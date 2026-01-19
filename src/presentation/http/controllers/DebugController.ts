import { Request, Response } from 'express';
import { GetTorrentsDebugInfoUseCase } from '../../../application/use-cases/GetTorrentsDebugInfoUseCase';
import { generateTorrentsSVG } from '../utils/svg-generator';

/**
 * Controller for handling debug-related HTTP requests
 */
export class DebugController {
  constructor(
    private getTorrentsDebugInfoUseCase: GetTorrentsDebugInfoUseCase
  ) { }

  /**
   * Handles GET /debug/torrents
   * Returns JSON with debug information about all torrents
   */
  getTorrentsDebugInfo(_req: Request, res: Response): void {
    const result = this.getTorrentsDebugInfoUseCase.execute({});

    res.json({
      success: result.success,
      count: result.count,
      torrents: result.torrents
    });
  }

  /**
   * Handles GET /debug/torrents.svg
   * Returns SVG visualization of all torrents
   */
  getTorrentsSVG(req: Request, res: Response): void {
    const result = this.getTorrentsDebugInfoUseCase.execute({});

    // Parse optional query parameters for SVG customization
    // Only include valid numbers (not NaN)
    const options: { width?: number; barHeight?: number; pieceBarHeight?: number } = {};

    if (req.query.width) {
      const width = parseInt(req.query.width as string, 10);
      if (!isNaN(width) && width > 0) {
        options.width = width;
      }
    }

    if (req.query.barHeight) {
      const barHeight = parseInt(req.query.barHeight as string, 10);
      if (!isNaN(barHeight) && barHeight > 0) {
        options.barHeight = barHeight;
      }
    }

    if (req.query.pieceBarHeight) {
      const pieceBarHeight = parseInt(req.query.pieceBarHeight as string, 10);
      if (!isNaN(pieceBarHeight) && pieceBarHeight > 0) {
        options.pieceBarHeight = pieceBarHeight;
      }
    }

    const svg = generateTorrentsSVG(result.torrents, options);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(svg);
  }
}
