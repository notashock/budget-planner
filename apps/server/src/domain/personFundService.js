import { eq, and, or, lte, gte, lt, ne, isNull, inArray, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { PASS_THROUGH_ORIGINS, passThroughDeltas } from '@budget/engine';
import { validateUserAccount } from '../services/accountValidation.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidUuid } from '../middleware/auth.js';
import { LedgerService } from './ledgerService.js';

/**
 * Held & Lent money (ADR 0069).
 *
 * A Person Fund is one running balance with one person:
 * - direction 'held': their money is with you; you owe it back.
 * - direction 'lent': your money is with them; they owe it to you.
 * Each cash movement is a pass-through transaction (origin held_in, held_return,
 * lent_out or lent_repaid). It changes account balances but is never income or
 * expense. The outstanding amount is always derived from those rows.
 */

const DIRECTIONS = ['held', 'lent'];
const CATEGORY = 'Held & Lent';

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Origin for a cash movement on a fund. flow 'in' = cash arrives, 'out' = cash leaves. */
export function originFor(direction, flow) {
  if (direction === 'held') return flow === 'in' ? 'held_in' : 'held_return';
  if (direction === 'lent') return flow === 'in' ? 'lent_repaid' : 'lent_out';
  return null;
}

function flowOf(origin) {
  return origin === 'held_in' || origin === 'lent_repaid' ? 'in' : 'out';
}

/** Outstanding on a fund from its settled rows: held -> what you owe, lent -> what they owe. */
function summarize(fund, txs) {
  let outstanding = 0;
  let totalIn = 0;
  let totalOut = 0;
  let plannedIn = 0;
  let plannedOut = 0;
  let lastActivityDate = null;
  // Where the outstanding money sits, so a return or repayment defaults to that account
  const byAccount = {};
  txs.forEach((t) => {
    const amt = Math.abs(Number(t.amount) || 0);
    const flow = flowOf(t.origin);
    if (t.status === 'successful') {
      const d = passThroughDeltas(t.origin, amt);
      const delta = fund.direction === 'held' ? d.held : d.lent;
      outstanding += delta;
      if (t.accountId) byAccount[t.accountId] = (byAccount[t.accountId] || 0) + delta;
      if (flow === 'in') totalIn += amt; else totalOut += amt;
      if (!lastActivityDate || t.date > lastActivityDate) lastActivityDate = t.date;
    } else if (t.status === 'planned') {
      if (flow === 'in') plannedIn += amt; else plannedOut += amt;
    }
  });
  const settleAccountId = Object.keys(byAccount)
    .filter((id) => byAccount[id] > 0)
    .sort((a, b) => byAccount[b] - byAccount[a])[0] || null;
  return {
    ...fund,
    outstanding,
    settleAccountId,
    totalIn,
    totalOut,
    plannedIn,
    plannedOut,
    lastActivityDate,
    entryCount: txs.filter((t) => t.status !== 'cancelled').length
  };
}

export async function resolveCoveringMonth(userId, date) {
  let month = await db.query.months.findFirst({
    where: and(eq(s.months.userId, userId), lte(s.months.startDate, date), gte(s.months.endDate, date))
  });
  if (!month) {
    // Calendar months created without explicit period dates: match on year and month
    const [yr, mo] = String(date).split('-').map(Number);
    if (yr && mo) {
      month = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.year, yr), eq(s.months.month, mo))
      });
    }
  }
  if (month && month.isClosed) {
    throw new ValidationError(`Cannot log money dated inside closed review period ${month.year}-${month.month}. Review periods are read-only.`);
  }
  return month || null;
}

/**
 * The month an entry is filed under. Like other entries, it goes into the month the
 * user is looking at (body.year/body.month) when that month is open; otherwise the
 * month that covers its date. Filing a 31 Oct entry under October while its
 * siblings sit in November left the cash out of November's balance.
 */
async function resolveEntryMonth(userId, body, date) {
  const year = Number(body.year);
  const monthNum = Number(body.month);
  if (Number.isInteger(year) && Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12) {
    const viewed = await db.query.months.findFirst({
      where: and(eq(s.months.userId, userId), eq(s.months.year, year), eq(s.months.month, monthNum))
    });
    if (viewed && !viewed.isClosed) return viewed;
  }
  return resolveCoveringMonth(userId, date);
}

// The same entry sent twice within this window is a double submit, not a second payment
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

async function loadOwnedFund(userId, fundId) {
  if (!fundId || !isValidUuid(String(fundId))) {
    throw new NotFoundError('Person not found');
  }
  const fund = await db.query.personFunds.findFirst({
    where: and(eq(s.personFunds.id, fundId), eq(s.personFunds.userId, userId))
  });
  if (!fund) throw new NotFoundError('Person not found');
  return fund;
}

async function fundTransactions(fundId) {
  return db.query.transactions.findMany({
    where: eq(s.transactions.personFundId, fundId),
    orderBy: [desc(s.transactions.date), desc(s.transactions.createdAt)]
  });
}

function parseAmount(amount) {
  const num = Math.round(Math.abs(Number(amount)));
  if (!Number.isFinite(num) || num <= 0) {
    throw new ValidationError('A positive amount is required');
  }
  return num;
}

export const PersonFundService = {
  originFor,

  async listFunds(userId, query = {}) {
    const conditions = [eq(s.personFunds.userId, userId)];
    if (query.status === 'open' || query.status === 'settled') {
      conditions.push(eq(s.personFunds.status, query.status));
    }
    if (DIRECTIONS.includes(query.direction)) {
      conditions.push(eq(s.personFunds.direction, query.direction));
    }
    const funds = await db.query.personFunds.findMany({
      where: and(...conditions),
      orderBy: [desc(s.personFunds.updatedAt)]
    });
    if (funds.length === 0) {
      return serialize({ funds: [], totals: { held: 0, lent: 0 } });
    }
    const txs = await db.query.transactions.findMany({
      where: inArray(s.transactions.personFundId, funds.map((f) => f.id))
    });
    const byFund = new Map();
    txs.forEach((t) => {
      if (!byFund.has(t.personFundId)) byFund.set(t.personFundId, []);
      byFund.get(t.personFundId).push(t);
    });
    const summaries = funds.map((f) => summarize(f, byFund.get(f.id) || []));
    const totals = summaries.reduce((acc, f) => {
      if (f.direction === 'held') acc.held += Math.max(0, f.outstanding);
      else acc.lent += Math.max(0, f.outstanding);
      return acc;
    }, { held: 0, lent: 0 });
    return serialize({ funds: summaries, totals });
  },

  async getFund(userId, fundId) {
    const fund = await loadOwnedFund(userId, fundId);
    const txs = await fundTransactions(fund.id);
    return serialize({ ...summarize(fund, txs), entries: txs });
  },

  /**
   * Creates a person fund. An optional first entry ({ amount, date, accountId })
   * records the money arriving (held) or leaving (lent) in the same call.
   */
  async createFund(userId, body = {}) {
    const personName = String(body.personName || '').trim();
    if (!personName) throw new ValidationError('Person name is required');
    if (personName.length > 80) throw new ValidationError('Person name is too long');
    const direction = body.direction;
    if (!DIRECTIONS.includes(direction)) {
      throw new ValidationError("direction must be 'held' or 'lent'");
    }
    // A second tap (or a second device) must not create the same person twice
    const existing = (await db.query.personFunds.findMany({
      where: and(eq(s.personFunds.userId, userId), eq(s.personFunds.direction, direction))
    })).find((f) => f.personName.trim().toLowerCase() === personName.toLowerCase());
    const [fund] = existing ? [existing] : await db.insert(s.personFunds).values({
      userId,
      personName,
      direction,
      note: String(body.note || '').trim(),
      expectedSettleDate: body.expectedSettleDate || null,
      status: 'open'
    }).returning();

    let entry = null;
    if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
      entry = await this.addEntry(userId, fund.id, {
        flow: direction === 'held' ? 'in' : 'out',
        amount: body.amount,
        date: body.date,
        accountId: body.accountId,
        note: body.entryNote,
        year: body.year,
        month: body.month,
        allowDuplicate: body.allowDuplicate
      });
    }
    const full = await this.getFund(userId, fund.id);
    return serialize({ ...full, createdEntry: entry });
  },

  async updateFund(userId, fundId, body = {}) {
    await loadOwnedFund(userId, fundId);
    const updates = { updatedAt: new Date() };
    if (body.personName !== undefined) {
      const name = String(body.personName).trim();
      if (!name) throw new ValidationError('Person name is required');
      updates.personName = name;
    }
    if (body.note !== undefined) updates.note = String(body.note).trim();
    if (body.expectedSettleDate !== undefined) updates.expectedSettleDate = body.expectedSettleDate || null;
    await db.update(s.personFunds).set(updates).where(eq(s.personFunds.id, fundId));
    return this.getFund(userId, fundId);
  },

  /** Deletes a person only when nothing was logged against them (history is kept otherwise). */
  async deleteFund(userId, fundId) {
    const fund = await loadOwnedFund(userId, fundId);
    const txs = await fundTransactions(fund.id);
    if (txs.some((t) => t.status !== 'cancelled')) {
      throw new ValidationError('This person has logged entries. Delete those entries first, or keep the record as settled.');
    }
    await db.delete(s.personFunds).where(eq(s.personFunds.id, fund.id));
    return serialize(fund);
  },

  /**
   * Logs a cash movement on a fund.
   * @param {object} body { flow: 'in'|'out', amount, date, accountId, note, status?: 'successful'|'planned', allowExceed? }
   */
  async addEntry(userId, fundId, body = {}) {
    const fund = await loadOwnedFund(userId, fundId);
    const flow = body.flow === 'in' || body.flow === 'out'
      ? body.flow
      : (PASS_THROUGH_ORIGINS.includes(body.origin) ? flowOf(body.origin) : null);
    if (!flow) throw new ValidationError("flow must be 'in' or 'out'");
    const origin = originFor(fund.direction, flow);
    if (body.origin && body.origin !== origin) {
      throw new ValidationError(`${body.origin} does not match a ${fund.direction} record`);
    }
    const amount = parseAmount(body.amount);
    const status = body.status === 'planned' ? 'planned' : 'successful';
    const date = body.date || todayIso();

    // A return or repayment can't be more than what is outstanding
    const isSettling = origin === 'held_return' || origin === 'lent_repaid';
    if (isSettling && status === 'successful' && !body.allowExceed) {
      const current = summarize(fund, await fundTransactions(fund.id));
      if (amount > current.outstanding) {
        throw new ValidationError(
          `That is more than the ${fund.direction === 'held' ? 'amount you hold for' : 'amount owed by'} ${fund.personName}.`,
          { outstanding: current.outstanding }
        );
      }
    }

    let accountId = body.accountId || null;
    if (!accountId) {
      const primary = await db.query.accounts.findFirst({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isPrimary, true), eq(s.accounts.isArchived, false))
      });
      accountId = primary?.id || null;
    }
    if (accountId) {
      const valid = await validateUserAccount({ userId, accountId });
      if (!valid) throw new ValidationError('Linked Account is invalid or not owned by user');
    }

    // Double submit: the same entry on this person a moment ago
    if (!body.allowDuplicate) {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
      const twin = (await fundTransactions(fund.id)).find((t) => (
        t.origin === origin && t.status === status && Number(t.amount) === amount && t.date === date
        && String(t.accountId || '') === String(accountId || '') && t.createdAt && new Date(t.createdAt) >= since
      ));
      if (twin) {
        throw new ValidationError('This was just saved. Check the list before adding it again.', { duplicateOf: twin.id });
      }
    }

    const month = await resolveEntryMonth(userId, body, date);
    const verbs = { held_in: 'Holding for', held_return: 'Returned to', lent_out: 'Lent to', lent_repaid: 'Repaid by' };
    const [tx] = await db.insert(s.transactions).values({
      userId,
      monthId: month ? month.id : null,
      name: String(body.name || `${verbs[origin]} ${fund.personName}`).trim(),
      status,
      origin,
      amount,
      date,
      plannedAmount: status === 'planned' ? amount : null,
      plannedDate: status === 'planned' ? date : null,
      category: CATEGORY,
      note: String(body.note || '').trim(),
      isIncome: false,
      accountId,
      personFundId: fund.id
    }).returning();

    if (tx.status === 'successful') {
      await LedgerService.applyTransactionBalance(tx, 1);
    }
    await this.refreshStatus(fund.id);
    return serialize(tx);
  },

  /** open while anything is outstanding or planned; settled once it nets to zero. */
  async refreshStatus(fundId) {
    const fund = await db.query.personFunds.findFirst({ where: eq(s.personFunds.id, fundId) });
    if (!fund) return null;
    const summary = summarize(fund, await fundTransactions(fund.id));
    const settled = summary.entryCount > 0 && summary.outstanding === 0 && summary.plannedIn === 0 && summary.plannedOut === 0;
    const status = settled ? 'settled' : 'open';
    if (status !== fund.status) {
      await db.update(s.personFunds).set({ status, updatedAt: new Date() }).where(eq(s.personFunds.id, fund.id));
    } else {
      await db.update(s.personFunds).set({ updatedAt: new Date() }).where(eq(s.personFunds.id, fund.id));
    }
    return status;
  },

  /**
   * Turns an income or expense row logged the old way into a held/lent entry.
   * Money in becomes held_in / lent_repaid, money out becomes held_return / lent_out.
   * body: { personFundId } or { personName, direction } to create the person on the fly.
   */
  async reclassifyTransaction(userId, txId, body = {}) {
    if (!txId || !isValidUuid(String(txId))) throw new NotFoundError('Transaction not found');
    const tx = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });
    if (!tx) throw new NotFoundError('Transaction not found');
    if (tx.status === 'cancelled') throw new ValidationError('Cancelled transactions cannot be reclassified');
    if (['transfer', 'salary', 'goal'].includes(tx.origin) || tx.goalId || tx.transferId) {
      throw new ValidationError('Transfers, salary and goal payments cannot be reclassified as held or lent money');
    }
    if (PASS_THROUGH_ORIGINS.includes(tx.origin)) {
      throw new ValidationError('This entry is already held or lent money');
    }
    if (tx.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    let fund;
    let createdFundId = null;
    if (body.personFundId) {
      fund = await loadOwnedFund(userId, body.personFundId);
    } else {
      const startedAt = Date.now();
      const created = await this.createFund(userId, { personName: body.personName, direction: body.direction });
      fund = await loadOwnedFund(userId, created.id);
      if (new Date(fund.createdAt).getTime() >= startedAt - 1000) createdFundId = fund.id;
    }

    // Cash direction stays exactly as it was; only its meaning changes
    const cashIn = Boolean(tx.isIncome) || Number(tx.amount) < 0;
    const origin = originFor(fund.direction, cashIn ? 'in' : 'out');

    const [updated] = await db.update(s.transactions).set({
      origin,
      isIncome: false,
      amount: Math.abs(Number(tx.amount) || 0),
      plannedAmount: tx.plannedAmount !== null && tx.plannedAmount !== undefined ? Math.abs(Number(tx.plannedAmount)) : null,
      category: CATEGORY,
      personFundId: fund.id,
      plannedItemId: null,
      refundTargetTransactionId: null,
      updatedAt: new Date()
    }).where(and(
      eq(s.transactions.id, tx.id),
      // Only if nobody moved it in the meantime (a double tap sends two requests)
      eq(s.transactions.origin, tx.origin),
      isNull(s.transactions.personFundId)
    )).returning();
    if (!updated) {
      // Lost the race: drop the person this request just added if nothing is logged on them
      if (createdFundId) {
        const left = await fundTransactions(createdFundId);
        if (left.length === 0) await db.delete(s.personFunds).where(eq(s.personFunds.id, createdFundId));
      }
      throw new ValidationError('This entry is already held or lent money');
    }
    if (tx.status === 'successful') {
      await LedgerService.applyTransactionBalance(tx, -1);
      await LedgerService.applyTransactionBalance(updated, 1);
    }

    await this.refreshStatus(fund.id);
    return serialize({ transaction: updated, fund: await this.getFund(userId, fund.id) });
  },

  /**
   * What the simulation needs: money held or lent before this month began
   * (aggregate and per account), and each fund's person name for event labels.
   */
  async getSimulationContext(userId, month) {
    const empty = { heldOpeningBalance: 0, heldOpeningByAccount: {}, lentOpeningBalance: 0, personNames: {} };
    if (!userId || !month) return empty;
    try {
      const monthStart = month.startDate || `${month.year}-${pad(month.month)}-01`;
      const [prior, funds] = await Promise.all([
        db.query.transactions.findMany({
          where: and(
            eq(s.transactions.userId, userId),
            eq(s.transactions.status, 'successful'),
            inArray(s.transactions.origin, PASS_THROUGH_ORIGINS),
            lt(s.transactions.date, monthStart),
            or(isNull(s.transactions.monthId), ne(s.transactions.monthId, month.id))
          )
        }),
        db.query.personFunds.findMany({ where: eq(s.personFunds.userId, userId) })
      ]);
      let held = 0;
      let lent = 0;
      const heldByAccount = {};
      prior.forEach((t) => {
        const d = passThroughDeltas(t.origin, t.amount);
        held += d.held;
        lent += d.lent;
        if (d.held && t.accountId) heldByAccount[t.accountId] = (heldByAccount[t.accountId] || 0) + d.held;
      });
      Object.keys(heldByAccount).forEach((k) => {
        heldByAccount[k] = Math.max(0, heldByAccount[k]);
      });
      const personNames = {};
      funds.forEach((f) => {
        personNames[f.id] = f.personName;
      });
      return {
        heldOpeningBalance: Math.max(0, held),
        heldOpeningByAccount: heldByAccount,
        lentOpeningBalance: Math.max(0, lent),
        personNames
      };
    } catch (err) {
      console.warn('[Simulation] Could not load held & lent context:', err.message || err);
      return empty;
    }
  }
};
