const config = require('./config');

/**
 * Handles HTTP range requests for video streaming
 */
class StreamHandler {
    /**
     * Streams video file over HTTP with range request support
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Object} file - WebTorrent file object
     */
    static streamVideo(req, res, file) {
        const range = req.headers.range;
        const fileName = file.name || 'unknown';
        const fileSize = file.length;

        if (!range) {
            // If no range header, send first small chunk (2 MB)
            // so browser can detect format and then use range requests
            return this._sendInitialChunk(req, res, file, fileName, fileSize);
        }

        // Parse and handle range request
        return this._handleRangeRequest(req, res, file, fileName, fileSize, range);
    }

    /**
     * Sends initial chunk when no range header is present
     * @private
     */
    static _sendInitialChunk(req, res, file, fileName, fileSize) {
        const initialChunkSize = Math.min(config.INITIAL_CHUNK_SIZE, fileSize);
        const end = initialChunkSize - 1;

        console.log(`[${fileName}] Request without range header - sending first chunk (0-${end}, ${(initialChunkSize / 1024 / 1024).toFixed(2)} MB)`);

        res.writeHead(206, {
            'Content-Range': `bytes 0-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': initialChunkSize,
            'Content-Type': 'video/mp4'
        });

        const stream = file.createReadStream({ start: 0, end });
        this._setupStreamHandlers(req, res, stream, fileName, 0, end);
        stream.pipe(res);
    }

    /**
     * Handles HTTP range request
     * @private
     */
    static _handleRangeRequest(req, res, file, fileName, fileSize, range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);

        // Determine end position
        let requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Limit chunk size to maximum value
        const maxAllowedEnd = Math.min(start + config.MAX_CHUNK_SIZE - 1, fileSize - 1);
        const end = Math.min(requestedEnd, maxAllowedEnd);

        const chunksize = (end - start) + 1;

        // Warn if requested chunk is too large
        if (requestedEnd - start > config.MAX_CHUNK_SIZE) {
            console.warn(`[${fileName}] Requested chunk too large: ${((requestedEnd - start) / 1024 / 1024).toFixed(2)} MB, limiting to ${(config.MAX_CHUNK_SIZE / 1024 / 1024).toFixed(2)} MB`);
        }

        // Log requested chunk
        const startMB = (start / 1024 / 1024).toFixed(2);
        const endMB = (end / 1024 / 1024).toFixed(2);
        const chunkMB = (chunksize / 1024 / 1024).toFixed(2);
        const progress = ((start / fileSize) * 100).toFixed(1);

        console.log(`[${fileName}] Chunk request: bytes ${start}-${end} (${chunkMB} MB) | Position: ${startMB}-${endMB} MB | Progress: ${progress}%`);

        // Check if chunk is valid
        if (start >= fileSize) {
            console.warn(`[${fileName}] Invalid range: start ${start} >= file.length ${fileSize}`);
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            res.end();
            return;
        }

        // Check chunk availability (whether it's loaded)
        this._checkChunkAvailability(file, fileName, start, end);

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        });

        // Create stream for requested byte range
        const stream = file.createReadStream({ start, end });
        this._setupStreamHandlers(req, res, stream, fileName, start, end);
        stream.pipe(res);
    }

    /**
     * Checks if chunk pieces are available
     * @private
     */
    static _checkChunkAvailability(file, fileName, start, end) {
        const pieceLength = file._torrent ? file._torrent.pieceLength : 0;
        if (pieceLength > 0) {
            const startPiece = Math.floor(start / pieceLength);
            const endPiece = Math.floor(end / pieceLength);
            const piecesAvailable = file._torrent.pieces ?
                file._torrent.pieces.slice(startPiece, endPiece + 1).filter(p => p).length : 0;
            const totalPieces = endPiece - startPiece + 1;

            if (piecesAvailable < totalPieces) {
                console.log(`[${fileName}] Pieces loading: ${piecesAvailable}/${totalPieces} available`);
            }
        }
    }

    /**
     * Sets up error handling and cleanup for stream
     * @private
     */
    static _setupStreamHandlers(req, res, stream, fileName, start, end) {
        // Stream error handling
        stream.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).end();
            }
            console.error(`[${fileName}] Stream error (bytes ${start}-${end}):`, err.message);
        });

        // Log chunk transfer completion
        stream.on('end', () => {
            console.log(`[${fileName}] Chunk ${start}-${end} successfully sent`);
        });

        // Client disconnect handling
        const cleanup = () => {
            if (stream && !stream.destroyed) {
                if (start !== undefined && end !== undefined) {
                    console.log(`[${fileName}] Connection closed by client, chunk ${start}-${end} interrupted`);
                }
                stream.destroy();
            }
        };

        req.on('close', cleanup);
        req.on('aborted', cleanup);
        res.on('close', cleanup);
        res.on('finish', cleanup);
    }
}

module.exports = StreamHandler;
