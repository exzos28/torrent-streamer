/**
 * Unit tests for pieceRanges utility functions
 */

import { describe, it, expect } from 'vitest';
import { getRanges, countPieces } from './pieceRanges';

describe('pieceRanges', () => {
    describe('getRanges', () => {
        it('should return empty array for empty input', () => {
            expect(getRanges([])).toEqual([]);
        });

        it('should return empty array for null/undefined input', () => {
            expect(getRanges(null as any)).toEqual([]);
            expect(getRanges(undefined as any)).toEqual([]);
        });

        it('should return single range for all ones', () => {
            expect(getRanges([1, 1, 1, 1, 1])).toEqual([[0, 4]]);
        });

        it('should return empty array for all zeros', () => {
            expect(getRanges([0, 0, 0, 0, 0])).toEqual([]);
        });

        it('should return single range for single one', () => {
            expect(getRanges([0, 0, 1, 0, 0])).toEqual([[2, 2]]);
        });

        it('should return multiple ranges for scattered ones', () => {
            expect(getRanges([1, 1, 0, 0, 1, 1, 1, 0, 1])).toEqual([[0, 1], [4, 6], [8, 8]]);
        });

        it('should handle range at the start', () => {
            expect(getRanges([1, 1, 1, 0, 0, 0])).toEqual([[0, 2]]);
        });

        it('should handle range at the end', () => {
            expect(getRanges([0, 0, 0, 1, 1, 1])).toEqual([[3, 5]]);
        });

        it('should handle alternating pattern', () => {
            expect(getRanges([1, 0, 1, 0, 1, 0])).toEqual([[0, 0], [2, 2], [4, 4]]);
        });

        it('should handle consecutive ranges', () => {
            expect(getRanges([1, 1, 0, 1, 1, 0, 1, 1])).toEqual([[0, 1], [3, 4], [6, 7]]);
        });

        it('should handle boolean values', () => {
            expect(getRanges([true, true, false, true] as any)).toEqual([[0, 1], [3, 3]]);
        });

        it('should handle mixed number and boolean values', () => {
            expect(getRanges([1, true, 0, false, 1] as any)).toEqual([[0, 1], [4, 4]]);
        });
    });

    describe('countPieces', () => {
        it('should return 0 for empty array', () => {
            expect(countPieces([])).toBe(0);
        });

        it('should return 0 for null/undefined input', () => {
            expect(countPieces(null as any)).toBe(0);
            expect(countPieces(undefined as any)).toBe(0);
        });

        it('should count all ones', () => {
            expect(countPieces([1, 1, 1, 1, 1])).toBe(5);
        });

        it('should return 0 for all zeros', () => {
            expect(countPieces([0, 0, 0, 0, 0])).toBe(0);
        });

        it('should count scattered ones', () => {
            expect(countPieces([1, 0, 1, 0, 1, 0, 1])).toBe(4);
        });

        it('should handle boolean values', () => {
            expect(countPieces([true, false, true, true] as any)).toBe(3);
        });

        it('should handle mixed number and boolean values', () => {
            expect(countPieces([1, true, 0, false, 1] as any)).toBe(3);
        });

        it('should handle large arrays', () => {
            const pieces = new Array(1000).fill(0).map((_, i) => i % 2 === 0 ? 1 : 0);
            expect(countPieces(pieces)).toBe(500);
        });
    });
});
