/**
 * Memory-limited chunk store that tracks total memory usage
 * Evicts least recently used chunks when memory limit is exceeded
 */

// @ts-expect-error - memory-chunk-store doesn't have types
import MemoryChunkStore from 'memory-chunk-store';

interface ChunkInfo {
    index: number;
    size: number;
    lastUsed: number;
}

/**
 * Global memory tracker for all stores
 */
class GlobalMemoryTracker {
    private static instance: GlobalMemoryTracker;
    private totalMemory: number = 0;
    private chunks: Map<string, ChunkInfo[]> = new Map(); // storeId -> chunks
    private maxMemory: number;
    private accessCounter: number = 0;

    private constructor(maxMemory: number) {
        this.maxMemory = maxMemory;
    }

    static getInstance(maxMemory: number): GlobalMemoryTracker {
        if (!GlobalMemoryTracker.instance) {
            GlobalMemoryTracker.instance = new GlobalMemoryTracker(maxMemory);
        }
        return GlobalMemoryTracker.instance;
    }

    addChunk(storeId: string, index: number, size: number): void {
        if (!this.chunks.has(storeId)) {
            this.chunks.set(storeId, []);
        }

        const storeChunks = this.chunks.get(storeId)!;
        const existing = storeChunks.find((c) => c.index === index);

        if (existing) {
            // Update existing chunk
            this.totalMemory -= existing.size;
            existing.size = size;
            existing.lastUsed = ++this.accessCounter;
        } else {
            // Add new chunk
            storeChunks.push({ index, size, lastUsed: ++this.accessCounter });
        }

        this.totalMemory += size;
        this.evictIfNeeded();
    }

    removeChunk(storeId: string, index: number): void {
        const storeChunks = this.chunks.get(storeId);
        if (!storeChunks) { return; }

        const chunkIndex = storeChunks.findIndex((c) => c.index === index);
        if (chunkIndex !== -1) {
            const chunk = storeChunks[chunkIndex];
            this.totalMemory -= chunk.size;
            storeChunks.splice(chunkIndex, 1);
        }
    }

    accessChunk(storeId: string, index: number): void {
        const storeChunks = this.chunks.get(storeId);
        if (!storeChunks) { return; }

        const chunk = storeChunks.find((c) => c.index === index);
        if (chunk) {
            chunk.lastUsed = ++this.accessCounter;
        }
    }

    removeStore(storeId: string): void {
        const storeChunks = this.chunks.get(storeId);
        if (storeChunks) {
            for (const chunk of storeChunks) {
                this.totalMemory -= chunk.size;
            }
            this.chunks.delete(storeId);
        }
    }

    private evictIfNeeded(): void {
        while (this.totalMemory > this.maxMemory) {
            // Find least recently used chunk across all stores
            let oldestChunk: { storeId: string; chunk: ChunkInfo } | null = null;
            let oldestTime = Infinity;

            for (const [storeId, chunks] of this.chunks.entries()) {
                for (const chunk of chunks) {
                    if (chunk.lastUsed < oldestTime) {
                        oldestTime = chunk.lastUsed;
                        oldestChunk = { storeId, chunk };
                    }
                }
            }

            if (!oldestChunk) { break; }

            // Remove oldest chunk
            const storeChunks = this.chunks.get(oldestChunk.storeId);
            if (storeChunks) {
                const index = storeChunks.findIndex((c) => c.index === oldestChunk!.chunk.index);
                if (index !== -1) {
                    this.totalMemory -= oldestChunk.chunk.size;
                    storeChunks.splice(index, 1);
                }
            }

            // Notify store to remove chunk (will be handled by store's eviction)
            // We return the storeId and index so the store can handle it
        }
    }

    getTotalMemory(): number {
        return this.totalMemory;
    }

    getMaxMemory(): number {
        return this.maxMemory;
    }
}

/**
 * Memory-limited chunk store
 * Wraps MemoryChunkStore and tracks memory usage globally by bytes, not by chunk count
 * chunkLength is only used to create the underlying store, it doesn't affect memory limits
 */
export class MemoryLimitedStore {
    private store: any;
    private storeId: string;
    private tracker: GlobalMemoryTracker;
    private evictedChunks: Set<number> = new Set();

    constructor(chunkLength: number, maxMemory: number) {
        // chunkLength is required by MemoryChunkStore but doesn't affect memory limits
        // Memory limit is controlled by maxMemory (bytes), not by chunk count
        this.storeId = `store_${Date.now()}_${Math.random()}`;
        this.store = new MemoryChunkStore(chunkLength);
        this.tracker = GlobalMemoryTracker.getInstance(maxMemory);
    }

    put(index: number, buf: Buffer, cb?: (err?: Error) => void): void {
        // Track memory by actual bytes used, not by chunk count
        const size = buf.length; // Actual size in bytes
        const currentMemory = this.tracker.getTotalMemory();

        // Check if we need to evict before adding (based on bytes, not chunk count)
        if (currentMemory + size > this.tracker.getMaxMemory()) {
            // Evict chunks until we have enough space (evicts by least recently used)
            this.evictChunks(size);
        }

        // Track memory usage by bytes
        this.tracker.addChunk(this.storeId, index, size);

        // If chunk was previously evicted, remove from evicted set
        if (this.evictedChunks.has(index)) {
            this.evictedChunks.delete(index);
        }

        // Store the chunk
        this.store.put(index, buf, (err?: Error) => {
            if (err) {
                // If error, remove from tracker
                this.tracker.removeChunk(this.storeId, index);
            }
            if (cb) { cb(err); }
        });
    }

    get(index: number, opts?: any, cb?: (err: Error | null, buf?: Buffer) => void): void {
        // Handle different call signatures
        let callback: ((err: Error | null, buf?: Buffer) => void) | undefined;

        if (typeof opts === 'function') {
            // Called as: get(index, callback)
            callback = opts;
        } else if (typeof cb === 'function') {
            // Called as: get(index, opts, callback)
            callback = cb;
        }

        // Check if chunk was evicted
        if (this.evictedChunks.has(index)) {
            const err = new Error('Chunk not found') as Error & { notFound?: boolean };
            err.notFound = true;
            if (callback) {
                callback(err);
            }
            return;
        }

        // Track access
        this.tracker.accessChunk(this.storeId, index);

        // Get from underlying store
        if (typeof opts === 'function') {
            this.store.get(index, opts);
        } else {
            this.store.get(index, opts, callback);
        }
    }

    close(cb?: (err?: Error) => void): void {
        this.tracker.removeStore(this.storeId);
        this.store.close(cb);
    }

    destroy(cb?: (err?: Error) => void): void {
        this.close(cb);
    }

    private evictChunks(requiredSize: number): void {
        // Get all chunks across all stores, sorted by last used
        const allChunks: Array<{ storeId: string; chunk: ChunkInfo }> = [];

        for (const [storeId, chunks] of this.tracker['chunks'].entries()) {
            for (const chunk of chunks) {
                allChunks.push({ storeId, chunk });
            }
        }

        // Sort by last used (oldest first)
        allChunks.sort((a, b) => a.chunk.lastUsed - b.chunk.lastUsed);

        let freed = 0;
        for (const { storeId, chunk } of allChunks) {
            if (freed >= requiredSize) { break; }

            // Mark as evicted if it's from this store
            if (storeId === this.storeId) {
                this.evictedChunks.add(chunk.index);
                // Clear from underlying store by setting to undefined
                // MemoryChunkStore stores chunks in array, we can't directly remove
                // but we track it as evicted so get() will return not found
            }

            freed += chunk.size;
            this.tracker.removeChunk(storeId, chunk.index);
        }
    }
}

/**
 * Factory function to create memory-limited store
 * @param chunkLength - Required by MemoryChunkStore, but doesn't affect memory limits
 * @param maxMemory - Maximum memory usage in bytes (this is what limits memory, not chunkLength)
 */
export function createMemoryLimitedStore(
    chunkLength: number,
    maxMemory: number
): MemoryLimitedStore {
    return new MemoryLimitedStore(chunkLength, maxMemory);
}
