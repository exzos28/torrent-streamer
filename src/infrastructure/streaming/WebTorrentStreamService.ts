import { Request, Response } from 'express';
import { TorrentFile } from 'webtorrent';
import config from '../../config';
import { IStreamService } from '../../domain/interfaces/IStreamService';
import { TorrentFileEntity } from '../../domain/entities';
import { ILogger } from '../../domain/interfaces/ILogger';

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

    const stream = file.createReadStream({ start: 0, end });
    this._setupStreamHandlers(req, res, stream, fileName, 0, end);
    stream.pipe(res);
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

    // Limit chunk size to maximum value
    const maxAllowedEnd = Math.min(start + config.MAX_CHUNK_SIZE - 1, fileSize - 1);
    const end = Math.min(requestedEnd, maxAllowedEnd);

    const chunksize = end - start + 1;

    // Warn if requested chunk is too large
    if (requestedEnd - start > config.MAX_CHUNK_SIZE) {
      this.logger.warn(
        `[${fileName}] Requested chunk too large: ${((requestedEnd - start) / 1024 / 1024).toFixed(2)} MB, limiting to ${(config.MAX_CHUNK_SIZE / 1024 / 1024).toFixed(2)} MB`
      );
    }

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

    // Check chunk availability and wait for pieces to load if needed
    const piecesReady = await this._waitForChunkAvailability(file, fileName, start, end);

    if (!piecesReady) {
      this.logger.warn(`[${fileName}] Chunk ${start}-${end} not fully available, streaming anyway (may be slow)`);
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });

    // Create stream for requested byte range
    const stream = file.createReadStream({ start, end });
    this._setupStreamHandlers(req, res, stream, fileName, start, end);
    stream.pipe(res);
  }

  /**
   * Checks if chunk pieces are available and waits for them to load
   * Also prioritizes downloading the requested pieces
   * @private
   * @returns Promise that resolves to true if pieces are ready, false if timeout
   */
  private async _waitForChunkAvailability(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number
  ): Promise<boolean> {
    // Get raw WebTorrent file to access piece information
    const rawFile = this.rawFileMap.get(file);
    if (!rawFile) {
      return true; // Can't check, assume ready
    }

    // Access private _torrent property for piece information
    const torrent = (rawFile as any)._torrent;
    if (!torrent) {
      return false;
    }

    const pieceLength = torrent.pieceLength || 0;
    if (pieceLength === 0) {
      return true; // Can't check, assume ready
    }

    const startPiece = Math.floor(start / pieceLength);
    const endPiece = Math.floor(end / pieceLength);
    const totalPieces = endPiece - startPiece + 1;

    // Check current availability
    const checkAvailability = (): number => {
      if (!torrent.pieces) {
        return 0;
      }
      return torrent.pieces
        .slice(startPiece, endPiece + 1)
        .filter((p: boolean) => p).length;
    };

    let piecesAvailable = checkAvailability();

    // If all pieces are available, return immediately
    if (piecesAvailable >= totalPieces) {
      return true;
    }

    this.logger.info(
      `[${fileName}] Waiting for pieces ${startPiece}-${endPiece} (${piecesAvailable}/${totalPieces} available)...`
    );

    // Prioritize downloading these pieces
    if (torrent.select && typeof torrent.select === 'function') {
      for (let i = startPiece; i <= endPiece; i++) {
        try {
          torrent.select(i, true); // Prioritize piece
        } catch (err) {
          // Ignore errors if piece selection fails
        }
      }
    }

    // Wait for pieces to load with timeout (max 30 seconds)
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    return new Promise<boolean>((resolve) => {
      const checkIntervalId = setInterval(() => {
        piecesAvailable = checkAvailability();

        if (piecesAvailable >= totalPieces) {
          clearInterval(checkIntervalId);
          this.logger.info(`[${fileName}] All pieces ${startPiece}-${endPiece} are now available`);
          resolve(true);
          return;
        }

        // Timeout check
        if (Date.now() - startTime > maxWaitTime) {
          clearInterval(checkIntervalId);
          this.logger.warn(
            `[${fileName}] Timeout waiting for pieces ${startPiece}-${endPiece} (${piecesAvailable}/${totalPieces} available after ${maxWaitTime}ms)`
          );
          resolve(false);
          return;
        }
      }, checkInterval);

      // Also listen to torrent 'download' event for faster response
      const onDownload = (): void => {
        piecesAvailable = checkAvailability();
        if (piecesAvailable >= totalPieces) {
          torrent.off('download', onDownload);
          clearInterval(checkIntervalId);
          this.logger.info(`[${fileName}] All pieces ${startPiece}-${endPiece} are now available (via download event)`);
          resolve(true);
        }
      };

      torrent.on('download', onDownload);

      // Cleanup on timeout
      setTimeout(() => {
        torrent.off('download', onDownload);
      }, maxWaitTime);
    });
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
    const cleanup = (): void => {
      if (stream && !(stream as any).destroyed) {
        this.logger.info(`[${fileName}] Connection closed by client, chunk ${start}-${end} interrupted`);
        (stream as any).destroy();
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  }
}
