import { RangeParseResult, RangeParseError } from '../../../domain/value-objects/ParsedRange';

/**
 * Parses HTTP Range header strings
 */
export class RangeParser {
  private static readonly BYTES_PREFIX = 'bytes=';
  private static readonly RANGE_SEPARATOR = '-';

  /**
   * Parses Range header value
   */
  static parse(range: string): RangeParseResult {
    // Remove 'bytes=' prefix
    const rangeValue = range.replace(new RegExp(`^${this.BYTES_PREFIX}`), '');
    if (!rangeValue) {
      return {
        success: false,
        error: RangeParseError.INVALID_FORMAT,
        message: 'Empty range value after bytes= prefix'
      };
    }

    // Check for multiple ranges (not supported)
    if (rangeValue.includes(',')) {
      return {
        success: false,
        error: RangeParseError.MULTIPLE_RANGES,
        message: 'Multiple ranges are not supported'
      };
    }

    const parts = rangeValue.split(this.RANGE_SEPARATOR);
    if (parts.length !== 2) {
      return {
        success: false,
        error: RangeParseError.INVALID_FORMAT,
        message: `Invalid range format, expected 'start-end', got '${rangeValue}'`
      };
    }

    const startStr = parts[0].trim();
    const endStr = parts[1].trim();

    // Case 1: bytes=-SUFFIX (suffix from end)
    if (!startStr && endStr) {
      const suffix = parseInt(endStr, 10);
      if (isNaN(suffix)) {
        return {
          success: false,
          error: RangeParseError.INVALID_NUMBER,
          message: `Invalid suffix value: '${endStr}'`
        };
      }
      if (suffix < 0) {
        return {
          success: false,
          error: RangeParseError.NEGATIVE_VALUE,
          message: `Suffix cannot be negative: ${suffix}`
        };
      }
      return { success: true, value: { type: 'suffix', suffix } };
    }

    // Case 2: bytes=START- (from START to end)
    if (startStr && !endStr) {
      const start = parseInt(startStr, 10);
      if (isNaN(start)) {
        return {
          success: false,
          error: RangeParseError.INVALID_NUMBER,
          message: `Invalid start value: '${startStr}'`
        };
      }
      return { success: true, value: { type: 'start-only', start } };
    }

    // Case 3: bytes=START-END (fixed range)
    if (startStr && endStr) {
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) {
        return {
          success: false,
          error: RangeParseError.INVALID_NUMBER,
          message: `Invalid start or end value: start='${startStr}', end='${endStr}'`
        };
      }
      return { success: true, value: { type: 'start-end', start, end } };
    }

    return {
      success: false,
      error: RangeParseError.INVALID_FORMAT,
      message: 'Range must have at least start or end value'
    };
  }
}
