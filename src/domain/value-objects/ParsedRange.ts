/**
 * Parsed HTTP Range header value
 * Represents different types of range requests
 */
export type ParsedRange =
  | { type: 'start-only'; start: number }
  | { type: 'start-end'; start: number; end: number }
  | { type: 'suffix'; suffix: number };

/**
 * Range parsing error types
 */
export enum RangeParseError {
  INVALID_FORMAT = 'INVALID_FORMAT',
  MULTIPLE_RANGES = 'MULTIPLE_RANGES',
  INVALID_NUMBER = 'INVALID_NUMBER',
  NEGATIVE_VALUE = 'NEGATIVE_VALUE'
}

/**
 * Result type for range parsing
 */
export type RangeParseResult =
  | { success: true; value: ParsedRange }
  | { success: false; error: RangeParseError; message: string };
