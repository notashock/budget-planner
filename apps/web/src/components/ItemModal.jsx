import React, { useState, useEffect } from 'react';
import {
  calculateFormulaCost,
  calculateFuelEfficiency,
  recommendPurchaseDate,
  formatCurrency,
  formatDisplayDate,
  formatDate
} from '@budget/engine';

export function ItemModal({
  isOpen,
  onClose,
  onSave,
  initialItem = null,
  currencySymbol = '$',
  month,
  monthSettings,
  existingItems = [],
  existingTransactions = []
}) {
  const [type, setType] = useState('one-time');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);

  // Recommendation state
  const [recommendation, setRecommendation] = useState(null);

  // Formula fields
  const [distance, setDistance] = useState('');
  const [efficiency, setEfficiency] = useState('');
  const [fuelPrice, setFuelPrice] = useState('');
  const [extraCost, setExtraCost] = useState('');
  const [datesStr, setDatesStr] = useState('');

  // Fuel log fields: list of fuel stops
  const [fuelStops, setFuelStops] = useState([
    { date: '', odometer: '', fuelVolume: '', fuelCost: '' },
    { date: '', odometer: '', fuelVolume: '', fuelCost: '' }
  ]);

  useEffect(() => {
    setRecommendation(null);
    const year = month?.year || 2026;
    const monthNum = month?.month || 1;
    const defaultDate = formatDate(year, monthNum, 1);

    if (initialItem) {
      setType(initialItem.type);
      setName(initialItem.name);
      setPriority(initialItem.priority ?? 0);
      if (initialItem.type === 'one-time') {
        setAmount((initialItem.amount / 100).toString());
        setDate(formatDate(year, monthNum, initialItem.day || 1));
      } else if (initialItem.type === 'recurring') {
        setAmount((initialItem.amount / 100).toString());
        setDayOfMonth(initialItem.dayOfMonth || 1);
      } else if (initialItem.type === 'fuel-log') {
        setFuelStops(
          initialItem.fuelStops?.map((s) => ({
            date: s.date || defaultDate,
            odometer: s.odometer?.toString() || '',
            fuelVolume: s.fuelVolume?.toString() || '',
            fuelCost: s.fuelCost ? (s.fuelCost / 100).toString() : ''
          })) || []
        );
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
      setDate(defaultDate);
      setDayOfMonth(1);
      setDistance('');
      setEfficiency('');
      setFuelPrice('');
      setExtraCost('');
      setDatesStr('');
      setFuelStops([
        { date: defaultDate, odometer: '', fuelVolume: '', fuelCost: '' },
        { date: defaultDate, odometer: '', fuelVolume: '', fuelCost: '' }
      ]);
    }
  }, [initialItem, isOpen, month]);

  if (!isOpen) return null;

  // Handle Recommendation calculation for One-Time Purchase
  const handleRecommendDate = () => {
    if (!amount || isNaN(Number(amount)) || !month) return;
    const minorAmount = Math.round(Number(amount) * 100);

    const rec = recommendPurchaseDate(
      monthSettings || {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0
      },
      existingItems.filter((i) => !initialItem || i._id !== initialItem._id),
      { year: month.year, month: month.month },
      minorAmount,
      existingTransactions
    );

    setRecommendation(rec);
  };

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

  // Live Formula Calculation
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
      const parsedDay = date ? parseInt(date.split('-')[2], 10) : 1;
      payload.day = parsedDay || 1;
    } else if (type === 'recurring') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
    } else if (type === 'fuel-log') {
      payload.fuelStops = parsedFuelStops;
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
          <h3>{initialItem ? 'Edit budget item' : 'Add budget item'}</h3>
          <button type="button" className="btn-subtle" onClick={onClose}>Close</button>
        </div>

        {/* Tab Selector */}
        {!initialItem && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {['one-time', 'recurring', 'fuel-log', 'formula'].map((t) => (
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

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Same-day priority (0 = high)</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>

            {type !== 'formula' && type !== 'fuel-log' && (
              <div className="form-group">
                <label className="form-label">Amount ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setRecommendation(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* One-Time Date Picker & Recommender */}
          {type === 'one-time' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label">Purchase date</label>
                <button
                  type="button"
                  className="btn-subtle"
                  style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--accent)' }}
                  onClick={handleRecommendDate}
                  disabled={!amount}
                >
                  ⚡ Recommend best date
                </button>
              </div>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {recommendation && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '10px',
                    borderRadius: 'var(--radius)',
                    background: recommendation.feasible ? 'var(--success-subtle)' : 'var(--danger-subtle)',
                    border: `1px solid ${recommendation.feasible ? 'var(--success-border)' : 'var(--danger-border)'}`,
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div>
                    <strong>Recommended:</strong> {formatDisplayDate(recommendation.recommendedDate)}
                  </div>
                  <div>
                    {recommendation.feasible
                      ? `Holding cash until this date maximizes savings with a safety buffer of ${formatCurrency(recommendation.savingsBuffer, currencySymbol)}.`
                      : `Floor breached on all dates. Scheduling on ${formatDisplayDate(recommendation.recommendedDate)} minimizes deficit.`}
                  </div>
                  {recommendation.recommendedDate && recommendation.recommendedDate !== date && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ marginTop: '4px', alignSelf: 'flex-start', padding: '4px 10px', fontSize: '11px' }}
                      onClick={() => setDate(recommendation.recommendedDate)}
                    >
                      Use {formatDisplayDate(recommendation.recommendedDate)}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Recurring Day */}
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

          {/* Formula item */}
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
                  <label className="form-label">Fuel efficiency (km/L)</label>
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
