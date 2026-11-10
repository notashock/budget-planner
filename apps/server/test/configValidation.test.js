import { describe, it, expect, vi } from 'vitest';
import { isValidMongoUri } from '../src/config.js';
import { connectDB } from '../src/db.js';
import { errorHandler } from '../src/app.js';

describe('MongoDB URI Pre-Flight Validation', () => {
  it('rejects undefined, null, empty strings, and non-strings', () => {
    expect(isValidMongoUri(undefined)).toBe(false);
    expect(isValidMongoUri(null)).toBe(false);
    expect(isValidMongoUri('')).toBe(false);
    expect(isValidMongoUri(12345)).toBe(false);
  });

  it('rejects URIs with invalid schemes', () => {
    expect(isValidMongoUri('http://localhost:27017')).toBe(false);
    expect(isValidMongoUri('postgres://user:pass@localhost:5432/db')).toBe(false);
  });

  it('rejects placeholder template angle brackets that cause querySrv EBADNAME crashes', () => {
    expect(isValidMongoUri('mongodb+srv://admin:pass@<cluster>.mongodb.net/test')).toBe(false);
    expect(isValidMongoUri('mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net')).toBe(false);
    expect(isValidMongoUri('mongodb://user:<password>@localhost:27017/db')).toBe(false);
  });

  it('rejects localhost and 127.0.0.1 in production mode', () => {
    expect(isValidMongoUri('mongodb://127.0.0.1:27017/db', true)).toBe(false);
    expect(isValidMongoUri('mongodb://localhost:27017/db', true)).toBe(false);
    // But allows in non-production mode
    expect(isValidMongoUri('mongodb://127.0.0.1:27017/db', false)).toBe(true);
    expect(isValidMongoUri('mongodb://localhost:27017/db', false)).toBe(true);
  });

  it('accepts valid production MongoDB Atlas SRV URIs', () => {
    expect(isValidMongoUri('mongodb+srv://admin:myrealpass123@cluster0.abcde.mongodb.net/budget_planner?retryWrites=true&w=majority', true)).toBe(true);
    expect(isValidMongoUri('mongodb://mongo-user:secret123@prod-db.example.com:27017/budget_planner', true)).toBe(true);
  });

  it('connectDB safely returns null without throwing when given an invalid URI', async () => {
    const result = await connectDB('mongodb+srv://user:pass@<cluster>.mongodb.net/test');
    expect(result).toBeNull();
  });

  it('errorHandler middleware catches MongoServerSelectionError and responds with HTTP 503 JSON', () => {
    const err = new Error('getaddrinfo ENOTFOUND cluster0.abcde.mongodb.net');
    err.name = 'MongoServerSelectionError';

    const req = {};
    const res = {
      statusCode: null,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.jsonData).toEqual({
      error: 'Database service unavailable. Please check your database connection configuration.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('errorHandler middleware catches Mongoose buffering timed out and responds with HTTP 503 JSON', () => {
    const err = new Error('Operation users.findOne() buffering timed out after 10000ms');
    err.name = 'MongooseError';

    const req = {};
    const res = {
      statusCode: null,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.jsonData).toEqual({
      error: 'Database service unavailable. Please check your database connection configuration.'
    });
  });
});
