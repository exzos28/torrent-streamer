import express, { Express } from 'express';
import { ConsoleLogger } from '../../infrastructure/logging/ConsoleLogger';
import { VideoFileFinder } from '../../infrastructure/torrent/VideoFileFinder';
import { WebTorrentRepository } from '../../infrastructure/torrent/WebTorrentRepository';
import { WebTorrentStreamService } from '../../infrastructure/streaming/WebTorrentStreamService';
import { StreamVideoUseCase } from '../../application/use-cases/StreamVideoUseCase';
import { GetTorrentInfoUseCase } from '../../application/use-cases/GetTorrentInfoUseCase';
import { AddTorrentUseCase } from '../../application/use-cases/AddTorrentUseCase';
import { RemoveTorrentUseCase } from '../../application/use-cases/RemoveTorrentUseCase';
import { ListTorrentsUseCase } from '../../application/use-cases/ListTorrentsUseCase';
import { StreamController } from './controllers/StreamController';
import { TorrentController } from './controllers/TorrentController';
import { createStreamRoutes } from './routes/stream.routes';

/**
 * Creates and configures Express application
 * Can be used both for production server and testing
 */
export function createApp(
    torrentRepository?: WebTorrentRepository,
    streamService?: WebTorrentStreamService,
    logger?: ConsoleLogger
): Express {
    // Initialize dependencies (allow injection for testing)
    const appLogger = logger || new ConsoleLogger();
    const videoFileFinder = new VideoFileFinder();
    const repo = torrentRepository || new WebTorrentRepository(videoFileFinder, appLogger);
    const service = streamService || new WebTorrentStreamService(appLogger);

    // Initialize use cases
    const streamVideoUseCase = new StreamVideoUseCase(repo, appLogger);
    const getTorrentInfoUseCase = new GetTorrentInfoUseCase(repo);
    const addTorrentUseCase = new AddTorrentUseCase(repo, appLogger);
    const removeTorrentUseCase = new RemoveTorrentUseCase(repo, appLogger);
    const listTorrentsUseCase = new ListTorrentsUseCase(repo);

    // Initialize controllers
    const streamController = new StreamController(streamVideoUseCase, service, repo);
    const torrentController = new TorrentController(
        getTorrentInfoUseCase,
        addTorrentUseCase,
        removeTorrentUseCase,
        listTorrentsUseCase
    );

    // Initialize Express app
    const app: Express = express();

    // Setup routes
    app.use('/', createStreamRoutes(streamController, torrentController));

    return app;
}
