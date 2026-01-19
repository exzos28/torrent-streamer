/**
 * Use case for getting debug information about all torrents
 * Includes pieces status for debugging download progress
 */

import { ITorrentRepository } from '../../domain/interfaces';
import { TorrentDebugInfo } from '../../domain/interfaces/ITorrentRepository';

export interface GetTorrentsDebugInfoRequest {
    // No parameters needed
}

export interface GetTorrentsDebugInfoResponse {
    success: boolean;
    torrents: TorrentDebugInfo[];
    count: number;
}

export class GetTorrentsDebugInfoUseCase {
    constructor(
        private torrentRepository: ITorrentRepository
    ) { }

    execute(_request: GetTorrentsDebugInfoRequest = {}): GetTorrentsDebugInfoResponse {
        const torrents = this.torrentRepository.getDebugInfo();

        return {
            success: true,
            torrents,
            count: torrents.length
        };
    }
}
