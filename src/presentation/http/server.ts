#!/usr/bin/env node

/**
 * Main server file for torrent streamer
 *
 * Usage:
 *   yarn dev (or ts-node src/presentation/http/server.ts)
 *
 * Then send a GET request:
 *   http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:...
 */

import config from '../../config';
import { createApp } from './app';
import { CompositeLogger } from '../../infrastructure/logging/CompositeLogger';
import { VideoFileFinder } from '../../infrastructure/torrent/VideoFileFinder';
import { WebTorrentRepository } from '../../infrastructure/torrent/WebTorrentRepository';
import { WebTorrentStreamService } from '../../infrastructure/streaming/WebTorrentStreamService';
import { clearTorrentCache } from '../../utils/clearTorrentCache';

// Initialize dependencies
const logger = new CompositeLogger();

// Initialize server asynchronously to allow cache clearing
(async () => {
  // Clear torrent cache before starting (unless CLEAR_CACHE=false)
  const shouldClearCache = process.env.CLEAR_CACHE !== 'false';
  if (shouldClearCache) {
    logger.info('🧹 Clearing torrent cache...');
    try {
      await clearTorrentCache(logger, true);
    } catch (error) {
      logger.error('Failed to clear cache, continuing anyway:', error);
    }
  }

  const videoFileFinder = new VideoFileFinder();
  const torrentRepository = new WebTorrentRepository(videoFileFinder, logger);
  const streamService = new WebTorrentStreamService(logger);

  // Create Express app
  const app = createApp(torrentRepository, streamService, logger);

  // Start server
  app.listen(config.PORT, () => {
    logger.info(`🚀 Torrent streamer running on http://localhost:${config.PORT}`);
    logger.info(`📺 Usage example:`);
    logger.info(`   http://localhost:${config.PORT}/stream?magnet=magnet:?xt=urn:btih:...`);
    logger.info(`\n💡 Use a video player with HTTP support (VLC, mpv, browser)`);
  });

  // Process termination handling
  process.on('SIGINT', async (): Promise<void> => {
    logger.info('\n🛑 Stopping server...');
    await torrentRepository.destroy();
    logger.info('✅ All torrents stopped');
    if ('close' in logger && typeof logger.close === 'function') {
      logger.close();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async (): Promise<void> => {
    logger.info('\n🛑 Stopping server...');
    await torrentRepository.destroy();
    logger.info('✅ All torrents stopped');
    if ('close' in logger && typeof logger.close === 'function') {
      logger.close();
    }
    process.exit(0);
  });
})().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

