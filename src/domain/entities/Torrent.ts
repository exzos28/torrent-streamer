/**
 * Domain entity representing a torrent
 * This is a domain model, independent of infrastructure
 */

export interface TorrentEntity {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  ready: boolean;
  files: TorrentFileEntity[];
}

export interface TorrentFileEntity {
  name: string;
  length: number;
  path: string;
  createReadStream(options?: { start?: number; end?: number }): NodeJS.ReadableStream;
}

export interface StreamRange {
  start: number;
  end: number;
  fileSize: number;
}
