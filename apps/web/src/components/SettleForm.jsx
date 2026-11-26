import React, { useMemo, useState } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { AccountSelect } from './AccountSelect.jsx';
import { DatePicker } from './DatePicker.jsx';
import { FloorBreachNotice, anywayLabel } from './FloorBreachNotice.jsx';
import { checkFloor, findCashAccount } from '../utils/floorCheck.js';

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The planned amount of a bill, in minor units. */
export function plannedAmountOf(bill) {
  if (!bill) return 0;
  if (bill.plannedAmount !== undefined && bill.plannedAmount !== null) return Math.abs(Number(bill.plannedAmount) || 0);
  return Math.abs(Number(bill.amount) || 0);
}

/** The account a bill is planned against, if any. */
export function accountIdOf(bill) {
  if (!bill) return '';
  return bill.accountId
    || bill.bankAccountId?._id || bill.bankAccountId
    || bill.walletId?._id || bill.walletId
    || '';
}

function accountTypeOf(id, bankAccounts, wallets, creditCards) {
  const match = (list) => list.some((a) => String(a.id || a._id) === String(id));
  if (match(wallets)) return 'wallet';
  if (match(creditCards)) return 'credit_card';
  return 'bank';
}

/**
 * Settle (mark as paid) a planned bill: the one flow for paying something that
 * was planned, opened from the Transactions list or from the entry sheet when a
 * spend matches a bill (ADR: "Transaction Settlement").
 *
 * When the amount paid differs from the plan, the choice of what happens to the
 * difference is asked inline, not in a second dialog.
 *
 * onSubmit({ amount, date, accountId, remainder }) where remainder is null or
 * { amount, name, category, date, accountId } for a new pending bill.
 */
export function SettleForm({
  bill,
  bankAccounts = [],
  wallets = [],
  creditCards = [],
  currencySymbol = '₹',
  simulation = null,
  initialAmount = null,
  initialAccountId = '',
  onSubmit,
  onCancel,
  submitting = false,
  error = '',
  submitLabel = 'Confirm paid',
  cancelLabel = 'Cancel'
}) {
  const planned = plannedAmountOf(bill);
  const fallbackAccount = (bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || wallets[0] || {});
  const startAccountId = initialAccountId || accountIdOf(bill) || fallbackAccount.id || fallbackAccount._id || '';
  const [amount, setAmount] = useState(() => {
    if (initialAmount !== null && initialAmount !== undefined && initialAmount !== '') return String(initialAmount);
    return planned ? String(planned / 100) : '';
  });
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState(startAccountId);
  const [accountType, setAccountType] = useState(() => accountTypeOf(startAccountId, bankAccounts, wallets, creditCards));
  const [leftover, setLeftover] = useState('release'); // 'release' | 'keep'
  const [localError, setLocalError] = useState('');

  const entered = Math.round(Math.abs(Number(amount) || 0) * 100);
  const difference = planned - entered; // > 0: paid less than planned
  const floorCheck = useMemo(
    () => checkFloor(findCashAccount(accountId, bankAccounts, wallets), entered, { simulation }),
    [accountId, bankAccounts, wallets, entered, simulation]
  );

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    setLocalError('');
    if (!entered || entered <= 0) {
      setLocalError('Enter the amount you paid.');
      return;
    }
    const remainder = difference > 0 && leftover === 'keep'
      ? {
          amount: difference,
          name: `${bill?.name || bill?.title || 'Bill'} (remainder)`,
          category: bill?.category || bill?.tag || null,
          date: bill?.date && bill.date > date ? bill.date : date,
          accountId
        }
      : null;
    onSubmit?.({ amount: entered, date, accountId, remainder });
  };

  const shownError = localError || error;

  return (
    <form autoComplete="off" className="form-stack settle-form" onSubmit={handleSubmit} data-testid="settle-form">
      <div className="settle-summary">
        <span className="settle-summary-name">{bill?.name || bill?.title || 'Planned bill'}</span>
        <span className="settle-summary-meta">
          Planned <strong className="tabular-nums">{formatCurrency(planned, currencySymbol)}</strong>
          {bill?.date ? ` · due ${formatDisplayDate(bill.date, false)}` : ''}
        </span>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="settle-amount">Amount paid ({currencySymbol})</label>
        <input autoComplete="off"
          id="settle-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          required
          autoFocus
          className="input-field tabular-nums settle-amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(localError) || undefined}
        />
      </div>

      {entered > 0 && difference > 0 && (
        <fieldset className="settle-leftover" data-testid="settle-leftover">
          <legend className="form-label">
            {formatCurrency(difference, currencySymbol)} less than planned. What about the rest?
          </legend>
          <button
            type="button"
            className={`choice-card ${leftover === 'release' ? 'active' : ''}`}
            aria-pressed={leftover === 'release'}
            onClick={() => setLeftover('release')}
          >
            <span className="choice-card-title">Done — release {formatCurrency(difference, currencySymbol)}</span>
            <span className="choice-card-sub">The bill is paid; the rest goes back to your spending money.</span>
          </button>
          <button
            type="button"
            className={`choice-card ${leftover === 'keep' ? 'active' : ''}`}
            aria-pressed={leftover === 'keep'}
            onClick={() => setLeftover('keep')}
          >
            <span className="choice-card-title">Still owed — keep {formatCurrency(difference, currencySymbol)} pending</span>
            <span className="choice-card-sub">Adds a planned bill for the rest.</span>
          </button>
        </fieldset>
      )}
      {entered > 0 && difference < 0 && (
        <p className="field-hint" data-testid="settle-over">
          {formatCurrency(-difference, currencySymbol)} more than planned.
        </p>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Paid on</label>
          <DatePicker value={date} onChange={setDate} maxDate={todayIso()} required />
        </div>
        <div className="form-group">
          <label className="form-label">Paid from</label>
          <AccountSelect
            accountType={accountType}
            accountId={accountId}
            onChange={({ accountType: t, accountId: id }) => {
              setAccountType(t);
              setAccountId(id);
            }}
            bankAccounts={bankAccounts}
            wallets={wallets}
            creditCards={creditCards}
            currencySymbol={currencySymbol}
            simulation={simulation}
          />
        </div>
      </div>

      <FloorBreachNotice check={floorCheck} currencySymbol={currencySymbol} />
      {shownError && <div className="form-error" role="alert">{shownError}</div>}

      <div className="form-footer">
        {onCancel && (
          <button type="button" className="btn-subtle" onClick={onCancel}>{cancelLabel}</button>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : anywayLabel(submitLabel, floorCheck)}
        </button>
      </div>
    </form>
  );
}
