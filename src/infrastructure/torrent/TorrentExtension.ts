/**
 * Extension for WebTorrent Torrent objects to track prioritized pieces
 * Adds methods and properties directly to the Torrent object
 */

import { Torrent } from 'webtorrent';
import { PiecePriority, PrioritizedPiece } from './TorrentWrapper';

/**
 * Extended Torrent interface with prioritized pieces tracking
 */
export interface ExtendedTorrent extends Torrent {
  /**
   * Get all prioritized pieces
   */
  getPrioritizedPieces(): PrioritizedPiece[];

  /**
   * Get prioritized pieces as a Set of piece indices
   */
  getPrioritizedPieceIndices(): Set<number>;

  /**
   * Get prioritized pieces as an array of 0/1 values (0 = not prioritized, 1 = prioritized)
   */
  getPrioritizedPiecesArray(totalPieces: number): number[];

  /**
   * Check if a specific piece is prioritized
   */
  isPiecePrioritized(pieceIndex: number): boolean;

  /**
   * Get priority level for a specific piece (0 if not prioritized)
   */
  getPiecePriority(pieceIndex: number): PiecePriority;

  /**
   * Clear all prioritized pieces tracking
   */
  clearPrioritizedPieces(): void;
}

/**
 * Private storage for prioritized pieces data
 * Uses WeakMap to avoid memory leaks
 */
const prioritizedPiecesMap = new WeakMap<Torrent, Map<number, PrioritizedPiece>>();
const originalSelectMap = new WeakMap<Torrent, (start: number, end: number, priority?: number, notify?: () => void) => void>();
const originalDeselectMap = new WeakMap<Torrent, (start: number, end: number, priority: number) => void>();

/**
 * Normalize priority value to PiecePriority enum
 */
function normalizePriority(priority?: number | boolean): PiecePriority {
  if (typeof priority === 'boolean') {
    return priority ? PiecePriority.HIGH : PiecePriority.NONE;
  }
  if (typeof priority === 'number') {
    if (priority <= 0) return PiecePriority.NONE;
    if (priority <= 1) return PiecePriority.LOW;
    if (priority <= 2) return PiecePriority.NORMAL;
    if (priority <= 3) return PiecePriority.HIGH;
    return PiecePriority.CRITICAL;
  }
  return PiecePriority.NONE;
}

/**
 * Extended select method that tracks prioritized pieces
 */
function extendedSelect(
  this: ExtendedTorrent,
  start: number,
  end: number,
  priority?: number,
  notify?: () => void
): void {
  const priorityLevel = normalizePriority(priority);
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  const originalSelect = originalSelectMap.get(this);

  // Only track pieces with priority > 0 (explicitly prioritized)
  // WebTorrent automatically selects all pieces with priority=0/false, which we ignore
  if (priorityLevel > 0 && prioritizedPieces) {
    const now = new Date();

    for (let pieceIndex = start; pieceIndex <= end; pieceIndex++) {
      const existing = prioritizedPieces.get(pieceIndex);

      // Only update if new priority is higher or equal
      if (!existing || priorityLevel >= existing.priority) {
        prioritizedPieces.set(pieceIndex, {
          pieceIndex,
          priority: priorityLevel,
          selectedAt: existing?.selectedAt || now
        });
      }
    }
  }

  // Call original select method
  if (originalSelect) {
    originalSelect.call(this, start, end, priority, notify);
  }
}

/**
 * Extended deselect method that removes tracking
 */
function extendedDeselect(
  this: ExtendedTorrent,
  start: number,
  end: number,
  priority: number
): void {
  const priorityLevel = normalizePriority(priority);
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  const originalDeselect = originalDeselectMap.get(this);

  if (prioritizedPieces) {
    // Remove pieces from tracking if they match the priority
    for (let pieceIndex = start; pieceIndex <= end; pieceIndex++) {
      const existing = prioritizedPieces.get(pieceIndex);
      if (existing && existing.priority === priorityLevel) {
        prioritizedPieces.delete(pieceIndex);
      }
    }
  }

  // Call original deselect method
  if (originalDeselect) {
    originalDeselect.call(this, start, end, priority);
  }
}

/**
 * Get all prioritized pieces
 */
function getPrioritizedPieces(this: ExtendedTorrent): PrioritizedPiece[] {
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  if (!prioritizedPieces) {
    return [];
  }
  return Array.from(prioritizedPieces.values()).sort((a, b) => a.pieceIndex - b.pieceIndex);
}

/**
 * Get prioritized pieces as a Set of piece indices
 */
function getPrioritizedPieceIndices(this: ExtendedTorrent): Set<number> {
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  if (!prioritizedPieces) {
    return new Set();
  }
  return new Set(prioritizedPieces.keys());
}

/**
 * Get prioritized pieces as an array of 0/1 values
 */
function getPrioritizedPiecesArray(this: ExtendedTorrent, totalPieces: number): number[] {
  const result = new Array(totalPieces).fill(0);
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  if (!prioritizedPieces) {
    return result;
  }

  for (const pieceIndex of prioritizedPieces.keys()) {
    if (pieceIndex >= 0 && pieceIndex < totalPieces) {
      result[pieceIndex] = 1;
    }
  }

  return result;
}

/**
 * Check if a specific piece is prioritized
 */
function isPiecePrioritized(this: ExtendedTorrent, pieceIndex: number): boolean {
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  return prioritizedPieces ? prioritizedPieces.has(pieceIndex) : false;
}

/**
 * Get priority level for a specific piece
 */
function getPiecePriority(this: ExtendedTorrent, pieceIndex: number): PiecePriority {
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  return prioritizedPieces?.get(pieceIndex)?.priority || PiecePriority.NONE;
}

/**
 * Clear all prioritized pieces tracking
 */
function clearPrioritizedPieces(this: ExtendedTorrent): void {
  const prioritizedPieces = prioritizedPiecesMap.get(this);
  if (prioritizedPieces) {
    prioritizedPieces.clear();
  }
}

/**
 * Extend a Torrent object with prioritized pieces tracking
 */
export function extendTorrent(
  torrent: Torrent,
  logger?: { debug: (msg: string, ...args: unknown[]) => void; info: (msg: string, ...args: unknown[]) => void }
): ExtendedTorrent {
  // Initialize storage if not already extended
  if (!prioritizedPiecesMap.has(torrent)) {
    prioritizedPiecesMap.set(torrent, new Map<number, PrioritizedPiece>());

    // Store original methods
    if (torrent.select) {
      originalSelectMap.set(torrent, torrent.select.bind(torrent));
    }
    if (torrent.deselect) {
      originalDeselectMap.set(torrent, torrent.deselect.bind(torrent));
    }

    // Override select/deselect methods
    if (torrent.select) {
      torrent.select = extendedSelect.bind(torrent as ExtendedTorrent);
    }
    if (torrent.deselect) {
      torrent.deselect = extendedDeselect.bind(torrent as ExtendedTorrent);
    }

    // Add extension methods
    (torrent as ExtendedTorrent).getPrioritizedPieces = getPrioritizedPieces.bind(torrent as ExtendedTorrent);
    (torrent as ExtendedTorrent).getPrioritizedPieceIndices = getPrioritizedPieceIndices.bind(torrent as ExtendedTorrent);
    (torrent as ExtendedTorrent).getPrioritizedPiecesArray = getPrioritizedPiecesArray.bind(torrent as ExtendedTorrent);
    (torrent as ExtendedTorrent).isPiecePrioritized = isPiecePrioritized.bind(torrent as ExtendedTorrent);
    (torrent as ExtendedTorrent).getPiecePriority = getPiecePriority.bind(torrent as ExtendedTorrent);
    (torrent as ExtendedTorrent).clearPrioritizedPieces = clearPrioritizedPieces.bind(torrent as ExtendedTorrent);

    logger?.debug(
      `[TorrentExtension] Extended torrent: ${torrent.name || 'unknown'}, ` +
      `infoHash: ${torrent.infoHash || 'unknown'}, has select: ${!!torrent.select}, has deselect: ${!!torrent.deselect}`
    );
  }

  return torrent as ExtendedTorrent;
}

/**
 * Check if a torrent is extended
 */
export function isExtendedTorrent(torrent: Torrent): torrent is ExtendedTorrent {
  return prioritizedPiecesMap.has(torrent) && 'getPrioritizedPieces' in torrent;
}

/**
 * Restore original methods (cleanup)
 */
export function restoreTorrent(torrent: Torrent): void {
  const originalSelect = originalSelectMap.get(torrent);
  const originalDeselect = originalDeselectMap.get(torrent);

  if (originalSelect && torrent.select) {
    torrent.select = originalSelect;
  }
  if (originalDeselect && torrent.deselect) {
    torrent.deselect = originalDeselect;
  }

  prioritizedPiecesMap.delete(torrent);
  originalSelectMap.delete(torrent);
  originalDeselectMap.delete(torrent);
}

// Re-export types for convenience
export { PiecePriority, PrioritizedPiece } from './TorrentWrapper';
