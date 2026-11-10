import { AppError } from '../utils/errors.js';
import { getTurnaroundDurationMs } from './envelope.js';

/**
 * Centralized Application Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  // If response headers are already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred';
  let details = null;

  // 1. Handled Application Errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // 2. PostgreSQL / Drizzle Error Codes
  else if (err.code === '23505') {
    // Unique violation
    statusCode = 409;
    code = 'UNIQUE_CONSTRAINT_VIOLATION';
    message = 'A record with this identifier or unique property already exists';
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced entity does not exist or has dependent relationships';
  } else if (err.code === '22P02') {
    // Invalid text representation (e.g. invalid UUID)
    statusCode = 400;
    code = 'INVALID_IDENTIFIER_FORMAT';
    message = 'Provided identifier has an invalid format';
  } else if (err.type === 'entity.parse.failed') {
    // Malformed JSON payload
    statusCode = 400;
    code = 'MALFORMED_JSON_PAYLOAD';
    message = 'Request body contains malformed or unparseable JSON';
  } else if (err.type === 'entity.too.large') {
    // Payload too large
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body exceeds the maximum permitted size (100KB)';
  } else if (
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    (err.name === 'MongooseError' && err.message?.includes('buffering timed out'))
  ) {
    statusCode = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database service unavailable. Please check your database connection configuration.';
  } else if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    statusCode = err.statusCode;
    code = err.code || (statusCode === 404 ? 'NOT_FOUND' : (statusCode === 401 ? 'UNAUTHORIZED' : (statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST')));
    message = err.message || message;
  } else {
    // Log unexpected 500s with stack trace for server diagnostics
    console.error(`[CRITICAL ERROR] ${req.method} ${req.originalUrl || req.url}:`, err);
  }

  return res.status(statusCode).json({
    status: 'error',
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      details
    },
    metadata: {
      durationMs: getTurnaroundDurationMs(req)
    }
  });
}
