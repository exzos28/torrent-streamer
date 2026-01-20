/**
 * SVG generator for torrent visualization
 * Creates SVG progress bars showing download progress and pieces status
 */

import { TorrentDebugInfo } from '../../../domain/interfaces/ITorrentRepository';

interface SVGOptions {
    width?: number;
    barHeight?: number;
    pieceBarHeight?: number;
    spacing?: number;
    fontSize?: number;
}

const DEFAULT_OPTIONS: Required<SVGOptions> = {
    width: 800,
    barHeight: 30,
    pieceBarHeight: 8,
    spacing: 20,
    fontSize: 14
};

/**
 * Generates SVG visualization of torrents with progress bars and pieces status
 */
export function generateTorrentsSVG(
    torrents: TorrentDebugInfo[],
    options: SVGOptions = {}
): string {
    // Ensure all options have valid default values
    const opts: Required<SVGOptions> = {
        width: options.width && !isNaN(options.width) ? options.width : DEFAULT_OPTIONS.width,
        barHeight: options.barHeight && !isNaN(options.barHeight) ? options.barHeight : DEFAULT_OPTIONS.barHeight,
        pieceBarHeight: options.pieceBarHeight && !isNaN(options.pieceBarHeight) ? options.pieceBarHeight : DEFAULT_OPTIONS.pieceBarHeight,
        spacing: options.spacing && !isNaN(options.spacing) ? options.spacing : DEFAULT_OPTIONS.spacing,
        fontSize: options.fontSize && !isNaN(options.fontSize) ? options.fontSize : DEFAULT_OPTIONS.fontSize
    };

    const padding = 20;
    let currentY = padding;

    // Calculate total height - ensure minimum height for empty state
    // Height includes: legend (1-2 rows), name, info, pieces stats, progress bar, pieces bar, spacing
    const availableWidth = (options.width && !isNaN(options.width) ? options.width : DEFAULT_OPTIONS.width) - padding * 2;
    const itemsPerRow = Math.floor(availableWidth / 150);
    const useTwoRows = itemsPerRow < 4; // 4 legend items
    const legendRows = useTwoRows ? 2 : 1;
    const legendHeight = torrents.length > 0 ? (opts.fontSize + 5) * legendRows + 10 : 0; // Add space for legend if there are torrents
    const torrentHeight = opts.pieceBarHeight + opts.spacing + opts.fontSize * 3 + 15; // Removed barHeight since we removed progress bar
    const minHeight = padding * 2 + opts.fontSize * 2; // Minimum height for "No active torrents" message
    const totalHeight = Math.max(minHeight, padding * 2 + legendHeight + torrents.length * torrentHeight);

    let svg = `<svg width="${opts.width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `             <style>
             .title { font-family: monospace; font-size: ${opts.fontSize + 2}px; font-weight: bold; fill: #333; }
             .info { font-family: monospace; font-size: ${opts.fontSize}px; fill: #666; }
             .legend { font-family: monospace; font-size: ${opts.fontSize - 1}px; fill: #555; }
             .progress-bg { fill: #e0e0e0; }
             .progress-fill { fill: #4caf50; }
             .piece-bg { fill: #f5f5f5; }
             .piece-downloaded { fill: #2196f3; } /* Blue - downloaded, not prioritized */
             .piece-missing { fill: #f5f5f5; } /* Light gray - not downloaded, not prioritized */
             .piece-prioritized { fill: #ff9800; } /* Orange - not downloaded, prioritized */
             .piece-prioritized-downloaded { fill: #ff5722; } /* Dark orange/red - downloaded and prioritized */
           </style>\n`;

    if (torrents.length === 0) {
        const centerX = opts.width / 2;
        const centerY = totalHeight / 2;
        svg += `  <text x="${centerX}" y="${centerY}" text-anchor="middle" class="info">No active torrents</text>\n`;
        svg += `</svg>`;
        return svg;
    }

    // Add legend at the top
    const legendY = currentY + opts.fontSize;
    const legendX = padding;
    const legendSquareSize = 10;
    const legendSpacing = 5;
    const legendLineHeight = opts.fontSize + 5;

    // Legend items - arrange in 2 rows if needed
    const legendItems = [
        { class: 'piece-missing', label: 'Not downloaded' },
        { class: 'piece-downloaded', label: 'Downloaded' },
        { class: 'piece-prioritized', label: 'Prioritized' },
        { class: 'piece-prioritized-downloaded', label: 'Downloaded + Priority' }
    ];

    // Use already calculated values for legend layout
    const legendItemsPerRow = Math.floor(availableWidth / 150); // ~150px per item
    const legendUseTwoRows = legendItemsPerRow < legendItems.length;

    svg += `  <text x="${legendX}" y="${legendY}" class="legend" font-weight="bold">Legend:</text>\n`;

    let legendItemX = legendX + 60;
    let legendItemY = legendY;
    let itemsInCurrentRow = 0;

    for (let i = 0; i < legendItems.length; i++) {
        const item = legendItems[i];

        // Move to second row if needed
        if (legendUseTwoRows && itemsInCurrentRow >= legendItemsPerRow && i > 0) {
            legendItemX = legendX + 60;
            legendItemY += legendLineHeight;
            itemsInCurrentRow = 0;
        }

        svg += `  <rect x="${legendItemX}" y="${legendItemY - legendSquareSize}" width="${legendSquareSize}" height="${legendSquareSize}" class="${item.class}" />\n`;
        svg += `  <text x="${legendItemX + legendSquareSize + legendSpacing}" y="${legendItemY}" class="legend">${escapeXml(item.label)}</text>\n`;

        legendItemX += 150; // Move to next item position
        itemsInCurrentRow++;
    }

    // Update currentY based on legend height (use already calculated legendRows)
    currentY += legendRows * legendLineHeight + 5;

    for (const torrent of torrents) {
        const x = padding;
        const progress = torrent.progress;
        const progressWidth = opts.width - padding * 2;

        // Torrent name and info
        const nameY = currentY + opts.fontSize;
        const torrentName = torrent.name || 'Unknown torrent';
        svg += `  <text x="${x}" y="${nameY}" class="title">${escapeXml(torrentName)}</text>\n`;

        const infoY = nameY + opts.fontSize + 5;
        const infoText = `${(progress * 100).toFixed(1)}% | ${formatBytes(torrent.downloadSpeed)}/s | ${torrent.numPeers} peers`;
        svg += `  <text x="${x}" y="${infoY}" class="info">${escapeXml(infoText)}</text>\n`;

        // Pieces statistics
        // torrent.pieces is an array of 0/1 (numbers) or boolean values indicating downloaded status
        let piecesDownloaded = 0;
        if (torrent.pieces && Array.isArray(torrent.pieces)) {
            piecesDownloaded = torrent.pieces.filter((p: number | boolean) => {
                // Handle both number (0/1) and boolean values
                return p === 1 || p === true;
            }).length;
        }

        let piecesPrioritized = 0;
        if (torrent.prioritizedPieces && Array.isArray(torrent.prioritizedPieces)) {
            piecesPrioritized = torrent.prioritizedPieces.filter((p: number | boolean) => {
                return p === 1 || p === true;
            }).length;
        }
        const piecesStatsY = infoY + opts.fontSize + 3;
        const piecesStatsText = `Pieces: ${piecesDownloaded}/${torrent.totalPieces} downloaded`;
        if (piecesPrioritized > 0) {
            const piecesStatsTextWithPriority = `${piecesStatsText} | ${piecesPrioritized} prioritized`;
            svg += `  <text x="${x}" y="${piecesStatsY}" class="info">${escapeXml(piecesStatsTextWithPriority)}</text>\n`;
        } else {
            svg += `  <text x="${x}" y="${piecesStatsY}" class="info">${escapeXml(piecesStatsText)}</text>\n`;
        }

        // Pieces visualization - shows all states in one detailed row:
        // - Light gray: not downloaded, not prioritized
        // - Blue: downloaded, not prioritized
        // - Orange: not downloaded, prioritized
        // - Dark orange/red: downloaded and prioritized
        if (torrent.totalPieces > 0 && torrent.pieces && Array.isArray(torrent.pieces) && torrent.pieces.length > 0) {
            const pieceBarY = piecesStatsY + opts.fontSize + 5;
            // Show all pieces for maximum detail (no limit, but use step if too many)
            const maxPiecesToShow = Math.min(torrent.totalPieces, 2000); // Very high limit for detail
            const pieceStep = Math.max(1, Math.ceil(torrent.totalPieces / maxPiecesToShow));
            const displayedWidth = progressWidth;
            const piecesCount = Math.min(torrent.totalPieces, torrent.pieces.length);

            // Only render if we have valid data
            if (piecesCount > 0 && displayedWidth > 0 && !isNaN(displayedWidth)) {
                for (let i = 0; i < piecesCount; i += pieceStep) {
                    const pieceRatio = i / piecesCount;
                    const pieceX = x + pieceRatio * displayedWidth;
                    const pieceW = Math.max(0.5, (pieceStep / piecesCount) * displayedWidth);
                    const pieceIndex = Math.floor(i);

                    // Get piece status
                    const pieceValue = pieceIndex < torrent.pieces.length ? torrent.pieces[pieceIndex] : 0;
                    // Handle both number (0/1) and boolean values
                    const isDownloaded = pieceValue === 1 || (typeof pieceValue === 'boolean' && pieceValue === true);

                    // Get prioritized status
                    const prioritizedValue = torrent.prioritizedPieces && pieceIndex < torrent.prioritizedPieces.length
                        ? torrent.prioritizedPieces[pieceIndex]
                        : 0;
                    const isPrioritized = prioritizedValue === 1 || (typeof prioritizedValue === 'boolean' && prioritizedValue === true);

                    // Validate all values before adding to SVG
                    if (
                        !isNaN(pieceX) &&
                        !isNaN(pieceW) &&
                        !isNaN(pieceBarY) &&
                        pieceX >= 0 &&
                        pieceW > 0 &&
                        pieceBarY >= 0
                    ) {
                        // Determine piece class based on downloaded and prioritized status
                        let pieceClass = 'piece-missing'; // Default: not downloaded, not prioritized
                        if (isDownloaded && isPrioritized) {
                            pieceClass = 'piece-prioritized-downloaded'; // Downloaded and prioritized
                        } else if (isDownloaded) {
                            pieceClass = 'piece-downloaded'; // Downloaded, not prioritized
                        } else if (isPrioritized) {
                            pieceClass = 'piece-prioritized'; // Not downloaded, but prioritized
                        }
                        svg += `  <rect x="${pieceX.toFixed(2)}" y="${pieceBarY}" width="${pieceW.toFixed(2)}" height="${opts.pieceBarHeight}" class="${pieceClass}" />\n`;
                    }
                }
            }
        }

        currentY += torrentHeight;
    }

    svg += `</svg>`;
    return svg;
}

/**
 * Formats bytes to human readable format
 */
function formatBytes(bytes: number): string {
    if (!bytes || isNaN(bytes) || bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const sizeIndex = Math.min(i, sizes.length - 1);
    return `${(bytes / Math.pow(k, sizeIndex)).toFixed(1)} ${sizes[sizeIndex]}`;
}

/**
 * Escapes XML special characters
 */
function escapeXml(text: string | undefined | null): string {
    if (!text) {
        return '';
    }
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
