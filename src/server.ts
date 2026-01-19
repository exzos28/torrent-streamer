#!/usr/bin/env node

/**
 * Main server file for torrent streamer
 *
 * Usage:
 *   yarn dev (or ts-node server.ts)
 *
 * Then send a GET request:
 *   http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:...
 */

import express, { Express } from 'express';
import config from './config';
import { TorrentManager } from './torrent-manager';
import { createStreamRoutes } from './routes/stream';

// Initialize Express app
const app: Express = express();

// Initialize torrent manager
const torrentManager: TorrentManager = new TorrentManager();

// Setup routes
app.use('/', createStreamRoutes(torrentManager));

// Start server
app.listen(config.PORT, () => {
  console.log(`🚀 Torrent streamer running on http://localhost:${config.PORT}`);
  console.log(`📺 Usage example:`);
  console.log(`   http://localhost:${config.PORT}/stream?magnet=magnet:?xt=urn:btih:...`);
  console.log(`\n💡 Use a video player with HTTP support (VLC, mpv, browser)`);
});

// Process termination handling
process.on('SIGINT', async (): Promise<void> => {
  console.log('\n🛑 Stopping server...');
  await torrentManager.destroy();
  console.log('✅ All torrents stopped');
  process.exit(0);
});

process.on('SIGTERM', async (): Promise<void> => {
  console.log('\n🛑 Stopping server...');
  await torrentManager.destroy();
  console.log('✅ All torrents stopped');
  process.exit(0);
});
