/**
 * Console logger implementation
 */

import { ILogger } from '../../domain/interfaces';

export class ConsoleLogger implements ILogger {
  log(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args);
  }
}
