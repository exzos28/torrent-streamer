/**
 * Use case for getting torrent information
 */

import { ITorrentRepository } from '../../domain/interfaces';
import { DetailedTorrentInfo } from '../../domain/interfaces/ITorrentRepository';

export interface GetTorrentInfoRequest {
  magnet: string;
}

export interface GetTorrentInfoResponse {
  success: boolean;
  info?: DetailedTorrentInfo;
  error?: string;
}

export class GetTorrentInfoUseCase {
  constructor(
    private torrentRepository: ITorrentRepository
  ) {}

  execute(request: GetTorrentInfoRequest): GetTorrentInfoResponse {
    if (!request.magnet) {
      return {
        success: false,
        error: 'Magnet link required'
      };
    }

    const info = this.torrentRepository.getInfo(request.magnet);

    if (!info) {
      return {
        success: false,
        error: 'Torrent not found'
      };
    }

    return {
      success: true,
      info
    };
  }
}
