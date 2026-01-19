/**
 * Configuration for torrent streamer
 */

export interface Config {
  PORT: number;
  MAX_CHUNK_SIZE: number;
  INITIAL_CHUNK_SIZE: number;
  METADATA_TIMEOUT: number;
  VIDEO_EXTENSIONS: readonly string[];
  // Maximum total memory usage for all torrent pieces (in bytes)
  // When limit is reached, least recently used pieces are evicted
  // Default: 500 MB - limits total memory across all active torrents
  MAX_MEMORY_USAGE: number;
}

const config: Config = {
  // Server configuration
  PORT: Number(process.env.PORT) || 3000,

  // Streaming configuration
  MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10 MB
  INITIAL_CHUNK_SIZE: 2 * 1024 * 1024, // 2 MB

  // Torrent configuration
  METADATA_TIMEOUT: 30000, // 30 seconds

  // Memory management
  // Maximum total memory usage for all torrent pieces (in bytes)
  // When limit is reached, least recently used pieces are evicted from memory
  // Pieces will be re-downloaded if needed after eviction
  MAX_MEMORY_USAGE: Number(process.env.MAX_MEMORY_USAGE) || 500 * 1024 * 1024, // 500 MB

  // Video file extensions
  VIDEO_EXTENSIONS: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'] as const
};

export default config;
