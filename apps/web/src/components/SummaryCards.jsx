import React from 'react';
import { formatCurrency } from '@budget/engine';

export function SummaryCards({
  incomeAmount = 0,
  incomeCreditDay = 1,
  openingBalance = 0,
  events = [],
  endingBalance = 0,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  currencySymbol = '$'
}) {
  // Sum expenses
  const totalOutflow = events
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const floorBreached = lowestBalance < safetyFloor;

  return (
    <div className="summary-grid">
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
        <span className="summary-label">Ending balance</span>
        <span className="summary-value">
          {formatCurrency(endingBalance, currencySymbol)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Starting: {formatCurrency(openingBalance, currencySymbol)}
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
          Occurs on {lowestDate || 'N/A'}
        </span>
      </div>
    </div>
  );
}
