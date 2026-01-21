/**
 * Unit tests for WebTorrentStreamService
 * Tests piece waiting and download checking functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebTorrentStreamService } from './WebTorrentStreamService';
import { ILogger } from '../../domain/interfaces/ILogger';
import { TorrentFileEntity } from '../../domain/entities';
import { EventEmitter } from 'events';
import { ExtendedTorrentFile } from '../torrent/WebTorrentExtendedTypes';
import config from '../../config';

describe('WebTorrentStreamService', () => {
    let service: WebTorrentStreamService;
    let mockLogger: ILogger;
    let mockFile: TorrentFileEntity;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            log: vi.fn()
        };
        service = new WebTorrentStreamService(mockLogger);

        mockFile = {
            name: 'test.mp4',
            length: 1000000,
            path: 'test.mp4',
            createReadStream: vi.fn()
        } as TorrentFileEntity;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    function createMockTorrent(pieces: Array<{ length: number; missing: number } | null>) {
        const torrent = new EventEmitter() as any;
        torrent.pieceLength = 16384; // 16KB pieces
        torrent.pieces = pieces;
        torrent.bitfield = null;
        return torrent;
    }

    function createMockTorrentFile(torrent: any): ExtendedTorrentFile {
        const file = {
            name: 'test.mp4',
            length: 1000000,
            path: 'test.mp4',
            _torrent: torrent
        } as ExtendedTorrentFile;
        return file;
    }

    describe('_arePiecesDownloaded', () => {
        it('should return true when all required pieces are downloaded', () => {
            // Create torrent with pieces 0-9 downloaded
            const pieces: Array<{ length: number; missing: number } | null> = [
                ...Array(10).fill({ length: 16384, missing: 0 }), // Pieces 0-9 downloaded
                ...Array(10).fill(null) // Pieces 10-19 not downloaded
            ];
            const torrent = createMockTorrent(pieces);
            const requiredPieces = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(true);
        });

        it('should return false when some pieces are not downloaded', () => {
            // Create torrent with pieces 0-4 downloaded, 5-9 not downloaded
            const pieces: Array<{ length: number; missing: number } | null> = [
                ...Array(5).fill({ length: 16384, missing: 0 }), // Pieces 0-4 downloaded
                ...Array(5).fill(null) // Pieces 5-9 not downloaded
            ];
            const torrent = createMockTorrent(pieces);
            const requiredPieces = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(false);
        });

        it('should return false when pieces are partially downloaded', () => {
            // Create torrent with piece 0 fully downloaded, piece 1 partially downloaded
            const pieces: Array<{ length: number; missing: number } | null> = [
                { length: 16384, missing: 0 }, // Piece 0 fully downloaded
                { length: 16384, missing: 8192 }, // Piece 1 partially downloaded
                ...Array(8).fill(null)
            ];
            const torrent = createMockTorrent(pieces);
            const requiredPieces = new Set([0, 1]);

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(false);
        });

        it('should return false when piece index is out of range', () => {
            const pieces: Array<{ length: number; missing: number } | null> = [
                ...Array(10).fill({ length: 16384, missing: 0 })
            ];
            const torrent = createMockTorrent(pieces);
            const requiredPieces = new Set([0, 1, 2, 15]); // Piece 15 is out of range

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(false);
        });

        it('should return false when pieces array is not available', () => {
            const torrent = createMockTorrent([]);
            torrent.pieces = null;
            const requiredPieces = new Set([0, 1, 2, 3, 4]);

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(false);
        });


        it('should return false when neither pieces nor bitfield is available', () => {
            const torrent = createMockTorrent([]);
            torrent.pieces = null;
            torrent.bitfield = null;
            const requiredPieces = new Set([0, 1]);

            const result = (service as any)._arePiecesDownloaded(torrent, requiredPieces);
            expect(result).toBe(false);
        });
    });

    describe('_waitForPieces', () => {
        it('should return true immediately if pieces are already downloaded', async () => {
            const pieces: Array<{ length: number; missing: number } | null> = [
                ...Array(10).fill({ length: 16384, missing: 0 })
            ];
            const torrent = createMockTorrent(pieces);
            torrent.pieceLength = 16384;
            const file = createMockTorrentFile(torrent);

            // Set up the raw file map
            (service as any).rawFileMap.set(mockFile, file);

            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 163839);
            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('All required pieces')
            );
        });

        it('should return false when file is not in rawFileMap', async () => {
            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 163840);
            expect(result).toBe(false);
        });

        it('should return false when torrent is not available', async () => {
            const file = {
                name: 'test.mp4',
                length: 1000000,
                path: 'test.mp4',
                _torrent: null
            } as unknown as ExtendedTorrentFile;

            (service as any).rawFileMap.set(mockFile, file);

            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 163840);
            expect(result).toBe(false);
        });

        it('should return false when pieceLength is zero', async () => {
            const torrent = createMockTorrent([]);
            torrent.pieceLength = 0;
            const file = createMockTorrentFile(torrent);

            (service as any).rawFileMap.set(mockFile, file);

            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 163840);
            expect(result).toBe(false);
        });

        it('should wait for pieces to download and return true', async () => {
            // Initially pieces are not downloaded
            const pieces: Array<{ length: number; missing: number } | null> = [
                null, null, null, null, null, // Pieces 0-4 not downloaded
                ...Array(5).fill({ length: 16384, missing: 0 }) // Pieces 5-9 downloaded
            ];
            const torrent = createMockTorrent(pieces);
            torrent.pieceLength = 16384;
            const file = createMockTorrentFile(torrent);

            (service as any).rawFileMap.set(mockFile, file);

            // Start waiting for pieces
            // Request bytes 0-81919 (pieces 0-4, endPiece = floor(81919/16384) = 4)
            const waitPromise = (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 81919);

            // Simulate pieces being downloaded after 50ms
            setTimeout(() => {
                // Mark pieces 0-4 as downloaded
                for (let i = 0; i < 5; i++) {
                    torrent.pieces[i] = { length: 16384, missing: 0 };
                }
                torrent.emit('download');
            }, 50);

            const result = await waitPromise;
            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('All required pieces')
            );
        }, 10000);

        it('should timeout and return false if pieces are not downloaded in time', async () => {
            // Save original timeout
            const originalTimeout = config.PIECE_WAIT_TIMEOUT;
            // Use shorter timeout for test
            (config as any).PIECE_WAIT_TIMEOUT = 100;

            const pieces: Array<{ length: number; missing: number } | null> = [
                null, null, null, null, null, null, // Pieces 0-5 not downloaded
                ...Array(5).fill({ length: 16384, missing: 0 })
            ];
            const torrent = createMockTorrent(pieces);
            torrent.pieceLength = 16384;
            const file = createMockTorrentFile(torrent);

            (service as any).rawFileMap.set(mockFile, file);

            // Request bytes 0-81919 (pieces 0-4, but endPiece calculation includes piece 5)
            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 81919);

            expect(result).toBe(false);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Waiting for pieces')
            );

            // Restore original timeout
            (config as any).PIECE_WAIT_TIMEOUT = originalTimeout;
        }, 5000);

        it('should calculate correct piece range from byte range', async () => {
            const pieces: Array<{ length: number; missing: number } | null> = [
                ...Array(20).fill({ length: 16384, missing: 0 })
            ];
            const torrent = createMockTorrent(pieces);
            torrent.pieceLength = 16384; // 16KB pieces
            const file = createMockTorrentFile(torrent);

            (service as any).rawFileMap.set(mockFile, file);

            // Request bytes 32768-65535 (pieces 2-3)
            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 32768, 65535);
            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('All required pieces 2-3 are already downloaded')
            );
        });

        it('should handle non-extended torrent file', async () => {
            const file = {
                name: 'test.mp4',
                length: 1000000,
                path: 'test.mp4'
                // No _torrent property
            } as any;

            (service as any).rawFileMap.set(mockFile, file);

            const result = await (service as any)._waitForPieces(mockFile, 'test.mp4', 0, 163840);
            expect(result).toBe(false);
        });
    });
});
