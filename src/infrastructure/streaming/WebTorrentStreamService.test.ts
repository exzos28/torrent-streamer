/**
 * Unit tests for WebTorrentStreamService
 * Tests range parsing and normalization functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ILogger } from '../../domain/interfaces/ILogger';
import { RangeParser } from './utils/RangeParser';
import { RangeNormalizer } from './utils/RangeNormalizer';
import { ByteRange } from '../../domain/value-objects/ByteRange';
import config from '../../config';

describe('WebTorrentStreamService', () => {
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            log: vi.fn()
        };
    });


    describe('RangeParser', () => {
        it('should parse bytes=START-END format', () => {
            const result = RangeParser.parse('bytes=100-200');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.value).toEqual({ type: 'start-end', start: 100, end: 200 });
            }
        });

        it('should parse bytes=START- format', () => {
            const result = RangeParser.parse('bytes=100-');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.value).toEqual({ type: 'start-only', start: 100 });
            }
        });

        it('should parse bytes=-SUFFIX format', () => {
            const result = RangeParser.parse('bytes=-500');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.value).toEqual({ type: 'suffix', suffix: 500 });
            }
        });

        it('should return error for invalid range', () => {
            expect(RangeParser.parse('invalid').success).toBe(false);
            expect(RangeParser.parse('bytes=').success).toBe(false);
            expect(RangeParser.parse('bytes=100,200').success).toBe(false); // multiple ranges
        });
    });

    describe('RangeNormalizer', () => {
        it('should normalize start-only range', () => {
            const parsed = { type: 'start-only' as const, start: 100 };
            const result = RangeNormalizer.normalize(parsed, 1000, config.CHUNK_SIZE, mockLogger, 'test.mp4');
            expect(result).toBeInstanceOf(ByteRange);
            expect(result?.start).toBe(100);
            expect(result?.end).toBe(Math.min(100 + config.CHUNK_SIZE - 1, 999));
        });

        it('should normalize suffix range', () => {
            const parsed = { type: 'suffix' as const, suffix: 500 };
            const result = RangeNormalizer.normalize(parsed, 1000, config.CHUNK_SIZE, mockLogger, 'test.mp4');
            expect(result).toBeInstanceOf(ByteRange);
            expect(result?.start).toBe(500);
            expect(result?.end).toBe(999);
        });

        it('should normalize start-end range', () => {
            const parsed = { type: 'start-end' as const, start: 100, end: 200 };
            const result = RangeNormalizer.normalize(parsed, 1000, config.CHUNK_SIZE, mockLogger, 'test.mp4');
            expect(result).toBeInstanceOf(ByteRange);
            expect(result?.start).toBe(100);
            expect(result?.end).toBe(200);
        });

        it('should return null for invalid range (end < start)', () => {
            const parsed = { type: 'start-end' as const, start: 200, end: 100 };
            const result = RangeNormalizer.normalize(parsed, 1000, config.CHUNK_SIZE, mockLogger, 'test.mp4');
            expect(result).toBeNull();
        });
    });

    describe('ByteRange', () => {
        it('should create valid range', () => {
            const range = new ByteRange(100, 200);
            expect(range.start).toBe(100);
            expect(range.end).toBe(200);
            expect(range.size).toBe(101);
        });

        it('should throw error for invalid range (start > end)', () => {
            expect(() => new ByteRange(200, 100)).toThrow();
        });

        it('should clamp range to file size', () => {
            const range = new ByteRange(100, 200);
            const clamped = range.clamp(150);
            expect(clamped.end).toBe(149);
        });

        it('should apply chunk limit', () => {
            const range = new ByteRange(0, 1000000);
            const limited = range.applyChunkLimit(500000, 1000000);
            expect(limited.end).toBeLessThanOrEqual(499999);
        });
    });
});
