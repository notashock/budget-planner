import React from 'react';
import { formatCurrency } from '@budget/engine';
import {
  getAccountLiveBalance,
  getAccountMinimumBalance,
  getAccountHeldForOthers
} from '../utils/floorCheck.js';

/**
 * What an entry does to its account, shown live under the form:
 *   "After this: HDFC Salary ₹41,050 · ₹11,050 above floor"
 *   "After this: Visa owes ₹21,300 · 43% of limit"
 * Turns red when an outflow would take a cash account below its safety floor.
 *
 * flow: 'out' (spend, transfer, lend) | 'in' (income, refund)
 */
export function describeConsequence({ account, accountType, amount, flow, simulation = null, accountSimulations = {} }) {
  const minor = Math.round(Math.abs(Number(amount) || 0));
  if (!account || !minor) return null;
  if (accountType === 'credit_card') {
    const owed = typeof account.outstanding === 'number' ? account.outstanding : Math.max(0, -(account.currentBalance || 0));
    const owedAfter = flow === 'in' ? Math.max(0, owed - minor) : owed + minor;
    const limit = Number(account.creditLimit) || 0;
    return {
      kind: 'card',
      name: account.name || 'Card',
      owedAfter,
      utilisation: limit > 0 ? owedAfter / limit : null,
      tone: limit > 0 && owedAfter / limit > 0.8 ? 'warn' : 'neutral'
    };
  }
  const own = getAccountLiveBalance(account, simulation, accountSimulations)
    - getAccountHeldForOthers(account, simulation, accountSimulations);
  const after = flow === 'in' ? own + minor : own - minor;
  const floor = getAccountMinimumBalance(account, simulation, accountSimulations);
  const margin = floor > 0 ? after - floor : null;
  return {
    kind: 'cash',
    name: account.name || 'Account',
    after,
    margin,
    tone: margin !== null && margin < 0 ? 'bad' : 'neutral'
  };
}

export function ConsequenceLine({ currencySymbol = '₹', ...rest }) {
  const c = describeConsequence(rest);
  if (!c) return null;
  const money = (v) => formatCurrency(v, currencySymbol);
  return (
    <p className={`consequence-line tone-${c.tone}`} data-testid="consequence-line" aria-live="polite">
      {c.kind === 'card' ? (
        <>
          After this: <strong>{c.name}</strong> owes <strong className="tabular-nums">{money(c.owedAfter)}</strong>
          {c.utilisation !== null && <> · <span className="tabular-nums">{Math.round(c.utilisation * 100)}%</span> of limit</>}
        </>
      ) : (
        <>
          After this: <strong>{c.name}</strong> <strong className="tabular-nums">{money(c.after)}</strong>
          {c.margin !== null && (
            c.margin >= 0
              ? <> · <span className="tabular-nums">{money(c.margin)}</span> above floor</>
              : <> · <span className="tabular-nums">{money(-c.margin)}</span> below your floor</>
          )}
        </>
      )}
    </p>
  );
}
