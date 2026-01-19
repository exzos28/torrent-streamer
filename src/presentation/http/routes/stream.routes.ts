import { Router } from 'express';
import { StreamController } from '../controllers/StreamController';
import { TorrentController } from '../controllers/TorrentController';

/**
 * Creates and configures stream routes
 */
export function createStreamRoutes(
  streamController: StreamController,
  torrentController: TorrentController
): Router {
  const router = Router();

  // Stream endpoint
  router.get('/stream', (req, res) => streamController.stream(req, res));

  // Torrent info endpoint
  router.get('/info', (req, res) => torrentController.getInfo(req, res));

  // List all torrents endpoint
  router.get('/torrents', (req, res) => torrentController.getAll(req, res));

  // Remove torrent endpoint
  router.delete('/torrent', (req, res) => torrentController.remove(req, res));

  return router;
}
