/**
 * Unit tests for ConsoleLogger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from './ConsoleLogger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new ConsoleLogger();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log messages', () => {
    logger.log('test message');
    expect(consoleLogSpy).toHaveBeenCalledWith('test message');
  });

  it('should log errors', () => {
    logger.error('error message');
    expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
  });

  it('should log warnings', () => {
    logger.warn('warning message');
    expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
  });

  it('should log info', () => {
    logger.info('info message');
    expect(consoleInfoSpy).toHaveBeenCalledWith('info message');
  });

  it('should log debug', () => {
    logger.debug('debug message');
    expect(consoleDebugSpy).toHaveBeenCalledWith('debug message');
  });

  it('should handle multiple arguments', () => {
    logger.log('message', { key: 'value' }, 123);
    expect(consoleLogSpy).toHaveBeenCalledWith('message', { key: 'value' }, 123);
  });
});
