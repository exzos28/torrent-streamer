#!/usr/bin/env node

/**
 * Simple torrent streamer for Node.js
 * Accepts magnet links and streams video over HTTP
 * 
 * Usage:
 *   node torrent-streamer.js
 * 
 * Then send a GET request:
 *   http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:...
 */

const WebTorrent = require('webtorrent');
const express = require('express');
const path = require('path');

const app = express();
const client = new WebTorrent();
const PORT = 3000;

// Storage for active torrents
const activeTorrents = new Map();

/**
 * Finds the first video file in the torrent
 */
function findVideoFile(torrent) {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
    return torrent.files.find(file => {
        const ext = path.extname(file.name).toLowerCase();
        return videoExtensions.includes(ext);
    });
}

/**
 * Streams video file over HTTP with range request support
 */
function streamVideo(req, res, file) {
    const range = req.headers.range;
    const fileName = file.name || 'unknown';
    const fileSize = file.length;

    if (!range) {
        // If no range header, send first small chunk (2 MB)
        // so browser can detect format and then use range requests
        const initialChunkSize = Math.min(2 * 1024 * 1024, fileSize); // 2 MB or less
        const end = initialChunkSize - 1;

        console.log(`[${fileName}] Request without range header - sending first chunk (0-${end}, ${(initialChunkSize / 1024 / 1024).toFixed(2)} MB)`);

        res.writeHead(206, {
            'Content-Range': `bytes 0-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': initialChunkSize,
            'Content-Type': 'video/mp4'
        });

        const stream = file.createReadStream({ start: 0, end });

        // Stream error handling
        stream.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).end();
            }
            console.error(`[${fileName}] Stream error:`, err.message);
        });

        // Client disconnect handling
        const cleanup = () => {
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        };

        req.on('close', cleanup);
        req.on('aborted', cleanup);
        res.on('close', cleanup);
        res.on('finish', () => {
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        stream.pipe(res);
        return;
    }

    // Parse range header (e.g., "bytes=0-1023")
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);

    // Maximum chunk size (10 MB)
    const MAX_CHUNK_SIZE = 10 * 1024 * 1024;

    // Determine end position
    let requestedEnd = parts[1] ? parseInt(parts[1], 10) : file.length - 1;

    // Limit chunk size to maximum value
    const maxAllowedEnd = Math.min(start + MAX_CHUNK_SIZE - 1, file.length - 1);
    const end = Math.min(requestedEnd, maxAllowedEnd);

    const chunksize = (end - start) + 1;

    // Warn if requested chunk is too large
    if (requestedEnd - start > MAX_CHUNK_SIZE) {
        console.warn(`[${fileName}] Requested chunk too large: ${((requestedEnd - start) / 1024 / 1024).toFixed(2)} MB, limiting to ${(MAX_CHUNK_SIZE / 1024 / 1024).toFixed(2)} MB`);
    }

    // Log requested chunk
    const startMB = (start / 1024 / 1024).toFixed(2);
    const endMB = (end / 1024 / 1024).toFixed(2);
    const chunkMB = (chunksize / 1024 / 1024).toFixed(2);
    const progress = ((start / fileSize) * 100).toFixed(1);

    console.log(`[${fileName}] Chunk request: bytes ${start}-${end} (${chunkMB} MB) | Position: ${startMB}-${endMB} MB | Progress: ${progress}%`);

    // Check if chunk is loaded
    if (start >= file.length) {
        console.warn(`[${fileName}] Invalid range: start ${start} >= file.length ${file.length}`);
        res.writeHead(416, { 'Content-Range': `bytes */${file.length}` });
        res.end();
        return;
    }

    // Check chunk availability (whether it's loaded)
    const pieceLength = file._torrent ? file._torrent.pieceLength : 0;
    if (pieceLength > 0) {
        const startPiece = Math.floor(start / pieceLength);
        const endPiece = Math.floor(end / pieceLength);
        const piecesAvailable = file._torrent.pieces ?
            file._torrent.pieces.slice(startPiece, endPiece + 1).filter(p => p).length : 0;
        const totalPieces = endPiece - startPiece + 1;

        if (piecesAvailable < totalPieces) {
            console.log(`[${fileName}] Pieces loading: ${piecesAvailable}/${totalPieces} available`);
        }
    }

    res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
    });

    // Create stream for requested byte range
    const stream = file.createReadStream({ start, end });

    // Stream error handling
    stream.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).end();
        }
        console.error(`[${fileName}] Stream error (bytes ${start}-${end}):`, err.message);
    });

    // Log chunk transfer start
    stream.on('data', (chunk) => {
        // Uncomment for detailed logging of each chunk
        // console.log(`[${fileName}] Sent ${chunk.length} bytes from chunk ${start}-${end}`);
    });

    // Log chunk transfer completion
    stream.on('end', () => {
        console.log(`[${fileName}] Chunk ${start}-${end} successfully sent`);
    });

    // Client disconnect handling
    const cleanup = () => {
        if (stream && !stream.destroyed) {
            console.log(`[${fileName}] Connection closed by client, chunk ${start}-${end} interrupted`);
            stream.destroy();
        }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('finish', () => {
        if (stream && !stream.destroyed) {
            stream.destroy();
        }
    });

    stream.pipe(res);
}

/**
 * Main streaming endpoint
 */
app.get('/stream', async (req, res) => {
    const magnet = req.query.magnet;

    if (!magnet || !magnet.startsWith('magnet:')) {
        return res.status(400).json({
            error: 'Magnet link required in parameter ?magnet=magnet:?xt=...'
        });
    }

    try {
        // Check if torrent is already active
        let torrent = activeTorrents.get(magnet);

        if (!torrent) {
            console.log(`Loading torrent: ${magnet.substring(0, 50)}...`);

            // Add new torrent
            torrent = client.add(magnet);

            activeTorrents.set(magnet, torrent);

            // Wait for torrent to receive metadata
            await new Promise((resolve, reject) => {
                torrent.on('metadata', () => {
                    console.log('Metadata received');
                    resolve();
                });

                torrent.on('error', (err) => {
                    console.error('Torrent error:', err);
                    activeTorrents.delete(magnet);
                    reject(err);
                });

                // Timeout for metadata reception
                setTimeout(() => {
                    if (!torrent.metadata) {
                        activeTorrents.delete(magnet);
                        reject(new Error('Metadata reception timeout'));
                    }
                }, 30000);
            });
        }

        // Find video file
        const videoFile = findVideoFile(torrent);

        if (!videoFile) {
            return res.status(404).json({
                error: 'Video file not found in torrent'
            });
        }

        console.log(`Streaming file: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`);

        // Stream video
        streamVideo(req, res, videoFile);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get torrent information
 */
app.get('/info', async (req, res) => {
    const magnet = req.query.magnet;

    if (!magnet) {
        return res.status(400).json({ error: 'Magnet link required' });
    }

    const torrent = activeTorrents.get(magnet);

    if (!torrent) {
        return res.status(404).json({ error: 'Torrent not found' });
    }

    const videoFile = findVideoFile(torrent);

    res.json({
        name: torrent.name,
        infoHash: torrent.infoHash,
        files: torrent.files.map(f => ({
            name: f.name,
            length: f.length,
            isVideo: videoFile === f
        })),
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        progress: torrent.progress,
        numPeers: torrent.numPeers,
        ready: torrent.ready
    });
});

/**
 * Endpoint to list active torrents
 */
app.get('/torrents', (req, res) => {
    const torrents = Array.from(activeTorrents.values()).map(torrent => ({
        infoHash: torrent.infoHash,
        name: torrent.name,
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed,
        numPeers: torrent.numPeers
    }));

    res.json({ torrents });
});

/**
 * Endpoint to stop a torrent
 */
app.delete('/torrent', (req, res) => {
    const magnet = req.query.magnet;

    if (!magnet) {
        return res.status(400).json({ error: 'Magnet link required' });
    }

    const torrent = activeTorrents.get(magnet);

    if (torrent) {
        client.remove(torrent);
        activeTorrents.delete(magnet);
        res.json({ message: 'Torrent stopped' });
    } else {
        res.status(404).json({ error: 'Torrent not found' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Torrent streamer running on http://localhost:${PORT}`);
    console.log(`📺 Usage example:`);
    console.log(`   http://localhost:${PORT}/stream?magnet=magnet:?xt=urn:btih:...`);
    console.log(`\n💡 Use a video player with HTTP support (VLC, mpv, browser)`);
});

// Process termination handling
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    client.destroy(() => {
        console.log('✅ All torrents stopped');
        process.exit(0);
    });
});
