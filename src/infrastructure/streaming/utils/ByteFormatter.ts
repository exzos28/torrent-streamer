/**
 * Utility for formatting byte values
 */
export class ByteFormatter {
  private static readonly MB = 1024 * 1024;
  private static readonly KB = 1024;

  /**
   * Formats bytes to MB with 2 decimal places
   */
  static toMB(bytes: number): string {
    return `${(bytes / this.MB).toFixed(2)} MB`;
  }

  /**
   * Formats bytes to human-readable format
   */
  static toHumanReadable(bytes: number): string {
    if (bytes >= this.MB) {
      return `${(bytes / this.MB).toFixed(2)} MB`;
    }
    if (bytes >= this.KB) {
      return `${(bytes / this.KB).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }

  /**
   * Formats percentage with 1 decimal place
   */
  static toPercentage(value: number, total: number): string {
    return `${((value / total) * 100).toFixed(1)}%`;
  }
}
