import { serialize } from '../utils/serializer.js';

/**
 * Helper to compute high-resolution turnaround time in milliseconds (2 decimal places)
 */
export function getTurnaroundDurationMs(req) {
  if (!req || !req._startTime) return 0;
  const elapsedNs = process.hrtime.bigint() - req._startTime;
  return Number((Number(elapsedNs) / 1e6).toFixed(2));
}

/**
 * Decorates the response object with standard envelope helpers
 * and intercepts raw `res.json()` calls to guarantee universal envelope compliance.
 */
export function responseEnvelope(req, res, next) {
  const originalJson = res.json.bind(res);

  // Explicit Success Dispatcher
  res.success = function (data, statusCode = 200, metadata = {}) {
    res.statusCode = statusCode;
    return originalJson({
      status: 'success',
      timestamp: new Date().toISOString(),
      metadata: {
        durationMs: getTurnaroundDurationMs(req),
        ...metadata
      },
      data: serialize(data)
    });
  };

  // Explicit Error Dispatcher
  res.fail = function (code, message, details = null, statusCode = 400, metadata = {}) {
    res.statusCode = statusCode;
    return originalJson({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code,
        message,
        details
      },
      metadata: {
        durationMs: getTurnaroundDurationMs(req),
        ...metadata
      }
    });
  };

  // Intercept raw res.json to format into envelope automatically
  res.json = function (body) {
    if (body === null || body === undefined) {
      return res.success(null, res.statusCode);
    }

    // Already enveloped
    if (typeof body === 'object' && (body.status === 'success' || body.status === 'error')) {
      return originalJson(body);
    }

    // Legacy error object shape { error: 'message' }
    if (typeof body === 'object' && body.error && Object.keys(body).length <= 2) {
      const code = res.statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : (res.statusCode === 404 ? 'NOT_FOUND' : (res.statusCode === 401 ? 'UNAUTHORIZED' : (res.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST')));
      const errorMsg = typeof body.error === 'string' ? body.error : (body.error.message || 'An error occurred');
      return res.fail(code, errorMsg, null, res.statusCode);
    }

    // Regular payload: wrap in success envelope
    return res.success(body, res.statusCode);
  };

  next();
}
