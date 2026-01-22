/**
 * Unit tests for WebTorrentStreamService
 * Tests piece waiting and download checking functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebTorrentStreamService } from './WebTorrentStreamService';
import { ILogger } from '../../domain/interfaces/ILogger';
import config from '../../config';

describe('WebTorrentStreamService', () => {
    let service: WebTorrentStreamService;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            log: vi.fn()
        };
        service = new WebTorrentStreamService(mockLogger);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });


    describe('_parseRangeHeader', () => {
        it('should parse bytes=START-END format', () => {
            const result = (service as any)._parseRangeHeader('bytes=100-200');
            expect(result).toEqual({ start: 100, end: 200, type: 'start-end' });
        });

        it('should parse bytes=START- format', () => {
            const result = (service as any)._parseRangeHeader('bytes=100-');
            expect(result).toEqual({ start: 100, end: null, type: 'start-only' });
        });

        it('should parse bytes=-SUFFIX format', () => {
            const result = (service as any)._parseRangeHeader('bytes=-500');
            expect(result).toEqual({ start: null, end: null, type: 'suffix', suffix: 500 });
        });

        it('should return null for invalid range', () => {
            expect((service as any)._parseRangeHeader('invalid')).toBeNull();
            expect((service as any)._parseRangeHeader('bytes=')).toBeNull();
            expect((service as any)._parseRangeHeader('bytes=100,200')).toBeNull(); // multiple ranges
        });
    });

    describe('_normalizeRange', () => {
        it('should normalize start-only range', () => {
            const parsed = { start: 100, end: null, type: 'start-only' as const };
            const result = (service as any)._normalizeRange(parsed, 1000, 'test.mp4');
            expect(result).toEqual({ start: 100, end: Math.min(100 + config.CHUNK_SIZE - 1, 999) });
        });

        it('should normalize suffix range', () => {
            const parsed = { start: null, end: null, type: 'suffix' as const, suffix: 500 };
            const result = (service as any)._normalizeRange(parsed, 1000, 'test.mp4');
            expect(result).toEqual({ start: 500, end: 999 });
        });

        it('should normalize start-end range', () => {
            const parsed = { start: 100, end: 200, type: 'start-end' as const };
            const result = (service as any)._normalizeRange(parsed, 1000, 'test.mp4');
            expect(result).toEqual({ start: 100, end: 200 });
        });

        it('should return null for invalid range (end < start)', () => {
            const parsed = { start: 200, end: 100, type: 'start-end' as const };
            const result = (service as any)._normalizeRange(parsed, 1000, 'test.mp4');
            expect(result).toBeNull();
        });
    });
});
