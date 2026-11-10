import { MaliciousInputError } from '../utils/errors.js';

const SCRIPT_PATTERN = /<\s*script\b[^>]*>|<\/\s*script\s*>|javascript\s*:|data\s*:\s*text\/html/i;
const SQL_PROBE_PATTERN = /('|\b)(OR|AND)\s+('?1'?\s*=\s*'?1'|true)\b|UNION\s+SELECT|DROP\s+TABLE|INFORMATION_SCHEMA/i;
const PATH_TRAVERSAL_PATTERN = /\.\.\/|\.\.\\/i;
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep inspection and sanitization of input values
 */
function inspectAndSanitize(val, path = '') {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    // 1. Strip null bytes
    let cleaned = val.replace(/\0/g, '');

    // 2. Reject malicious script injection
    if (SCRIPT_PATTERN.test(cleaned)) {
      throw new MaliciousInputError(`Potential cross-site scripting (XSS) detected in ${path || 'input'}`);
    }

    // 3. Reject active SQL injection probes
    if (SQL_PROBE_PATTERN.test(cleaned)) {
      throw new MaliciousInputError(`Potential SQL injection pattern detected in ${path || 'input'}`);
    }

    // 4. Reject directory traversal probes
    if (PATH_TRAVERSAL_PATTERN.test(cleaned)) {
      throw new MaliciousInputError(`Potential path traversal sequence detected in ${path || 'input'}`);
    }

    return cleaned;
  }

  if (Array.isArray(val)) {
    return val.map((item, idx) => inspectAndSanitize(item, `${path}[${idx}]`));
  }

  if (typeof val === 'object') {
    const sanitizedObj = {};
    for (const key of Object.keys(val)) {
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
        throw new MaliciousInputError(`Prohibited prototype pollution key '${key}' detected`);
      }
      sanitizedObj[key] = inspectAndSanitize(val[key], path ? `${path}.${key}` : key);
    }
    return sanitizedObj;
  }

  return val;
}

/**
 * Defensive Security Firewall Middleware
 */
export function defenseFirewall(req, res, next) {
  // 1. Apply Defense-in-Depth Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-XSS-Protection', '0');

  // 2. Deep-inspect parameters, query strings, and body payloads
  try {
    if (req.params) {
      req.params = inspectAndSanitize(req.params, 'params');
    }
    if (req.query) {
      req.query = inspectAndSanitize(req.query, 'query');
    }
    if (req.body) {
      req.body = inspectAndSanitize(req.body, 'body');
    }
    next();
  } catch (err) {
    next(err);
  }
}
