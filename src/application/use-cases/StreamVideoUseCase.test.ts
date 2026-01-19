/**
 * Unit tests for StreamVideoUseCase
 * Demonstrates how to test use cases with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamVideoUseCase } from './StreamVideoUseCase';
import { ITorrentRepository, ILogger } from '../../domain/interfaces';
import { TorrentFileEntity } from '../../domain/entities';

describe('StreamVideoUseCase', () => {
    let useCase: StreamVideoUseCase;
    let mockTorrentRepository: ITorrentRepository;
    let mockLogger: ILogger;

    beforeEach(() => {
        // Create mocks
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

        useCase = new StreamVideoUseCase(mockTorrentRepository, mockLogger);
    });

    it('should return error for invalid magnet link', async () => {
        const result = await useCase.execute({ magnet: 'invalid' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid magnet link');
        expect(mockTorrentRepository.add).not.toHaveBeenCalled();
    });

    it('should return error when magnet link is missing', async () => {
        const result = await useCase.execute({ magnet: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid magnet link');
    });

    it('should return error when video file not found', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';

        vi.mocked(mockTorrentRepository.add).mockResolvedValue({
            infoHash: 'test',
            name: 'Test Torrent',
            progress: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            ready: false,
            files: []
        });

        vi.mocked(mockTorrentRepository.getVideoFile).mockReturnValue(null);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Video file not found in torrent');
        expect(mockTorrentRepository.add).toHaveBeenCalledWith(magnet);
        expect(mockTorrentRepository.getVideoFile).toHaveBeenCalledWith(magnet);
    });

    it('should return success with video file when torrent exists', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const mockVideoFile: TorrentFileEntity = {
            name: 'video.mp4',
            length: 100 * 1024 * 1024, // 100 MB
            path: 'video.mp4',
            createReadStream: vi.fn()
        };

        vi.mocked(mockTorrentRepository.add).mockResolvedValue({
            infoHash: 'test',
            name: 'Test Torrent',
            progress: 1,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            ready: true,
            files: [mockVideoFile]
        });

        vi.mocked(mockTorrentRepository.getVideoFile).mockReturnValue(mockVideoFile);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(true);
        expect(result.file).toEqual(mockVideoFile);
        expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle errors from repository', async () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const error = new Error('Repository error');

        vi.mocked(mockTorrentRepository.add).mockRejectedValue(error);

        const result = await useCase.execute({ magnet });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Repository error');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
