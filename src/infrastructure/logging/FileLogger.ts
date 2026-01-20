/**
 * File logger implementation
 * Writes logs to files in the runtime directory
 */

import fs from 'fs';
import path from 'path';
import { ILogger } from '../../domain/interfaces';
import config from '../../config';

export class FileLogger implements ILogger {
  private logDir: string;
  private logFile: string;
  private errorFile: string;
  private writeStream: fs.WriteStream | null = null;
  private errorStream: fs.WriteStream | null = null;

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(config.RUNTIME_DIR, 'logs');
    
    // Ensure log directory exists
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
      throw new Error(`Failed to create log directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    this.logFile = path.join(this.logDir, `app-${timestamp}.log`);
    this.errorFile = path.join(this.logDir, `error-${timestamp}.log`);

    try {
      // Create write streams
      this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.errorStream = fs.createWriteStream(this.errorFile, { flags: 'a' });

      // Setup error handlers for streams
      this.writeStream.on('error', (err) => {
        console.error('Error writing to log file:', err);
      });

      this.errorStream.on('error', (err) => {
        console.error('Error writing to error file:', err);
      });
    } catch (error) {
      console.error('Failed to create log streams:', error);
      // Streams will remain null, logging will fall back to console only
    }

    // Also log to console for immediate feedback
    if (this.writeStream) {
      this.log(`FileLogger initialized. Logs: ${this.logFile}, Errors: ${this.errorFile}`);
    } else {
      console.warn('FileLogger: Failed to initialize file streams, using console only');
    }
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${argsStr}\n`;
  }

  private writeToFile(stream: fs.WriteStream | null, level: string, message: string, ...args: unknown[]): void {
    if (!stream || stream.destroyed || !stream.writable) {
      return;
    }

    try {
      const formatted = this.formatMessage(level, message, ...args);
      const written = stream.write(formatted);
      
      // If write buffer is full, wait for drain event
      if (!written) {
        stream.once('drain', () => {
          // Buffer drained, can continue writing
        });
      }
    } catch (error) {
      // Silently fail - we don't want logging errors to crash the app
      // Error is already logged via stream's error handler
      console.error('Failed to write to log file:', error);
    }
  }

  log(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
    this.writeToFile(this.writeStream, 'LOG', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
    this.writeToFile(this.errorStream, 'ERROR', message, ...args);
    // Also write errors to main log file
    this.writeToFile(this.writeStream, 'ERROR', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
    this.writeToFile(this.writeStream, 'WARN', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args);
    this.writeToFile(this.writeStream, 'INFO', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args);
    this.writeToFile(this.writeStream, 'DEBUG', message, ...args);
  }

  /**
   * Close file streams (call on application shutdown)
   */
  close(): void {
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end();
      this.writeStream = null;
    }
    if (this.errorStream && !this.errorStream.destroyed) {
      this.errorStream.end();
      this.errorStream = null;
    }
  }
}
