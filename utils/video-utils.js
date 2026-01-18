const path = require('path');
const config = require('../config');

/**
 * Finds the first video file in the torrent
 * @param {Object} torrent - WebTorrent torrent object
 * @returns {Object|null} - Video file or null if not found
 */
function findVideoFile(torrent) {
    return torrent.files.find(file => {
        const ext = path.extname(file.name).toLowerCase();
        return config.VIDEO_EXTENSIONS.includes(ext);
    });
}

module.exports = {
    findVideoFile
};
