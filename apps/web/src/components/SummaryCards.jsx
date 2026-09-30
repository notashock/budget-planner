import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function SummaryCards({
  incomeAmount = 0,
  incomeCreditDay = 1,
  openingBalance = 0,
  events = [],
  endingBalance = 0,
  todayBalance,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  unplannedAllowance = 0,
  allowanceLeft = 0,
  daysLeft = 1,
  safeToSpendPerDay = 0,
  currencySymbol = '₹'
}) {
  const totalOutflow = events
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const floorBreached = lowestBalance < safetyFloor;

  return (
    <div className="summary-grid">
      {/* Safe to spend per day */}
      {unplannedAllowance > 0 && (
        <div className="summary-card summary-card-full" style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="summary-label" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Safe to spend per day
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {daysLeft} days left in month
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span className="summary-value" style={{ color: 'var(--accent)' }}>
              {formatCurrency(safeToSpendPerDay, currencySymbol)}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              ({formatCurrency(allowanceLeft, currencySymbol)} allowance remaining)
            </span>
          </div>
        </div>
      )}

      <div className="summary-card">
        <span className="summary-label">Monthly income</span>
        <span className="summary-value" style={{ color: 'var(--success)' }}>
          {formatCurrency(incomeAmount, currencySymbol)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Credited on day {incomeCreditDay}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">Total expenses</span>
        <span className="summary-value">
          {formatCurrency(totalOutflow, currencySymbol)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Across {events.filter((e) => e.amount < 0).length} occurrences
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">Today's balance</span>
        <span className="summary-value">
          {formatCurrency(todayBalance !== undefined ? todayBalance : endingBalance, currencySymbol)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Month-end projected: {formatCurrency(endingBalance, currencySymbol)}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">Lowest balance</span>
        <span
          className="summary-value"
          style={{ color: floorBreached ? 'var(--danger)' : 'var(--text)' }}
        >
          {formatCurrency(lowestBalance, currencySymbol)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Occurs on {lowestDate ? formatDisplayDate(lowestDate, true) : 'N/A'}
        </span>
      </div>
    </div>
  );
}
