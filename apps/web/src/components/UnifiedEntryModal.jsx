import React, { useState, useEffect } from 'react';
import {
  formatCurrency,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from '@budget/engine';
import {
  ZapIcon,
  PlusIcon,
  TagIcon,
  CalendarIcon,
  RefreshIcon,
  CheckCircleIcon
} from './Icons.jsx';
import { SearchableItemPicker } from './SearchableItemPicker.jsx';
import { api } from '../api.js';

export function UnifiedEntryModal({
  isOpen,
  onClose,
  onLogTransaction,
  onSaveItem,
  initialItem = null,
  initialMode = 'log', // 'log' | 'plan'
  plannedItems = [],
  currencySymbol = '₹',
  month
}) {
  const [mode, setMode] = useState('log'); // 'log' | 'plan'

  // --- Transaction State ---
  const [txAmount, setTxAmount] = useState('');
  const [isRefund, setIsRefund] = useState(false);
  const [tag, setTag] = useState('Food');
  const [note, setNote] = useState('');
  const [matchedItemId, setMatchedItemId] = useState('');
  const [txDate, setTxDate] = useState('');

  // --- Plan Item State ---
  const [itemType, setItemType] = useState('one-time');
  const [itemName, setItemName] = useState('');
  const [priority, setPriority] = useState(0);
  const [itemAmount, setItemAmount] = useState('');
  const [itemDate, setItemDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [isFixed, setIsFixed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (initialItem) {
      // Editing an existing planned item
      setMode('plan');
      setItemType(initialItem.type === 'recurring' ? 'recurring' : 'one-time');
      setItemName(initialItem.name);
      setPriority(initialItem.priority ?? 0);
      setIsFixed(Boolean(initialItem.isFixed));
      setIsPaid(Boolean(initialItem.isPaid));

      const year = month?.year || now.getFullYear();
      const monthNum = month?.month || (now.getMonth() + 1);

      if (initialItem.type === 'recurring') {
        setItemAmount((initialItem.amount / 100).toString());
        setDayOfMonth(initialItem.dayOfMonth || 1);
      } else {
        setItemAmount(initialItem.amount ? (initialItem.amount / 100).toString() : '');
        if (typeof initialItem.day === 'number' && initialItem.day < 0) {
          setItemDate(initialItem.date || getDateFromRelativeDay(initialItem.day, year, monthNum));
        } else {
          setItemDate(initialItem.date || formatDate(year, monthNum, initialItem.day || 1));
        }
      }
    } else {
      // New entry: reset both forms
      setMode(initialMode || 'log');
      // Reset transaction form
      setTxAmount('');
      setIsRefund(false);
      setTag('Food');
      setNote('');
      setMatchedItemId('');
      setTxDate(todayStr);

      // Reset plan item form
      setItemType('one-time');
      setItemName('');
      setPriority(0);
      setIsFixed(false);
      setIsPaid(false);
      setItemAmount('');
      setItemDate(''); // Default mode not done: keep date blank for recommendation
      setDayOfMonth(now.getDate() || 1);
    }
  }, [isOpen, initialItem, initialMode, month]);

  if (!isOpen) return null;

  // Transaction submission
  const handleTransactionSubmit = (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(Number(txAmount))) return;

    const baseAmount = Math.round(Math.abs(Number(txAmount)) * 100);
    const finalAmount = isRefund ? -baseAmount : baseAmount;

    onLogTransaction({
      amount: finalAmount,
      tag,
      note: note.trim(),
      date: txDate,
      plannedItemId: matchedItemId || null
    });
  };

  const handleTogglePaidStatus = (newPaid) => {
    setIsPaid(newPaid);
    if (newPaid && !itemDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setItemDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    } else if (!newPaid && !initialItem) {
      setItemDate('');
    }
  };

  const handleRecommendDate = async () => {
    const amt = Math.round(Number(itemAmount || 0) * 100);
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);
    setRecommending(true);
    try {
      const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
      if (rec?.recommendedDate) {
        setItemDate(rec.recommendedDate);
      } else {
        alert(rec?.explanation || 'No safe date could be found this month without risking floor breach.');
      }
    } catch (err) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setItemDate(`${year}-${pad(monthNum)}-01`);
    } finally {
      setRecommending(false);
    }
  };

  // Plan item submission
  const handleItemSubmit = async (e) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    let finalDate = itemDate;
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);

    // If payment not done and date left blank, auto-assign the best recommended date
    if (itemType === 'one-time' && !finalDate && !isPaid) {
      try {
        const amt = Math.round(Number(itemAmount || 0) * 100);
        const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
        if (rec?.recommendedDate) {
          finalDate = rec.recommendedDate;
        } else {
          const pad = (n) => String(n).padStart(2, '0');
          finalDate = `${year}-${pad(monthNum)}-01`;
        }
      } catch (err) {
        const pad = (n) => String(n).padStart(2, '0');
        finalDate = `${year}-${pad(monthNum)}-01`;
      }
    }

    const payload = {
      type: itemType,
      name: itemName.trim(),
      priority: Number(priority) || 0,
      isPaid
    };

    if (itemType === 'one-time') {
      payload.amount = Math.round(Number(itemAmount || 0) * 100);
      const relativeDay = finalDate ? getRelativeDay(finalDate, year, monthNum) : 1;
      payload.day = relativeDay;
      payload.date = finalDate;
    } else if (itemType === 'recurring') {
      payload.amount = Math.round(Number(itemAmount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
      payload.isFixed = isFixed;
    }

    onSaveItem(payload);
  };

  const eligiblePlannedItems = (plannedItems || []).filter(
    (item) => item.type === 'one-time' || item.type === 'recurring'
  );

  const currentYear = month?.year || new Date().getFullYear();
  const currentMonthNum = month?.month || (new Date().getMonth() + 1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Mobile bottom-sheet grab handle indicator */}
        <div className="modal-drag-handle" />

        {/* Header & Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-subtle)', padding: '3px', borderRadius: 'var(--radius)' }}>
            {!initialItem && (
              <>
                <button
                  type="button"
                  className={mode === 'log' ? 'btn-primary' : 'btn-subtle'}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: 'calc(var(--radius) - 2px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  onClick={() => setMode('log')}
                >
                  <ZapIcon size={13} />
                  <span>Log Spending</span>
                </button>
                <button
                  type="button"
                  className={mode === 'plan' ? 'btn-primary' : 'btn-subtle'}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: 'calc(var(--radius) - 2px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  onClick={() => setMode('plan')}
                >
                  <PlusIcon size={13} />
                  <span>Plan Budget Item</span>
                </button>
              </>
            )}
            {initialItem && (
              <span style={{ fontSize: '13px', fontWeight: 600, padding: '4px 8px' }}>
                Edit Planned Item
              </span>
            )}
          </div>
          <button type="button" className="btn-subtle" onClick={onClose} style={{ fontSize: '12px', padding: '4px 8px' }}>
            Close
          </button>
        </div>

        {/* MODE 1: LOG SPENDING / ACTUAL TRANSACTION */}
        {mode === 'log' && (
          <form onSubmit={handleTransactionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Amount & Credit / Refund Toggle */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label">Amount ({currencySymbol})</label>
                <button
                  type="button"
                  className={`btn-subtle ${isRefund ? 'credit-active-btn' : ''}`}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: isRefund ? '1px solid var(--success)' : '1px solid var(--border)',
                    background: isRefund ? 'var(--success-subtle)' : 'var(--surface)',
                    color: isRefund ? 'var(--success)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onClick={() => setIsRefund(!isRefund)}
                >
                  {isRefund ? (
                    <>
                      <CheckCircleIcon size={12} />
                      <span>Credit / Refund</span>
                    </>
                  ) : (
                    'Expense Debit'
                  )}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  padding: '10px 12px',
                  color: isRefund ? 'var(--success)' : 'var(--text)',
                  borderColor: isRefund ? 'var(--success)' : undefined
                }}
              />
            </div>

            {/* Category Tag Pills */}
            <div className="form-group">
              <label className="form-label">Category tag</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {['Food', 'Travel', 'Health', 'Other'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={tag === t ? 'btn-primary' : 'btn-subtle'}
                    onClick={() => setTag(t)}
                    style={{
                      padding: '8px 4px',
                      fontSize: '12px',
                      fontWeight: tag === t ? 600 : 400,
                      border: tag === t ? undefined : '1px solid var(--border)'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Note / Description */}
            <div className="form-group">
              <label className="form-label">Description note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Grocery, Metro pass, Doctor checkup"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* Match Planned Item */}
            <div className="form-group">
              <label className="form-label">Match to planned item (optional)</label>
              <SearchableItemPicker
                items={eligiblePlannedItems}
                selectedId={matchedItemId}
                onSelect={(id) => setMatchedItemId(id)}
                currencySymbol={currencySymbol}
              />
              <span
                style={{
                  fontSize: '11px',
                  marginTop: '4px',
                  display: 'block',
                  color: isRefund ? 'var(--success)' : 'var(--text-muted)',
                  fontWeight: isRefund ? 500 : 400
                }}
              >
                {matchedItemId
                  ? isRefund
                    ? 'Applies this refund as a credit to the item, reducing its net cost.'
                    : 'Fulfills and replaces the planned item to prevent double-counting.'
                  : isRefund
                  ? 'Adds this credit/refund directly into your monthly cash reserve.'
                  : 'Logs as unexpected spending, reducing your safe-to-spend allowance.'}
              </span>
            </div>

            {/* Date Input */}
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />
              {(() => {
                const relDay = txDate ? getRelativeDay(txDate, currentYear, currentMonthNum) : 1;
                if (relDay < 0) {
                  return (
                    <span style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ZapIcon size={12} color="var(--accent)" />
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
              <button
                type="submit"
                className="btn-primary"
                style={{
                  padding: '10px 20px',
                  background: isRefund ? 'var(--success)' : undefined,
                  borderColor: isRefund ? 'var(--success)' : undefined
                }}
              >
                {isRefund ? 'Log credit inflow' : 'Log expense debit'}
              </button>
            </div>
          </form>
        )}

        {/* MODE 2: PLAN BUDGET ITEM */}
        {mode === 'plan' && (
          <form onSubmit={handleItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Item Type Switcher: 2-way toggle */}
            <div className="form-group">
              <label className="form-label">Item type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {[
                  { id: 'one-time', label: 'One-Time' },
                  { id: 'recurring', label: 'Recurring' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={itemType === t.id ? 'btn-primary' : 'btn-subtle'}
                    onClick={() => setItemType(t.id)}
                    style={{
                      padding: '8px 4px',
                      fontSize: '12px',
                      fontWeight: itemType === t.id ? 600 : 400,
                      border: itemType === t.id ? undefined : '1px solid var(--border)'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Name / Description</label>
              <input
                type="text"
                required
                placeholder="e.g. Rent, Electricity, Groceries"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            {/* Amount for One-Time & Recurring */}
            <div className="form-group">
              <label className="form-label">Planned amount ({currencySymbol})</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                placeholder="0.00"
                value={itemAmount}
                onChange={(e) => setItemAmount(e.target.value)}
                style={{ fontSize: '18px', fontWeight: 600 }}
              />
            </div>

            {/* Same-Day Priority Tiers */}
            <div className="form-group">
              <label className="form-label">Same-day priority</label>
              <div className="priority-selector">
                {[
                  { label: 'High', value: 0, bars: 3 },
                  { label: 'Medium', value: 1, bars: 2 },
                  { label: 'Low', value: 2, bars: 1 }
                ].map((tier) => {
                  const isSelected = (Number(priority) || 0) === tier.value;
                  return (
                    <button
                      key={tier.value}
                      type="button"
                      className={`priority-option-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => setPriority(tier.value)}
                    >
                      <span className="priority-bars-icon" aria-hidden="true">
                        <span className={`priority-bar bar-1 ${tier.bars >= 1 ? 'active' : ''}`} />
                        <span className={`priority-bar bar-2 ${tier.bars >= 2 ? 'active' : ''}`} />
                        <span className={`priority-bar bar-3 ${tier.bars >= 3 ? 'active' : ''}`} />
                      </span>
                      <span>{tier.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* One-Time Date Picker */}
            {itemType === 'one-time' && (
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Planned payment date</label>
                  {!isPaid && (
                    <button
                      type="button"
                      className="btn-subtle"
                      style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border)' }}
                      onClick={handleRecommendDate}
                      disabled={recommending}
                      title="Recommend best date based on spending pace, balance, and floor buffer"
                    >
                      {recommending ? 'Calculating...' : '⚡ Recommend best date'}
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={itemDate}
                  onChange={(e) => setItemDate(e.target.value)}
                  placeholder="Leave blank for auto-recommended safe date"
                />
                {!itemDate && !isPaid && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Payment pending: date left blank. Application will assign best date on save or click "Recommend best date".
                  </span>
                )}
                {(() => {
                  if (!itemDate) return null;
                  const relDay = getRelativeDay(itemDate, currentYear, currentMonthNum);
                  if (relDay < 0) {
                    return (
                      <span style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ZapIcon size={12} color="var(--accent)" />
                        Pre-month event (Day {relDay}): will be processed before Day 1.
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Recurring Day & Fixed Rollover Toggle */}
            {itemType === 'recurring' && (
              <>
                <div className="form-group">
                  <label className="form-label">Day of month (1 - 31)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    required
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                  />
                </div>

                <div
                  style={{
                    padding: '10px 12px',
                    background: isFixed ? 'var(--surface)' : 'var(--surface-subtle)',
                    borderRadius: 'var(--radius)',
                    border: isFixed ? '1px solid var(--text)' : '1px solid var(--border)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={isFixed}
                      onChange={(e) => setIsFixed(e.target.checked)}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      Fixed recurring (auto-carry forward on month rollover)
                    </span>
                  </label>
                </div>
              </>
            )}

            {/* Modal Footer with Payment Status on Left Corner and Actions on Right */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)'
              }}
            >
              {/* Left corner: Payment Done Toggle Switch */}
              <div
                className="recurring-toggle-switch"
                onClick={() => handleTogglePaidStatus(!isPaid)}
                title={isPaid ? 'Payment done - click to toggle pending' : 'Payment pending - click to mark done'}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTogglePaidStatus(!isPaid);
                  }
                }}
              >
                <div className={`recurring-toggle-track ${isPaid ? 'active' : ''}`}>
                  <div className="recurring-toggle-thumb" />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: isPaid ? 'var(--text)' : 'var(--text-secondary)' }}>
                  {isPaid ? 'Payment done' : 'Payment pending'}
                </span>
              </div>

              {/* Right corner: Cancel & Save */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 18px' }}>
                  {initialItem ? 'Update planned item' : 'Save planned item'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
