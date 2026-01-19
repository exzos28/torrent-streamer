/**
 * Adapter to convert WebTorrent types to domain entities
 */

import { Torrent, TorrentFile } from 'webtorrent';
import { TorrentEntity, TorrentFileEntity } from '../../domain/entities';

export class WebTorrentAdapter {
  static toTorrentEntity(torrent: Torrent): TorrentEntity {
    return {
      infoHash: torrent.infoHash,
      name: torrent.name,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      numPeers: torrent.numPeers,
      ready: torrent.ready,
      files: torrent.files.map((f) => this.toTorrentFileEntity(f))
    };
  }

  static toTorrentFileEntity(file: TorrentFile): TorrentFileEntity {
    return {
      name: file.name,
      length: file.length,
      path: file.path,
      createReadStream: (options?: { start?: number; end?: number }) => {
        // WebTorrent's createReadStream accepts optional parameters
        // We pass them through as-is, WebTorrent handles undefined values
        const stream = file.createReadStream(options as any);
        return stream as NodeJS.ReadableStream;
      }
    };
  }

  static toTorrentFile(_file: TorrentFileEntity, originalFile: TorrentFile): TorrentFile {
    // Return original WebTorrent file for streaming
    // This is needed because we need the actual WebTorrent file object for createReadStream
    return originalFile;
  }
}
