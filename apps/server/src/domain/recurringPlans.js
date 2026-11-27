import { randomUUID } from 'node:crypto';
import { eq, and, ne, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';

const pad = (n) => String(n).padStart(2, '0');

/** The given day in that month, pulled back to the month's last day (31 -> 30 Nov, 28 Feb). */
export function dayInMonth(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(Math.max(1, day), last))}`;
}

/** The first date on [day] strictly after [afterIso]: on 28 Nov, day 26 is 26 Dec, day 30 is 30 Nov, day 28 is 28 Dec. */
export function nextOccurrence(day, afterIso) {
  let [y, m] = afterIso.split('-').map(Number);
  for (;;) {
    const d = dayInMonth(y, m, day);
    if (d > afterIso) return d;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

/**
 * Fields for a new planned transaction that recurs monthly: its day, its series and,
 * with no date given, its first date (strictly after today). A first date after the
 * cycle it was added in is held ("scheduled", no month) until the cycle holding it starts.
 */
export function newRecurringPlan(payload, { todayIso, month }) {
  const recurrence = payload.recurrence || (payload.type === 'recurring' ? 'monthly' : null);
  if (!recurrence) return null;
  const given = payload.date || payload.plannedDate;
  const day = Number(payload.dayOfMonth || payload.recurrenceDay || payload.day || (given ? given.slice(8) : 0)) || 1;
  const date = given || nextOccurrence(day, todayIso);
  const held = Boolean(month.endDate && date > month.endDate);
  return { recurrence, recurrenceDay: Math.min(31, Math.max(1, day)), seriesId: randomUUID(), date, held };
}

const seriesKey = (t) => t.seriesId || `${t.name}|${t.accountId || ''}|${t.recurrenceDay || Number(t.date.slice(8))}`;

/**
 * What a new cycle gets from the one that closed:
 * - an unpaid Fixed plan moves in (still owed, so it shows as overdue); an unpaid Variable one is dropped;
 * - every monthly plan gets its next occurrence on the same calendar day, if that day falls in the cycle
 *   (Fixed at its planned amount, Variable at the last amount, as an estimate);
 * - a held first occurrence moves in once the cycle holds its date.
 */
export async function carryPlansIntoCycle(userId, closedMonth, nextMonth) {
  const start = nextMonth.startDate;
  const end = nextMonth.endDate;
  const moved = [];
  const dropped = [];
  const repeated = [];

  const unpaid = await db.query.transactions.findMany({
    where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, closedMonth.id), eq(s.transactions.status, 'planned'))
  });
  for (const t of unpaid) {
    if (t.isFixed) moved.push(t);
    else dropped.push(t);
  }
  if (moved.length) {
    await db.update(s.transactions).set({ monthId: nextMonth.id, updatedAt: new Date() })
      .where(inArray(s.transactions.id, moved.map((t) => t.id)));
  }
  if (dropped.length) {
    await db.update(s.transactions).set({ status: 'cancelled', updatedAt: new Date() })
      .where(inArray(s.transactions.id, dropped.map((t) => t.id)));
  }

  if (start && end) {
    // A held first occurrence dated on or before this cycle's end belongs here
    const held = (await db.query.transactions.findMany({
      where: and(eq(s.transactions.userId, userId), eq(s.transactions.status, 'scheduled'))
    })).filter((t) => t.date <= end);
    if (held.length) {
      await db.update(s.transactions).set({ monthId: nextMonth.id, status: 'planned', updatedAt: new Date() })
        .where(inArray(s.transactions.id, held.map((t) => t.id)));
    }

    // Each series' latest occurrence, wherever it is
    const all = await db.query.transactions.findMany({
      where: and(eq(s.transactions.userId, userId), isNotNull(s.transactions.recurrence), ne(s.transactions.origin, 'salary'))
    });
    const latest = new Map();
    for (const t of all) {
      const k = seriesKey(t);
      if (!latest.has(k) || t.date > latest.get(k).date) latest.set(k, t);
    }
    for (const t of latest.values()) {
      if (t.date >= start) continue; // already has this cycle's (or a later) occurrence
      const day = t.recurrenceDay || Number(t.date.slice(8));
      let date = nextOccurrence(day, t.date);
      while (date < start) date = nextOccurrence(day, date);
      if (date > end) continue;
      const amount = t.isFixed ? (t.plannedAmount ?? t.amount) : t.amount;
      const [created] = await db.insert(s.transactions).values({
        userId,
        monthId: nextMonth.id,
        name: t.name,
        status: 'planned',
        origin: t.origin === 'goal' ? 'goal' : 'planned',
        amount,
        date,
        plannedAmount: amount,
        plannedDate: date,
        category: t.category,
        note: t.note || '',
        isIncome: t.isIncome,
        recurrence: t.recurrence,
        recurrenceDay: day,
        seriesId: t.seriesId,
        isFixed: t.isFixed,
        accountId: t.accountId
      }).returning();
      repeated.push(created);
    }
  }

  return { moved, dropped, repeated };
}
