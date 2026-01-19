import WebTorrent, { Instance, Torrent, TorrentFile } from 'webtorrent';
import config from '../../config';
import { ITorrentRepository, DetailedTorrentInfo, FileInfo, TorrentDebugInfo } from '../../domain/interfaces/ITorrentRepository';
import { TorrentEntity, TorrentFileEntity } from '../../domain/entities';
import { WebTorrentAdapter } from './WebTorrentAdapter';
import { IVideoFileFinder } from '../../domain/interfaces/IVideoFileFinder';
import { ILogger } from '../../domain/interfaces/ILogger';
import { isExtendedTorrent } from './WebTorrentExtendedTypes';

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
                // store: (chunkLength: number) => {
                // return createMemoryLimitedStore(chunkLength, config.MAX_MEMORY_USAGE);
                // }
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
                    this.logger.info('Metadata received, torrent ready');
                    resolve();
                });

                torrentRef.on("error", (raw) => {
                    this.logger.error('Torrent error:', raw);
                    this.activeTorrents.delete(magnet);
                    reject(raw);
                });

                // Timeout for metadata reception
                setTimeout(() => {
                    const hasMetadata = isExtendedTorrent(torrentRef) ? torrentRef.metadata : false;
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

    getDebugInfo(): TorrentDebugInfo[] {
        const debugInfo: TorrentDebugInfo[] = [];

        for (const [magnet, torrent] of this.activeTorrents.entries()) {
            // Get pieces information - get fresh data from torrent
            const extendedTorrent = isExtendedTorrent(torrent) ? torrent : null;
            const pieceLength = torrent.pieceLength || 0;
            let totalPieces = 0;
            let piecesStatus: number[] = [];

            // Use torrent.pieces directly - it's a public property: Array<TorrentPiece | null>
            // TorrentPiece has { length: number, missing: number }
            // null = piece not downloaded, TorrentPiece with missing === 0 = downloaded
            const pieces = torrent.pieces;

            if (Array.isArray(pieces) && pieces.length > 0) {
                // pieces is Array<TorrentPiece | null> according to WebTorrent types
                // TorrentPiece interface: { length: number, missing: number }
                // - piece === null means piece is not downloaded
                // - piece !== null && missing === 0 means piece is fully downloaded
                // - piece !== null && missing > 0 means piece is partially downloaded
                totalPieces = pieces.length;
                piecesStatus = pieces.map((piece) => {
                    // null = not downloaded
                    if (piece === null) {
                        return 0;
                    }

                    // TorrentPiece object - check missing property
                    // According to types, TorrentPiece always has missing property
                    // missing === 0 means fully downloaded
                    return piece.missing === 0 ? 1 : 0;
                });

                // If we got 0 downloaded pieces but torrent has progress, try bitfield as fallback
                // This handles cases where pieces array might not be fully initialized
                const downloadedCount = piecesStatus.filter(p => p === 1).length;
                if (downloadedCount === 0 && torrent.progress > 0 && extendedTorrent?.bitfield) {
                    const bitfield = extendedTorrent.bitfield;
                    if (typeof bitfield.get === 'function') {
                        // Use bitfield to get actual piece status
                        piecesStatus = [];
                        for (let i = 0; i < totalPieces; i++) {
                            try {
                                piecesStatus.push(bitfield.get(i) ? 1 : 0);
                            } catch {
                                piecesStatus.push(0);
                            }
                        }
                    }
                }
            } else if (pieces && typeof pieces === 'object' && 'length' in pieces && typeof (pieces as { length: number }).length === 'number') {
                // If it's array-like object, try to access it
                const arrayLike = pieces as { length: number;[index: number]: unknown };
                totalPieces = arrayLike.length;
                piecesStatus = [];
                for (let i = 0; i < totalPieces; i++) {
                    const piece = arrayLike[i];
                    piecesStatus.push((piece === true || piece === 1) ? 1 : 0);
                }
            } else {
                // Fallback: try to get from bitfield first (most accurate)
                const bitfield = extendedTorrent?.bitfield;
                if (bitfield && typeof bitfield.get === 'function') {
                    // It's a bitfield - count pieces by checking each one
                    // First, try to get total from torrent.length and pieceLength
                    if (pieceLength > 0 && torrent.length) {
                        totalPieces = Math.ceil(torrent.length / pieceLength);
                    } else if (torrent.pieces && Array.isArray(torrent.pieces)) {
                        // Use pieces array length if available
                        totalPieces = torrent.pieces.length;
                    }
                    piecesStatus = [];
                    for (let i = 0; i < totalPieces; i++) {
                        try {
                            piecesStatus.push(bitfield.get(i) ? 1 : 0);
                        } catch {
                            piecesStatus.push(0);
                        }
                    }
                } else {
                    // Last resort: if we can't get pieces info, return empty
                    // Don't use progress fallback as it gives wrong information
                    // (pieces may be downloaded in random order, not sequentially)
                    if (pieceLength > 0 && torrent.length) {
                        totalPieces = Math.ceil(torrent.length / pieceLength);
                        piecesStatus = new Array(totalPieces).fill(0);
                    } else {
                        totalPieces = 0;
                        piecesStatus = [];
                    }
                }

                // Ensure piecesStatus matches totalPieces
                if (piecesStatus.length !== totalPieces && totalPieces > 0) {
                    // Resize array if needed
                    if (piecesStatus.length < totalPieces) {
                        piecesStatus = [...piecesStatus, ...new Array(totalPieces - piecesStatus.length).fill(0)];
                    } else {
                        piecesStatus = piecesStatus.slice(0, totalPieces);
                    }
                }
            }

            // Get prioritized pieces information
            // WebTorrent stores selections in _selections or _selection array
            // Try to access it through internal properties
            let prioritizedPieces: number[] = new Array(totalPieces).fill(0);
            try {
                if (!extendedTorrent) {
                    // Can't access internal properties without extended type
                    throw new Error('Extended torrent type not available');
                }

                // WebTorrent may store selections in different ways
                // Try _selections (array of selected piece indices)
                const selections = extendedTorrent._selections;
                if (Array.isArray(selections)) {
                    selections.forEach((pieceIndex: number) => {
                        if (pieceIndex >= 0 && pieceIndex < totalPieces) {
                            prioritizedPieces[pieceIndex] = 1;
                        }
                    });
                } else {
                    // Try _selection (bitfield-like structure)
                    const selection = extendedTorrent._selection;
                    if (selection) {
                        // Check if it's a bitfield object with get method
                        if (Array.isArray(selection)) {
                            // It's an array of piece indices
                            selection.forEach((pieceIndex: number) => {
                                if (pieceIndex >= 0 && pieceIndex < totalPieces) {
                                    prioritizedPieces[pieceIndex] = 1;
                                }
                            });
                        } else if (typeof selection === 'object' && 'get' in selection && typeof selection.get === 'function') {
                            // It's a bitfield object
                            const bitfield = selection as { get(index: number): boolean };
                            for (let i = 0; i < totalPieces; i++) {
                                try {
                                    if (bitfield.get(i)) {
                                        prioritizedPieces[i] = 1;
                                    }
                                } catch {
                                    // Ignore errors
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                // If we can't access selection info, just leave all as 0
                this.logger.debug(`Could not get prioritized pieces for ${torrent.infoHash}:`, err);
            }

            // Get video file info
            const torrentEntity = WebTorrentAdapter.toTorrentEntity(torrent);
            const videoFile = this.videoFileFinder.find(torrentEntity);

            debugInfo.push({
                magnet,
                infoHash: torrent.infoHash,
                name: torrent.name,
                progress: torrent.progress,
                downloadSpeed: torrent.downloadSpeed,
                uploadSpeed: torrent.uploadSpeed,
                numPeers: torrent.numPeers,
                ready: torrent.ready,
                pieceLength,
                totalPieces,
                pieces: piecesStatus,
                prioritizedPieces,
                files: torrent.files.map((f: TorrentFile): FileInfo => ({
                    name: f.name,
                    length: f.length,
                    isVideo: videoFile?.name === f.name
                }))
            });
        }

        return debugInfo;
    }
}
