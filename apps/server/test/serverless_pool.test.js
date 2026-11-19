import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { poolSizing } from '../src/db/poolSizing.js';

describe('pool sizing', () => {
  it('a serverless instance holds one connection and lets it go quickly', () => {
    expect(poolSizing({ serverless: true, production: true })).toMatchObject({ max: 1, idleTimeoutMillis: 5000, allowExitOnIdle: true });
  });

  it('a long-running server keeps a small pool', () => {
    expect(poolSizing({ serverless: false, production: true }).max).toBe(10);
    expect(poolSizing({ serverless: false, production: false }).max).toBe(4);
  });
});

// Runs the real pool as Vercel would build it (VERCEL is read when db/index.js loads)
describe('on serverless (one pooled connection)', () => {
  let pool;
  let db;
  let SalaryCycleJob;
  const previous = process.env.VERCEL;

  beforeAll(async () => {
    process.env.VERCEL = '1';
    vi.resetModules();
    ({ pool, db } = await import('../src/db/index.js'));
    ({ SalaryCycleJob } = await import('../src/services/salaryCycleJob.js'));
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
    await pool?.end();
  });

  it('builds the pool with a single connection', () => {
    expect(pool.options.max).toBe(1);
  });

  it('parallel queries in one request queue on it instead of failing', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => pool.query('SELECT $1::int AS n', [i])));
    expect(results.map((r) => r.rows[0].n)).toEqual([0, 1, 2, 3, 4, 5]);
    await expect(db.query.users.findMany({ limit: 1 })).resolves.toBeDefined();
  });

  it('the salary job does not wait on its own lock connection', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await SalaryCycleJob.runJob();
      const jobFailures = errors.mock.calls.filter(([msg]) => String(msg).includes('Background job execution error'));
      expect(jobFailures).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  }, 30000);
});
