import { Request, Response } from 'express';
import { GetTorrentInfoUseCase } from '../../../application/use-cases/GetTorrentInfoUseCase';
import { AddTorrentUseCase } from '../../../application/use-cases/AddTorrentUseCase';
import { RemoveTorrentUseCase } from '../../../application/use-cases/RemoveTorrentUseCase';
import { ListTorrentsUseCase } from '../../../application/use-cases/ListTorrentsUseCase';

/**
 * Controller for handling torrent-related HTTP requests
 */
export class TorrentController {
    constructor(
        private getTorrentInfoUseCase: GetTorrentInfoUseCase,
        private addTorrentUseCase: AddTorrentUseCase,
        private removeTorrentUseCase: RemoveTorrentUseCase,
        private listTorrentsUseCase: ListTorrentsUseCase
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
        const result = this.listTorrentsUseCase.execute({});
        res.json({ torrents: result.torrents, count: result.count });
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

        const result = this.removeTorrentUseCase.execute({ magnet });

        if (result.success) {
            res.json({ message: result.message });
        } else {
            res.status(result.error === 'Magnet link required' ? 400 : 404).json({
                error: result.error
            });
        }
    }

    /**
     * Handles POST /torrent?magnet=...
     * Adds a new torrent
     */
    async add(req: Request, res: Response): Promise<void> {
        const magnet = typeof req.query.magnet === 'string' ? req.query.magnet : undefined;

        if (!magnet) {
            res.status(400).json({ error: 'Magnet link required' });
            return;
        }

        const result = await this.addTorrentUseCase.execute({ magnet });

        if (result.success && result.torrent) {
            res.status(201).json({
                message: 'Torrent added successfully',
                torrent: result.torrent
            });
        } else {
            res.status(result.error === 'Invalid magnet link' ? 400 : 500).json({
                error: result.error || 'Failed to add torrent'
            });
        }
    }
}
