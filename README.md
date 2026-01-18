# Torrent Streamer

## Installation

```bash
npm install
```

## Usage

### Start the server

```bash
npm run start
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
| DELETE | `/torrent?magnet=...` | Stop and remove a torrent |

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

# Stop torrent
curl -X DELETE "http://localhost:3000/torrent?magnet=magnet:?xt=..."
```

### Test Magnet Links

**Big Buck Bunny (test animation):**
```
magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny
```

## Configuration

You can modify these constants in the code:

- `PORT` - Server port (default: 3000)
- `MAX_CHUNK_SIZE` - Maximum chunk size in bytes (default: 10 MB)
- Initial chunk size - First chunk when no Range header (default: 2 MB)
- Metadata timeout - Timeout for receiving torrent metadata (default: 30 seconds)
