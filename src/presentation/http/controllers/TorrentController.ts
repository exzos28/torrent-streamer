import { Request, Response } from 'express';
import { GetTorrentInfoUseCase } from '../../../application/use-cases/GetTorrentInfoUseCase';
import { ITorrentRepository } from '../../../domain/interfaces/ITorrentRepository';

/**
 * Controller for handling torrent-related HTTP requests
 */
export class TorrentController {
    constructor(
        private getTorrentInfoUseCase: GetTorrentInfoUseCase,
        private torrentRepository: ITorrentRepository
    ) { }

    /**
     * Handles GET /info?magnet=...
     */
    async getInfo(req: Request, res: Response): Promise<void> {
        const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

        if (!magnet) {
            res.status(400).json({ error: 'Magnet link required' });
            return;
        }

        const result = this.getTorrentInfoUseCase.execute({ magnet });

        if (!result.success || !result.info) {
            res.status(result.error === 'Magnet link required' ? 400 : 404).json({
                error: result.error || 'Torrent not found'
            });
            return;
        }

        res.json(result.info);
    }

    /**
     * Handles GET /torrents
     */
    getAll(_req: Request, res: Response): void {
        const torrents = this.torrentRepository.getAll();
        res.json({ torrents });
    }

    /**
     * Handles DELETE /torrent?magnet=...
     */
    remove(req: Request, res: Response): void {
        const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

        if (!magnet) {
            res.status(400).json({ error: 'Magnet link required' });
            return;
        }

        const removed = this.torrentRepository.remove(magnet);

        if (removed) {
            res.json({ message: 'Torrent stopped' });
        } else {
            res.status(404).json({ error: 'Torrent not found' });
        }
    }
}
