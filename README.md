# Torrent Streamer

## Installation

```bash
yarn install
```

## Usage

### Start the server

```bash
yarn start
```

Server will start on `http://localhost:3000`

### Stream video

Send a GET request with a magnet link:

```
http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:HASH&dn=NAME
```

**Example:**
```bash
# In browser or video player
http://localhost:3000/stream?magnet=magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel
```

**Browser:**
Open the URL in a browser (not all browsers support this)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stream?magnet=...` | Stream video file with range request support |
| GET | `/info?magnet=...` | Get torrent information (files, progress, speed, etc.) |
| GET | `/torrents` | List all active torrents |
| POST | `/torrent?magnet=...` | Add a new torrent |
| DELETE | `/torrent?magnet=...` | Stop and remove a torrent |
| GET | `/debug/torrents` | Get debug information about all torrents (JSON with pieces status) |
| GET | `/debug/torrents.svg` | Get SVG visualization of all torrents with progress bars and pieces status |

## How It Works

### Example Flow

```
Client Request: bytes=0-10485759 (10 MB)
Server Response: 206 Partial Content, sends 10 MB chunk

Client Request: bytes=10485760-20971519 (10 MB)  
Server Response: 206 Partial Content, sends next 10 MB chunk

Client Request: bytes=20971520-30912703775 (29 GB!)
Server Response: 206 Partial Content, sends only 10 MB (limited)
```

## Examples

### cURL

```bash
# Stream video
curl "http://localhost:3000/stream?magnet=magnet:?xt=..." --output video.mp4

# Get torrent info
curl "http://localhost:3000/info?magnet=magnet:?xt=..."

# List active torrents
curl "http://localhost:3000/torrents"

# Add torrent
curl -X POST "http://localhost:3000/torrent?magnet=magnet:?xt=..."

# Stop torrent
curl -X DELETE "http://localhost:3000/torrent?magnet=magnet:?xt=..."

# Get debug info (JSON)
curl "http://localhost:3000/debug/torrents"

# Get debug visualization (SVG)
curl "http://localhost:3000/debug/torrents.svg" --output torrents.svg
# Or open in browser: http://localhost:3000/debug/torrents.svg
```

### Test Magnet Links

**Big Buck Bunny (test animation):**
```
magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny
```

## Development

### Available Scripts

- `yarn start` - Start the server
- `yarn build` - Compile TypeScript to JavaScript
- `yarn dev` - Start server with ts-node (TypeScript)
- `yarn lint` - Run ESLint to check code quality
- `yarn lint:fix` - Automatically fix ESLint errors
- `yarn type-check` - Check TypeScript types without compiling
- `yarn test` - Run tests in watch mode
- `yarn test:run` - Run tests once
- `yarn test:ui` - Run tests with UI
- `yarn test:coverage` - Run tests with coverage report

## Debug & Monitoring

### Debug Endpoints

The application provides debug endpoints to monitor torrent downloads:

**JSON Debug Info (`/debug/torrents`):**
Returns detailed information about all active torrents including:
- Torrent metadata (name, infoHash, progress, speeds, peers)
- Pieces status array (0 = not downloaded, 1 = downloaded)
- File information

**SVG Visualization (`/debug/torrents.svg`):**
Returns an SVG image showing:
- Progress bars for each torrent
- Visual representation of downloaded pieces (blue = downloaded, light red = missing)
- Torrent statistics (progress %, download speed, peer count)

**Example:**
```bash
# View in browser
open http://localhost:3000/debug/torrents.svg

# Or download
curl "http://localhost:3000/debug/torrents.svg" --output torrents.svg
```

The SVG visualization helps debug download patterns:
- Sequential downloads show continuous blue blocks
- Random downloads show scattered blue blocks
- Missing pieces show as light red blocks

## Configuration

You can modify these constants in the code:

- `PORT` - Server port (default: 3000)
- `MAX_CHUNK_SIZE` - Maximum chunk size in bytes (default: 10 MB)
- Initial chunk size - First chunk when no Range header (default: 2 MB)
- Metadata timeout - Timeout for receiving torrent metadata (default: 30 seconds)
- `MAX_MEMORY_USAGE` - Maximum memory for torrent pieces (default: 500 MB)

## TODO

Future improvements and features:

- [ ] **Memory limiting** - Implement memory limit for torrent pieces to prevent excessive RAM usage. Use LRU eviction strategy to remove least recently used pieces when memory limit is reached.
- [ ] **Dependency Injection container** - Add a proper DI container (e.g., using `inversify` or custom implementation) to simplify dependency management and improve testability.
- [ ] **Request validation middleware** - Add middleware to validate magnet links and request parameters before processing.
- [ ] **Error handling middleware** - Implement centralized error handling middleware for consistent error responses.
- [ ] **Request logging middleware** - Add middleware to log all incoming requests for debugging and monitoring.
- [ ] **Rate limiting** - Implement rate limiting to prevent abuse and ensure fair resource usage.
- [ ] **Configuration via environment variables** - Make all configuration options configurable via environment variables.
- [ ] **Health check endpoint** - Add `/health` endpoint for monitoring and load balancer health checks.