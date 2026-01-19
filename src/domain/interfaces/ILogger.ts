/**
 * Logger interface for dependency inversion
 * Allows easy mocking in tests and switching implementations
 */

export interface ILogger {
  log(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
