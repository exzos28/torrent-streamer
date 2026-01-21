/**
 * Wrapper for WebTorrent Torrent objects to track prioritized pieces
 * Intercepts select/deselect calls and maintains a record of prioritized chunks
 * 
 * Usage:
 * ```typescript
 * const wrapper = new TorrentWrapper(torrent);
 * 
 * // When torrent.select() is called, it's automatically tracked
 * torrent.select(0, 10, 1); // Prioritize pieces 0-10
 * 
 * // Query prioritized pieces
 * const prioritized = wrapper.getPrioritizedPieces();
 * const indices = wrapper.getPrioritizedPieceIndices();
 * const array = wrapper.getPrioritizedPiecesArray(totalPieces);
 * 
 * // Cleanup when done
 * wrapper.restore();
 * ```
 */

import { Torrent } from 'webtorrent';

/**
 * Priority level for pieces
 * Higher numbers = higher priority
 */
export enum PiecePriority {
  NONE = 0,
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

/**
 * Information about a prioritized piece
 */
export interface PrioritizedPiece {
  pieceIndex: number;
  priority: PiecePriority;
  selectedAt: Date;
}

/**
 * Wrapper class for WebTorrent Torrent objects
 * Tracks pieces that have been prioritized through select() calls
 */
export class TorrentWrapper {
  private torrent: Torrent;
  private prioritizedPieces: Map<number, PrioritizedPiece> = new Map();
  private originalSelect: (start: number, end: number, priority?: number, notify?: () => void) => void;
  private originalDeselect: (start: number, end: number, priority: number) => void;
  private logger?: { debug: (msg: string, ...args: unknown[]) => void; info: (msg: string, ...args: unknown[]) => void };

  constructor(torrent: Torrent, logger?: { debug: (msg: string, ...args: unknown[]) => void; info: (msg: string, ...args: unknown[]) => void }) {
    this.torrent = torrent;
    this.logger = logger;

    // Store original methods (check if they exist first)
    this.originalSelect = torrent.select ? torrent.select.bind(torrent) : () => { };
    this.originalDeselect = torrent.deselect ? torrent.deselect.bind(torrent) : () => { };

    // Override select method to track prioritized pieces
    if (torrent.select) {
      torrent.select = this.select.bind(this);
    }
    if (torrent.deselect) {
      torrent.deselect = this.deselect.bind(this);
    }

    this.logger?.debug(
      `[TorrentWrapper] Created wrapper for torrent: ${torrent.name || 'unknown'}, ` +
      `infoHash: ${torrent.infoHash || 'unknown'}, has select: ${!!torrent.select}, has deselect: ${!!torrent.deselect}`
    );
  }

  /**
   * Get the wrapped torrent object
   */
  getTorrent(): Torrent {
    return this.torrent;
  }

  /**
   * Select pieces with priority (wraps original select method)
   * Tracks which pieces have been prioritized
   */
  select(start: number, end: number, priority?: number, notify?: () => void): void {
    const priorityLevel = this._normalizePriority(priority);
    const now = new Date();
    let addedCount = 0;
    let updatedCount = 0;

    // Only track pieces with priority > 0 (explicitly prioritized)
    // WebTorrent automatically selects all pieces with priority=0/false, which we ignore
    if (priorityLevel > 0) {
      // Track all pieces in the range
      for (let pieceIndex = start; pieceIndex <= end; pieceIndex++) {
        const existing = this.prioritizedPieces.get(pieceIndex);

        // Only update if new priority is higher or equal
        if (!existing || priorityLevel >= existing.priority) {
          this.prioritizedPieces.set(pieceIndex, {
            pieceIndex,
            priority: priorityLevel,
            selectedAt: existing?.selectedAt || now
          });
          if (existing) {
            updatedCount++;
          } else {
            addedCount++;
          }
        }
      }

      this.logger?.debug(
        `[TorrentWrapper] select(${start}, ${end}, priority=${priority}): added ${addedCount}, updated ${updatedCount}, total prioritized: ${this.prioritizedPieces.size}`
      );
    } else {
      this.logger?.debug(
        `[TorrentWrapper] select(${start}, ${end}, priority=${priority}): ignoring (priority=0, WebTorrent default)`
      );
    }

    // Call original select method
    this.originalSelect(start, end, priority, notify);
  }

  /**
   * Deselect pieces (wraps original deselect method)
   * Removes tracking for deselected pieces
   */
  deselect(start: number, end: number, priority: number): void {
    const priorityLevel = this._normalizePriority(priority);
    const beforeCount = this.prioritizedPieces.size;
    let removedCount = 0;

    // Remove pieces from tracking if they match the priority
    for (let pieceIndex = start; pieceIndex <= end; pieceIndex++) {
      const existing = this.prioritizedPieces.get(pieceIndex);
      if (existing && existing.priority === priorityLevel) {
        this.prioritizedPieces.delete(pieceIndex);
        removedCount++;
      }
    }

    const afterCount = this.prioritizedPieces.size;
    if (removedCount > 0 || beforeCount !== afterCount) {
      this.logger?.debug(
        `[TorrentWrapper] deselect(${start}, ${end}, priority=${priority}): removed ${removedCount}, before: ${beforeCount}, after: ${afterCount}`
      );
    }

    // Call original deselect method
    this.originalDeselect(start, end, priority);
  }

  /**
   * Get all prioritized pieces
   */
  getPrioritizedPieces(): PrioritizedPiece[] {
    return Array.from(this.prioritizedPieces.values()).sort((a, b) => a.pieceIndex - b.pieceIndex);
  }

  /**
   * Get prioritized pieces as a Set of piece indices
   */
  getPrioritizedPieceIndices(): Set<number> {
    return new Set(this.prioritizedPieces.keys());
  }

  /**
   * Get prioritized pieces as an array of 0/1 values (0 = not prioritized, 1 = prioritized)
   * Useful for debugging and visualization
   */
  getPrioritizedPiecesArray(totalPieces: number): number[] {
    const result = new Array(totalPieces).fill(0);
    let validCount = 0;
    let invalidCount = 0;

    for (const pieceIndex of this.prioritizedPieces.keys()) {
      if (pieceIndex >= 0 && pieceIndex < totalPieces) {
        result[pieceIndex] = 1;
        validCount++;
      } else {
        invalidCount++;
      }
    }

    const onesCount = result.filter(v => v === 1).length;
    this.logger?.debug(
      `[TorrentWrapper] getPrioritizedPiecesArray(totalPieces=${totalPieces}): ` +
      `prioritizedPieces.size=${this.prioritizedPieces.size}, valid=${validCount}, invalid=${invalidCount}, result ones=${onesCount}`
    );

    return result;
  }

  /**
   * Get prioritized pieces with priority levels as an array
   * Returns array where each element is the priority level (0-4) for that piece
   */
  getPrioritizedPiecesWithPriorityArray(totalPieces: number): number[] {
    const result = new Array(totalPieces).fill(0);
    for (const [pieceIndex, info] of this.prioritizedPieces.entries()) {
      if (pieceIndex >= 0 && pieceIndex < totalPieces) {
        result[pieceIndex] = info.priority;
      }
    }
    return result;
  }

  /**
   * Check if a specific piece is prioritized
   */
  isPiecePrioritized(pieceIndex: number): boolean {
    return this.prioritizedPieces.has(pieceIndex);
  }

  /**
   * Get priority level for a specific piece (0 if not prioritized)
   */
  getPiecePriority(pieceIndex: number): PiecePriority {
    return this.prioritizedPieces.get(pieceIndex)?.priority || PiecePriority.NONE;
  }

  /**
   * Get count of prioritized pieces
   */
  getPrioritizedPiecesCount(): number {
    return this.prioritizedPieces.size;
  }

  /**
   * Clear all prioritized pieces tracking
   * Note: This does NOT call deselect on the torrent, it only clears our tracking
   */
  clearPrioritizedPieces(): void {
    this.prioritizedPieces.clear();
  }

  /**
   * Get prioritized pieces for a specific byte range
   */
  getPrioritizedPiecesForRange(startByte: number, endByte: number): PrioritizedPiece[] {
    const pieceLength = this.torrent.pieceLength || 0;
    if (pieceLength === 0) {
      return [];
    }

    const startPiece = Math.floor(startByte / pieceLength);
    const endPiece = Math.floor(endByte / pieceLength);

    const result: PrioritizedPiece[] = [];
    for (let pieceIndex = startPiece; pieceIndex <= endPiece; pieceIndex++) {
      const piece = this.prioritizedPieces.get(pieceIndex);
      if (piece) {
        result.push(piece);
      }
    }

    return result;
  }

  /**
   * Normalize priority value to PiecePriority enum
   * WebTorrent uses numeric priorities, we map them to our enum
   */
  private _normalizePriority(priority?: number): PiecePriority {
    if (priority === undefined || priority === null) {
      return PiecePriority.NORMAL;
    }

    // Map numeric priorities to enum
    if (priority >= 3) {
      return PiecePriority.CRITICAL;
    } else if (priority >= 2) {
      return PiecePriority.HIGH;
    } else if (priority >= 1) {
      return PiecePriority.NORMAL;
    } else if (priority > 0) {
      return PiecePriority.LOW;
    }

    return PiecePriority.NONE;
  }

  /**
   * Restore original methods (useful for cleanup)
   */
  restore(): void {
    if (this.torrent.select) {
      this.torrent.select = this.originalSelect;
    }
    if (this.torrent.deselect) {
      this.torrent.deselect = this.originalDeselect;
    }
  }
}
