/**
 * HTTP status codes used in streaming
 */
export const HTTP_STATUS = {
  PARTIAL_CONTENT: 206,
  RANGE_NOT_SATISFIABLE: 416,
  INTERNAL_SERVER_ERROR: 500,
  BAD_REQUEST: 400,
  NOT_FOUND: 404
} as const;

/**
 * HTTP headers used in streaming responses
 */
export const HTTP_HEADERS = {
  CONTENT_TYPE_VIDEO: 'video/mp4',
  ACCEPT_RANGES: 'bytes',
  CACHE_CONTROL_NO_CACHE: 'no-cache'
} as const;

/**
 * Piece priority levels for WebTorrent
 */
export const PIECE_PRIORITY = {
  HIGH: 1,
  NORMAL: 0
} as const;
