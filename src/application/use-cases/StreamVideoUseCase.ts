/**
 * Use case for streaming video from torrent
 * Contains business logic for video streaming
 */

import { ITorrentRepository, ILogger } from '../../domain/interfaces';
import { TorrentFileEntity } from '../../domain/entities';

export interface StreamVideoRequest {
  magnet: string;
  range?: string;
}

export interface StreamVideoResponse {
  success: boolean;
  file?: TorrentFileEntity;
  error?: string;
}

export class StreamVideoUseCase {
  constructor(
    private torrentRepository: ITorrentRepository,
    private logger: ILogger
  ) {}

  async execute(request: StreamVideoRequest): Promise<StreamVideoResponse> {
    try {
      // Validate magnet link
      if (!request.magnet || !request.magnet.startsWith('magnet:')) {
        return {
          success: false,
          error: 'Invalid magnet link'
        };
      }

      // Add torrent and wait for metadata
      await this.torrentRepository.add(request.magnet);

      // Find video file
      const videoFile = this.torrentRepository.getVideoFile(request.magnet);

      if (!videoFile) {
        return {
          success: false,
          error: 'Video file not found in torrent'
        };
      }

      this.logger.info(`Streaming file: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`);

      return {
        success: true,
        file: videoFile
      };
    } catch (error) {
      this.logger.error('Error in StreamVideoUseCase:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
