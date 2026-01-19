import express, { Router, Request, Response } from 'express';
import { StreamHandler } from '../stream-handler';
import { TorrentManager } from '../torrent-manager';
import { TorrentsResponse } from '../types';

const router = express.Router();

/**
 * Creates stream routes with torrent manager instance
 * @param torrentManager - Torrent manager instance
 * @returns Express router
 */
export function createStreamRoutes(torrentManager: TorrentManager): Router {
  /**
   * Main streaming endpoint
   * GET /stream?magnet=magnet:?xt=...
   */
  router.get('/stream', async (req: Request, res: Response): Promise<void> => {
    const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

    if (!magnet || !magnet.startsWith('magnet:')) {
      res.status(400).json({
        error: 'Magnet link required in parameter ?magnet=magnet:?xt=...'
      });
      return;
    }

    try {
      // Add torrent and wait for metadata
      await torrentManager.addTorrent(magnet);

      // Find video file
      const videoFile = torrentManager.getVideoFile(magnet);

      if (!videoFile) {
        res.status(404).json({
          error: 'Video file not found in torrent'
        });
        return;
      }

      console.log(`Streaming file: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`);

      // Stream video
      StreamHandler.streamVideo(req, res, videoFile);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Endpoint to get torrent information
   * GET /info?magnet=magnet:?xt=...
   */
  router.get('/info', async (req: Request, res: Response): Promise<void> => {
    const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

    if (!magnet) {
      res.status(400).json({ error: 'Magnet link required' });
      return;
    }

    const info = torrentManager.getTorrentInfo(magnet);

    if (!info) {
      res.status(404).json({ error: 'Torrent not found' });
      return;
    }

    res.json(info);
  });

  /**
   * Endpoint to list active torrents
   * GET /torrents
   */
  router.get('/torrents', (_req: Request, res: Response<TorrentsResponse>): void => {
    const torrents = torrentManager.getAllTorrents();
    res.json({ torrents });
  });

  /**
   * Endpoint to stop a torrent
   * DELETE /torrent?magnet=magnet:?xt=...
   */
  router.delete('/torrent', (req: Request, res: Response): void => {
    const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

    if (!magnet) {
      res.status(400).json({ error: 'Magnet link required' });
      return;
    }

    const removed = torrentManager.removeTorrent(magnet);

    if (removed) {
      res.json({ message: 'Torrent stopped' });
    } else {
      res.status(404).json({ error: 'Torrent not found' });
    }
  });

  return router;
}
