/**
 * Common types for torrent streamer project
 */

export interface TorrentInfo {
    infoHash: string;
    name: string;
    progress: number;
    downloadSpeed: number;
    numPeers: number;
}

export interface FileInfo {
    name: string;
    length: number;
    isVideo: boolean;
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

export interface ErrorResponse {
    error: string;
}

export interface TorrentsResponse {
    torrents: TorrentInfo[];
}

// StreamQuery removed - using Express's built-in query types instead
