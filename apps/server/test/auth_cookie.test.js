import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/index.js';
import { AUTH_COOKIE } from '../src/utils/authCookie.js';

const cookieFrom = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${AUTH_COOKIE}=`));

describe('Web auth via httpOnly cookie, mobile via Bearer', () => {
  let app;
  let authCookie;
  let token;

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .set('X-Requested-With', 'fetch')
      .send({ email: `cookie_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    token = reg.body.data?.token || reg.body.token;
    const raw = cookieFrom(reg);
    expect(raw).toBeDefined();
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    authCookie = raw.split(';')[0];
  });

  it('authenticates with the cookie alone (nothing stored by page scripts)', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', authCookie);
    expect(me.status).toBe(200);
    expect((me.body.data || me.body).user).toBeTruthy();

    const settings = await request(app).get('/api/settings').set('Cookie', authCookie);
    expect(settings.status).toBe(200);
  });

  it('rejects a cookie-authenticated write without X-Requested-With (CSRF guard)', async () => {
    const res = await request(app).put('/api/settings').set('Cookie', authCookie).send({ currencySymbol: '₹' });
    expect(res.status).toBe(403);
  });

  it('accepts the same write when the web client sends X-Requested-With', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', authCookie)
      .set('X-Requested-With', 'fetch')
      .send({ currencySymbol: '₹' });
    expect(res.status).toBe(200);
  });

  it('leaves Bearer-token clients (the mobile app) unaffected', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ currencySymbol: '₹' });
    expect(res.status).toBe(200);
  });

  it('moves a legacy Bearer token into the cookie on /api/auth/me', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(cookieFrom(me)).toBeDefined();
  });

  it('clears the cookie on logout', async () => {
    const out = await request(app).post('/api/auth/logout').set('Cookie', authCookie).set('X-Requested-With', 'fetch');
    expect(out.status).toBe(200);
    const cleared = cookieFrom(out);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});
