import React, { useState, useEffect } from 'react';
import {
  calculateFuelEfficiency,
  formatCurrency,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from '@budget/engine';
import { api } from '../api.js';
import { DatePicker } from './DatePicker.jsx';
import { SparklesIcon } from './Icons.jsx';

export function ItemModal({
  isOpen,
  onClose,
  onSave,
  initialItem = null,
  currencySymbol = '₹',
  month,
  existingItems = [],
  existingTransactions = []
}) {
  const [type, setType] = useState('one-time');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [isFixed, setIsFixed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [recommending, setRecommending] = useState(false);

  // Fuel log fields: list of fuel stops
  const [fuelStops, setFuelStops] = useState([
    { date: '', odometer: '', fuelVolume: '', fuelCost: '' },
    { date: '', odometer: '', fuelVolume: '', fuelCost: '' }
  ]);

  useEffect(() => {
    const year = month?.year || 2026;
    const monthNum = month?.month || 1;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (initialItem) {
      setType(initialItem.type);
      setName(initialItem.name);
      setPriority(initialItem.priority ?? 0);
      setIsFixed(Boolean(initialItem.isFixed));
      setIsPaid(Boolean(initialItem.isPaid));
      if (initialItem.type === 'one-time') {
        setAmount((initialItem.amount / 100).toString());
        if (typeof initialItem.day === 'number' && initialItem.day < 0) {
          setDate(initialItem.date || getDateFromRelativeDay(initialItem.day, year, monthNum));
        } else {
          setDate(initialItem.date || formatDate(year, monthNum, initialItem.day || 1));
        }
      } else if (initialItem.type === 'recurring') {
        setAmount((initialItem.amount / 100).toString());
        setDayOfMonth(initialItem.dayOfMonth || 1);
      } else if (initialItem.type === 'fuel-log') {
        setFuelStops(
          initialItem.fuelStops?.map((s) => ({
            date: s.date || todayStr,
            odometer: s.odometer?.toString() || '',
            fuelVolume: s.fuelVolume?.toString() || '',
            fuelCost: s.fuelCost ? (s.fuelCost / 100).toString() : ''
          })) || []
        );
      }
    } else {
      setType('one-time');
      setName('');
      setPriority(0);
      setIsFixed(false);
      setIsPaid(false);
      setAmount('');
      setDate(''); // Default mode not done: keep date blank for recommendation
      setDayOfMonth(now.getDate() || 1);
      setFuelStops([
        { date: todayStr, odometer: '', fuelVolume: '', fuelCost: '' },
        { date: todayStr, odometer: '', fuelVolume: '', fuelCost: '' }
      ]);
    }
  }, [initialItem, isOpen, month]);

  if (!isOpen) return null;

  // Live Fuel Efficiency Calculation
  const parsedFuelStops = fuelStops
    .filter((s) => s.odometer !== '' && s.fuelVolume !== '')
    .map((s) => ({
      date: s.date,
      odometer: Number(s.odometer) || 0,
      fuelVolume: Number(s.fuelVolume) || 0,
      fuelCost: Math.round(Number(s.fuelCost || 0) * 100)
    }));

  const fuelEfficiencyResult = calculateFuelEfficiency(parsedFuelStops);

  const handleTogglePaid = (newPaid) => {
    setIsPaid(newPaid);
    if (newPaid && !date) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    } else if (!newPaid && !initialItem) {
      setDate('');
    }
  };

  const handleRecommendDate = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);
    setRecommending(true);
    try {
      const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
      if (rec?.recommendedDate) {
        setDate(rec.recommendedDate);
      } else {
        alert(rec?.explanation || 'No safe date could be found this month without risking floor breach.');
      }
    } catch (err) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
      const safeFutureDay = isCurrentMonth ? Math.min(now.getDate() + 1, 28) : 1;
      setDate(`${year}-${pad(monthNum)}-${pad(safeFutureDay)}`);
    } finally {
      setRecommending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    let finalDate = date;
    const year = month?.year || 2026;
    const monthNum = month?.month || 1;

    // If payment not done and date left blank, auto-assign the best recommended date
    if (type === 'one-time' && !finalDate && !isPaid) {
      try {
        const amt = Math.round(Number(amount || 0) * 100);
        const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
        if (rec?.recommendedDate) {
          finalDate = rec.recommendedDate;
        } else {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
          const safeFutureDay = isCurrentMonth ? Math.min(now.getDate() + 1, 28) : 1;
          finalDate = `${year}-${pad(monthNum)}-${pad(safeFutureDay)}`;
        }
      } catch (err) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
        const safeFutureDay = isCurrentMonth ? Math.min(now.getDate() + 1, 28) : 1;
        finalDate = `${year}-${pad(monthNum)}-${pad(safeFutureDay)}`;
      }
    }

    const payload = {
      type,
      name: name.trim(),
      priority: Number(priority) || 0,
      isPaid
    };

    if (type === 'one-time') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      const relativeDay = finalDate ? getRelativeDay(finalDate, year, monthNum) : 1;
      payload.day = relativeDay;
      payload.date = finalDate;
    } else if (type === 'recurring') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
      payload.isFixed = isFixed;
    } else if (type === 'fuel-log') {
      payload.fuelStops = parsedFuelStops;
    }

    onSave(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{initialItem ? 'Edit budget item' : 'Add budget item'}</h3>
          <button type="button" className="btn-icon" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        {/* Tab Selector */}
        {!initialItem && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {['one-time', 'recurring', 'fuel-log'].map((t) => (
              <button
                key={t}
                type="button"
                className={type === t ? 'btn-primary' : ''}
                onClick={() => setType(t)}
                style={{ padding: '6px 4px', fontSize: '11px' }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Item name</label>
            <input
              type="text"
              required
              placeholder="e.g. Rent, Groceries, Bike fuel log"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {type !== 'fuel-log' && (
            <div className="form-group">
              <label className="form-label">Amount ({currencySymbol})</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}

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
          {type === 'one-time' && (
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0 }}>Planned payment date</label>
                {!isPaid && (
                  <button
                    type="button"
                    className="sparkle-action-link"
                    onClick={handleRecommendDate}
                    disabled={recommending}
                    title="Recommend best safe date based on spending pace, balance, and floor buffer"
                  >
                    <SparklesIcon size={12} className={recommending ? 'sparkle-spin-icon' : ''} />
                    <span>{recommending ? 'Analyzing cash flow...' : 'Recommend best date'}</span>
                  </button>
                )}
              </div>
              <DatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Leave blank for auto-recommended safe date"
                month={month}
              />
              {!date && !isPaid && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Payment pending: date left blank. Application will assign best date on save or click "Recommend best date".
                </span>
              )}
            </div>
          )}

          {/* Recurring Day and Fixed Carryover Toggle */}
          {type === 'recurring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Day of month to bill (1 - 31)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Automatically clamped to the last calendar day in shorter months.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                <input
                  type="checkbox"
                  id="isFixedCheckbox"
                  checked={isFixed}
                  onChange={(e) => setIsFixed(e.target.checked)}
                />
                <label htmlFor="isFixedCheckbox" style={{ fontSize: '13px', cursor: 'pointer' }}>
                  Fixed recurring item (carries same amount and date forward to next month)
                </label>
              </div>
            </div>
          )}

          {/* Bike Fuel Log */}
          {type === 'fuel-log' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="form-label">Fuel stops & odometer log</span>
                <button
                  type="button"
                  className="btn-subtle"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() =>
                    setFuelStops([
                      ...fuelStops,
                      { date: date || '2026-09-01', odometer: '', fuelVolume: '', fuelCost: '' }
                    ])
                  }
                >
                  + Add fuel stop
                </button>
              </div>

              {fuelStops.map((stop, sIdx) => (
                <div
                  key={sIdx}
                  style={{
                    padding: '8px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                    <span>Stop #{sIdx + 1} {sIdx === 0 ? '(Baseline odometer)' : ''}</span>
                    {fuelStops.length > 2 && (
                      <button
                        type="button"
                        className="btn-subtle"
                        style={{ padding: '0 4px', color: 'var(--danger)' }}
                        onClick={() => setFuelStops(fuelStops.filter((_, i) => i !== sIdx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="form-row">
                    <input
                      type="date"
                      required
                      value={stop.date}
                      onChange={(e) => {
                        const next = [...fuelStops];
                        next[sIdx].date = e.target.value;
                        setFuelStops(next);
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Odometer (km)"
                      required
                      value={stop.odometer}
                      onChange={(e) => {
                        const next = [...fuelStops];
                        next[sIdx].odometer = e.target.value;
                        setFuelStops(next);
                      }}
                    />
                  </div>

                  <div className="form-row">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Fuel volume (L)"
                      required
                      value={stop.fuelVolume}
                      onChange={(e) => {
                        const next = [...fuelStops];
                        next[sIdx].fuelVolume = e.target.value;
                        setFuelStops(next);
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`Total cost (${currencySymbol})`}
                      required
                      value={stop.fuelCost}
                      onChange={(e) => {
                        const next = [...fuelStops];
                        next[sIdx].fuelCost = e.target.value;
                        setFuelStops(next);
                      }}
                    />
                  </div>
                </div>
              ))}

              {fuelEfficiencyResult.averageEfficiency && (
                <div className="assumptions-box" style={{ background: 'var(--success-subtle)', borderColor: 'var(--success-border)' }}>
                  <strong>Bike efficiency:</strong> {fuelEfficiencyResult.averageEfficiency} km/L across {fuelEfficiencyResult.totalDistance} km.
                  <br />
                  <strong>Total fuel cost:</strong> {formatCurrency(fuelEfficiencyResult.totalFuelCost, currencySymbol)} ({fuelEfficiencyResult.totalFuelVolume} L total).
                </div>
              )}
            </div>
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
            {type !== 'fuel-log' ? (
              <div
                className="recurring-toggle-switch"
                onClick={() => handleTogglePaid(!isPaid)}
                title={isPaid ? 'Payment done - click to toggle pending' : 'Payment pending - click to mark done'}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTogglePaid(!isPaid);
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
            ) : <div />}

            {/* Right corner: Cancel & Save */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {initialItem ? 'Update item' : 'Save item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
