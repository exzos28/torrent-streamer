import { Response } from 'express';
import { ILogger } from '../../../domain/interfaces/ILogger';
import { HTTP_STATUS } from '../constants/HttpConstants';

/**
 * Handles streaming errors consistently
 */
export class StreamErrorHandler {
  /**
   * Ensures headers are not sent before executing callback
   */
  static ensureHeadersNotSent(res: Response, callback: () => void): void {
    if (!res.headersSent) {
      callback();
    }
  }

  /**
   * Handles stream errors
   */
  static handle(
    error: Error,
    res: Response,
    logger: ILogger,
    context: string,
    additionalInfo?: Record<string, unknown>
  ): void {
    logger.error(`[${context}] ${error.message}`, additionalInfo);

    this.ensureHeadersNotSent(res, () => {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: error.message || 'Internal server error'
      });
    });
  }

  /**
   * Sends generic error response
   */
  static sendError(res: Response, error: string, status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR): void {
    this.ensureHeadersNotSent(res, () => {
      res.status(status).json({ error });
    });
  }
}
