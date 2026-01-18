const express = require('express');
const router = express.Router();
const StreamHandler = require('../stream-handler');

/**
 * Creates stream routes with torrent manager instance
 * @param {TorrentManager} torrentManager - Torrent manager instance
 * @returns {express.Router} - Express router
 */
function createStreamRoutes(torrentManager) {
    /**
     * Main streaming endpoint
     * GET /stream?magnet=magnet:?xt=...
     */
    router.get('/stream', async (req, res) => {
        const magnet = req.query.magnet;

        if (!magnet || !magnet.startsWith('magnet:')) {
            return res.status(400).json({
                error: 'Magnet link required in parameter ?magnet=magnet:?xt=...'
            });
        }

        try {
            // Add torrent and wait for metadata
            await torrentManager.addTorrent(magnet);

            // Find video file
            const videoFile = torrentManager.getVideoFile(magnet);

            if (!videoFile) {
                return res.status(404).json({
                    error: 'Video file not found in torrent'
                });
            }

            console.log(`Streaming file: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`);

            // Stream video
            StreamHandler.streamVideo(req, res, videoFile);

        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Endpoint to get torrent information
     * GET /info?magnet=magnet:?xt=...
     */
    router.get('/info', async (req, res) => {
        const magnet = req.query.magnet;

        if (!magnet) {
            return res.status(400).json({ error: 'Magnet link required' });
        }

        const info = torrentManager.getTorrentInfo(magnet);

        if (!info) {
            return res.status(404).json({ error: 'Torrent not found' });
        }

        res.json(info);
    });

    /**
     * Endpoint to list active torrents
     * GET /torrents
     */
    router.get('/torrents', (req, res) => {
        const torrents = torrentManager.getAllTorrents();
        res.json({ torrents });
    });

    /**
     * Endpoint to stop a torrent
     * DELETE /torrent?magnet=magnet:?xt=...
     */
    router.delete('/torrent', (req, res) => {
        const magnet = req.query.magnet;

        if (!magnet) {
            return res.status(400).json({ error: 'Magnet link required' });
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

module.exports = createStreamRoutes;
