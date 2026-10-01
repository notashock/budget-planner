import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDisplayDate, getRelativeDay } from '@budget/engine';
import { SearchableItemPicker } from './SearchableItemPicker';

export function QuickLogModal({
  isOpen,
  onClose,
  onLogTransaction,
  plannedItems = [],
  currencySymbol = '₹',
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

      // Always default date selector strictly to today's real-world date
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      setDate(todayStr);
    }
  }, [isOpen]);

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
            <SearchableItemPicker
              items={eligiblePlannedItems}
              selectedId={plannedItemId}
              onSelect={(id) => setPlannedItemId(id)}
              currencySymbol={currencySymbol}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {plannedItemId
                ? isRefund
                  ? 'Applies this refund as a credit to the item, calculating its net cost.'
                  : 'Matches and fulfills the planned item, replacing it to prevent double-counting.'
                : isRefund
                ? 'Adds this credit/refund directly to your balance.'
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
            {(() => {
              const year = month?.year || new Date().getFullYear();
              const monthNum = month?.month || (new Date().getMonth() + 1);
              const relDay = date ? getRelativeDay(date, year, monthNum) : 1;
              if (relDay < 0) {
                return (
                  <span style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', display: 'block' }}>
                    Pre-month event (Day {relDay}): will be processed before Day 1.
                  </span>
                );
              }
              return null;
            })()}
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
