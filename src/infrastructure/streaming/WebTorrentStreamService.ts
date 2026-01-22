import { Request, Response } from 'express';
import { TorrentFile } from 'webtorrent';
import config from '../../config';
import { IStreamService } from '../../domain/interfaces/IStreamService';
import { TorrentFileEntity } from '../../domain/entities';
import { ILogger } from '../../domain/interfaces/ILogger';
import { isExtendedTorrentFile, ExtendedTorrent } from '../torrent/WebTorrentExtendedTypes';

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
   */
  setRawFile(fileEntity: TorrentFileEntity, rawFile: TorrentFile): void {
    this.rawFileMap.set(fileEntity, rawFile);
  }

  streamVideo(req: Request, res: Response, file: TorrentFileEntity): void {
    const range = req.headers.range;
    const fileName = file.name || 'unknown';
    const fileSize = file.length;

    this.logger.info(`[${fileName}] Stream request: range=${range || 'none'}, fileSize=${fileSize}`);

    if (!range) {
      this._sendInitialChunk(req, res, file, fileName, fileSize).catch((err) => {
        this.logger.error(`[${fileName}] Error sending initial chunk:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream initial chunk' });
        }
      });
      return;
    }

    this._handleRangeRequest(req, res, file, fileName, fileSize, range).catch((err) => {
      this.logger.error(`[${fileName}] Error handling range request:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream chunk' });
      }
    });
  }

  private async _sendInitialChunk(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number
  ): Promise<void> {
    // According to spec: start=0, end=min(CHUNK-1, L-1)
    const start = 0;
    const end = Math.min(config.CHUNK_SIZE - 1, fileSize - 1);
    const chunkSize = end - start + 1;

    this.logger.info(
      `[${fileName}] Request without range header - sending first chunk (${start}-${end}, ${(chunkSize / 1024 / 1024).toFixed(2)} MB)`
    );

    // WebTorrent instructions: deselect then select with buffer
    await this._applyWebTorrentInstructions(file, fileName, start, end, fileSize);

    // Send HTTP 206 response (always Partial Content, never 200)
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4'
    });

    try {
      const stream = file.createReadStream({ start, end });
      this._setupStreamHandlers(req, res, stream, fileName, start, end);
      this.logger.debug(`[${fileName}] Stream created, piping to response`);
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

  private async _handleRangeRequest(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    fileSize: number,
    range: string
  ): Promise<void> {
    const parsedRange = this._parseRangeHeader(range);
    if (!parsedRange) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    // Normalize range according to spec
    const normalized = this._normalizeRange(parsedRange, fileSize, fileName);
    if (!normalized) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    const { start, end } = normalized;

    // Apply CHUNK limit
    const chunkEnd = Math.min(start + config.CHUNK_SIZE - 1, fileSize - 1);
    const finalEnd = Math.min(end, chunkEnd);
    const chunkSize = finalEnd - start + 1;

    // WebTorrent instructions: deselect then select with buffer
    await this._applyWebTorrentInstructions(file, fileName, start, finalEnd, fileSize);

    // Send HTTP 206 response
    this._sendRangeResponse(req, res, file, fileName, start, finalEnd, chunkSize, fileSize);
  }

  /**
   * Parses the Range header according to spec
   * Supports: bytes=START-, bytes=START-END, bytes=-SUFFIX
   * @returns Parsed range with type indicator or null if invalid
   */
  private _parseRangeHeader(
    range: string
  ): { start: number | null; end: number | null; type: 'start-only' | 'start-end' | 'suffix'; suffix?: number } | null {
    // Remove 'bytes=' prefix
    const rangeValue = range.replace(/^bytes=/, '');
    if (!rangeValue) {
      return null;
    }

    // Check for multiple ranges (not supported)
    if (rangeValue.includes(',')) {
      return null;
    }

    const parts = rangeValue.split('-');
    if (parts.length !== 2) {
      return null;
    }

    const startStr = parts[0].trim();
    const endStr = parts[1].trim();

    // Case 1: bytes=-SUFFIX (suffix from end)
    if (!startStr && endStr) {
      const suffix = parseInt(endStr, 10);
      if (isNaN(suffix) || suffix < 0) {
        return null;
      }
      return { start: null, end: null, type: 'suffix', suffix };
    }

    // Case 2: bytes=START- (from START to end)
    if (startStr && !endStr) {
      const start = parseInt(startStr, 10);
      if (isNaN(start)) {
        return null;
      }
      return { start, end: null, type: 'start-only' };
    }

    // Case 3: bytes=START-END (fixed range)
    if (startStr && endStr) {
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) {
        return null;
      }
      return { start, end, type: 'start-end' };
    }

    return null;
  }

  /**
   * Normalizes range according to spec
   * @returns Normalized { start, end } or null if invalid
   */
  private _normalizeRange(
    parsedRange: { start: number | null; end: number | null; type: 'start-only' | 'start-end' | 'suffix'; suffix?: number },
    fileSize: number,
    fileName: string
  ): { start: number; end: number } | null {
    const clamp = (x: number): number => Math.min(Math.max(x, 0), fileSize - 1);

    let start: number;
    let end: number;

    switch (parsedRange.type) {
      case 'suffix': {
        // bytes=-SUFFIX: start = max(L - SUFFIX, 0), end = L - 1
        const suffix = parsedRange.suffix || 0;
        start = Math.max(fileSize - suffix, 0);
        end = fileSize - 1;
        break;
      }

      case 'start-only': {
        // bytes=START-: start = clamp(START), end = min(start + CHUNK - 1, L - 1)
        start = clamp(parsedRange.start || 0);
        end = Math.min(start + config.CHUNK_SIZE - 1, fileSize - 1);
        break;
      }

      case 'start-end': {
        // bytes=START-END: start = clamp(START), end = clamp(END)
        start = clamp(parsedRange.start || 0);
        end = clamp(parsedRange.end || 0);

        // Validate: if end < start → invalid
        if (end < start) {
          this.logger.warn(`[${fileName}] Invalid range: end ${end} < start ${start}`);
          return null;
        }
        break;
      }

      default:
        return null;
    }

    // Final validation
    if (start >= fileSize || end >= fileSize || start > end) {
      this.logger.warn(`[${fileName}] Invalid normalized range: start=${start}, end=${end}, fileSize=${fileSize}`);
      return null;
    }

    return { start, end };
  }

  /**
   * Applies WebTorrent instructions: deselect() then select() with buffer
   */
  private async _applyWebTorrentInstructions(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number,
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

    // Calculate piece indices
    const startPiece = Math.floor(start / pieceLength);

    // Calculate select range with buffer: selectEnd = min(end + BUFFER, L - 1)
    const selectStart = startPiece;
    const selectEndPiece = Math.floor(Math.min(end + config.BUFFER_SIZE, fileSize - 1) / pieceLength);

    // Step 1: deselect() - clear previous priorities
    if (torrent.deselect && typeof torrent.deselect === 'function') {
      try {
        // Deselect all pieces (0 to total pieces)
        const totalPieces = Array.isArray(torrent.pieces) ? torrent.pieces.length : 0;
        if (totalPieces > 0) {
          torrent.deselect(0, totalPieces - 1, 1);
          this.logger.debug(`[${fileName}] Deselected all pieces (0-${totalPieces - 1})`);
        }
      } catch (err) {
        this.logger.debug(`[${fileName}] Failed to deselect pieces:`, err);
      }
    }

    // Step 2: select() - prioritize pieces with buffer
    if (torrent.select && typeof torrent.select === 'function') {
      try {
        torrent.select(selectStart, selectEndPiece, 1);
        this.logger.info(
          `[${fileName}] Selected pieces ${selectStart}-${selectEndPiece} for range ${start}-${end} (buffer: ${config.BUFFER_SIZE / 1024 / 1024} MB)`
        );
      } catch (err) {
        this.logger.debug(`[${fileName}] Failed to select pieces:`, err);
      }
    }
  }


  /**
   * Sends the HTTP range response with appropriate headers and streams the data
   */
  private _sendRangeResponse(
    req: Request,
    res: Response,
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number,
    chunkSize: number,
    fileSize: number
  ): void {
    this.logger.info(
      `[${fileName}] Sending range response: bytes ${start}-${end}/${fileSize} (${(chunkSize / 1024 / 1024).toFixed(2)} MB)`
    );

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-cache'
    });

    try {
      const stream = file.createReadStream({ start, end });
      this._setupStreamHandlers(req, res, stream, fileName, start, end);
      this.logger.debug(`[${fileName}] Stream created for range ${start}-${end}, piping to response`);
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


  private _getTorrent(file: TorrentFileEntity): ExtendedTorrent | null {
    const rawFile = this.rawFileMap.get(file);
    if (!rawFile) {
      return null;
    }
    const extendedFile = isExtendedTorrentFile(rawFile) ? rawFile : null;
    return extendedFile?._torrent || null;
  }


  private _setupStreamHandlers(
    req: Request,
    res: Response,
    stream: NodeJS.ReadableStream,
    fileName: string,
    start: number,
    end: number
  ): void {
    let bytesSent = 0;
    const expectedBytes = end - start + 1;

    stream.on('data', (chunk: Buffer) => {
      bytesSent += chunk.length;
      this.logger.debug(
        `[${fileName}] Stream data: ${bytesSent}/${expectedBytes} bytes (${((bytesSent / expectedBytes) * 100).toFixed(1)}%)`
      );
    });

    stream.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(500).end();
      }
      this.logger.error(
        `[${fileName}] Stream error (bytes ${start}-${end}): ${err.message}, sent ${bytesSent}/${expectedBytes} bytes`
      );
    });

    stream.on('end', () => {
      this.logger.info(
        `[${fileName}] Chunk ${start}-${end} successfully sent (${bytesSent}/${expectedBytes} bytes)`
      );
      if (bytesSent !== expectedBytes) {
        this.logger.warn(
          `[${fileName}] WARNING: Sent ${bytesSent} bytes but expected ${expectedBytes} bytes (difference: ${expectedBytes - bytesSent})`
        );
      }
    });

    let isCleanedUp = false;
    const cleanup = (): void => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;

      const streamWithDestroy = stream as NodeJS.ReadableStream & { destroyed?: boolean; destroy?: () => void };
      if (stream && !streamWithDestroy.destroyed && typeof streamWithDestroy.destroy === 'function') {
        try {
          streamWithDestroy.destroy();
        } catch (error) {
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
