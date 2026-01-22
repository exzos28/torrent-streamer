/**
 * Configuration for torrent streamer
 */

import path from 'path';

export interface Config {
  PORT: number;
  MAX_CHUNK_SIZE: number;
  INITIAL_CHUNK_SIZE: number;
  CHUNK_SIZE: number; // Fixed chunk size for streaming (default: 50 MB)
  BUFFER_SIZE: number; // Prefetch buffer size ahead of requested range (default: 15 MB)
  METADATA_TIMEOUT: number;
  PIECE_WAIT_TIMEOUT: number; // Timeout for waiting pieces to download (default: 60 seconds)
  VIDEO_EXTENSIONS: readonly string[];
  // Maximum total memory usage for all torrent pieces (in bytes)
  // When limit is reached, least recently used pieces are evicted
  // Default: 500 MB - limits total memory across all active torrents
  MAX_MEMORY_USAGE: number;
  // Runtime directory for storing torrent files and logs
  RUNTIME_DIR: string;
}

const config: Config = {
  // Server configuration
  PORT: Number(process.env.PORT) || 3000,

  // Streaming configuration
  MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10 MB (deprecated, use CHUNK_SIZE instead)
  INITIAL_CHUNK_SIZE: 2 * 1024 * 1024, // 2 MB
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE) || 50 * 1024 * 1024, // 50 MB - fixed chunk size for streaming
  BUFFER_SIZE: Number(process.env.BUFFER_SIZE) || 15 * 1024 * 1024, // 15 MB - prefetch buffer ahead of requested range

  // Torrent configuration
  METADATA_TIMEOUT: 30000, // 30 seconds
  PIECE_WAIT_TIMEOUT: Number(process.env.PIECE_WAIT_TIMEOUT) || 60000, // 60 seconds - timeout for waiting pieces to download

  // Memory management
  // Maximum total memory usage for all torrent pieces (in bytes)
  // When limit is reached, least recently used pieces are evicted from memory
  // Pieces will be re-downloaded if needed after eviction
  MAX_MEMORY_USAGE: Number(process.env.MAX_MEMORY_USAGE) || 500 * 1024 * 1024, // 500 MB

  // Runtime directory for storing torrent files and logs
  RUNTIME_DIR: process.env.RUNTIME_DIR || path.join(process.cwd(), '.runtime'),

  // Video file extensions
  VIDEO_EXTENSIONS: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'] as const
};

export default config;
