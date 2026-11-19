import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { responseEnvelope } from '../src/middleware/envelope.js';
import {
  idempotency,
  createMemoryIdempotencyStore,
  KEY_TTL_MS,
  PENDING_TTL_MS
} from '../src/middleware/idempotency.js';

// Unit tests: no database. A stub route counts how often the write really runs.
describe('idempotency middleware', () => {
  let store;
  let clock;
  let calls;
  let release; // resolves a slow request in the concurrency test

  const build = () => {
    const app = express();
    app.use(express.json());
    app.use(responseEnvelope);
    app.use((req, _res, next) => {
      req.userId = req.headers['x-test-user'] || undefined;
      next();
    });
    app.use(idempotency({ store, log: { warn: () => {} } }));
    app.post('/things', (req, res) => {
      calls += 1;
      res.success({ id: `thing-${calls}`, name: req.body.name }, 201);
    });
    app.post('/slow', async (_req, res) => {
      calls += 1;
      await new Promise((r) => { release = r; });
      res.success({ ok: true }, 201);
    });
    app.post('/fails', (_req, res) => {
      calls += 1;
      res.fail('BAD', 'nope', null, 400);
    });
    app.delete('/things/1', (_req, res) => {
      calls += 1;
      res.status(204).end();
    });
    app.get('/things', (_req, res) => {
      calls += 1;
      res.success([]);
    });
    return app;
  };

  beforeEach(() => {
    clock = 1_000_000;
    calls = 0;
    store = createMemoryIdempotencyStore({ now: () => clock });
  });

  const post = (app, path, { user = 'u1', key = 'k1', body = { name: 'Rent' } } = {}) => {
    let r = request(app).post(path).set('x-test-user', user);
    if (key !== null) r = r.set('Idempotency-Key', key);
    return r.send(body);
  };

  it('runs a keyed write once and replays the same response on retry', async () => {
    const app = build();
    const first = await post(app, '/things');
    const second = await post(app, '/things');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(calls).toBe(1);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.text).toBe(first.text);
    expect(second.body.data.id).toBe('thing-1');
  });

  it('runs every request when no key is sent', async () => {
    const app = build();
    await post(app, '/things', { key: null });
    await post(app, '/things', { key: null });
    expect(calls).toBe(2);
  });

  it('scopes keys to the user: another user with the same key gets their own write', async () => {
    const app = build();
    const a = await post(app, '/things', { user: 'alice' });
    const b = await post(app, '/things', { user: 'bob' });
    expect(calls).toBe(2);
    expect(a.body.data.id).toBe('thing-1');
    expect(b.body.data.id).toBe('thing-2');
    expect(b.headers['idempotent-replayed']).toBeUndefined();
  });

  it('rejects the same key with a different body (422) without running the write', async () => {
    const app = build();
    await post(app, '/things', { body: { name: 'Rent' } });
    const reused = await post(app, '/things', { body: { name: 'Groceries' } });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(calls).toBe(1);
  });

  it('answers 409 to a duplicate that arrives while the first is still running', async () => {
    const app = build();
    const firstPromise = post(app, '/slow', { body: {} }).then((r) => r);
    // Wait until the first request is inside the handler.
    while (!release) await new Promise((r) => setTimeout(r, 5));

    const dup = await post(app, '/slow', { body: {} });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    expect(dup.headers['retry-after']).toBe('1');

    release();
    const first = await firstPromise;
    expect(first.status).toBe(201);
    expect(calls).toBe(1);

    const replay = await post(app, '/slow', { body: {} });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(calls).toBe(1);
  });

  it('does not store failures: a retry after a 4xx runs the write again', async () => {
    const app = build();
    const a = await post(app, '/fails');
    const b = await post(app, '/fails');
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(b.headers['idempotent-replayed']).toBeUndefined();
    expect(calls).toBe(2);
  });

  it('replays bodiless 204 responses', async () => {
    const app = build();
    const r1 = await request(app).delete('/things/1').set('x-test-user', 'u1').set('Idempotency-Key', 'del-1');
    const r2 = await request(app).delete('/things/1').set('x-test-user', 'u1').set('Idempotency-Key', 'del-1');
    expect(r1.status).toBe(204);
    expect(r2.status).toBe(204);
    expect(r2.headers['idempotent-replayed']).toBe('true');
    expect(calls).toBe(1);
  });

  it('ignores the key on reads', async () => {
    const app = build();
    await request(app).get('/things').set('x-test-user', 'u1').set('Idempotency-Key', 'k1');
    await request(app).get('/things').set('x-test-user', 'u1').set('Idempotency-Key', 'k1');
    expect(calls).toBe(2);
  });

  it('passes unauthenticated requests through untouched', async () => {
    const app = build();
    await post(app, '/things', { user: '' });
    await post(app, '/things', { user: '' });
    expect(calls).toBe(2);
  });

  it('rejects an empty or over-long key with 400', async () => {
    const app = build();
    const empty = await post(app, '/things', { key: '   ' });
    const long = await post(app, '/things', { key: 'x'.repeat(256) });
    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(empty.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(calls).toBe(0);
  });

  it('expires stored keys after 24 hours and abandoned reservations after 2 minutes', async () => {
    const app = build();
    await post(app, '/things');
    clock += KEY_TTL_MS + 1;
    await post(app, '/things');
    expect(calls).toBe(2);

    // A reservation left behind by a request that never answered.
    await store.reserve('u1', 'stuck', 'fp');
    expect((await store.reserve('u1', 'stuck', 'fp')).state).toBe('pending');
    clock += PENDING_TTL_MS + 1;
    expect((await store.reserve('u1', 'stuck', 'fp')).state).toBe('reserved');
  });

  it('runs the request without idempotency when the store is down', async () => {
    store = {
      reserve: async () => { throw new Error('db down'); },
      complete: async () => {},
      release: async () => {}
    };
    const app = build();
    const r = await post(app, '/things');
    expect(r.status).toBe(201);
    expect(calls).toBe(1);
  });
});
