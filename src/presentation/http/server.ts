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
import { ConsoleLogger } from '../../infrastructure/logging/ConsoleLogger';
import { VideoFileFinder } from '../../infrastructure/torrent/VideoFileFinder';
import { WebTorrentRepository } from '../../infrastructure/torrent/WebTorrentRepository';
import { WebTorrentStreamService } from '../../infrastructure/streaming/WebTorrentStreamService';

// Initialize dependencies
const logger = new ConsoleLogger();
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
  process.exit(0);
});

process.on('SIGTERM', async (): Promise<void> => {
  logger.info('\n🛑 Stopping server...');
  await torrentRepository.destroy();
  logger.info('✅ All torrents stopped');
  process.exit(0);
});
