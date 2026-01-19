/**
 * Stream service interface
 * Handles video streaming operations
 */

import { Request, Response } from 'express';
import { TorrentFileEntity } from '../entities/Torrent';

export interface IStreamService {
  /**
   * Streams video file over HTTP with range request support
   * @param req - Express request object
   * @param res - Express response object
   * @param file - Torrent file entity
   */
  streamVideo(req: Request, res: Response, file: TorrentFileEntity): void;
}
