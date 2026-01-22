/**
 * Immutable value object representing a byte range
 * Provides type safety and utility methods for range operations
 */
export class ByteRange {
  constructor(
    public readonly start: number,
    public readonly end: number
  ) {
    if (start < 0 || end < 0) {
      throw new Error(`ByteRange: start and end must be non-negative, got start=${start}, end=${end}`);
    }
    if (start > end) {
      throw new Error(`ByteRange: start must be <= end, got start=${start}, end=${end}`);
    }
  }

  /**
   * Returns the size of the range in bytes (inclusive)
   */
  get size(): number {
    return this.end - this.start + 1;
  }

  /**
   * Clamps the range to fit within maxSize
   */
  clamp(maxSize: number): ByteRange {
    const clampedStart = Math.min(Math.max(this.start, 0), maxSize - 1);
    const clampedEnd = Math.min(Math.max(this.end, 0), maxSize - 1);
    return new ByteRange(clampedStart, clampedEnd);
  }

  /**
   * Validates that the range is valid for the given file size
   */
  isValid(fileSize: number): boolean {
    return this.start < fileSize && this.end < fileSize && this.start <= this.end;
  }

  /**
   * Formats the range as Content-Range header value
   */
  toContentRange(fileSize: number): string {
    return `bytes ${this.start}-${this.end}/${fileSize}`;
  }

  /**
   * Applies chunk size limit to the range
   */
  applyChunkLimit(chunkSize: number, fileSize: number): ByteRange {
    const maxEnd = Math.min(this.start + chunkSize - 1, fileSize - 1);
    const finalEnd = Math.min(this.end, maxEnd);
    return new ByteRange(this.start, finalEnd);
  }

  /**
   * Creates a range from start-only format (bytes=START-)
   */
  static fromStartOnly(start: number, chunkSize: number, fileSize: number): ByteRange {
    const clampedStart = Math.min(Math.max(start, 0), fileSize - 1);
    const end = Math.min(clampedStart + chunkSize - 1, fileSize - 1);
    return new ByteRange(clampedStart, end);
  }

  /**
   * Creates a range from suffix format (bytes=-SUFFIX)
   */
  static fromSuffix(suffix: number, fileSize: number): ByteRange {
    const start = Math.max(fileSize - suffix, 0);
    return new ByteRange(start, fileSize - 1);
  }

  /**
   * Creates initial chunk range (no Range header)
   */
  static initialChunk(chunkSize: number, fileSize: number): ByteRange {
    const start = 0;
    const end = Math.min(chunkSize - 1, fileSize - 1);
    return new ByteRange(start, end);
  }

  /**
   * Creates a range from start and end values
   */
  static fromStartEnd(start: number, end: number, fileSize: number): ByteRange | null {
    const clampedStart = Math.min(Math.max(start, 0), fileSize - 1);
    const clampedEnd = Math.min(Math.max(end, 0), fileSize - 1);

    if (clampedEnd < clampedStart) {
      return null;
    }

    return new ByteRange(clampedStart, clampedEnd);
  }
}
