import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { repairZeroMonthOpenings } from '../src/scripts/repair_zero_month_openings.js';

// The old backfill wrote a ₹0 opening for months that had none; the repair resets it to the ledger
// balance at the month's start and leaves genuine zeros alone.
describe('repairZeroMonthOpenings', () => {
  let userId;
  let bankId;
  let emptyBankId;
  let badOpeningId;
  let genuineOpeningId;
  let client;
  const backupDir = fs.mkdtempSync(`${os.tmpdir()}/openings-`);

  beforeAll(async () => {
    await runMigrations();
    [{ id: userId }] = await db.insert(s.users).values({ email: `repair_${Date.now()}@example.com`, passwordHash: 'x' }).returning();
    [{ id: bankId }] = await db.insert(s.accounts).values({
      userId, name: 'Main', type: 'bank', openingBalance: 50000, openingBalanceDate: '2030-09-01', currentBalance: 0
    }).returning();
    [{ id: emptyBankId }] = await db.insert(s.accounts).values({ userId, name: 'Empty', type: 'bank', openingBalance: 0, currentBalance: 0 }).returning();

    const base = { userId, status: 'successful', origin: 'spot', accountId: bankId };
    await db.insert(s.transactions).values([
      { ...base, name: 'Before opening date', amount: 9999, date: '2030-08-20' }, // already inside the opening balance
      { ...base, name: 'October bill', amount: 1000, date: '2030-10-15' },
      { ...base, name: 'October pay', amount: 3000, date: '2030-10-31', isIncome: true },
      { ...base, name: 'Planned, not paid', amount: 700, date: '2030-10-20', status: 'planned', origin: 'planned' },
      { ...base, name: 'Inside November', amount: 500, date: '2030-11-05' }
    ]);

    const [nov] = await db.insert(s.months).values({ userId, year: 2030, month: 11, openingBalance: 0 }).returning();
    [{ id: badOpeningId }] = await db.insert(s.monthAccountOpenings).values({ monthId: nov.id, accountId: bankId, amount: 0 }).returning();
    const [dec] = await db.insert(s.months).values({ userId, year: 2030, month: 12, openingBalance: 0 }).returning();
    [{ id: genuineOpeningId }] = await db.insert(s.monthAccountOpenings).values({ monthId: dec.id, accountId: emptyBankId, amount: 0 }).returning();

    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  const openingAmount = async (id) => (await db.query.monthAccountOpenings.findFirst({ where: eq(s.monthAccountOpenings.id, id) })).amount;

  it('dry run reports the ledger value and changes nothing', async () => {
    const res = await repairZeroMonthOpenings(client, { userId, backupDir });
    // 50,000 opening − 1,000 bill + 3,000 pay; ignores the pre-opening, planned and in-month rows
    expect(res.fixes.map((f) => [f.id, f.ledger_amount])).toEqual([[badOpeningId, 52000]]);
    expect(res.matched).toBe(2); // the genuine zero matched but is not a fix
    expect(res.backupPath).toBeNull();
    expect(await openingAmount(badOpeningId)).toBe(0);
  });

  it('apply backs up the old rows and updates only the wrong one', async () => {
    const res = await repairZeroMonthOpenings(client, { apply: true, userId, backupDir });
    expect(JSON.parse(fs.readFileSync(res.backupPath, 'utf8'))).toEqual([
      expect.objectContaining({ id: badOpeningId, account_id: bankId, amount: 0 })
    ]);
    expect(await openingAmount(badOpeningId)).toBe(52000);
    expect(await openingAmount(genuineOpeningId)).toBe(0);

    // Running again finds nothing left to fix
    expect((await repairZeroMonthOpenings(client, { userId, backupDir })).fixes).toEqual([]);
  });
});
