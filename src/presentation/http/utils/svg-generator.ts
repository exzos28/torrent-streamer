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
    // Height includes: name, info, pieces stats, progress bar, pieces bar (downloaded), prioritized pieces bar, spacing
    const torrentHeight = opts.barHeight + opts.pieceBarHeight * 1.5 + opts.spacing + opts.fontSize * 3 + 15;
    const minHeight = padding * 2 + opts.fontSize * 2; // Minimum height for "No active torrents" message
    const totalHeight = Math.max(minHeight, padding * 2 + torrents.length * torrentHeight);

    let svg = `<svg width="${opts.width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `             <style>
             .title { font-family: monospace; font-size: ${opts.fontSize + 2}px; font-weight: bold; fill: #333; }
             .info { font-family: monospace; font-size: ${opts.fontSize}px; fill: #666; }
             .progress-bg { fill: #e0e0e0; }
             .progress-fill { fill: #4caf50; }
             .piece-bg { fill: #f5f5f5; }
             .piece-downloaded { fill: #2196f3; }
             .piece-missing { fill: #ffebee; }
             .piece-prioritized { fill: #ff9800; }
             .piece-prioritized-downloaded { fill: #ff5722; }
           </style>\n`;

    if (torrents.length === 0) {
        const centerX = opts.width / 2;
        const centerY = totalHeight / 2;
        svg += `  <text x="${centerX}" y="${centerY}" text-anchor="middle" class="info">No active torrents</text>\n`;
        svg += `</svg>`;
        return svg;
    }

    for (const torrent of torrents) {
        const x = padding;
        const progress = torrent.progress;
        const progressWidth = opts.width - padding * 2;
        const progressFillWidth = progressWidth * progress;

        // Torrent name and info
        const nameY = currentY + opts.fontSize;
        svg += `  <text x="${x}" y="${nameY}" class="title">${escapeXml(torrent.name)}</text>\n`;

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

        // Progress bar
        const barY = piecesStatsY + opts.fontSize + 5;
        svg += `  <rect x="${x}" y="${barY}" width="${progressWidth}" height="${opts.barHeight}" class="progress-bg" rx="4"/>\n`;
        svg += `  <rect x="${x}" y="${barY}" width="${progressFillWidth}" height="${opts.barHeight}" class="progress-fill" rx="4"/>\n`;

        // Pieces visualization (downloaded status)
        if (torrent.totalPieces > 0 && torrent.pieces && Array.isArray(torrent.pieces) && torrent.pieces.length > 0) {
            const pieceBarY = barY + opts.barHeight + 5;
            const maxPiecesToShow = Math.min(torrent.totalPieces, 200); // Limit to 200 pieces for readability
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
                    const pieceValue = pieceIndex < torrent.pieces.length ? torrent.pieces[pieceIndex] : 0;
                    // Handle both number (0/1) and boolean values
                    // TypeScript sees pieceValue as number, but at runtime it might be boolean
                    const isDownloaded = pieceValue === 1 || (typeof pieceValue === 'boolean' && pieceValue === true);
                    const isPrioritized = torrent.prioritizedPieces && pieceIndex < torrent.prioritizedPieces.length && torrent.prioritizedPieces[pieceIndex] === 1;

                    // Validate all values before adding to SVG
                    if (
                        !isNaN(pieceX) &&
                        !isNaN(pieceW) &&
                        !isNaN(pieceBarY) &&
                        pieceX >= 0 &&
                        pieceW > 0 &&
                        pieceBarY >= 0
                    ) {
                        // Use different colors for prioritized pieces
                        let pieceClass = 'piece-missing';
                        if (isDownloaded && isPrioritized) {
                            pieceClass = 'piece-prioritized-downloaded';
                        } else if (isDownloaded) {
                            pieceClass = 'piece-downloaded';
                        } else if (isPrioritized) {
                            pieceClass = 'piece-prioritized';
                        }
                        svg += `  <rect x="${pieceX.toFixed(2)}" y="${pieceBarY}" width="${pieceW.toFixed(2)}" height="${opts.pieceBarHeight}" class="${pieceClass}" />\n`;
                    }
                }
            }

            // Prioritized pieces visualization (second row)
            if (torrent.prioritizedPieces && Array.isArray(torrent.prioritizedPieces) && torrent.prioritizedPieces.length > 0) {
                const prioritizedBarY = pieceBarY + opts.pieceBarHeight + 3;
                const prioritizedCount = Math.min(torrent.totalPieces, torrent.prioritizedPieces.length);

                if (prioritizedCount > 0 && displayedWidth > 0 && !isNaN(displayedWidth)) {
                    for (let i = 0; i < prioritizedCount; i += pieceStep) {
                        const pieceRatio = i / prioritizedCount;
                        const pieceX = x + pieceRatio * displayedWidth;
                        const pieceW = Math.max(0.5, (pieceStep / prioritizedCount) * displayedWidth);
                        const pieceIndex = Math.floor(i);
                        const isPrioritized = pieceIndex < torrent.prioritizedPieces.length && torrent.prioritizedPieces[pieceIndex] === 1;

                        if (
                            isPrioritized &&
                            !isNaN(pieceX) &&
                            !isNaN(pieceW) &&
                            !isNaN(prioritizedBarY) &&
                            pieceX >= 0 &&
                            pieceW > 0 &&
                            prioritizedBarY >= 0
                        ) {
                            svg += `  <rect x="${pieceX.toFixed(2)}" y="${prioritizedBarY}" width="${pieceW.toFixed(2)}" height="${opts.pieceBarHeight / 2}" class="piece-prioritized" />\n`;
                        }
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
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
