/**
 * Repository interface for torrent operations
 * This is a port in Hexagonal Architecture
 */

import { TorrentEntity, TorrentFileEntity } from '../entities/Torrent';

export interface ITorrentRepository {
  /**
   * Adds a torrent by magnet link and waits for metadata
   * @param magnet - Magnet link
   * @returns Promise that resolves to torrent entity
   */
  add(magnet: string): Promise<TorrentEntity>;

  /**
   * Gets a torrent by magnet link
   * @param magnet - Magnet link
   * @returns Torrent entity or null if not found
   */
  get(magnet: string): TorrentEntity | null;

  /**
   * Gets all active torrents
   * @returns Array of torrent entities
   */
  getAll(): TorrentEntity[];

  /**
   * Gets detailed information about a torrent
   * @param magnet - Magnet link
   * @returns Detailed torrent info or null
   */
  getInfo(magnet: string): DetailedTorrentInfo | null;

  /**
   * Gets video file from torrent
   * @param magnet - Magnet link
   * @returns Video file entity or null
   */
  getVideoFile(magnet: string): TorrentFileEntity | null;

  /**
   * Removes a torrent
   * @param magnet - Magnet link
   * @returns True if torrent was removed
   */
  remove(magnet: string): boolean;

  /**
   * Destroys all torrents and cleans up resources
   * @returns Promise that resolves when cleanup is complete
   */
  destroy(): Promise<void>;
}

export interface DetailedTorrentInfo {
  name: string;
  infoHash: string;
  files: FileInfo[];
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  numPeers: number;
  ready: boolean;
}

export interface FileInfo {
  name: string;
  length: number;
  isVideo: boolean;
}
