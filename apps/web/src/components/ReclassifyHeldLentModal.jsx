import React, { useEffect, useState } from 'react';
import { formatCurrency } from '@budget/engine';
import { api } from '../api.js';
import { AnimatedModal } from './AnimatedModal.jsx';
import { Button } from './ui/Button.jsx';

const NEW_PERSON = '__new__';

/**
 * Turns an income or expense that was logged the old way into held or lent money,
 * so it stops counting as income or spending (ADR 0069). Cash direction is kept:
 * money in becomes "received to hold" / "paid back", money out becomes "returned" / "lent".
 */
export function ReclassifyHeldLentModal({ transaction, currencySymbol = '₹', onClose, onDone }) {
  const cashIn = Boolean(transaction?.isIncome) || Number(transaction?.amount) < 0;
  const [direction, setDirection] = useState(cashIn ? 'held' : 'lent');
  const [funds, setFunds] = useState([]);
  const [fundId, setFundId] = useState(NEW_PERSON);
  const [personName, setPersonName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return undefined;
    let alive = true;
    api.getPersonFunds().then((res) => {
      if (alive) setFunds(res?.funds || []);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [transaction]);

  const matching = funds.filter((f) => f.direction === direction);
  useEffect(() => {
    if (fundId !== NEW_PERSON && !matching.some((f) => f.id === fundId)) setFundId(NEW_PERSON);
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!transaction) return null;

  const meaning = {
    held: cashIn ? 'Someone gave you money to keep' : 'You gave back money you were keeping',
    lent: cashIn ? 'Someone paid back money you lent' : 'You lent this money to someone'
  };

  const submit = async () => {
    setError('');
    if (fundId === NEW_PERSON && !personName.trim()) {
      setError('Enter the person’s name.');
      return;
    }
    setSaving(true);
    try {
      const body = fundId === NEW_PERSON
        ? { personName: personName.trim(), direction }
        : { personFundId: fundId };
      await api.reclassifyTransaction(transaction.id || transaction._id, body);
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Could not move this entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedModal isOpen={Boolean(transaction)} onClose={onClose} dataTestId="reclassify-held-lent">
      <div className="hl-form">
        <h3 className="hl-modal-title">Move to Held &amp; Lent</h3>
        <p className="hl-hint">
          {transaction.name || 'This entry'} ({formatCurrency(Math.abs(transaction.amount), currencySymbol)}) will stop
          counting as {cashIn ? 'income' : 'spending'}. Your balance stays the same.
        </p>
        <div className="hl-actions hl-actions-2" role="radiogroup" aria-label="What was it">
          {['held', 'lent'].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              className={`hl-action ${direction === d ? 'active' : ''}`}
              onClick={() => setDirection(d)}
            >
              {meaning[d]}
            </button>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="rc-person">Person</label>
          <select id="rc-person" className="input-field" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {matching.map((f) => <option key={f.id} value={f.id}>{f.personName}</option>)}
            <option value={NEW_PERSON}>+ New person</option>
          </select>
          {fundId === NEW_PERSON && (
            <input autoComplete="off"
              className="input-field hl-new-person"
              placeholder="Name"
              aria-label="Person name"
              value={personName}
              maxLength={80}
              onChange={(e) => setPersonName(e.target.value)}
            />
          )}
        </div>
        {error && <div className="hl-error" role="alert">{error}</div>}
        <div className="hl-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Moving…' : 'Move'}</Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
