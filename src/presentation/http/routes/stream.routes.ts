import { Router } from 'express';
import { StreamController } from '../controllers/StreamController';
import { TorrentController } from '../controllers/TorrentController';
import { DebugController } from '../controllers/DebugController';

/**
 * Creates and configures stream routes
 */
export function createStreamRoutes(
  streamController: StreamController,
  torrentController: TorrentController,
  debugController: DebugController
): Router {
  const router = Router();

  // Stream endpoint
  router.get('/stream', (req, res) => streamController.stream(req, res));

  // Torrent info endpoint
  router.get('/info', (req, res) => torrentController.getInfo(req, res));

  // List all torrents endpoint
  router.get('/torrents', (req, res) => torrentController.getAll(req, res));

  // Add torrent endpoint
  router.post('/torrent', (req, res) => torrentController.add(req, res));

  // Remove torrent endpoint
  router.delete('/torrent', (req, res) => torrentController.remove(req, res));

  // Debug endpoints
  router.get('/debug/torrents', (req, res) => debugController.getTorrentsDebugInfo(req, res));
  router.get('/debug/torrents.svg', (req, res) => debugController.getTorrentsSVG(req, res));

  return router;
}
