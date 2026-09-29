import React, { useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function CreateMonthModal({ isOpen, onClose, onCreate, settings }) {
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [openingBalance, setOpeningBalance] = useState('');
  const [incomeAmount, setIncomeAmount] = useState(
    settings?.defaultIncomeAmount ? (settings.defaultIncomeAmount / 100).toString() : ''
  );
  const [safetyFloor, setSafetyFloor] = useState(
    settings?.defaultSafetyFloor ? (settings.defaultSafetyFloor / 100).toString() : ''
  );

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      year: Number(year),
      month: Number(month),
      openingBalance: openingBalance ? Math.round(Number(openingBalance) * 100) : 0,
      incomeAmount: incomeAmount ? Math.round(Number(incomeAmount) * 100) : undefined,
      safetyFloor: safetyFloor ? Math.round(Number(safetyFloor) * 100) : undefined
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Create budget month</h3>
          <button type="button" className="btn-subtle" onClick={onClose}>Close</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Year</label>
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Opening balance ({settings?.currencySymbol || '$'})</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Income ({settings?.currencySymbol || '$'})</label>
              <input
                type="number"
                step="0.01"
                placeholder="Default from settings"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Safety floor ({settings?.currencySymbol || '$'})</label>
              <input
                type="number"
                step="0.01"
                placeholder="Default from settings"
                value={safetyFloor}
                onChange={(e) => setSafetyFloor(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create month</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RolloverModal({
  isOpen,
  onClose,
  onConfirm,
  currentMonth,
  endingBalance = 0,
  currencySymbol = '$'
}) {
  const [carryBalance, setCarryBalance] = useState(true);

  if (!isOpen || !currentMonth) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Month rollover</h3>
          <button type="button" className="btn-subtle" onClick={onClose}>Close</button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Rollover copies all recurring bills into the next calendar month so you don't have to re-enter them.
        </p>

        <div style={{ padding: '12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={carryBalance}
              onChange={(e) => setCarryBalance(e.target.checked)}
            />
            <span style={{ fontSize: '13px' }}>
              Carry ending balance forward as opening balance ({currencySymbol}{(endingBalance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })})
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(carryBalance)}
          >
            Confirm rollover
          </button>
        </div>
      </div>
    </div>
  );
}
