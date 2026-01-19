/**
 * Unit tests for AddTorrentUseCase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddTorrentUseCase } from './AddTorrentUseCase';
import { ITorrentRepository, ILogger } from '../../domain/interfaces';
import { TorrentEntity } from '../../domain/entities';

describe('AddTorrentUseCase', () => {
    let useCase: AddTorrentUseCase;
    let mockTorrentRepository: ITorrentRepository;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockTorrentRepository = {
            add: vi.fn(),
            get: vi.fn(),
            getAll: vi.fn(),
            getInfo: vi.fn(),
            getVideoFile: vi.fn(),
            remove: vi.fn(),
            destroy: vi.fn(),
            getDebugInfo: vi.fn()
        };

        mockLogger = {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        useCase = new AddTorrentUseCase(mockTorrentRepository, mockLogger);
    });

    it('should return error for invalid magnet link', async () => {
        const result = await useCase.execute({ magnet: 'invalid-link' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid magnet link');
        expect(mockTorrentRepository.add).not.toHaveBeenCalled();
    });

    it('should return error when magnet link is missing', async () => {
        const result = await useCase.execute({ magnet: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid magnet link');
    });

    it('should return existing torrent if already added', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const existingTorrent: TorrentEntity = {
            infoHash: 'test',
            name: 'Existing Torrent',
            progress: 1,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            ready: true,
            files: []
        };

        vi.mocked(mockTorrentRepository.get).mockReturnValue(existingTorrent);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(true);
        expect(result.torrent).toEqual(existingTorrent);
        expect(mockTorrentRepository.add).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Torrent already exists'));
    });

    it('should add new torrent successfully', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const newTorrent: TorrentEntity = {
            infoHash: 'test',
            name: 'New Torrent',
            progress: 0.5,
            downloadSpeed: 1000,
            uploadSpeed: 500,
            numPeers: 5,
            ready: false,
            files: []
        };

        vi.mocked(mockTorrentRepository.get).mockReturnValue(null);
        vi.mocked(mockTorrentRepository.add).mockResolvedValue(newTorrent);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(true);
        expect(result.torrent).toEqual(newTorrent);
        expect(mockTorrentRepository.add).toHaveBeenCalledWith(magnet);
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Adding torrent'));
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Torrent added successfully'));
    });

    it('should handle errors from repository', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const error = new Error('Repository error');

        vi.mocked(mockTorrentRepository.get).mockReturnValue(null);
        vi.mocked(mockTorrentRepository.add).mockRejectedValue(error);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Repository error');
        expect(mockLogger.error).toHaveBeenCalledWith('Error in AddTorrentUseCase:', error);
    });
});
