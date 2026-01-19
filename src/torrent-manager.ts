import WebTorrent, { Instance, Torrent, TorrentFile } from 'webtorrent';
import config from './config';
import { findVideoFile } from './utils/video-utils';
import { TorrentInfo, DetailedTorrentInfo, FileInfo } from './types';
import { createMemoryLimitedStore } from './utils/memory-limited-store';

/**
 * Manages WebTorrent client and active torrents
 * Uses MemoryLimitedStore to:
 * - Keep pieces only in memory, not on disk
 * - Limit total memory usage across all torrents (config.MAX_MEMORY_USAGE)
 * - Automatically evict least recently used pieces when memory limit is exceeded
 * This prevents creating full file instances on disk (important for large files 40-50GB)
 * and provides precise memory control based on actual bytes used, not piece count
 */
export class TorrentManager {
  private client: Instance;
  private activeTorrents: Map<string, Torrent>;

  constructor() {
    // WebTorrent client - pieces will be stored in memory only
    // No disk writes, only RAM usage for downloaded pieces
    this.client = new WebTorrent();
    this.activeTorrents = new Map();
  }

  /**
   * Adds a torrent and waits for metadata
   * @param magnet - Magnet link
   * @returns Promise that resolves to Torrent object
   */
  async addTorrent(magnet: string): Promise<Torrent> {
    // Check if torrent is already active
    let torrent = this.activeTorrents.get(magnet);

    if (!torrent) {
      console.log(`Loading torrent: ${magnet.substring(0, 50)}...`);

      // Add new torrent with memory-limited store
      // This ensures pieces are stored in memory only, not written to disk
      // For large files (40-50GB), this prevents creating full file instances
      // MemoryLimitedStore tracks total memory usage and evicts LRU pieces when limit exceeded
      torrent = this.client.add(magnet, {
        // store is a function that creates a chunk store for the torrent
        // MemoryLimitedStore tracks memory usage globally and evicts based on bytes, not piece count
        store: (chunkLength: number) => {
          return createMemoryLimitedStore(chunkLength, config.MAX_MEMORY_USAGE);
        }
      });
      this.activeTorrents.set(magnet, torrent);

      // Wait for torrent to receive metadata
      await new Promise<void>((resolve, reject) => {
        const torrentRef = torrent; // Keep reference for timeout check

        if (!torrentRef) {
          reject(new Error('Failed to create torrent'));
          return;
        }

        torrentRef.on('metadata', () => {
          console.log('Metadata received');
          resolve();
        });

        // Use any to handle error event which may not be in types
        (torrentRef as any).on('error', (err: Error) => {
          console.error('Torrent error:', err);
          this.activeTorrents.delete(magnet);
          reject(err);
        });

        // Timeout for metadata reception
        setTimeout(() => {
          // Check if metadata was received (using any to access private property)
          const hasMetadata = (torrentRef as any).metadata;
          if (!hasMetadata) {
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
   * @param magnet - Magnet link
   * @returns Torrent object or null
   */
  getTorrent(magnet: string): Torrent | null {
    return this.activeTorrents.get(magnet) || null;
  }

  /**
   * Gets video file from torrent
   * @param magnet - Magnet link
   * @returns Video file or null
   */
  getVideoFile(magnet: string): TorrentFile | null {
    const torrent = this.getTorrent(magnet);
    if (!torrent) {
      return null;
    }
    const videoFile = findVideoFile(torrent);
    return videoFile || null;
  }

  /**
   * Removes a torrent
   * @param magnet - Magnet link
   * @returns True if torrent was removed
   */
  removeTorrent(magnet: string): boolean {
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
   * @returns Array of torrent info objects
   */
  getAllTorrents(): TorrentInfo[] {
    return Array.from(this.activeTorrents.values()).map((torrent: Torrent) => ({
      infoHash: torrent.infoHash,
      name: torrent.name,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      numPeers: torrent.numPeers
    }));
  }

  /**
   * Gets detailed torrent information
   * @param magnet - Magnet link
   * @returns Torrent info or null
   */
  getTorrentInfo(magnet: string): DetailedTorrentInfo | null {
    const torrent = this.getTorrent(magnet);
    if (!torrent) {
      return null;
    }

    const videoFile = findVideoFile(torrent);

    return {
      name: torrent.name,
      infoHash: torrent.infoHash,
      files: torrent.files.map((f: TorrentFile): FileInfo => ({
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
   * @returns Promise that resolves when all torrents are stopped
   */
  destroy(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.client.destroy(() => {
        this.activeTorrents.clear();
        resolve();
      });
    });
  }
}
