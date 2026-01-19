/**
 * Use case for listing all active torrents
 * Contains business logic for retrieving torrent list
 */

import { ITorrentRepository } from '../../domain/interfaces';
import { TorrentEntity } from '../../domain/entities';

export interface ListTorrentsRequest {
    // No parameters needed for listing all torrents
}

export interface ListTorrentsResponse {
    success: boolean;
    torrents: TorrentEntity[];
    count: number;
}

export class ListTorrentsUseCase {
    constructor(
        private torrentRepository: ITorrentRepository
    ) { }

    execute(_request: ListTorrentsRequest = {}): ListTorrentsResponse {
        const torrents = this.torrentRepository.getAll();

        return {
            success: true,
            torrents,
            count: torrents.length
        };
    }
}
