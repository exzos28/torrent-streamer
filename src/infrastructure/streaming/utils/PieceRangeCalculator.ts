import { ByteRange } from '../../../domain/value-objects/ByteRange';

/**
 * Calculates piece ranges from byte ranges
 */
export class PieceRangeCalculator {
  /**
   * Converts byte range to piece range indices
   */
  static byteRangeToPieceRange(byteRange: ByteRange, pieceLength: number): { startPiece: number; endPiece: number } {
    if (pieceLength === 0) {
      throw new Error('PieceRangeCalculator: pieceLength cannot be zero');
    }

    const startPiece = Math.floor(byteRange.start / pieceLength);
    const endPiece = Math.floor(byteRange.end / pieceLength);

    return { startPiece, endPiece };
  }

  /**
   * Adds buffer to piece range for prefetch
   */
  static addBuffer(
    pieceRange: { startPiece: number; endPiece: number },
    bufferSize: number,
    fileSize: number,
    pieceLength: number
  ): { startPiece: number; endPiece: number } {
    const byteEnd = (pieceRange.endPiece + 1) * pieceLength - 1;
    const bufferedByteEnd = Math.min(byteEnd + bufferSize, fileSize - 1);
    const bufferedEndPiece = Math.floor(bufferedByteEnd / pieceLength);

    return {
      startPiece: pieceRange.startPiece,
      endPiece: bufferedEndPiece
    };
  }
}
