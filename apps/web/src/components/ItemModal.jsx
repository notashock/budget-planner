import React, { useState, useEffect } from 'react';
import { calculateFormulaCost, formatCurrency } from '@budget/engine';

export function ItemModal({
  isOpen,
  onClose,
  onSave,
  initialItem = null,
  currencySymbol = '$'
}) {
  const [type, setType] = useState('one-time');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  // Formula fields
  const [distance, setDistance] = useState('');
  const [efficiency, setEfficiency] = useState('');
  const [fuelPrice, setFuelPrice] = useState('');
  const [extraCost, setExtraCost] = useState('');
  const [datesStr, setDatesStr] = useState('');

  useEffect(() => {
    if (initialItem) {
      setType(initialItem.type);
      setName(initialItem.name);
      setPriority(initialItem.priority ?? 0);
      if (initialItem.type === 'one-time') {
        setAmount((initialItem.amount / 100).toString());
        setDay(initialItem.day || 1);
      } else if (initialItem.type === 'recurring') {
        setAmount((initialItem.amount / 100).toString());
        setDayOfMonth(initialItem.dayOfMonth || 1);
      } else if (initialItem.type === 'formula') {
        const cfg = initialItem.formulaConfig || {};
        setDistance(cfg.distance?.toString() || '');
        setEfficiency(cfg.efficiency?.toString() || '');
        setFuelPrice(cfg.fuelPrice ? (cfg.fuelPrice / 100).toString() : '');
        setExtraCost(cfg.extraCost ? (cfg.extraCost / 100).toString() : '');
        setDatesStr(cfg.dates ? cfg.dates.join(', ') : '');
      }
    } else {
      setType('one-time');
      setName('');
      setPriority(0);
      setAmount('');
      setDay(1);
      setDayOfMonth(1);
      setDistance('');
      setEfficiency('');
      setFuelPrice('');
      setExtraCost('');
      setDatesStr('');
    }
  }, [initialItem, isOpen]);

  if (!isOpen) return null;

  // Calculate formula cost live for preview
  let formulaPerCost = 0;
  let parsedDates = [];
  if (type === 'formula') {
    const distNum = Number(distance) || 0;
    const effNum = Number(efficiency) || 1;
    const fuelNum = Math.round(Number(fuelPrice || 0) * 100);
    const extraNum = Math.round(Number(extraCost || 0) * 100);

    if (distNum > 0 && effNum > 0) {
      formulaPerCost = calculateFormulaCost({
        distance: distNum,
        efficiency: effNum,
        fuelPrice: fuelNum,
        extraCost: extraNum,
        scale: 100
      });
    }

    parsedDates = datesStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 31);
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      type,
      name: name.trim(),
      priority: Number(priority) || 0
    };

    if (type === 'one-time') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      payload.day = Number(day) || 1;
    } else if (type === 'recurring') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
    } else if (type === 'formula') {
      payload.formulaConfig = {
        distance: Number(distance) || 0,
        efficiency: Number(efficiency) > 0 ? Number(efficiency) : 1,
        fuelPrice: Math.round(Number(fuelPrice || 0) * 100),
        extraCost: Math.round(Number(extraCost || 0) * 100),
        dates: parsedDates
      };
    }

    onSave(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{initialItem ? 'Edit item' : 'Add new item'}</h3>
          <button type="button" className="btn-subtle" onClick={onClose} style={{ padding: '4px 8px' }}>
            Close
          </button>
        </div>

        {/* Item Type Selector */}
        {!initialItem && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {['one-time', 'recurring', 'formula'].map((t) => (
              <button
                key={t}
                type="button"
                className={type === t ? 'btn-primary' : ''}
                onClick={() => setType(t)}
                style={{ padding: '6px 8px', fontSize: '12px' }}
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
              placeholder="e.g. Rent, Grocery run, Work trip"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Same-day priority (0 = high)</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>

            {type !== 'formula' && (
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
          </div>

          {type === 'one-time' && (
            <div className="form-group">
              <label className="form-label">Day of month (1 - 31)</label>
              <input
                type="number"
                min="1"
                max="31"
                required
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
          )}

          {type === 'recurring' && (
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
          )}

          {type === 'formula' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Distance per trip</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 50"
                    required
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fuel efficiency (km/L or MPG)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 42.5"
                    required
                    value={efficiency}
                    onChange={(e) => setEfficiency(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fuel price ({currencySymbol} / unit)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 117"
                    required
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Extra per occurrence ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 300"
                    value={extraCost}
                    onChange={(e) => setExtraCost(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Dates in month (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. 10, 17, 25"
                  required
                  value={datesStr}
                  onChange={(e) => setDatesStr(e.target.value)}
                />
              </div>

              {formulaPerCost > 0 && (
                <div className="assumptions-box">
                  <strong>Assumptions:</strong> {distance} units @ {efficiency} efficiency, fuel {currencySymbol}{fuelPrice} + extra {currencySymbol}{extraCost || 0}
                  <br />
                  <strong>Per occurrence:</strong> {formatCurrency(formulaPerCost, currencySymbol)} rounded to whole unit.
                  <br />
                  <strong>Total ({parsedDates.length} occurrences):</strong> {formatCurrency(formulaPerCost * parsedDates.length, currencySymbol)}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {initialItem ? 'Update item' : 'Save item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
