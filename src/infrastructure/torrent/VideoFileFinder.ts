import path from 'path';
import config from '../../config';
import { IVideoFileFinder } from '../../domain/interfaces/IVideoFileFinder';
import { TorrentEntity, TorrentFileEntity } from '../../domain/entities';

/**
 * Finds video files in torrents based on file extensions
 */
export class VideoFileFinder implements IVideoFileFinder {
    find(torrent: TorrentEntity): TorrentFileEntity | null {
        const videoFile = torrent.files.find((file: TorrentFileEntity) => {
            const ext = path.extname(file.name).toLowerCase();
            return config.VIDEO_EXTENSIONS.includes(ext);
        });

        return videoFile || null;
    }
}
