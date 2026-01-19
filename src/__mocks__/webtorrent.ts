/**
 * Mock implementation of WebTorrent for testing
 */

import { EventEmitter } from 'events';

export interface MockTorrentFile {
    name: string;
    length: number;
    path: string;
    createReadStream(options?: { start?: number; end?: number }): NodeJS.ReadableStream;
}

export interface MockTorrent extends EventEmitter {
    infoHash: string;
    name: string;
    length: number;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    ready: boolean;
    files: MockTorrentFile[];
    pieceLength: number;
    pieces: boolean[];
    select(pieceIndex: number, priority: boolean): void;
    metadata: boolean;
}

export interface MockWebTorrentClient extends EventEmitter {
    add(magnet: string, options?: any): MockTorrent;
    remove(torrent: MockTorrent): void;
    destroy(callback?: () => void): void;
}

/**
 * Creates a mock torrent file
 */
export function createMockTorrentFile(
    name: string,
    length: number,
    path: string
): MockTorrentFile {
    return {
        name,
        length,
        path,
        createReadStream(options?: { start?: number; end?: number }): NodeJS.ReadableStream {
            const { Readable } = require('stream');
            const start = options?.start || 0;
            const end = options?.end || length - 1;
            const chunkSize = end - start + 1;

            // Create a readable stream with mock data
            const stream = new Readable({
                read() {
                    // Generate mock video data (just zeros for testing)
                    const buffer = Buffer.alloc(Math.min(chunkSize, 1024 * 1024)); // 1MB chunks
                    this.push(buffer);
                    if (this.readableLength >= chunkSize) {
                        this.push(null); // End stream
                    }
                }
            });

            return stream as NodeJS.ReadableStream;
        }
    };
}

/**
 * Creates a mock torrent
 */
export function createMockTorrent(
    infoHash: string,
    name: string,
    files: MockTorrentFile[]
): MockTorrent {
    const torrent = new EventEmitter() as MockTorrent;
    const totalLength = files.reduce((sum, f) => sum + f.length, 0);

    torrent.infoHash = infoHash;
    torrent.name = name;
    torrent.length = totalLength;
    torrent.progress = 1.0; // Fully downloaded for testing
    torrent.downloadSpeed = 0;
    torrent.uploadSpeed = 0;
    torrent.numPeers = 5;
    torrent.ready = true;
    torrent.files = files;
    torrent.pieceLength = 16384; // 16KB pieces
    torrent.pieces = new Array(100).fill(true); // All pieces available
    torrent.metadata = true;

    torrent.select = (_pieceIndex: number, _priority: boolean): void => {
        // Mock implementation
    };

    // Emit metadata event immediately
    setImmediate(() => {
        torrent.emit('metadata');
    });

    return torrent;
}

/**
 * Creates a mock WebTorrent client
 */
export function createMockWebTorrentClient(): MockWebTorrentClient {
    const client = new EventEmitter() as MockWebTorrentClient;
    const torrents = new Map<string, MockTorrent>();

    client.add = (magnet: string, _options?: any): MockTorrent => {
        // Extract infoHash from magnet link (simplified)
        const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/);
        const infoHash = infoHashMatch ? infoHashMatch[1] : `hash_${Date.now()}`;

        // Check if torrent already exists
        if (torrents.has(magnet)) {
            return torrents.get(magnet)!;
        }

        // Create mock video file
        const videoFile = createMockTorrentFile('test-video.mp4', 100 * 1024 * 1024, 'test-video.mp4');
        const torrent = createMockTorrent(infoHash, 'Test Torrent', [videoFile]);

        torrents.set(magnet, torrent);

        // Emit metadata after a short delay (simulating network delay)
        setImmediate(() => {
            torrent.emit('metadata');
        });

        return torrent;
    };

    client.remove = (torrent: MockTorrent): void => {
        // Find and remove torrent
        for (const [magnet, t] of torrents.entries()) {
            if (t === torrent) {
                torrents.delete(magnet);
                break;
            }
        }
    };

    client.destroy = (callback?: () => void): void => {
        torrents.clear();
        if (callback) {
            setImmediate(callback);
        }
    };

    return client;
}
