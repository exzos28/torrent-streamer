/**
 * Unit tests for ListTorrentsUseCase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListTorrentsUseCase } from './ListTorrentsUseCase';
import { ITorrentRepository } from '../../domain/interfaces';
import { TorrentEntity } from '../../domain/entities';

describe('ListTorrentsUseCase', () => {
    let useCase: ListTorrentsUseCase;
    let mockTorrentRepository: ITorrentRepository;

    beforeEach(() => {
        mockTorrentRepository = {
            add: vi.fn(),
            get: vi.fn(),
            getAll: vi.fn(),
            getInfo: vi.fn(),
            getVideoFile: vi.fn(),
            remove: vi.fn(),
            destroy: vi.fn()
        };

        useCase = new ListTorrentsUseCase(mockTorrentRepository);
    });

    it('should return empty list when no torrents exist', () => {
        vi.mocked(mockTorrentRepository.getAll).mockReturnValue([]);

        const result = useCase.execute({});

        expect(result.success).toBe(true);
        expect(result.torrents).toEqual([]);
        expect(result.count).toBe(0);
        expect(mockTorrentRepository.getAll).toHaveBeenCalled();
    });

    it('should return list of torrents', () => {
        const torrents: TorrentEntity[] = [
            {
                infoHash: 'hash1',
                name: 'Torrent 1',
                progress: 0.5,
                downloadSpeed: 1000,
                uploadSpeed: 500,
                numPeers: 5,
                ready: false,
                files: []
            },
            {
                infoHash: 'hash2',
                name: 'Torrent 2',
                progress: 1,
                downloadSpeed: 0,
                uploadSpeed: 0,
                numPeers: 0,
                ready: true,
                files: []
            }
        ];

        vi.mocked(mockTorrentRepository.getAll).mockReturnValue(torrents);

        const result = useCase.execute({});

        expect(result.success).toBe(true);
        expect(result.torrents).toEqual(torrents);
        expect(result.count).toBe(2);
        expect(result.torrents.length).toBe(2);
    });

    it('should work without request parameter', () => {
        const torrents: TorrentEntity[] = [
            {
                infoHash: 'hash1',
                name: 'Torrent 1',
                progress: 1,
                downloadSpeed: 0,
                uploadSpeed: 0,
                numPeers: 0,
                ready: true,
                files: []
            }
        ];

        vi.mocked(mockTorrentRepository.getAll).mockReturnValue(torrents);

        const result = useCase.execute();

        expect(result.success).toBe(true);
        expect(result.torrents).toEqual(torrents);
        expect(result.count).toBe(1);
    });
});
