import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, toMinorUnits } from '@budget/engine';
import { api } from '../api.js';
import { AccountSelect } from './AccountSelect.jsx';
import { DatePicker } from './DatePicker.jsx';
import { Button } from './ui/Button.jsx';
import { FloorBreachNotice, anywayLabel } from './FloorBreachNotice.jsx';
import { checkFloor, findCashAccount } from '../utils/floorCheck.js';

/**
 * Held & Lent money entry (ADR 0069).
 * Four actions, one per cash movement. None of them is income or expense:
 *   Receive to hold   (someone's money comes to you)    -> held, flow in
 *   Return            (you give their money back)       -> held, flow out
 *   Lend              (your money goes to someone)      -> lent, flow out
 *   Got back          (they repay you)                  -> lent, flow in
 */
export const HELD_LENT_ACTIONS = [
  { key: 'hold', direction: 'held', flow: 'in', label: 'Receive to hold', hint: "Someone's money is coming to you. You'll give it back." },
  { key: 'return', direction: 'held', flow: 'out', label: 'Return', hint: 'You are giving back money you were holding.' },
  { key: 'lend', direction: 'lent', flow: 'out', label: 'Lend', hint: 'Your money is going to someone. They will pay it back.' },
  { key: 'repaid', direction: 'lent', flow: 'in', label: 'Got back', hint: 'Someone is paying back money you lent.' }
];

const NEW_PERSON = '__new__';

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function HeldLentForm({
  bankAccounts = [],
  wallets = [],
  currencySymbol = '₹',
  month = null,
  simulation = null,
  accountSimulations = {},
  initialAction = 'hold',
  initialFundId = '',
  // Values carried over from another form (the entry modal's shared state), so
  // switching to Held/Lent keeps what the user already typed.
  initialValues = null,
  onValuesChange,
  onSaved,
  onCancel
}) {
  const primary = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || wallets[0] || null;
  // Held and lent money moves through a bank account or wallet, never a card
  const carriedAccount = useMemo(() => {
    const id = initialValues?.accountId;
    if (!id) return null;
    const bank = bankAccounts.find((b) => String(b.id || b._id) === String(id));
    if (bank) return { accountType: 'bank', accountId: bank.id || bank._id };
    const wallet = wallets.find((w) => String(w.id || w._id) === String(id));
    if (wallet) return { accountType: 'wallet', accountId: wallet.id || wallet._id };
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [action, setAction] = useState(initialAction);
  const [funds, setFunds] = useState([]);
  const [fundId, setFundId] = useState(initialFundId || '');
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [date, setDate] = useState(initialValues?.date || todayIso());
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [accountType, setAccountType] = useState(
    carriedAccount ? carriedAccount.accountType : (primary && wallets.includes(primary) ? 'wallet' : 'bank')
  );
  const [accountId, setAccountId] = useState(
    carriedAccount ? carriedAccount.accountId : (primary ? (primary.id || primary._id) : '')
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Report edits back so the values survive switching to another tab
  useEffect(() => {
    onValuesChange?.({ amount, date, note, accountType, accountId });
  }, [amount, date, note, accountType, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = HELD_LENT_ACTIONS.find((a) => a.key === action) || HELD_LENT_ACTIONS[0];
  const startsNew = current.key === 'hold' || current.key === 'lend';

  useEffect(() => {
    let alive = true;
    api.getPersonFunds()
      .then((res) => {
        if (alive) setFunds(Array.isArray(res?.funds) ? res.funds : []);
      })
      .catch(() => {
        if (alive) setFunds([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // People that fit the chosen action. Returning or getting back needs someone with money outstanding.
  const matching = useMemo(() => funds.filter((f) => {
    if (f.direction !== current.direction) return false;
    return startsNew ? true : (f.outstanding > 0 || String(f.id) === String(fundId));
  }), [funds, current.direction, startsNew, fundId]);

  // Keep the picked person valid when the action changes
  useEffect(() => {
    if (fundId === NEW_PERSON) {
      if (!startsNew) setFundId(matching[0]?.id || '');
      return;
    }
    if (fundId && !matching.some((f) => String(f.id) === String(fundId))) {
      setFundId(startsNew ? NEW_PERSON : (matching[0]?.id || ''));
    } else if (!fundId) {
      setFundId(startsNew ? (matching.length ? matching[0].id : NEW_PERSON) : (matching[0]?.id || ''));
    }
  }, [action, matching]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedFund = funds.find((f) => String(f.id) === String(fundId)) || null;
  const outstanding = selectedFund ? selectedFund.outstanding : 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    const minor = toMinorUnits(amount, 100);
    if (!minor || minor <= 0) {
      setError('Enter an amount above zero.');
      return;
    }
    if (!startsNew && !selectedFund) {
      setError(current.direction === 'held' ? 'No one has money held with you yet.' : 'No one owes you money yet.');
      return;
    }
    if (!startsNew && minor > outstanding) {
      setError(`That is more than the ${formatCurrency(outstanding, currencySymbol)} outstanding with ${selectedFund.personName}.`);
      return;
    }
    if (fundId === NEW_PERSON && !personName.trim()) {
      setError('Enter the person’s name.');
      return;
    }
    setSaving(true);
    try {
      let saved;
      if (fundId === NEW_PERSON) {
        saved = await api.createPersonFund({
          personName: personName.trim(),
          direction: current.direction,
          amount: minor,
          date,
          accountId: accountId || undefined,
          entryNote: note
        });
      } else {
        saved = await api.addPersonFundEntry(fundId, {
          flow: current.flow,
          amount: minor,
          date,
          accountId: accountId || undefined,
          note
        });
      }
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const noAccounts = bankAccounts.length === 0 && wallets.length === 0;

  // Lending spends your own money, so it is checked against the safety floor.
  // Returning held money is not: it was never yours, so your own money is unchanged.
  const floorCheck = current.key === 'lend'
    ? checkFloor(findCashAccount(accountId, bankAccounts, wallets), toMinorUnits(amount || 0, 100), { simulation, accountSimulations })
    : null;

  return (
    <form className="hl-form" onSubmit={handleSubmit} data-testid="held-lent-form">
      <div className="hl-actions" role="radiogroup" aria-label="What happened">
        {HELD_LENT_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={action === a.key}
            className={`hl-action ${action === a.key ? 'active' : ''}`}
            onClick={() => setAction(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="hl-hint">{current.hint} It won&rsquo;t count as income or spending.</p>

      <div className="form-group">
        <label className="form-label" htmlFor="hl-person">{current.direction === 'held' ? 'Whose money' : 'Who'}</label>
        <select
          id="hl-person"
          className="input-field"
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
        >
          {matching.map((f) => (
            <option key={f.id} value={f.id}>
              {f.personName}{f.outstanding > 0 ? ` (${formatCurrency(f.outstanding, currencySymbol)} ${f.direction === 'held' ? 'held' : 'owed'})` : ''}
            </option>
          ))}
          {startsNew && <option value={NEW_PERSON}>+ New person</option>}
          {!startsNew && matching.length === 0 && <option value="">No one yet</option>}
        </select>
        {fundId === NEW_PERSON && (
          <input
            className="input-field hl-new-person"
            placeholder="Name"
            value={personName}
            maxLength={80}
            onChange={(e) => setPersonName(e.target.value)}
            aria-label="Person name"
            autoFocus
          />
        )}
      </div>

      <div className="hl-row">
        <div className="form-group">
          <label className="form-label" htmlFor="hl-amount">Amount ({currencySymbol})</label>
          <input
            id="hl-amount"
            className="input-field tabular-nums"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
          />
          {!startsNew && selectedFund && (
            <button type="button" className="hl-fill" onClick={() => setAmount(String(outstanding / 100))}>
              All {formatCurrency(outstanding, currencySymbol)}
            </button>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <DatePicker compact value={date} onChange={setDate} month={month} required />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{current.flow === 'in' ? 'Into account' : 'From account'}</label>
        {noAccounts ? (
          <p className="hl-hint">Add a bank account or wallet first.</p>
        ) : (
          <AccountSelect
            accountType={accountType}
            accountId={accountId}
            onChange={({ accountType: t, accountId: id }) => {
              setAccountType(t);
              setAccountId(id);
            }}
            bankAccounts={bankAccounts}
            wallets={wallets}
            currencySymbol={currencySymbol}
            simulation={simulation}
            accountSimulations={accountSimulations}
          />
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="hl-note">Note (optional)</label>
        <input id="hl-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>

      <FloorBreachNotice check={floorCheck} currencySymbol={currencySymbol} />

      {error && <div className="hl-error" role="alert">{error}</div>}

      <div className="hl-footer">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" type="submit" disabled={saving || noAccounts}>
          {saving ? 'Saving…' : anywayLabel(current.label, floorCheck)}
        </Button>
      </div>
    </form>
  );
}
