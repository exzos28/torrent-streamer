import { Response } from 'express';
import { ByteRange } from '../../../domain/value-objects/ByteRange';
import { HTTP_STATUS, HTTP_HEADERS } from '../constants/HttpConstants';

/**
 * Builds and sends HTTP range responses
 */
export class RangeResponseBuilder {
  /**
   * Sends 206 Partial Content response
   */
  static sendPartialContent(
    res: Response,
    range: ByteRange,
    fileSize: number,
    contentType: string = HTTP_HEADERS.CONTENT_TYPE_VIDEO
  ): void {
    res.writeHead(HTTP_STATUS.PARTIAL_CONTENT, {
      'Content-Range': range.toContentRange(fileSize),
      'Accept-Ranges': HTTP_HEADERS.ACCEPT_RANGES,
      'Content-Length': range.size,
      'Content-Type': contentType,
      'Cache-Control': HTTP_HEADERS.CACHE_CONTROL_NO_CACHE
    });
  }

  /**
   * Sends 416 Range Not Satisfiable response
   */
  static sendRangeNotSatisfiable(res: Response, fileSize: number): void {
    res.writeHead(HTTP_STATUS.RANGE_NOT_SATISFIABLE, {
      'Content-Range': `bytes */${fileSize}`
    });
    res.end();
  }

  /**
   * Sends error response if headers not sent
   */
  static sendErrorIfHeadersNotSent(
    res: Response,
    error: string,
    status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
  ): void {
    if (!res.headersSent) {
      res.status(status).json({ error });
    }
  }
}
