import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function SafeVelocityCard({
  safeVelocity = null,
  daysLeft = 1,
  safeToSpendPerDay = 0,
  allowanceLeft = 0,
  currencySymbol = '₹'
}) {
  return (
    <div
      className="summary-card safe-velocity-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="summary-label" style={{ fontWeight: 600, color: 'var(--text)' }}>
            Dynamic Safe Velocity
          </span>
          {safeVelocity?.paceStatus && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'var(--surface-subtle)',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: '0.04em'
              }}
            >
              {safeVelocity.paceStatus}
            </span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {safeVelocity?.daysLeft || daysLeft} days remaining
        </span>
      </div>

      <div className="safe-velocity-hero" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <span className="summary-value safe-velocity-value">
          {formatCurrency(safeVelocity?.safeVelocityPerDay ?? safeToSpendPerDay, currencySymbol)}
          <span className="safe-velocity-per-day"> / day</span>
        </span>
      </div>

      <div className="safe-velocity-footer">
        <span>
          Upcoming bills: {formatCurrency(safeVelocity?.committedUpcomingItems || 0, currencySymbol)}
        </span>
        {safeVelocity?.burnRatePerDay > 0 && (
          <span>
            Burn pace: {formatCurrency(safeVelocity.burnRatePerDay, currencySymbol)}/day
          </span>
        )}
      </div>
    </div>
  );
}

export function DetailedKpiGrid({
  incomeAmount = 0,
  incomeCreditDay = 1,
  events = [],
  endingBalance = 0,
  todayBalance,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  currencySymbol = '₹'
}) {
  const totalOutflow = events
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const floorBreached = lowestBalance < safetyFloor;

  return (
    <div className="detailed-kpi-grid summary-grid">
      <div className="summary-card">
        <span className="summary-label">Monthly income</span>
        <span className="summary-value">
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

export function SummaryCards(props) {
  return (
    <>
      <SafeVelocityCard {...props} />
      <DetailedKpiGrid {...props} />
    </>
  );
}
