import { eq, and, or, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidUuid } from '../middleware/auth.js';
import { LedgerService } from './ledgerService.js';
import { TransferService } from './transferService.js';
import { resolveCoveringMonth } from './personFundService.js';
import { localNow } from '../utils/clock.js';

/**
 * Credit cards (ADR 0070).
 *
 * A card is an account of type 'credit_card' whose balance is negative: what you owe.
 * Swipes are ordinary expenses on the card; paying the bill is a transfer from a
 * bank account or wallet into the card. On the user's bill generation day a draft
 * statement is created from the card's own ledger; the user confirms it, editing
 * the amount to match the bank (fees, interest, cashback) if needed.
 * Payments against a statement are derived from transfers into the card, so a
 * payment made from any screen counts.
 */

const MAX_CYCLES_PER_RUN = 24;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayIso() {
  const d = localNow();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A day of the month, clamped to the month's length (31 -> 28 in February). */
export function dateOn(y, m, day) {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function shiftMonth(y, m, by) {
  const idx = y * 12 + (m - 1) + by;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** The first bill generation date on or after `iso`. */
export function nextStatementOnOrAfter(iso, statementDay) {
  const [y, m] = iso.split('-').map(Number);
  const here = dateOn(y, m, statementDay);
  if (here >= iso) return here;
  const [ny, nm] = shiftMonth(y, m, 1);
  return dateOn(ny, nm, statementDay);
}

/**
 * The due date for a bill generated on `statementDate`: the next `dueDay` after
 * it (same month when the due day falls later in the month, else the next month).
 */
export function dueDateFor(statementDate, dueDay) {
  const [y, m] = statementDate.split('-').map(Number);
  const same = dateOn(y, m, dueDay);
  if (same > statementDate) return same;
  const [ny, nm] = shiftMonth(y, m, 1);
  return dateOn(ny, nm, dueDay);
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * Effect of a settled transaction on the card's balance (negative = owed).
 * Same rules as the ledger: spend and cash taken out add to what you owe,
 * refunds and payments into the card reduce it.
 */
function cardEffect(tx, cardId) {
  const amt = Number(tx.amount) || 0;
  if (tx.origin === 'transfer') {
    if (tx.destinationAccountId === cardId) return Math.abs(amt);
    if (tx.accountId === cardId) return -Math.abs(amt);
    return 0;
  }
  if (tx.accountId !== cardId) return 0;
  if (tx.origin === 'held_in' || tx.origin === 'lent_repaid') return Math.abs(amt);
  if (tx.origin === 'held_return' || tx.origin === 'lent_out') return -Math.abs(amt);
  return tx.isIncome ? amt : -amt;
}

const isPayment = (tx, cardId) => tx.origin === 'transfer' && tx.destinationAccountId === cardId;
const isSpend = (tx, cardId) => tx.origin !== 'transfer' && tx.accountId === cardId;

function cardStartDate(card) {
  if (card.openingBalanceDate) return card.openingBalanceDate;
  const c = new Date(card.createdAt || Date.now());
  return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
}

/** What is owed on the card at the end of `iso` (positive). */
function owedAsOf(card, txs, iso) {
  let bal = Number(card.openingBalance) || 0;
  txs.forEach((t) => {
    if (t.date <= iso) bal += cardEffect(t, card.id);
  });
  return -bal;
}

/** Net spend on the card between two dates, inclusive (refunds reduce it). */
function spendBetween(card, txs, from, to) {
  return txs
    .filter((t) => isSpend(t, card.id) && t.date >= from && t.date <= to)
    .reduce((sum, t) => sum - cardEffect(t, card.id), 0);
}

function paymentsBetween(card, txs, afterExclusive, toInclusive) {
  return txs
    .filter((t) => isPayment(t, card.id) && t.date > afterExclusive && t.date <= toInclusive)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
}

async function loadCardTransactions(cardId) {
  return db.query.transactions.findMany({
    where: and(
      eq(s.transactions.status, 'successful'),
      or(eq(s.transactions.accountId, cardId), eq(s.transactions.destinationAccountId, cardId))
    ),
    orderBy: [asc(s.transactions.date), asc(s.transactions.createdAt)]
  });
}

async function loadOwnedCard(userId, cardId) {
  if (!cardId || !isValidUuid(String(cardId))) throw new NotFoundError('Card not found');
  const card = await db.query.accounts.findFirst({
    where: and(eq(s.accounts.id, cardId), eq(s.accounts.userId, userId), eq(s.accounts.type, 'credit_card'))
  });
  if (!card) throw new NotFoundError('Card not found');
  return card;
}

/** A statement with its payments and state worked out from the card's ledger. */
function describeStatement(card, stmt, txs, nextStmt, today) {
  const amount = stmt.statementAmount ?? stmt.computedAmount;
  const until = nextStmt ? nextStmt.cycleEnd : today;
  const paid = paymentsBetween(card, txs, stmt.cycleEnd, until);
  const paidByDue = paymentsBetween(card, txs, stmt.cycleEnd, stmt.dueDate);
  const remaining = stmt.status === 'carried' ? 0 : Math.max(0, amount - paid);
  let state = stmt.status;
  if (stmt.status !== 'carried') {
    if (remaining === 0 && amount > 0) state = 'paid';
    else if (remaining === 0) state = 'paid';
    else if (stmt.dueDate < today) state = 'overdue';
    else if (paid > 0) state = 'partial';
    else state = stmt.status === 'draft' ? 'draft' : 'open';
  }
  return {
    ...stmt,
    amount,
    paid,
    paidByDue,
    remaining,
    state,
    isDraft: stmt.status === 'draft',
    cycleDays: Math.max(1, daysBetween(stmt.cycleStart, stmt.cycleEnd) + 1),
    paidInFull: paid >= amount,
    paidLate: stmt.dueDate < today && paidByDue < amount && amount > 0
  };
}

export const CardService = {
  /**
   * Creates any missing statements up to today. Older missed cycles are filed as
   * 'carried' (their balance rolls into the newest bill); only the newest stays a
   * draft for the user to confirm.
   */
  async ensureStatements(card, txs, today = todayIso()) {
    if (!card.statementDay || !card.dueDay) return [];
    const existing = await db.query.cardStatements.findMany({
      where: eq(s.cardStatements.accountId, card.id),
      orderBy: [desc(s.cardStatements.cycleEnd)]
    });
    const last = existing[0] || null;
    let from = last ? addDays(last.cycleEnd, 1) : cardStartDate(card);
    const created = [];
    for (let i = 0; i < MAX_CYCLES_PER_RUN; i++) {
      const end = nextStatementOnOrAfter(from, card.statementDay);
      if (end > today) break;
      created.push({
        userId: card.userId,
        accountId: card.id,
        cycleStart: from,
        cycleEnd: end,
        dueDate: dueDateFor(end, card.dueDay),
        newSpend: Math.max(0, spendBetween(card, txs, from, end)),
        computedAmount: Math.max(0, owedAsOf(card, txs, end)),
        status: 'draft'
      });
      from = addDays(end, 1);
    }
    if (created.length === 0) return [];
    // Anything earlier is now inside the newest bill
    created.slice(0, -1).forEach((c) => {
      c.status = 'carried';
      c.statementAmount = c.computedAmount;
    });
    // An earlier bill still unpaid is now inside the new one; a paid one is filed as paid
    const priorOpen = existing.filter((st) => st.status === 'open' || st.status === 'draft');
    for (const st of priorOpen) {
      const amount = st.statementAmount ?? st.computedAmount;
      const paid = paymentsBetween(card, txs, st.cycleEnd, today);
      const status = paid >= amount ? 'paid' : 'carried';
      await db.update(s.cardStatements).set({ status, updatedAt: new Date() }).where(eq(s.cardStatements.id, st.id));
    }
    const inserted = await db.insert(s.cardStatements).values(created).onConflictDoNothing().returning();
    return inserted;
  },

  /** Everything about one card: what is owed, this cycle, bills and the open bill. */
  async describeCard(card, today = todayIso()) {
    const txs = await loadCardTransactions(card.id);
    await this.ensureStatements(card, txs, today);
    const statements = await db.query.cardStatements.findMany({
      where: eq(s.cardStatements.accountId, card.id),
      orderBy: [desc(s.cardStatements.cycleEnd)]
    });
    const described = statements.map((st, i) => describeStatement(card, st, txs, i > 0 ? statements[i - 1] : null, today));

    // Keep the stored status in step with payments
    for (const d of described) {
      if (d.status === 'open' && d.state === 'paid') {
        await db.update(s.cardStatements).set({ status: 'paid', updatedAt: new Date() }).where(eq(s.cardStatements.id, d.id));
        d.status = 'paid';
      }
    }

    const latest = described[0] || null;
    const cycleStart = latest ? addDays(latest.cycleEnd, 1) : cardStartDate(card);
    const cycleEnd = card.statementDay ? nextStatementOnOrAfter(cycleStart > today ? cycleStart : today, card.statementDay) : null;
    const openBill = latest && latest.remaining > 0 && latest.status !== 'carried'
      ? {
          statementId: latest.id,
          remaining: latest.remaining,
          amount: latest.amount,
          minimumDue: latest.minimumDue,
          dueDate: latest.dueDate,
          isDraft: latest.isDraft,
          isOverdue: latest.state === 'overdue'
        }
      : null;
    // Past bills for the pace and the trend; empty cycles (card not in use yet) say nothing
    const history = described
      .filter((d) => d.status !== 'draft' && (d.amount > 0 || d.newSpend > 0))
      .slice(0, 3)
      .map((d) => ({
        amount: d.amount,
        newSpend: d.newSpend,
        cycleDays: d.cycleDays,
        paidInFull: d.paidInFull,
        paidLate: d.paidLate
      }));
    const outstanding = Math.max(0, owedAsOf(card, txs, today));
    const limit = Number(card.creditLimit) || 0;

    return {
      ...serialize(card),
      outstanding,
      unbilledSoFar: Math.max(0, spendBetween(card, txs, cycleStart, today)),
      creditLimit: limit,
      availableCredit: limit > 0 ? Math.max(0, limit - outstanding) : null,
      utilization: limit > 0 ? Math.round((outstanding / limit) * 1000) / 1000 : null,
      cycleStart,
      cycleEnd,
      cycleDueDate: cycleEnd && card.dueDay ? dueDateFor(cycleEnd, card.dueDay) : null,
      openBill,
      history,
      statements: serialize(described)
    };
  },

  async listCards(userId, today = todayIso()) {
    const cards = await db.query.accounts.findMany({
      where: and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'credit_card'), eq(s.accounts.isArchived, false)),
      orderBy: [asc(s.accounts.createdAt)]
    });
    const out = [];
    for (const card of cards) out.push(await this.describeCard(card, today));
    return out;
  },

  async getCard(userId, cardId) {
    const card = await loadOwnedCard(userId, cardId);
    return this.describeCard(card);
  },

  async loadOwnedStatement(userId, statementId) {
    if (!statementId || !isValidUuid(String(statementId))) throw new NotFoundError('Statement not found');
    const stmt = await db.query.cardStatements.findFirst({
      where: and(eq(s.cardStatements.id, statementId), eq(s.cardStatements.userId, userId))
    });
    if (!stmt) throw new NotFoundError('Statement not found');
    const card = await loadOwnedCard(userId, stmt.accountId);
    return { stmt, card };
  },

  /**
   * Confirms a bill, optionally editing it to match the bank's statement.
   * body: { statementAmount?, minimumDue?, dueDate?, logChargesDifference? }
   * With logChargesDifference, a higher bank amount is logged as a card charge
   * (fees, interest) and a lower one as a card credit (cashback), so the card's
   * ledger matches the bank.
   */
  async confirmStatement(userId, statementId, body = {}) {
    const { stmt, card } = await this.loadOwnedStatement(userId, statementId);
    if (stmt.status === 'carried') {
      throw new ValidationError('This bill was rolled into a newer one');
    }
    const amount = body.statementAmount === undefined || body.statementAmount === null || body.statementAmount === ''
      ? stmt.computedAmount
      : Math.round(Number(body.statementAmount));
    if (!Number.isFinite(amount) || amount < 0) throw new ValidationError('Bill amount must be zero or more');
    let minimumDue = null;
    if (body.minimumDue !== undefined && body.minimumDue !== null && body.minimumDue !== '') {
      minimumDue = Math.round(Number(body.minimumDue));
      if (!Number.isFinite(minimumDue) || minimumDue < 0 || minimumDue > amount) {
        throw new ValidationError('Minimum due must be between zero and the bill amount');
      }
    }
    const dueDate = body.dueDate || stmt.dueDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < stmt.cycleEnd) {
      throw new ValidationError('Due date must be on or after the bill date');
    }

    const difference = amount - stmt.computedAmount;
    let adjustment = null;
    if (body.logChargesDifference && difference !== 0) {
      const month = await resolveCoveringMonth(userId, stmt.cycleEnd).catch(() => null);
      const [tx] = await db.insert(s.transactions).values({
        userId,
        monthId: month ? month.id : null,
        name: difference > 0 ? `${card.name} charges` : `${card.name} credit`,
        status: 'successful',
        origin: 'spot',
        amount: difference, // positive = charge (owed more), negative = credit
        date: stmt.cycleEnd,
        category: difference > 0 ? 'Card charges' : 'Card credit',
        note: 'Matches the bank statement',
        isIncome: false,
        accountId: card.id
      }).returning();
      await LedgerService.applyTransactionBalance(tx, 1);
      adjustment = serialize(tx);
    }

    const [updated] = await db.update(s.cardStatements).set({
      statementAmount: amount,
      computedAmount: adjustment ? amount : stmt.computedAmount,
      minimumDue,
      dueDate,
      status: 'open',
      confirmedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(s.cardStatements.id, stmt.id)).returning();

    return { statement: serialize(updated), adjustment, card: await this.describeCard(card) };
  },

  /**
   * Pays a bill: a transfer from a bank account or wallet into the card.
   * body: { amount?, fromAccountId?, date? } (amount defaults to what is left)
   */
  async payStatement(userId, statementId, body = {}) {
    const { stmt, card } = await this.loadOwnedStatement(userId, statementId);
    const before = await this.describeCard(card);
    const current = before.statements.find((st) => st.id === stmt.id);
    const remaining = current ? current.remaining : 0;
    const amount = body.amount === undefined || body.amount === null || body.amount === ''
      ? remaining
      : Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Enter an amount to pay');

    const fromId = body.fromAccountId || card.payFromAccountId;
    if (!fromId) throw new ValidationError('Choose the account to pay from');
    const from = await db.query.accounts.findFirst({
      where: and(eq(s.accounts.id, fromId), eq(s.accounts.userId, userId))
    });
    if (!from || from.type === 'credit_card') {
      throw new ValidationError('Pay the bill from one of your bank accounts or wallets');
    }

    const result = await TransferService.createTransfer(userId, {
      sourceAccountId: from.id,
      destinationAccountId: card.id,
      amount,
      date: body.date || todayIso(),
      note: `${card.name} bill`
    });
    return { transfer: result.transfer, card: await this.describeCard(card) };
  },

  /**
   * What the simulation needs for each card, plus the next expected income so a
   * bill due next month can be judged against next month's money.
   */
  async getSimulationContext(userId, month) {
    const empty = { creditCards: [], nextIncome: null };
    if (!userId || !month) return empty;
    try {
      const cards = await this.listCards(userId);
      const monthEnd = month.endDate || dateOn(Number(month.year), Number(month.month), 31);
      const today = todayIso();
      const cutoff = today < monthEnd ? today : monthEnd;
      const creditCards = [];
      for (const c of cards) {
        const txs = await loadCardTransactions(c.id);
        // The simulation replays this month's own rows; everything else on the card
        // up to today (earlier months, rows not linked to this month) is the opening.
        const outside = txs.filter((t) => t.monthId !== month.id);
        creditCards.push({
          id: c.id,
          name: c.name,
          creditLimit: c.creditLimit,
          payFromAccountId: c.payFromAccountId,
          openingOutstanding: Math.max(0, owedAsOf(c, outside, cutoff)),
          unbilledSoFar: c.unbilledSoFar,
          cycleStart: c.cycleStart,
          cycleEnd: c.cycleEnd,
          cycleDueDate: c.cycleDueDate,
          openBill: c.openBill,
          history: c.history
        });
      }
      return { creditCards, nextIncome: await this.nextIncomeAfter(userId, month) };
    } catch (err) {
      console.warn('[Simulation] Could not load credit cards:', err.message || err);
      return empty;
    }
  },

  /** Expected income in the month after `month`: the salary template, else this month's income. */
  async nextIncomeAfter(userId, month) {
    const [ny, nm] = shiftMonth(Number(month.year), Number(month.month), 1);
    const template = await db.query.salaryTemplates.findFirst({
      where: and(eq(s.salaryTemplates.userId, userId), eq(s.salaryTemplates.isActive, true)),
      orderBy: [desc(s.salaryTemplates.version)]
    });
    if (template && Number(template.amount) > 0) {
      return { amount: Number(template.amount), date: dateOn(ny, nm, template.expectedCreditDay || 1) };
    }
    if (Number(month.incomeAmount) > 0) {
      const day = month.incomeCreditDate ? Number(month.incomeCreditDate.split('-')[2]) || 1 : 1;
      return { amount: Number(month.incomeAmount), date: dateOn(ny, nm, day) };
    }
    return null;
  }
};
