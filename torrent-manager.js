const WebTorrent = require('webtorrent');
const config = require('./config');
const { findVideoFile } = require('./utils/video-utils');

/**
 * Manages WebTorrent client and active torrents
 */
class TorrentManager {
    constructor() {
        this.client = new WebTorrent();
        this.activeTorrents = new Map();
    }

    /**
     * Adds a torrent and waits for metadata
     * @param {string} magnet - Magnet link
     * @returns {Promise<Object>} - Torrent object
     */
    async addTorrent(magnet) {
        // Check if torrent is already active
        let torrent = this.activeTorrents.get(magnet);

        if (!torrent) {
            console.log(`Loading torrent: ${magnet.substring(0, 50)}...`);

            // Add new torrent
            torrent = this.client.add(magnet);
            this.activeTorrents.set(magnet, torrent);

            // Wait for torrent to receive metadata
            await new Promise((resolve, reject) => {
                torrent.on('metadata', () => {
                    console.log('Metadata received');
                    resolve();
                });

                torrent.on('error', (err) => {
                    console.error('Torrent error:', err);
                    this.activeTorrents.delete(magnet);
                    reject(err);
                });

                // Timeout for metadata reception
                setTimeout(() => {
                    if (!torrent.metadata) {
                        this.activeTorrents.delete(magnet);
                        reject(new Error('Metadata reception timeout'));
                    }
                }, config.METADATA_TIMEOUT);
            });
        }

        return torrent;
    }

    /**
     * Gets a torrent by magnet link
     * @param {string} magnet - Magnet link
     * @returns {Object|null} - Torrent object or null
     */
    getTorrent(magnet) {
        return this.activeTorrents.get(magnet) || null;
    }

    /**
     * Gets video file from torrent
     * @param {string} magnet - Magnet link
     * @returns {Object|null} - Video file or null
     */
    getVideoFile(magnet) {
        const torrent = this.getTorrent(magnet);
        if (!torrent) {
            return null;
        }
        return findVideoFile(torrent);
    }

    /**
     * Removes a torrent
     * @param {string} magnet - Magnet link
     * @returns {boolean} - True if torrent was removed
     */
    removeTorrent(magnet) {
        const torrent = this.activeTorrents.get(magnet);
        if (torrent) {
            this.client.remove(torrent);
            this.activeTorrents.delete(magnet);
            return true;
        }
        return false;
    }

    /**
     * Gets all active torrents
     * @returns {Array} - Array of torrent info objects
     */
    getAllTorrents() {
        return Array.from(this.activeTorrents.values()).map(torrent => ({
            infoHash: torrent.infoHash,
            name: torrent.name,
            progress: torrent.progress,
            downloadSpeed: torrent.downloadSpeed,
            numPeers: torrent.numPeers
        }));
    }

    /**
     * Gets detailed torrent information
     * @param {string} magnet - Magnet link
     * @returns {Object|null} - Torrent info or null
     */
    getTorrentInfo(magnet) {
        const torrent = this.getTorrent(magnet);
        if (!torrent) {
            return null;
        }

        const videoFile = findVideoFile(torrent);

        return {
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
        };
    }

    /**
     * Destroys all torrents and client
     * @returns {Promise} - Promise that resolves when all torrents are stopped
     */
    destroy() {
        return new Promise((resolve) => {
            this.client.destroy(() => {
                this.activeTorrents.clear();
                resolve();
            });
        });
    }
}

module.exports = TorrentManager;
