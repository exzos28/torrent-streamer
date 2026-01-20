/**
 * Composite logger that writes to both console and file
 * Useful for development and production
 */

import { ILogger } from '../../domain/interfaces';
import { ConsoleLogger } from './ConsoleLogger';
import { FileLogger } from './FileLogger';

export class CompositeLogger implements ILogger {
  private consoleLogger: ConsoleLogger;
  private fileLogger: FileLogger;

  constructor(logDir?: string) {
    this.consoleLogger = new ConsoleLogger();
    this.fileLogger = new FileLogger(logDir);
  }

  log(message: string, ...args: unknown[]): void {
    this.consoleLogger.log(message, ...args);
    this.fileLogger.log(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.consoleLogger.error(message, ...args);
    this.fileLogger.error(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.consoleLogger.warn(message, ...args);
    this.fileLogger.warn(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.consoleLogger.info(message, ...args);
    this.fileLogger.info(message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.consoleLogger.debug(message, ...args);
    this.fileLogger.debug(message, ...args);
  }

  /**
   * Close file streams (call on application shutdown)
   */
  close(): void {
    this.fileLogger.close();
  }
}
