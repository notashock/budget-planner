import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/index.js';

// Sprint 1: the server simulation must include goals (it used to pass none),
// reserving each open goal's monthly share, the same as the browser engine.
describe('Server simulation reserves goal monthly share', () => {
  let app;
  let token;

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `goal_reserve_${Date.now()}@example.com`, password: 'Password123!' });
    token = reg.body.data?.token || reg.body.token;
  });

  it('GET /api/v1/periods/:y/:m includes this month\'s goal reserve in safe-to-spend', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const monthRes = await request(app)
      .post('/api/months')
      .set(auth)
      .send({ year: 2026, month: 12, openingBalance: 500000, safetyFloor: 10000 });
    expect([200, 201]).toContain(monthRes.status);

    const before = await request(app).get('/api/v1/periods/2026/12').set(auth);
    expect(before.status).toBe(200);
    const simBefore = (before.body.data || before.body).simulation;
    expect(simBefore.safeVelocity.goalReserve).toBe(0);

    // ₹600 by February: Dec, Jan, Feb = 3 months → ₹200 (20,000 paise) reserved this month
    const goalRes = await request(app)
      .post('/api/months/2026/12/goals')
      .set(auth)
      .send({ name: 'New phone', targetAmount: 60000, targetDate: '2027-02-15' });
    expect([200, 201]).toContain(goalRes.status);

    const after = await request(app).get('/api/v1/periods/2026/12').set(auth);
    const simAfter = (after.body.data || after.body).simulation;
    expect(simAfter.safeVelocity.goalReserve).toBe(20000);
    expect(simAfter.safeVelocity.freeSurplus).toBe(Math.max(0, simBefore.safeVelocity.freeSurplus - 20000));
  });
});
