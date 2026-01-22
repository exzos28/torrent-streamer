import { ParsedRange } from '../../../domain/value-objects/ParsedRange';
import { ByteRange } from '../../../domain/value-objects/ByteRange';
import { ILogger } from '../../../domain/interfaces/ILogger';

/**
 * Normalizes parsed range according to spec
 */
export class RangeNormalizer {
  /**
   * Normalizes parsed range to ByteRange
   */
  static normalize(
    parsed: ParsedRange,
    fileSize: number,
    chunkSize: number,
    logger: ILogger,
    fileName: string
  ): ByteRange | null {
    let range: ByteRange | null = null;

    switch (parsed.type) {
      case 'suffix': {
        // bytes=-SUFFIX: start = max(L - SUFFIX, 0), end = L - 1
        range = ByteRange.fromSuffix(parsed.suffix, fileSize);
        break;
      }

      case 'start-only': {
        // bytes=START-: start = clamp(START), end = min(start + CHUNK - 1, L - 1)
        range = ByteRange.fromStartOnly(parsed.start, chunkSize, fileSize);
        break;
      }

      case 'start-end': {
        // bytes=START-END: start = clamp(START), end = clamp(END)
        range = ByteRange.fromStartEnd(parsed.start, parsed.end, fileSize);
        if (!range) {
          logger.warn(`[${fileName}] Invalid range: end ${parsed.end} < start ${parsed.start}`);
          return null;
        }
        break;
      }
    }

    // Final validation
    if (range && !range.isValid(fileSize)) {
      logger.warn(
        `[${fileName}] Invalid normalized range: start=${range.start}, end=${range.end}, fileSize=${fileSize}`
      );
      return null;
    }

    return range;
  }
}
