/**
 * Interface for finding video files in torrents
 */

import { TorrentEntity, TorrentFileEntity } from '../entities/Torrent';

export interface IVideoFileFinder {
  /**
   * Finds the first video file in a torrent
   * @param torrent - Torrent entity
   * @returns Video file entity or null if not found
   */
  find(torrent: TorrentEntity): TorrentFileEntity | null;
}
