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
    <div className="summary-card safe-velocity-card">
      <div className="card-top-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="summary-label">
            Dynamic Safe Velocity
          </span>
          {safeVelocity?.paceStatus && (
            <span className="pace-status-badge">
              {safeVelocity.paceStatus}
            </span>
          )}
        </div>
        <span className="days-remaining-pill">
          {safeVelocity?.daysLeft || daysLeft} days left
        </span>
      </div>

      <div className="safe-velocity-hero">
        <span className="safe-velocity-value tabular-nums">
          {formatCurrency(safeVelocity?.safeVelocityPerDay ?? safeToSpendPerDay, currencySymbol)}
        </span>
        <span className="safe-velocity-per-day">/ day</span>
      </div>

      <div className="safe-velocity-footer">
        <span className="safe-velocity-meta-item">
          Committed bills: <strong className="tabular-nums">{formatCurrency(safeVelocity?.committedUpcomingItems || 0, currencySymbol)}</strong>
        </span>
        {safeVelocity?.burnRatePerDay > 0 && (
          <span className="safe-velocity-meta-item">
            Burn pace: <strong className="tabular-nums">{formatCurrency(safeVelocity.burnRatePerDay, currencySymbol)}/day</strong>
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
      <div className="summary-card kpi-card">
        <span className="summary-label">Monthly income</span>
        <span className="summary-value tabular-nums">
          {formatCurrency(incomeAmount, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          Credited on day {incomeCreditDay}
        </span>
      </div>

      <div className="summary-card kpi-card">
        <span className="summary-label">Total expenses</span>
        <span className="summary-value tabular-nums">
          {formatCurrency(totalOutflow, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          Across {events.filter((e) => e.amount < 0).length} occurrences
        </span>
      </div>

      <div className="summary-card kpi-card">
        <span className="summary-label">Today's balance</span>
        <span className="summary-value tabular-nums">
          {formatCurrency(todayBalance !== undefined ? todayBalance : endingBalance, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          Month-end: <span className="tabular-nums">{formatCurrency(endingBalance, currencySymbol)}</span>
        </span>
      </div>

      <div className={`summary-card kpi-card ${floorBreached ? 'kpi-card-breached' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="summary-label">Lowest balance</span>
          {floorBreached && (
            <span className="kpi-breach-badge">
              ▲ BREACH
            </span>
          )}
        </div>
        <span className={`summary-value tabular-nums ${floorBreached ? 'text-breached' : ''}`}>
          {formatCurrency(lowestBalance, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          On {lowestDate ? formatDisplayDate(lowestDate, true) : 'N/A'}
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
