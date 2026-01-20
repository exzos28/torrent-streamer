/**
 * Utility functions for working with piece ranges
 * Converts arrays of 0/1 values to ranges of consecutive pieces
 */

/**
 * Converts an array of 0/1 values to ranges of consecutive pieces
 * @param pieces - Array of 0/1 values where 1 indicates the piece is present
 * @returns Array of [start, end] ranges (inclusive)
 * 
 * @example
 * getRanges([1, 1, 1, 0, 0, 1, 1, 0]) // returns [[0, 2], [5, 6]]
 */
export function getRanges(pieces: number[]): number[][] {
    if (!pieces || pieces.length === 0) {
        return [];
    }

    const ranges: number[][] = [];
    let rangeStart: number | null = null;

    for (let i = 0; i < pieces.length; i++) {
        const value = pieces[i];
        const isPresent = value === 1 || (typeof value === 'boolean' && value === true);

        if (isPresent) {
            // Start a new range if we're not in one
            if (rangeStart === null) {
                rangeStart = i;
            }
        } else {
            // End the current range if we're in one
            if (rangeStart !== null) {
                ranges.push([rangeStart, i - 1]);
                rangeStart = null;
            }
        }
    }

    // Close any open range at the end
    if (rangeStart !== null) {
        ranges.push([rangeStart, pieces.length - 1]);
    }

    return ranges;
}

/**
 * Counts the number of pieces that are present (value === 1)
 * @param pieces - Array of 0/1 values
 * @returns Number of pieces that are present
 */
export function countPieces(pieces: number[]): number {
    if (!pieces || pieces.length === 0) {
        return 0;
    }

    return pieces.filter((p: number | boolean) => {
        return p === 1 || (typeof p === 'boolean' && p === true);
    }).length;
}
