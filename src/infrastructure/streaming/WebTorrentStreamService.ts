import { Request, Response } from 'express';
import { TorrentFile } from 'webtorrent';
import config from '../../config';
import { IStreamService } from '../../domain/interfaces/IStreamService';
import { TorrentFileEntity } from '../../domain/entities';
import { ILogger } from '../../domain/interfaces/ILogger';
import { isExtendedTorrentFile } from '../torrent/WebTorrentExtendedTypes';

/**
 * WebTorrent implementation of IStreamService
 * Handles HTTP range requests for video streaming
 */
export class WebTorrentStreamService implements IStreamService {
  private logger: ILogger;
  private rawFileMap: WeakMap<TorrentFileEntity, TorrentFile> = new WeakMap();

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Sets the raw WebTorrent file for a file entity
   * This is needed to access piece information
   */
  setRawFile(fileEntity: TorrentFileEntity, rawFile: TorrentFile): void {
    this.rawFileMap.set(fileEntity, rawFile);
  }

  streamVideo(req: Request, res: Response, file: TorrentFileEntity): void {
    const range = req.headers.range;
    const fileName = file.name || 'unknown';
    const fileSize = file.length;

    if (!range) {
      // If no range header, send first small chunk (2 MB)
      // so browser can detect format and then use range requests
      return this._sendInitialChunk(req, res, file, fileName, fileSize);
    }

    // Parse and handle range request
    this._handleRangeRequest(req, res, file, fileName, fileSize, range).catch((err) => {
      this.logger.error(`[${fileName}] Error handling range request:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream chunk' });
      }
    });
  }

  /**
   * Sends initial chunk when no range header is present
   * @private
   */
  private _sendInitialChunk(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number
  ): void {
    const initialChunkSize = Math.min(config.INITIAL_CHUNK_SIZE, fileSize);
    const end = initialChunkSize - 1;

    this.logger.info(
      `[${fileName}] Request without range header - sending first chunk (0-${end}, ${(initialChunkSize / 1024 / 1024).toFixed(2)} MB)`
    );

    res.writeHead(206, {
      'Content-Range': `bytes 0-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': initialChunkSize,
      'Content-Type': 'video/mp4'
    });

    try {
      const stream = file.createReadStream({ start: 0, end });
      this._setupStreamHandlers(req, res, stream, fileName, 0, end);
      stream.pipe(res);
    } catch (error) {
      this.logger.error(`[${fileName}] Error creating read stream:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to create stream. Torrent may not be ready yet. Please try again in a moment.'
        });
      }
    }
  }

  /**
   * Handles HTTP range request
   * @private
   */
  private async _handleRangeRequest(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number,
    range: string
  ): Promise<void> {
    // Parse range header (e.g., "bytes=0-1023")
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);

    // Determine end position
    const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Check if requesting entire file (or close to it)
    // Only limit if requesting the whole file or very large portion
    const requestedSize = requestedEnd - start + 1;
    const isRequestingEntireFile = start === 0 && requestedEnd >= fileSize - 1;
    const isRequestingLargePortion = requestedSize > fileSize * 0.9; // More than 90% of file

    let end: number;
    if (isRequestingEntireFile || isRequestingLargePortion) {
      // Limit chunk size only when requesting entire file or large portion
      const maxAllowedEnd = Math.min(start + config.MAX_CHUNK_SIZE - 1, fileSize - 1);
      end = Math.min(requestedEnd, maxAllowedEnd);
      this.logger.info(
        `[${fileName}] Requesting ${isRequestingEntireFile ? 'entire file' : 'large portion'} (${(requestedSize / 1024 / 1024).toFixed(2)} MB), limiting to ${((end - start + 1) / 1024 / 1024).toFixed(2)} MB`
      );
    } else {
      // For normal range requests, serve the full requested range without limits
      end = Math.min(requestedEnd, fileSize - 1);
    }

    const chunksize = end - start + 1;

    // Log requested chunk
    const startMB = (start / 1024 / 1024).toFixed(2);
    const endMB = (end / 1024 / 1024).toFixed(2);
    const chunkMB = (chunksize / 1024 / 1024).toFixed(2);
    const progress = ((start / fileSize) * 100).toFixed(1);

    this.logger.info(
      `[${fileName}] Chunk request: bytes ${start}-${end} (${chunkMB} MB) | Position: ${startMB}-${endMB} MB | Progress: ${progress}%`
    );

    // Check if chunk is valid
    if (start >= fileSize) {
      this.logger.warn(`[${fileName}] Invalid range: start ${start} >= file.length ${fileSize}`);
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    // Prioritize pieces for this range (but don't wait - stream immediately)
    // This helps WebTorrent focus on downloading needed pieces while we stream
    await this._prioritizePieces(file, fileName, start, end);

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });

    // Create stream for requested byte range
    try {
      const stream = file.createReadStream({ start, end });
      this._setupStreamHandlers(req, res, stream, fileName, start, end);
      stream.pipe(res);
    } catch (error) {
      this.logger.error(`[${fileName}] Error creating read stream for range ${start}-${end}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to create stream. Torrent may not be ready yet. Please try again in a moment.'
        });
      }
    }
  }

  /**
   * Prioritizes downloading pieces for the requested range
   * Does NOT wait - just tells WebTorrent to prioritize these pieces
   * @private
   */
  private async _prioritizePieces(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number
  ): Promise<void> {
    // Get raw WebTorrent file to access piece information
    const rawFile = this.rawFileMap.get(file);
    if (!rawFile) {
      return; // Can't prioritize, skip
    }

    // Access private _torrent property for piece information
    const extendedFile = isExtendedTorrentFile(rawFile) ? rawFile : null;
    const torrent = extendedFile?._torrent;
    if (!torrent) {
      return;
    }

    const pieceLength = torrent.pieceLength || 0;
    if (pieceLength === 0) {
      return; // Can't calculate pieces, skip
    }

    const startPiece = Math.floor(start / pieceLength);
    const endPiece = Math.floor(end / pieceLength);

    // Prioritize downloading these pieces (but don't wait)
    if (torrent.select && typeof torrent.select === 'function') {
      try {
        // Select the entire range of pieces with high priority
        // WebTorrent select API: select(start, end, priority?, notify?)
        // Priority: 1 = high priority, 0 = normal priority
        torrent.select(startPiece, endPiece, 1);
        this.logger.debug(`[${fileName}] Prioritized pieces ${startPiece}-${endPiece} for range ${start}-${end}`);
      } catch (err) {
        // Ignore errors - prioritization is best-effort
        this.logger.debug(`[${fileName}] Failed to prioritize pieces ${startPiece}-${endPiece}:`, err);
      }
    }
  }

  /**
   * Sets up error handling and cleanup for stream
   * @private
   */
  private _setupStreamHandlers(
    req: Request,
    res: Response,
    stream: NodeJS.ReadableStream,
    fileName: string,
    start: number,
    end: number
  ): void {
    // Stream error handling
    stream.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(500).end();
      }
      this.logger.error(`[${fileName}] Stream error (bytes ${start}-${end}):`, err.message);
    });

    // Log chunk transfer completion
    stream.on('end', () => {
      this.logger.info(`[${fileName}] Chunk ${start}-${end} successfully sent`);
    });

    // Client disconnect handling
    let isCleanedUp = false;
    const cleanup = (): void => {
      // Prevent multiple cleanup calls
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;

      // Check if stream has destroy method (NodeJS.ReadableStream may have it)
      // Use type guard pattern instead of type assertion
      const streamWithDestroy = stream as NodeJS.ReadableStream & { destroyed?: boolean; destroy?: () => void };
      if (stream && !streamWithDestroy.destroyed && typeof streamWithDestroy.destroy === 'function') {
        this.logger.info(`[${fileName}] Connection closed by client, chunk ${start}-${end} interrupted`);
        try {
          streamWithDestroy.destroy();
        } catch (error) {
          // Ignore errors during cleanup
          this.logger.debug(`[${fileName}] Error during stream cleanup:`, error);
        }
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  }
}
