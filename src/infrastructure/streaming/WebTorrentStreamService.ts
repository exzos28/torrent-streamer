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
   */
  setRawFile(fileEntity: TorrentFileEntity, rawFile: TorrentFile): void {
    this.rawFileMap.set(fileEntity, rawFile);
  }

  streamVideo(req: Request, res: Response, file: TorrentFileEntity): void {
    const range = req.headers.range;
    const fileName = file.name || 'unknown';
    const fileSize = file.length;

    if (!range) {
      return this._sendInitialChunk(req, res, file, fileName, fileSize);
    }

    this._handleRangeRequest(req, res, file, fileName, fileSize, range).catch((err) => {
      this.logger.error(`[${fileName}] Error handling range request:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream chunk' });
      }
    });
  }

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

    const { start, end } = parsedRange;

    if (!this._validateRange(res, start, end, fileSize, fileName)) {
      return;
    }

    const { end: allowedEnd, chunkSize } = this._calculateChunkRange(start, end, fileSize, fileName);

    await this._ensurePiecesReady(file, fileName, start, allowedEnd);

    this._sendRangeResponse(req, res, file, fileName, start, allowedEnd, chunkSize, fileSize);
  }

  /**
   * Parses the Range header and extracts start and requested end positions
   * Only parses the header format, no validation of values
   * @returns Parsed range or null if start/end is missing or invalid
   */
  private _parseRangeHeader(
    range: string
  ): { start: number; end: number } | null {
    // Remove 'bytes=' prefix
    const rangeValue = range.replace(/^bytes=/, '');
    if (!rangeValue) {
      return null;
    }

    const parts = rangeValue.split('-');
    if (parts.length !== 2) {
      return null;
    }

    const startStr = parts[0].trim();
    const endStr = parts[1].trim();

    // Start must be provided and valid
    if (!startStr) {
      return null;
    }

    const start = parseInt(startStr, 10);
    if (isNaN(start)) {
      return null;
    }

    // End must be provided and valid
    if (!endStr) {
      return null;
    }

    const end = parseInt(endStr, 10);
    if (isNaN(end)) {
      return null;
    }

    return { start, end };
  }

  /**
   * Validates the range request and sends 416 error if invalid
   * @returns true if range is valid, false otherwise
   */
  private _validateRange(
    res: Response,
    start: number,
    end: number,
    fileSize: number,
    fileName: string
  ): boolean {
    if (start >= fileSize) {
      this.logger.warn(`[${fileName}] Invalid range: start ${start} >= file.length ${fileSize}`);
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return false;
    }

    if (end >= fileSize) {
      this.logger.warn(`[${fileName}] Invalid range: end ${end} >= file.length ${fileSize}`);
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return false;
    }

    if (start > end) {
      this.logger.warn(`[${fileName}] Invalid range: start ${start} > end ${end}`);
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return false;
    }

    return true;
  }

  /**
   * Calculates the actual chunk range based on fixed chunk size limits
   */
  private _calculateChunkRange(
    start: number,
    requestedEnd: number,
    fileSize: number,
    fileName: string
  ): { end: number; chunkSize: number } {
    const fixedChunkSize = config.CHUNK_SIZE;
    const maxAllowedEnd = Math.min(start + fixedChunkSize - 1, fileSize - 1);
    const end = Math.min(requestedEnd, maxAllowedEnd);
    const chunkSize = end - start + 1;

    if (requestedEnd - start + 1 > fixedChunkSize) {
      this.logger.info(
        `[${fileName}] Requesting ${((requestedEnd - start + 1) / 1024 / 1024).toFixed(2)} MB, ` +
        `limiting to fixed chunk size ${(chunkSize / 1024 / 1024).toFixed(2)} MB`
      );
    }

    return { end, chunkSize };
  }

  /**
   * Ensures that required pieces are prioritized and ready for streaming
   */
  private async _ensurePiecesReady(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number
  ): Promise<void> {
    await this._prioritizePieces(file, fileName, start, end);
    const piecesReady = await this._waitForPieces(file, fileName, start, end);

    if (!piecesReady) {
      this.logger.warn(`[${fileName}] Timeout waiting for pieces, sending anyway`);
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

  private async _waitForPieces(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number
  ): Promise<boolean> {
    const torrent = this._getTorrent(file);
    if (!torrent) {
      return false;
    }

    const pieceLength = torrent.pieceLength || 0;
    if (pieceLength === 0) {
      return false;
    }

    const startPiece = Math.floor(start / pieceLength);
    const endPiece = Math.floor(end / pieceLength);
    const requiredPieces = new Set<number>();
    for (let i = startPiece; i <= endPiece; i++) {
      requiredPieces.add(i);
    }

    // Check if already downloaded (pieces МОГУТ уже быть)
    this.logger.debug(`[${fileName}] Initial check for pieces ${startPiece}-${endPiece} (${requiredPieces.size} pieces)`);

    // Log what pieces are actually downloaded in the torrent (to see what WebTorrent is downloading)
    const pieces = torrent.pieces;
    if (Array.isArray(pieces)) {
      // Find first 20 downloaded pieces (to see what WebTorrent is actually downloading)
      const downloadedIndices: number[] = [];
      for (let i = 0; i < pieces.length && downloadedIndices.length < 20; i++) {
        const p = pieces[i];
        if (p !== null && p && typeof p === 'object' && 'missing' in p && (p.missing === undefined || p.missing === 0)) {
          downloadedIndices.push(i);
        }
      }
      if (downloadedIndices.length > 0) {
        this.logger.debug(`[${fileName}] Actually downloaded pieces (first 20): [${downloadedIndices.join(', ')}]`);
      } else {
        this.logger.debug(`[${fileName}] No fully downloaded pieces found yet`);
      }

      // Also check our required pieces
      const requiredStatus = Array.from(requiredPieces).map(i => {
        const p = pieces[i];
        if (p === null) {
          return `${i}:null`;
        }
        if (p && typeof p === 'object' && 'missing' in p) {
          if (p.missing === undefined || p.missing === 0) {
            return `${i}:✓`;
          }
          const pieceLength = p.length || torrent.pieceLength || 4194304;
          const downloadedPercentage = ((pieceLength - (p.missing || 0)) / pieceLength * 100).toFixed(0);
          return `${i}:${downloadedPercentage}%`;
        }
        return `${i}:?`;
      }).join(', ');
      this.logger.debug(`[${fileName}] Required pieces ${startPiece}-${endPiece} status: [${requiredStatus}]`);
    }

    if (this._arePiecesDownloaded(torrent, requiredPieces)) {
      this.logger.info(`[${fileName}] All required pieces ${startPiece}-${endPiece} are already downloaded, proceeding immediately`);
      return true;
    }

    this.logger.info(`[${fileName}] Waiting for pieces ${startPiece}-${endPiece} to fully download...`);

    // Wait and listen to 'download' events
    return new Promise<boolean>((resolve) => {
      let timeout: NodeJS.Timeout | null = null;
      let isResolved = false;

      const cleanup = (): void => {
        if (isResolved) {
          return;
        }
        isResolved = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        torrent.off('download', checkPieces);
        torrent.off('done', checkPieces);
      };

      let lastDownloadedCount = 0;
      const checkPieces = (): void => {
        if (isResolved) {
          return;
        }

        // Count how many of our required pieces are downloaded
        const pieces = torrent.pieces;
        let downloadedCount = 0;
        if (Array.isArray(pieces)) {
          downloadedCount = Array.from(requiredPieces).filter(i => {
            if (i < 0 || i >= pieces.length) {
              return false;
            }
            const p = pieces[i];
            // Piece is downloaded if: not null AND (missing is undefined OR missing === 0)
            if (p === null) {
              return false;
            }
            if (p && typeof p === 'object' && 'missing' in p) {
              return p.missing === undefined || p.missing === 0;
            }
            // Piece exists but no missing property - assume downloaded
            return true;
          }).length;
        }

        // Only log when count changes (to reduce spam)
        if (downloadedCount !== lastDownloadedCount) {
          lastDownloadedCount = downloadedCount;
          this.logger.debug(`[${fileName}] Pieces ${startPiece}-${endPiece}: ${downloadedCount}/${requiredPieces.size} downloaded after download/done event`);
        }

        if (this._arePiecesDownloaded(torrent, requiredPieces)) {
          cleanup();
          this.logger.info(`[${fileName}] All required pieces ${startPiece}-${endPiece} are now downloaded`);
          resolve(true);
        }
      };

      torrent.on('download', checkPieces);
      torrent.on('done', checkPieces);

      timeout = setTimeout(() => {
        if (!isResolved) {
          cleanup();
          this.logger.warn(`[${fileName}] Timeout waiting for pieces ${startPiece}-${endPiece}`);
          resolve(false);
        }
      }, config.PIECE_WAIT_TIMEOUT);
    });
  }

  /**
   * Checks if all required pieces are downloaded
   * pieces: Array<TorrentPiece | null>
   * TorrentPiece: { length: number, missing: number }
   */
  private _arePiecesDownloaded(torrent: any, requiredPieces: Set<number>): boolean {
    const pieces = torrent.pieces;
    if (!Array.isArray(pieces)) {
      this.logger.debug(`_arePiecesDownloaded: pieces is not an array, type=${typeof pieces}`);
      return false;
    }

    const pieceStatuses: string[] = [];
    let allDownloaded = true;

    for (const pieceIndex of requiredPieces) {
      if (pieceIndex < 0 || pieceIndex >= pieces.length) {
        pieceStatuses.push(`${pieceIndex}:out-of-range`);
        allDownloaded = false;
        continue;
      }

      const piece = pieces[pieceIndex];
      if (piece === null) {
        pieceStatuses.push(`${pieceIndex}:null`);
        allDownloaded = false;
      } else if (piece && typeof piece === 'object' && 'missing' in piece) {
        if (piece.missing === undefined || piece.missing === 0) {
          pieceStatuses.push(`${pieceIndex}:downloaded`);
        } else {
          const pieceLength = piece.length || torrent.pieceLength || 4194304;
          const missingPercentage = ((piece.missing || 0) / pieceLength) * 100;
          pieceStatuses.push(`${pieceIndex}:missing=${piece.missing}(${missingPercentage.toFixed(1)}%)`);
          allDownloaded = false;
        }
      } else {
        pieceStatuses.push(`${pieceIndex}:unknown(${typeof piece})`);
        // Assume downloaded if piece exists but doesn't have missing property
      }
    }

    this.logger.debug(
      `_arePiecesDownloaded: checking pieces [${Array.from(requiredPieces).join(',')}], ` +
      `status: [${pieceStatuses.join(', ')}], ` +
      `allDownloaded=${allDownloaded}, ` +
      `torrent.progress=${(torrent.progress * 100).toFixed(2)}%, ` +
      `pieces.length=${pieces.length}`
    );

    return allDownloaded;
  }

  private _getTorrent(file: TorrentFileEntity): any | null {
    const rawFile = this.rawFileMap.get(file);
    if (!rawFile) {
      return null;
    }
    const extendedFile = isExtendedTorrentFile(rawFile) ? rawFile : null;
    return extendedFile?._torrent || null;
  }

  private async _prioritizePieces(
    file: TorrentFileEntity,
    fileName: string,
    start: number,
    end: number
  ): Promise<void> {
    const torrent = this._getTorrent(file);
    if (!torrent) {
      return;
    }

    const pieceLength = torrent.pieceLength || 0;
    if (pieceLength === 0) {
      return;
    }

    const startPiece = Math.floor(start / pieceLength);
    const endPiece = Math.floor(end / pieceLength);
    const MAX_PRIORITIZED_PIECES = 100;
    const limitedEndPiece = Math.min(endPiece, startPiece + MAX_PRIORITIZED_PIECES - 1);

    if (torrent.select && typeof torrent.select === 'function') {
      try {
        torrent.select(startPiece, limitedEndPiece, 1);
        this.logger.info(
          `[${fileName}] Prioritized pieces ${startPiece}-${limitedEndPiece} for range ${start}-${end}`
        );
      } catch (err) {
        this.logger.debug(`[${fileName}] Failed to prioritize pieces:`, err);
      }
    }
  }

  private _setupStreamHandlers(
    req: Request,
    res: Response,
    stream: NodeJS.ReadableStream,
    fileName: string,
    start: number,
    end: number
  ): void {
    stream.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(500).end();
      }
      this.logger.error(`[${fileName}] Stream error (bytes ${start}-${end}):`, err.message);
    });

    stream.on('end', () => {
      this.logger.info(`[${fileName}] Chunk ${start}-${end} successfully sent`);
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
