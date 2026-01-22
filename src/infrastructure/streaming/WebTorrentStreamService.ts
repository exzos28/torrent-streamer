import { Request, Response } from 'express';
import { TorrentFile } from 'webtorrent';
import config from '../../config';
import { IStreamService } from '../../domain/interfaces/IStreamService';
import { TorrentFileEntity } from '../../domain/entities';
import { ILogger } from '../../domain/interfaces/ILogger';
import { isExtendedTorrentFile, ExtendedTorrent } from '../torrent/WebTorrentExtendedTypes';
import { ByteRange } from '../../domain/value-objects';
import {
  RangeParser,
  RangeNormalizer,
  RangeResponseBuilder,
  StreamErrorHandler,
  StreamEventHandler,
  WebTorrentPieceManager,
  ByteFormatter
} from './utils';
import { HTTP_STATUS } from './constants/HttpConstants';

/**
 * WebTorrent implementation of IStreamService
 * Handles HTTP range requests for video streaming according to spec
 */
export class WebTorrentStreamService implements IStreamService {
  private readonly logger: ILogger;
  private readonly rawFileMap: WeakMap<TorrentFileEntity, TorrentFile> = new WeakMap();

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  // ========== Public API ==========

  /**
   * Sets the raw WebTorrent file for a file entity
   */
  setRawFile(fileEntity: TorrentFileEntity, rawFile: TorrentFile): void {
    this.rawFileMap.set(fileEntity, rawFile);
  }

  /**
   * Streams video file over HTTP with range request support
   * Always returns 206 Partial Content (never 200 OK)
   */
  streamVideo(req: Request, res: Response, file: TorrentFileEntity): void {
    const range = req.headers.range;
    const fileName = file.name || 'unknown';
    const fileSize = file.length;

    this.logger.info(`[${fileName}] Stream request: range=${range || 'none'}, fileSize=${fileSize}`);

    if (!range) {
      this._sendInitialChunk(req, res, file, fileName, fileSize).catch((err) => {
        StreamErrorHandler.handle(err, res, this.logger, fileName);
      });
      return;
    }

    this._handleRangeRequest(req, res, file, fileName, fileSize, range).catch((err) => {
      StreamErrorHandler.handle(err, res, this.logger, fileName);
    });
  }

  // ========== Range Request Handling ==========

  /**
   * Sends initial chunk when no Range header is present
   * According to spec: start=0, end=min(CHUNK-1, L-1)
   */
  private async _sendInitialChunk(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number
  ): Promise<void> {
    const range = ByteRange.initialChunk(config.CHUNK_SIZE, fileSize);

    this.logger.info(
      `[${fileName}] Request without range header - sending first chunk (${range.start}-${range.end}, ${ByteFormatter.toMB(range.size)})`
    );

    await this._applyWebTorrentInstructions(file, fileName, range, fileSize);
    this._sendStreamResponse(req, res, file, fileName, range, fileSize);
  }

  /**
   * Handles range request
   */
  private async _handleRangeRequest(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number,
    rangeHeader: string
  ): Promise<void> {
    // Parse range header
    const parseResult = RangeParser.parse(rangeHeader);
    if (!parseResult.success) {
      RangeResponseBuilder.sendRangeNotSatisfiable(res, fileSize);
      return;
    }

    // Normalize range
    const normalizedRange = RangeNormalizer.normalize(
      parseResult.value,
      fileSize,
      config.CHUNK_SIZE,
      this.logger,
      fileName
    );

    if (!normalizedRange) {
      RangeResponseBuilder.sendRangeNotSatisfiable(res, fileSize);
      return;
    }

    // Apply CHUNK limit
    const finalRange = normalizedRange.applyChunkLimit(config.CHUNK_SIZE, fileSize);

    // Apply WebTorrent instructions
    await this._applyWebTorrentInstructions(file, fileName, finalRange, fileSize);

    // Send response
    this._sendStreamResponse(req, res, file, fileName, finalRange, fileSize);
  }

  // ========== WebTorrent Operations ==========

  /**
   * Applies WebTorrent instructions: deselect() then select() with buffer
   */
  private async _applyWebTorrentInstructions(
    file: TorrentFileEntity,
    fileName: string,
    range: ByteRange,
    fileSize: number
  ): Promise<void> {
    const torrent = this._getTorrent(file);
    if (!torrent) {
      this.logger.debug(`[${fileName}] No torrent found, skipping WebTorrent instructions`);
      return;
    }

    const pieceLength = torrent.pieceLength || 0;
    if (pieceLength === 0) {
      this.logger.debug(`[${fileName}] Torrent has no pieceLength, skipping WebTorrent instructions`);
      return;
    }

    const pieceManager = new WebTorrentPieceManager(torrent, this.logger, fileName);
    pieceManager.clearAllPriorities();
    pieceManager.prioritizeRange(range, config.BUFFER_SIZE, fileSize);
  }

  /**
   * Gets ExtendedTorrent from file entity
   */
  private _getTorrent(file: TorrentFileEntity): ExtendedTorrent | null {
    const rawFile = this.rawFileMap.get(file);
    if (!rawFile) {
      return null;
    }
    const extendedFile = isExtendedTorrentFile(rawFile) ? rawFile : null;
    return extendedFile?._torrent || null;
  }

  // ========== HTTP Response ==========

  /**
   * Sends HTTP 206 response and streams the data
   */
  private _sendStreamResponse(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    range: ByteRange,
    fileSize: number
  ): void {
    this.logger.info(
      `[${fileName}] Sending range response: bytes ${range.start}-${range.end}/${fileSize} (${ByteFormatter.toMB(range.size)})`
    );

    // Check if response is still writable before sending headers
    if (res.writableEnded || res.destroyed) {
      this.logger.warn(`[${fileName}] Response already ended, skipping stream`);
      return;
    }

    RangeResponseBuilder.sendPartialContent(res, range, fileSize);

    try {
      const stream = file.createReadStream({ start: range.start, end: range.end });
      const eventHandler = new StreamEventHandler(this.logger, fileName, range);
      eventHandler.setup(stream, req, res);

      this.logger.debug(`[${fileName}] Stream created for range ${range.start}-${range.end}, piping to response`);
      stream.pipe(res);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`[${fileName}] Error creating read stream:`, err);
      // If headers were sent, we can't send JSON error - just end the response
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          // Response may already be closed, ignore
        }
      } else {
        RangeResponseBuilder.sendErrorIfHeadersNotSent(
          res,
          'Failed to create stream. Torrent may not be ready yet. Please try again in a moment.',
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }
    }
  }
}
