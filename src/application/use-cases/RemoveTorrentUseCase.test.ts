/**
 * Unit tests for RemoveTorrentUseCase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoveTorrentUseCase } from './RemoveTorrentUseCase';
import { ITorrentRepository, ILogger } from '../../domain/interfaces';
import { TorrentEntity } from '../../domain/entities';

describe('RemoveTorrentUseCase', () => {
    let useCase: RemoveTorrentUseCase;
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

        useCase = new RemoveTorrentUseCase(mockTorrentRepository, mockLogger);
    });

    it('should return error when magnet link is missing', () => {
        const result = useCase.execute({ magnet: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Magnet link required');
        expect(mockTorrentRepository.remove).not.toHaveBeenCalled();
    });

    it('should return error when torrent is not found', () => {
        const magnet = 'magnet:?xt=urn:btih:test';

        vi.mocked(mockTorrentRepository.get).mockReturnValue(null);

        const result = useCase.execute({ magnet });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Torrent not found');
        expect(mockTorrentRepository.remove).not.toHaveBeenCalled();
    });

    it('should remove torrent successfully', () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const torrent: TorrentEntity = {
            infoHash: 'test',
            name: 'Test Torrent',
            progress: 1,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            ready: true,
            files: []
        };

        vi.mocked(mockTorrentRepository.get).mockReturnValue(torrent);
        vi.mocked(mockTorrentRepository.remove).mockReturnValue(true);

        const result = useCase.execute({ magnet });

        expect(result.success).toBe(true);
        expect(result.message).toBe('Torrent stopped');
        expect(mockTorrentRepository.remove).toHaveBeenCalledWith(magnet);
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Torrent removed'));
    });

    it('should return error when removal fails', () => {
        const magnet = 'magnet:?xt=urn:btih:test';
        const torrent: TorrentEntity = {
            infoHash: 'test',
            name: 'Test Torrent',
            progress: 1,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            ready: true,
            files: []
        };

        vi.mocked(mockTorrentRepository.get).mockReturnValue(torrent);
        vi.mocked(mockTorrentRepository.remove).mockReturnValue(false);

        const result = useCase.execute({ magnet });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to remove torrent');
    });
});
