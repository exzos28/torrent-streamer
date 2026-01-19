/**
 * Use case for adding a torrent
 * Contains business logic for adding torrents by magnet link
 */

import { ITorrentRepository, ILogger } from '../../domain/interfaces';
import { TorrentEntity } from '../../domain/entities';

export interface AddTorrentRequest {
    magnet: string;
}

export interface AddTorrentResponse {
    success: boolean;
    torrent?: TorrentEntity;
    error?: string;
}

export class AddTorrentUseCase {
    constructor(
        private torrentRepository: ITorrentRepository,
        private logger: ILogger
    ) { }

    async execute(request: AddTorrentRequest): Promise<AddTorrentResponse> {
        try {
            // Validate magnet link
            if (!request.magnet || !request.magnet.startsWith('magnet:')) {
                return {
                    success: false,
                    error: 'Invalid magnet link'
                };
            }

            // Check if torrent already exists
            const existingTorrent = this.torrentRepository.get(request.magnet);
            if (existingTorrent) {
                this.logger.info(`Torrent already exists: ${existingTorrent.name}`);
                return {
                    success: true,
                    torrent: existingTorrent
                };
            }

            // Add torrent and wait for metadata
            this.logger.info(`Adding torrent: ${request.magnet.substring(0, 50)}...`);
            const torrent = await this.torrentRepository.add(request.magnet);

            this.logger.info(`Torrent added successfully: ${torrent.name} (${torrent.progress * 100}% ready)`);

            return {
                success: true,
                torrent
            };
        } catch (error) {
            this.logger.error('Error in AddTorrentUseCase:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage
            };
        }
    }
}
