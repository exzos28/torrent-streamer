/**
 * Adapter to convert WebTorrent types to domain entities
 */

import { Torrent, TorrentFile } from 'webtorrent';
import { TorrentEntity, TorrentFileEntity } from '../../domain/entities';

/**
 * Options for createReadStream method
 * WebTorrent's createReadStream requires both start and end, but we make them optional
 * for convenience - undefined values are handled by WebTorrent
 */
type CreateReadStreamOptions = {
  start?: number;
  end?: number;
};

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
      createReadStream: (options?: CreateReadStreamOptions) => {
        // WebTorrent's createReadStream accepts optional parameters
        // TypeScript types require both start and end, but runtime accepts undefined
        // We cast to satisfy TypeScript while maintaining runtime flexibility
        const stream = file.createReadStream(
          options ? ({ start: options.start, end: options.end } as { start: number; end: number }) : undefined
        );
        return stream;
      }
    };
  }

  static toTorrentFile(_file: TorrentFileEntity, originalFile: TorrentFile): TorrentFile {
    // Return original WebTorrent file for streaming
    // This is needed because we need the actual WebTorrent file object for createReadStream
    return originalFile;
  }
}
