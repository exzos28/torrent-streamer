import { Request, Response } from 'express';
import { StreamVideoUseCase } from '../../../application/use-cases/StreamVideoUseCase';
import { IStreamService } from '../../../domain/interfaces/IStreamService';
import { WebTorrentRepository } from '../../../infrastructure/torrent/WebTorrentRepository';
import { WebTorrentStreamService } from '../../../infrastructure/streaming/WebTorrentStreamService';

/**
 * Controller for handling stream-related HTTP requests
 */
export class StreamController {
    constructor(
        private streamVideoUseCase: StreamVideoUseCase,
        private streamService: IStreamService,
        private torrentRepository: WebTorrentRepository
    ) { }

    /**
     * Handles GET /stream?magnet=...
     */
    async stream(req: Request, res: Response): Promise<void> {
        const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

        if (!magnet || !magnet.startsWith('magnet:')) {
            res.status(400).json({
                error: 'Magnet link required in parameter ?magnet=magnet:?xt=...'
            });
            return;
        }

        try {
            // Execute use case to get video file
            const result = await this.streamVideoUseCase.execute({ magnet });

            if (!result.success || !result.file) {
                res.status(result.error === 'Invalid magnet link' ? 400 : 404).json({
                    error: result.error || 'Video file not found in torrent'
                });
                return;
            }

            // Get raw WebTorrent file for stream service
            const rawFile = this.torrentRepository.getRawTorrentFile(magnet);
            if (rawFile && this.streamService instanceof WebTorrentStreamService) {
                this.streamService.setRawFile(result.file, rawFile);
            }

            // Stream video using stream service
            // Note: streamVideo may start sending response asynchronously
            // Don't send error response if headers are already sent
            this.streamService.streamVideo(req, res, result.file);
        } catch (error) {
            // Only send error if headers haven't been sent yet
            if (!res.headersSent) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({ error: errorMessage });
            }
        }
    }
}
