import { ExtendedTorrent } from '../../torrent/WebTorrentExtendedTypes';
import { ILogger } from '../../../domain/interfaces/ILogger';
import { ByteRange } from '../../../domain/value-objects/ByteRange';
import { PieceRangeCalculator } from './PieceRangeCalculator';
import { PIECE_PRIORITY } from '../constants/HttpConstants';

/**
 * Manages WebTorrent piece selection/deselection operations
 */
export class WebTorrentPieceManager {
  constructor(
    private readonly torrent: ExtendedTorrent,
    private readonly logger: ILogger,
    private readonly fileName: string
  ) {}

  /**
   * Clears all piece priorities
   */
  clearAllPriorities(): void {
    if (!this.torrent.deselect || typeof this.torrent.deselect !== 'function') {
      this.logger.debug(`[${this.fileName}] Torrent has no deselect method`);
      return;
    }

    try {
      const totalPieces = Array.isArray(this.torrent.pieces) ? this.torrent.pieces.length : 0;
      if (totalPieces > 0) {
        this.torrent.deselect(0, totalPieces - 1, PIECE_PRIORITY.HIGH);
        this.logger.debug(`[${this.fileName}] Deselected all pieces (0-${totalPieces - 1})`);
      }
    } catch (err) {
      this.logger.debug(`[${this.fileName}] Failed to deselect pieces:`, err);
    }
  }

  /**
   * Prioritizes pieces for the given byte range with buffer
   */
  prioritizeRange(range: ByteRange, bufferSize: number, fileSize: number): void {
    const pieceLength = this.torrent.pieceLength || 0;
    if (pieceLength === 0) {
      this.logger.debug(`[${this.fileName}] Torrent has no pieceLength, skipping prioritization`);
      return;
    }

    if (!this.torrent.select || typeof this.torrent.select !== 'function') {
      this.logger.debug(`[${this.fileName}] Torrent has no select method`);
      return;
    }

    try {
      const pieceRange = PieceRangeCalculator.byteRangeToPieceRange(range, pieceLength);
      const bufferedRange = PieceRangeCalculator.addBuffer(pieceRange, bufferSize, fileSize, pieceLength);

      this.torrent.select(bufferedRange.startPiece, bufferedRange.endPiece, PIECE_PRIORITY.HIGH);
      this.logger.info(
        `[${this.fileName}] Selected pieces ${bufferedRange.startPiece}-${bufferedRange.endPiece} ` +
        `for range ${range.start}-${range.end} (buffer: ${bufferSize / 1024 / 1024} MB)`
      );
    } catch (err) {
      this.logger.debug(`[${this.fileName}] Failed to select pieces:`, err);
    }
  }
}
