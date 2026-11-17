import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Legacy route deprecation notice', () => {
  function appWithLog() {
    const lines = [];
    const app = createApp({ deprecationLog: (line) => lines.push(line) });
    return { app, lines };
  }

  it('logs one line with method and path (no query string) for each legacy route hit', async () => {
    const { app, lines } = appWithLog();

    const res = await request(app).get('/api/months/2026/11?secret=1');
    await request(app).post('/api/bank-accounts').send({});
    await request(app).get('/api/transactions');

    expect(res.headers.deprecation).toBe('true');
    expect(lines).toEqual([
      '[deprecated] GET /api/months/2026/11 (use /api/v1)',
      '[deprecated] POST /api/bank-accounts (use /api/v1)',
      '[deprecated] GET /api/transactions (use /api/v1)'
    ]);
  });

  it('does not log v1 routes or routes that have no v1 replacement', async () => {
    const { app, lines } = appWithLog();

    const res = await request(app).get('/api/v1/periods');
    await request(app).get('/api/settings');
    await request(app).get('/api/health');
    await request(app).get('/api/monthsXYZ');

    expect(res.headers.deprecation).toBeUndefined();
    expect(lines).toEqual([]);
  });
});
