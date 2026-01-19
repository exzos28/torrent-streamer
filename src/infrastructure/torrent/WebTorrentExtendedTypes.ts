/**
 * Extended types for WebTorrent internal properties
 * These are not part of the public API but are needed for advanced functionality
 */

import { Torrent, TorrentFile } from 'webtorrent';

/**
 * Extended Torrent type with internal properties
 * Uses intersection type to avoid conflicts with base Torrent interface
 */
export type ExtendedTorrent = Torrent & {
    /**
     * Internal metadata flag
     */
    readonly metadata?: boolean;

    /**
     * Internal bitfield for piece availability
     */
    readonly bitfield?: {
        get(index: number): boolean;
        [key: string]: unknown;
    };

    /**
     * Internal selections array for prioritized pieces
     */
    readonly _selections?: number[];

    /**
     * Internal selection bitfield for prioritized pieces
     */
    readonly _selection?: {
        get(index: number): boolean;
        [key: string]: unknown;
    } | number[];
}

/**
 * Extended TorrentFile type with internal properties
 * Uses intersection type to avoid conflicts with base TorrentFile interface
 */
export type ExtendedTorrentFile = TorrentFile & {
    /**
     * Internal reference to parent torrent
     */
    readonly _torrent?: ExtendedTorrent;
}

/**
 * Type guard to check if torrent has extended properties
 * In practice, all Torrent objects have these properties at runtime
 */
export function isExtendedTorrent(torrent: Torrent | ExtendedTorrent): torrent is ExtendedTorrent {
    return torrent !== null && typeof torrent === 'object';
}

/**
 * Type guard to check if file has extended properties
 * In practice, all TorrentFile objects have these properties at runtime
 */
export function isExtendedTorrentFile(file: TorrentFile | ExtendedTorrentFile): file is ExtendedTorrentFile {
    return file !== null && typeof file === 'object';
}
