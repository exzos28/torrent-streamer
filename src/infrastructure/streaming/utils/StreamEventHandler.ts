import { Request, Response } from 'express';
import { ILogger } from '../../../domain/interfaces/ILogger';
import { ByteRange } from '../../../domain/value-objects/ByteRange';
import { ByteFormatter } from './ByteFormatter';

/**
 * Handles stream events (data, error, end, cleanup)
 */
export class StreamEventHandler {
  private bytesSent = 0;
  private isCleanedUp = false;

  constructor(
    private readonly logger: ILogger,
    private readonly fileName: string,
    private readonly range: ByteRange
  ) {}

  /**
   * Sets up all stream event handlers
   */
  setup(stream: NodeJS.ReadableStream, req: Request, res: Response): void {
    this.setupDataHandler(stream);
    this.setupErrorHandler(stream, res);
    this.setupEndHandler(stream);
    this.setupCleanup(req, res, stream);
  }

  /**
   * Handles data events - logs progress
   */
  private setupDataHandler(stream: NodeJS.ReadableStream): void {
    stream.on('data', (chunk: Buffer) => {
      this.bytesSent += chunk.length;
      this.logger.debug(
        `[${this.fileName}] Stream data: ${this.bytesSent}/${this.range.size} bytes ` +
        `(${ByteFormatter.toPercentage(this.bytesSent, this.range.size)})`
      );
    });
  }

  /**
   * Handles error events
   */
  private setupErrorHandler(stream: NodeJS.ReadableStream, res: Response): void {
    stream.on('error', (err: Error) => {
      this.logger.error(
        `[${this.fileName}] Stream error (bytes ${this.range.start}-${this.range.end}): ${err.message}, ` +
        `sent ${this.bytesSent}/${this.range.size} bytes`
      );
      // Only try to send error response if headers haven't been sent
      // If headers are sent, the stream is already being piped and we can't send JSON
      if (!res.headersSent && !res.writableEnded) {
        try {
          res.status(500).end();
        } catch (responseError) {
          // Response may already be closed, ignore
          this.logger.debug(`[${this.fileName}] Could not send error response:`, responseError);
        }
      }
    });
  }

  /**
   * Handles end events - validates bytes sent
   */
  private setupEndHandler(stream: NodeJS.ReadableStream): void {
    stream.on('end', () => {
      this.logger.info(
        `[${this.fileName}] Chunk ${this.range.start}-${this.range.end} successfully sent ` +
        `(${this.bytesSent}/${this.range.size} bytes)`
      );

      if (this.bytesSent !== this.range.size) {
        const difference = this.range.size - this.bytesSent;
        this.logger.warn(
          `[${this.fileName}] WARNING: Sent ${this.bytesSent} bytes but expected ${this.range.size} bytes ` +
          `(difference: ${difference})`
        );
      }
    });
  }

  /**
   * Sets up cleanup handlers for request/response/stream
   */
  private setupCleanup(req: Request, res: Response, stream: NodeJS.ReadableStream): void {
    const cleanup = (): void => {
      if (this.isCleanedUp) {
        return;
      }
      this.isCleanedUp = true;

      const streamWithDestroy = stream as NodeJS.ReadableStream & {
        destroyed?: boolean;
        destroy?: () => void;
      };

      if (stream && !streamWithDestroy.destroyed && typeof streamWithDestroy.destroy === 'function') {
        try {
          streamWithDestroy.destroy();
        } catch (error) {
          this.logger.debug(`[${this.fileName}] Error during stream cleanup:`, error);
        }
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  }
}
