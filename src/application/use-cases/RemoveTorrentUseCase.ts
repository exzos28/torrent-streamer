/**
 * Use case for removing a torrent
 * Contains business logic for removing torrents
 */

import { ITorrentRepository, ILogger } from '../../domain/interfaces';

export interface RemoveTorrentRequest {
    magnet: string;
}

export interface RemoveTorrentResponse {
    success: boolean;
    message?: string;
    error?: string;
}

export class RemoveTorrentUseCase {
    constructor(
        private torrentRepository: ITorrentRepository,
        private logger: ILogger
    ) { }

    execute(request: RemoveTorrentRequest): RemoveTorrentResponse {
        // Validate magnet link
        if (!request.magnet) {
            return {
                success: false,
                error: 'Magnet link required'
            };
        }

        // Check if torrent exists
        const torrent = this.torrentRepository.get(request.magnet);
        if (!torrent) {
            return {
                success: false,
                error: 'Torrent not found'
            };
        }

        // Remove torrent
        const removed = this.torrentRepository.remove(request.magnet);

        if (removed) {
            this.logger.info(`Torrent removed: ${torrent.name}`);
            return {
                success: true,
                message: 'Torrent stopped'
            };
        }

        return {
            success: false,
            error: 'Failed to remove torrent'
        };
    }
}
