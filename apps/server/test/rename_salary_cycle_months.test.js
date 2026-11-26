import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { renameSalaryCycleMonths } from '../src/scripts/rename_salary_cycle_months.js';

// Months filed under their start month before periodMonthKey get the name of the month they mostly cover.
describe('renameSalaryCycleMonths', () => {
  let userId;
  let clashUserId;
  let calendarUserId;
  let client;
  const ids = {};
  const backupDir = fs.mkdtempSync(`${os.tmpdir()}/month-names-`);
  const email = (p) => `${p}_${Date.now()}_${Math.random()}@example.com`;
  const template = (uid, periodType) => ({ userId: uid, amount: 100, expectedCreditDay: 30, periodType, effectiveDate: '2030-01-30' });

  beforeAll(async () => {
    await runMigrations();
    [{ id: userId }] = await db.insert(s.users).values({ email: email('rename'), passwordHash: 'x' }).returning();
    [{ id: clashUserId }] = await db.insert(s.users).values({ email: email('rename_clash'), passwordHash: 'x' }).returning();
    [{ id: calendarUserId }] = await db.insert(s.users).values({ email: email('rename_cal'), passwordHash: 'x' }).returning();
    await db.insert(s.salaryTemplates).values([
      template(userId, 'salary_cycle'), template(clashUserId, 'salary_cycle'), template(calendarUserId, 'calendar_month')
    ]);

    const month = async (key, uid, year, m, startDate, endDate) => {
      [{ id: ids[key] }] = await db.insert(s.months).values({ userId: uid, year, month: m, startDate, endDate }).returning();
    };
    // A chain, each one name too early: Aug -> Sep, Sep -> Oct, Oct -> Nov. The first month started late
    // (opening date 25 Sep) inside the cycle that began 30 Aug, so it is September, not October.
    await month('first', userId, 2030, 8, '2030-09-25', '2030-09-29');
    await month('second', userId, 2030, 9, '2030-09-30', '2030-10-29');
    await month('third', userId, 2030, 10, '2030-10-30', '2030-11-29');
    // Already right: created after periodMonthKey
    await month('fourth', userId, 2030, 12, '2030-11-30', '2030-12-29');

    // Old cycle (Oct name) wants Nov, but a dateless Nov month holds that name
    await month('clashOld', clashUserId, 2030, 10, '2030-10-30', '2030-11-29');
    await month('clashHolder', clashUserId, 2030, 11, null, null);

    await month('calendar', calendarUserId, 2030, 10, '2030-10-30', '2030-11-29');
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await db.delete(s.users).where(inArray(s.users.id, [userId, clashUserId, calendarUserId].filter(Boolean)));
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  const nameOf = async (key) => {
    const m = await db.query.months.findFirst({ where: eq(s.months.id, ids[key]) });
    return `${m.year}-${m.month}`;
  };
  const moves = (list) => list
    .filter((r) => [userId, clashUserId, calendarUserId].includes(r.user_id))
    .map((r) => [r.id, `${r.to.year}-${r.to.month}`]);

  it('dry run lists the renames and the clash and changes nothing', async () => {
    const res = await renameSalaryCycleMonths(client, { backupDir });
    expect(moves(res.renames)).toEqual([[ids.first, '2030-9'], [ids.second, '2030-10'], [ids.third, '2030-11']]);
    expect(moves(res.conflicts)).toEqual([[ids.clashOld, '2030-11']]);
    expect(res.backupPath).toBeNull();
    expect(await nameOf('second')).toBe('2030-9');
  });

  it('apply renames the chain in one go, backs up old names, and is a no-op the second time', async () => {
    const res = await renameSalaryCycleMonths(client, { apply: true, userId, backupDir });
    expect(JSON.parse(fs.readFileSync(res.backupPath, 'utf8'))).toEqual([
      expect.objectContaining({ id: ids.first, year: 2030, month: 8 }),
      expect.objectContaining({ id: ids.second, year: 2030, month: 9 }),
      expect.objectContaining({ id: ids.third, year: 2030, month: 10 })
    ]);
    expect([await nameOf('first'), await nameOf('second'), await nameOf('third'), await nameOf('fourth')])
      .toEqual(['2030-9', '2030-10', '2030-11', '2030-12']);
    expect((await renameSalaryCycleMonths(client, { userId, backupDir })).renames).toEqual([]);
  });

  it('leaves calendar-month users and clashing months alone', async () => {
    expect(await nameOf('calendar')).toBe('2030-10');
    expect(await nameOf('clashOld')).toBe('2030-10');
  });
});
