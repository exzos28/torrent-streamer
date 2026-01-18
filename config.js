/**
 * Configuration for torrent streamer
 */

module.exports = {
    // Server configuration
    PORT: process.env.PORT || 3000,

    // Streaming configuration
    MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10 MB
    INITIAL_CHUNK_SIZE: 2 * 1024 * 1024, // 2 MB

    // Torrent configuration
    METADATA_TIMEOUT: 30000, // 30 seconds

    // Video file extensions
    VIDEO_EXTENSIONS: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']
};
