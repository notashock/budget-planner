import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function QuickLogModal({
  isOpen,
  onClose,
  onLogTransaction,
  plannedItems = [],
  currencySymbol = '$',
  month
}) {
  const [amount, setAmount] = useState('');
  const [isRefund, setIsRefund] = useState(false);
  const [tag, setTag] = useState('Food');
  const [note, setNote] = useState('');
  const [plannedItemId, setPlannedItemId] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setIsRefund(false);
      setTag('Food');
      setNote('');
      setPlannedItemId('');

      // Default date to today, clamped to this month
      const now = new Date();
      const currentYear = month ? month.year : now.getFullYear();
      const currentMonth = month ? month.month : now.getMonth() + 1;
      const day = Math.min(28, now.getDate());
      const pad = (n) => String(n).padStart(2, '0');
      setDate(`${currentYear}-${pad(currentMonth)}-${pad(day)}`);
    }
  }, [isOpen, month]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;

    const baseAmount = Math.round(Math.abs(Number(amount)) * 100);
    const finalAmount = isRefund ? -baseAmount : baseAmount;

    onLogTransaction({
      amount: finalAmount,
      tag,
      note: note.trim(),
      date,
      plannedItemId: plannedItemId ? plannedItemId : null
    });
  };

  // Filter planned items that are one-time or recurring
  const eligiblePlannedItems = plannedItems.filter(
    (item) => item.type === 'one-time' || item.type === 'recurring'
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Log spending</h3>
          <button type="button" className="btn-subtle" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Tap 1: Amount & Refund Toggle */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="form-label">Amount ({currencySymbol})</label>
              <button
                type="button"
                className={`btn-subtle ${isRefund ? 'btn-primary' : ''}`}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setIsRefund(!isRefund)}
              >
                {isRefund ? 'Refund / credit' : 'Expense'}
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: '18px', fontWeight: 600, padding: '10px' }}
            />
          </div>

          {/* Tap 2: Tag Pills */}
          <div className="form-group">
            <label className="form-label">Category tag</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {['Food', 'Travel', 'Health', 'Other'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tag === t ? 'btn-primary' : ''}
                  onClick={() => setTag(t)}
                  style={{ padding: '8px 4px', fontSize: '12px' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Note input */}
          <div className="form-group">
            <label className="form-label">Description note (optional)</label>
            <input
              type="text"
              placeholder="e.g. Coffee, Taxi ride, Medicine"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Tap 3: Match to Planned Item or Draw Down Unplanned Allowance */}
          <div className="form-group">
            <label className="form-label">Match to planned item (optional)</label>
            <select
              value={plannedItemId}
              onChange={(e) => setPlannedItemId(e.target.value)}
            >
              <option value="">Unexpected spending (draws down unplanned allowance)</option>
              {eligiblePlannedItems.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name} ({formatCurrency(item.amount, currencySymbol)})
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {plannedItemId
                ? 'Matches and fulfills the planned item, replacing it to prevent double-counting.'
                : 'Logs as unexpected spending, reducing your safe-to-spend daily allowance.'}
            </span>
          </div>

          {/* Date Picker (defaults to today, supports backdating) */}
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" style={{ padding: '10px 18px' }}>
              Log entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
