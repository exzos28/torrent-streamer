/**
 * Unit tests for WebTorrentRepository.getDebugInfo
 * Tests piece ranges and counts functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebTorrentRepository } from './WebTorrentRepository';
import { VideoFileFinder } from './VideoFileFinder';
import { ILogger } from '../../domain/interfaces/ILogger';
import { TorrentWrapper } from './TorrentWrapper';
import { EventEmitter } from 'events';

describe('WebTorrentRepository.getDebugInfo', () => {
    let repository: WebTorrentRepository;
    let mockLogger: ILogger;
    let videoFileFinder: VideoFileFinder;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            log: vi.fn()
        };
        videoFileFinder = new VideoFileFinder();
        repository = new WebTorrentRepository(videoFileFinder, mockLogger);
    });

    it('should return empty array when no torrents exist', () => {
        const debugInfo = repository.getDebugInfo();
        expect(debugInfo).toEqual([]);
    });

    function createMockTorrent(pieces: Array<{ length: number; missing: number } | null>) {
        const torrent = new EventEmitter() as any;
        torrent.infoHash = 'test-hash';
        torrent.name = 'Test Torrent';
        torrent.length = 1000000;
        torrent.progress = 0.5;
        torrent.downloadSpeed = 1000;
        torrent.uploadSpeed = 500;
        torrent.numPeers = 5;
        torrent.ready = true;
        torrent.pieceLength = 16384;
        torrent.pieces = pieces;
        torrent.files = [
            { name: 'test.mp4', length: 1000000, path: 'test.mp4' }
        ];
        torrent.select = vi.fn();
        torrent.deselect = vi.fn();
        return torrent;
    }

    it('should calculate downloadedPiecesCount correctly', () => {
        // Create pieces: first 30 downloaded, next 20 not, last 50 downloaded
        const pieces: Array<{ length: number; missing: number } | null> = [
            ...Array(30).fill({ length: 16384, missing: 0 }),
            ...Array(20).fill(null),
            ...Array(50).fill({ length: 16384, missing: 0 })
        ];
        const mockTorrent = createMockTorrent(pieces);

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        const debugInfo = repository.getDebugInfo();

        expect(debugInfo).toHaveLength(1);
        expect(debugInfo[0].totalPieces).toBe(100);
        expect(debugInfo[0].downloadedPiecesCount).toBe(80); // 30 + 50
    });

    it('should calculate downloadedRanges correctly', () => {
        const pieces: Array<{ length: number; missing: number } | null> = [
            // Pieces 0-9: downloaded
            ...Array(10).fill({ length: 16384, missing: 0 }),
            // Pieces 10-19: not downloaded
            ...Array(10).fill(null),
            // Pieces 20-29: downloaded
            ...Array(10).fill({ length: 16384, missing: 0 }),
            // Pieces 30-39: not downloaded
            ...Array(10).fill(null),
            // Pieces 40-49: downloaded
            ...Array(10).fill({ length: 16384, missing: 0 })
        ];
        const mockTorrent = createMockTorrent(pieces);

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        const debugInfo = repository.getDebugInfo();

        expect(debugInfo[0].downloadedRanges).toEqual([[0, 9], [20, 29], [40, 49]]);
    });

    it('should calculate prioritizedRanges correctly', () => {
        // Create pieces where some are downloaded and some are not
        const pieces: Array<{ length: number; missing: number } | null> = [];
        for (let i = 0; i < 100; i++) {
            // Pieces 0-49: downloaded, pieces 50-99: not downloaded
            if (i < 50) {
                pieces.push({ length: 16384, missing: 0 });
            } else {
                pieces.push(null);
            }
        }
        const mockTorrent = createMockTorrent(pieces);

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        // Prioritize pieces 5-15 (downloaded) and 30-40 (downloaded) and 60-70 (not downloaded)
        wrapper.select(5, 15, 1);
        wrapper.select(30, 40, 1);
        wrapper.select(60, 70, 1);

        const debugInfo = repository.getDebugInfo();

        // After cleanup, only non-downloaded prioritized pieces should remain
        // So only 60-70 should be in prioritizedRanges
        expect(debugInfo[0].prioritizedRanges).toEqual([[60, 70]]);
    });

    it('should handle empty prioritized ranges', () => {
        const pieces = Array(100).fill({ length: 16384, missing: 0 });
        const mockTorrent = createMockTorrent(pieces);

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        const debugInfo = repository.getDebugInfo();

        expect(debugInfo[0].prioritizedRanges).toEqual([]);
    });

    it('should handle torrent with no downloaded pieces', () => {
        const pieces = Array(100).fill(null); // None downloaded
        const mockTorrent = createMockTorrent(pieces);
        mockTorrent.progress = 0;
        mockTorrent.downloadSpeed = 0;
        mockTorrent.uploadSpeed = 0;
        mockTorrent.numPeers = 0;
        mockTorrent.ready = false;

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        const debugInfo = repository.getDebugInfo();

        expect(debugInfo[0].downloadedPiecesCount).toBe(0);
        expect(debugInfo[0].downloadedRanges).toEqual([]);
    });

    it('should handle torrent with all pieces downloaded', () => {
        const pieces = Array(100).fill({ length: 16384, missing: 0 }); // All downloaded
        const mockTorrent = createMockTorrent(pieces);
        mockTorrent.progress = 1.0;
        mockTorrent.downloadSpeed = 0;
        mockTorrent.uploadSpeed = 0;
        mockTorrent.numPeers = 0;

        (repository as any).activeTorrents.set('magnet:test', mockTorrent);
        const wrapper = new TorrentWrapper(mockTorrent);
        (repository as any).torrentWrappers.set('magnet:test', wrapper);

        const debugInfo = repository.getDebugInfo();

        expect(debugInfo[0].downloadedPiecesCount).toBe(100);
        expect(debugInfo[0].downloadedRanges).toEqual([[0, 99]]);
    });
});
