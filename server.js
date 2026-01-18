#!/usr/bin/env node

/**
 * Main server file for torrent streamer
 * 
 * Usage:
 *   node server.js
 * 
 * Then send a GET request:
 *   http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:...
 */

const express = require('express');
const config = require('./config');
const TorrentManager = require('./torrent-manager');
const createStreamRoutes = require('./routes/stream');

// Initialize Express app
const app = express();

// Initialize torrent manager
const torrentManager = new TorrentManager();

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
process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping server...');
    await torrentManager.destroy();
    console.log('✅ All torrents stopped');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Stopping server...');
    await torrentManager.destroy();
    console.log('✅ All torrents stopped');
    process.exit(0);
});
