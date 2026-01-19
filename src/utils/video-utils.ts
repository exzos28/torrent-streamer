import path from 'path';
import config from '../config';
import { Torrent, TorrentFile } from 'webtorrent';

/**
 * Finds the first video file in the torrent
 * @param torrent - WebTorrent torrent object
 * @returns Video file or undefined if not found
 */
export function findVideoFile(torrent: Torrent): TorrentFile | undefined {
  return torrent.files.find((file: TorrentFile) => {
    const ext = path.extname(file.name).toLowerCase();
    return config.VIDEO_EXTENSIONS.includes(ext);
  });
}
