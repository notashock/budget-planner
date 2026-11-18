import React, { useState } from 'react';
import { AccountSelect } from './AccountSelect.jsx';

const PRIORITIES = [
  { value: 0, label: 'High' },
  { value: 1, label: 'Medium' },
  { value: 2, label: 'Low' }
];

function fundingOf(goal) {
  const walletId = goal?.fundingWalletId?._id || goal?.fundingWalletId;
  if (walletId) return { accountType: 'wallet', accountId: walletId };
  const bankId = goal?.fundingBankAccountId?._id || goal?.fundingBankAccountId || goal?.fundingAccountId;
  return { accountType: 'bank', accountId: bankId || '' };
}

/**
 * Edit a purchase goal: name, price, priority and the account it is paid from.
 * onSubmit(updates) where updates only holds the fields that changed.
 */
export function GoalEditForm({ goal, bankAccounts = [], wallets = [], currencySymbol = '₹', onSubmit, onCancel }) {
  const start = fundingOf(goal);
  const [name, setName] = useState(goal?.name || '');
  const [price, setPrice] = useState(goal?.targetAmount ? String(goal.targetAmount / 100) : '');
  const [priority, setPriority] = useState(Number(goal?.priority) || 0);
  const [accountType, setAccountType] = useState(start.accountType);
  const [accountId, setAccountId] = useState(start.accountId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    const minor = Math.round(Math.abs(Number(price) || 0) * 100);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!minor) return setError('Enter the price.');
    // Send only what changed, so untouched fields are never rewritten
    const updates = {};
    if (name.trim() !== (goal?.name || '')) updates.name = name.trim();
    if (minor !== Number(goal?.targetAmount || 0)) updates.targetAmount = minor;
    if (priority !== (Number(goal?.priority) || 0)) updates.priority = priority;
    if (String(accountId || '') !== String(start.accountId || '')) updates.fundingAccountId = accountId || null;
    if (Object.keys(updates).length === 0) {
      onCancel?.();
      return;
    }
    setSaving(true);
    try {
      await onSubmit?.(updates);
    } catch (err) {
      setError(err?.message || 'Could not save the goal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} data-testid="goal-edit-form">
      <h3 className="settle-modal-title">Edit goal</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="goal-edit-name">Goal</label>
        <input id="goal-edit-name" className="input-field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="goal-edit-price">Price ({currencySymbol})</label>
        <input
          id="goal-edit-price"
          className="input-field tabular-nums"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="form-group">
        <span className="form-label">Priority</span>
        <div className="entry-segment" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`entry-segment-btn ${priority === p.value ? 'active' : ''}`}
              aria-pressed={priority === p.value}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <span className="form-label">Paid from</span>
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
        />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-footer">
        <button type="button" className="btn-subtle" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}
