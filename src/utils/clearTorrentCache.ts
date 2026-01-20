/**
 * Utility function to clear WebTorrent cache directory
 * Removes all files and subdirectories from the torrents cache directory
 */

import fs from 'fs';
import path from 'path';
import config from '../config';
import { ILogger } from '../domain/interfaces/ILogger';

/**
 * Clears the WebTorrent cache directory
 * @param logger - Logger instance for logging operations
 * @param skipIfNotExists - If true, skip clearing if directory doesn't exist (default: false)
 * @returns Promise that resolves when cache is cleared
 */
export async function clearTorrentCache(
  logger: ILogger,
  skipIfNotExists: boolean = false
): Promise<void> {
  const torrentsDir = path.join(config.RUNTIME_DIR, 'torrents');

  try {
    // Check if directory exists
    if (!fs.existsSync(torrentsDir)) {
      if (skipIfNotExists) {
        logger.debug('Torrents cache directory does not exist, skipping clear');
        return;
      }
      // Create directory if it doesn't exist
      fs.mkdirSync(torrentsDir, { recursive: true });
      logger.debug('Created torrents cache directory');
      return;
    }

    // Read directory contents
    const entries = fs.readdirSync(torrentsDir, { withFileTypes: true });
    
    if (entries.length === 0) {
      logger.debug('Torrents cache directory is already empty');
      return;
    }

    let filesDeleted = 0;
    let dirsDeleted = 0;
    let totalSize = 0;

    // Delete all entries
    for (const entry of entries) {
      const entryPath = path.join(torrentsDir, entry.name);
      
      try {
        if (entry.isDirectory()) {
          // Recursively delete directory
          const dirStats = getDirSize(entryPath);
          totalSize += dirStats.size;
          fs.rmSync(entryPath, { recursive: true, force: true });
          dirsDeleted++;
        } else {
          // Delete file
          const stats = fs.statSync(entryPath);
          totalSize += stats.size;
          fs.unlinkSync(entryPath);
          filesDeleted++;
        }
      } catch (error) {
        logger.warn(`Failed to delete ${entryPath}:`, error);
        // Continue with other entries
      }
    }

    const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
    logger.info(
      `🧹 Cleared torrent cache: ${filesDeleted} files, ${dirsDeleted} directories, ${sizeMB} MB freed`
    );
  } catch (error) {
    logger.error('Failed to clear torrent cache:', error);
    throw new Error(
      `Failed to clear torrent cache: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate total size of a directory recursively
 * @param dirPath - Path to directory
 * @returns Object with size in bytes and file count
 */
function getDirSize(dirPath: string): { size: number; files: number } {
  let size = 0;
  let files = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const subDirStats = getDirSize(entryPath);
        size += subDirStats.size;
        files += subDirStats.files;
      } else {
        try {
          const stats = fs.statSync(entryPath);
          size += stats.size;
          files++;
        } catch {
          // Ignore errors for individual files
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return { size, files };
}
