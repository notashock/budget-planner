import React, { useState, useEffect } from 'react';

export function GoalsScreen({
  month,
  settings,
  onSaveMonthSettings,
  onSaveDefaults
}) {
  // Current month overrides
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCreditDay, setIncomeCreditDay] = useState(1);
  const [safetyFloor, setSafetyFloor] = useState('');
  const [unplannedAllowance, setUnplannedAllowance] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // Global default settings
  const [defaultIncome, setDefaultIncome] = useState('');
  const [defaultCreditDay, setDefaultCreditDay] = useState(1);
  const [defaultFloor, setDefaultFloor] = useState('');
  const [defaultAllowance, setDefaultAllowance] = useState('');

  const [monthSaved, setMonthSaved] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  useEffect(() => {
    if (month) {
      setIncomeAmount((month.incomeAmount / 100).toString());
      setIncomeCreditDay(month.incomeCreditDay || 1);
      setSafetyFloor((month.safetyFloor / 100).toString());
      setUnplannedAllowance(month.unplannedAllowance ? (month.unplannedAllowance / 100).toString() : '');
      setCurrencySymbol(month.currencySymbol || '$');
    }
  }, [month]);

  useEffect(() => {
    if (settings) {
      setDefaultIncome((settings.defaultIncomeAmount / 100).toString());
      setDefaultCreditDay(settings.defaultIncomeCreditDay || 1);
      setDefaultFloor((settings.defaultSafetyFloor / 100).toString());
      setDefaultAllowance(settings.defaultUnplannedAllowance ? (settings.defaultUnplannedAllowance / 100).toString() : '');
    }
  }, [settings]);

  const handleSaveMonth = (e) => {
    e.preventDefault();
    onSaveMonthSettings({
      incomeAmount: Math.round(Number(incomeAmount || 0) * 100),
      incomeCreditDay: Number(incomeCreditDay) || 1,
      safetyFloor: Math.round(Number(safetyFloor || 0) * 100),
      unplannedAllowance: Math.round(Number(unplannedAllowance || 0) * 100),
      currencySymbol: currencySymbol.trim() || '$'
    });
    setMonthSaved(true);
    setTimeout(() => setMonthSaved(false), 2500);
  };

  const handleSaveDefaults = (e) => {
    e.preventDefault();
    onSaveDefaults({
      defaultIncomeAmount: Math.round(Number(defaultIncome || 0) * 100),
      defaultIncomeCreditDay: Number(defaultCreditDay) || 1,
      defaultSafetyFloor: Math.round(Number(defaultFloor || 0) * 100),
      defaultUnplannedAllowance: Math.round(Number(defaultAllowance || 0) * 100),
      currencySymbol: currencySymbol.trim() || '$'
    });
    setDefaultsSaved(true);
    setTimeout(() => setDefaultsSaved(false), 2500);
  };

  return (
    <div className="screen-content">
      <h2>Goals & settings</h2>

      {/* Month Specific Overrides */}
      {month && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Current month settings ({month.month}/{month.year})</span>
          </div>

          <form onSubmit={handleSaveMonth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Monthly income ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Income credit day (1 - 31)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={incomeCreditDay}
                  onChange={(e) => setIncomeCreditDay(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Safety floor threshold ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={safetyFloor}
                  onChange={(e) => setSafetyFloor(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Monthly unplanned allowance ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1000"
                  value={unplannedAllowance}
                  onChange={(e) => setUnplannedAllowance(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Currency symbol</label>
              <input
                type="text"
                maxLength="5"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--success)' }}>
                {monthSaved ? 'Month settings updated.' : ''}
              </span>
              <button type="submit" className="btn-primary">
                Save month settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Global User Defaults */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Default profile settings</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          These defaults are automatically pre-filled when creating new budget months.
        </p>

        <form onSubmit={handleSaveDefaults} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Default income</label>
              <input
                type="number"
                step="0.01"
                value={defaultIncome}
                onChange={(e) => setDefaultIncome(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default credit day</label>
              <input
                type="number"
                min="1"
                max="31"
                value={defaultCreditDay}
                onChange={(e) => setDefaultCreditDay(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Default safety floor</label>
              <input
                type="number"
                step="0.01"
                value={defaultFloor}
                onChange={(e) => setDefaultFloor(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default unplanned allowance</label>
              <input
                type="number"
                step="0.01"
                value={defaultAllowance}
                onChange={(e) => setDefaultAllowance(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--success)' }}>
              {defaultsSaved ? 'Defaults saved.' : ''}
            </span>
            <button type="submit" className="btn-primary">
              Save profile defaults
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
