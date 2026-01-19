import WebTorrent, { Instance, Torrent, TorrentFile } from 'webtorrent';
import config from '../../config';
import { ITorrentRepository, DetailedTorrentInfo, FileInfo } from '../../domain/interfaces/ITorrentRepository';
import { TorrentEntity, TorrentFileEntity } from '../../domain/entities';
import { WebTorrentAdapter } from './WebTorrentAdapter';
import { IVideoFileFinder } from '../../domain/interfaces/IVideoFileFinder';
import { ILogger } from '../../domain/interfaces/ILogger';
import { createMemoryLimitedStore } from '../../utils/memory-limited-store';

/**
 * WebTorrent implementation of ITorrentRepository
 * Manages WebTorrent client and active torrents
 * Uses MemoryLimitedStore to keep pieces only in memory, not on disk
 */
export class WebTorrentRepository implements ITorrentRepository {
    private client: Instance;
    private activeTorrents: Map<string, Torrent>;
    private videoFileFinder: IVideoFileFinder;
    private logger: ILogger;

    constructor(videoFileFinder: IVideoFileFinder, logger: ILogger) {
        this.client = new WebTorrent();
        this.activeTorrents = new Map();
        this.videoFileFinder = videoFileFinder;
        this.logger = logger;
    }

    async add(magnet: string): Promise<TorrentEntity> {
        // Check if torrent is already active
        let torrent = this.activeTorrents.get(magnet);

        if (!torrent) {
            this.logger.info(`Loading torrent: ${magnet.substring(0, 50)}...`);

            // Add new torrent with memory-limited store
            torrent = this.client.add(magnet, {
                store: (chunkLength: number) => {
                    return createMemoryLimitedStore(chunkLength, config.MAX_MEMORY_USAGE);
                }
            });
            this.activeTorrents.set(magnet, torrent);

            // Wait for torrent to receive metadata
            await new Promise<void>((resolve, reject) => {
                const torrentRef = torrent;

                if (!torrentRef) {
                    reject(new Error('Failed to create torrent'));
                    return;
                }

                torrentRef.on('metadata', () => {
                    this.logger.info('Metadata received');
                    resolve();
                });

                (torrentRef as any).on('error', (err: Error) => {
                    this.logger.error('Torrent error:', err);
                    this.activeTorrents.delete(magnet);
                    reject(err);
                });

                // Timeout for metadata reception
                setTimeout(() => {
                    const hasMetadata = (torrentRef as any).metadata;
                    if (!hasMetadata) {
                        this.activeTorrents.delete(magnet);
                        reject(new Error('Metadata reception timeout'));
                    }
                }, config.METADATA_TIMEOUT);
            });
        }

        return WebTorrentAdapter.toTorrentEntity(torrent);
    }

    get(magnet: string): TorrentEntity | null {
        const torrent = this.activeTorrents.get(magnet);
        return torrent ? WebTorrentAdapter.toTorrentEntity(torrent) : null;
    }

    getAll(): TorrentEntity[] {
        return Array.from(this.activeTorrents.values()).map((torrent: Torrent) =>
            WebTorrentAdapter.toTorrentEntity(torrent)
        );
    }

    getInfo(magnet: string): DetailedTorrentInfo | null {
        const torrent = this.activeTorrents.get(magnet);
        if (!torrent) {
            return null;
        }

        const torrentEntity = WebTorrentAdapter.toTorrentEntity(torrent);
        const videoFile = this.videoFileFinder.find(torrentEntity);

        return {
            name: torrent.name,
            infoHash: torrent.infoHash,
            files: torrent.files.map((f: TorrentFile): FileInfo => ({
                name: f.name,
                length: f.length,
                isVideo: videoFile?.name === f.name
            })),
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            progress: torrent.progress,
            numPeers: torrent.numPeers,
            ready: torrent.ready
        };
    }

    getVideoFile(magnet: string): TorrentFileEntity | null {
        const torrent = this.activeTorrents.get(magnet);
        if (!torrent) {
            return null;
        }

        const torrentEntity = WebTorrentAdapter.toTorrentEntity(torrent);
        return this.videoFileFinder.find(torrentEntity);
    }

    remove(magnet: string): boolean {
        const torrent = this.activeTorrents.get(magnet);
        if (torrent) {
            this.client.remove(torrent);
            this.activeTorrents.delete(magnet);
            return true;
        }
        return false;
    }

    async destroy(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.client.destroy(() => {
                this.activeTorrents.clear();
                resolve();
            });
        });
    }

    /**
     * Internal method to get raw WebTorrent Torrent object
     * Needed for stream service to access piece information
     */
    getRawTorrent(magnet: string): Torrent | null {
        return this.activeTorrents.get(magnet) || null;
    }

    /**
     * Internal method to get raw WebTorrent TorrentFile object
     * Needed for stream service to access piece information
     */
    getRawTorrentFile(magnet: string): TorrentFile | null {
        const torrent = this.activeTorrents.get(magnet);
        if (!torrent) {
            return null;
        }

        const torrentEntity = WebTorrentAdapter.toTorrentEntity(torrent);
        const videoFileEntity = this.videoFileFinder.find(torrentEntity);
        if (!videoFileEntity) {
            return null;
        }

        // Find the corresponding WebTorrent file
        return torrent.files.find((f: TorrentFile) => f.name === videoFileEntity.name) || null;
    }
}
