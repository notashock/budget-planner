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
            Safe Velocity
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
          Committed: <strong className="tabular-nums">{formatCurrency(safeVelocity?.committedUpcomingItems || 0, currencySymbol)}</strong>
        </span>
        {(safeVelocity?.burnRatePerDay !== undefined || safeVelocity?.burnRate !== undefined) && (
          <span className="safe-velocity-meta-item">
            Burn pace: <strong className="tabular-nums">{formatCurrency(safeVelocity.burnRatePerDay ?? safeVelocity.burnRate ?? 0, currencySymbol)}/day</strong>
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
  totalExpenses,
  endingBalance = 0,
  todayBalance,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  currencySymbol = '₹',
  isSalaryCredited = false,
  salaryCreditedDate = null,
  month = null,
  canEditSalary = false
}) {
  const isCreditEffective = isSalaryCredited || Boolean(
    salaryCreditedDate && month && salaryCreditedDate < `${month.year}-${String(month.month).padStart(2, '0')}-01`
  );

  const expenseEvents = events.filter((e) => e.amount < 0 && e.itemType !== 'transfer');
  const totalOutflow = totalExpenses !== undefined
    ? totalExpenses
    : expenseEvents.reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const floorBreached = lowestBalance < safetyFloor;

  return (
    <div className="detailed-kpi-grid summary-grid">
      <div className="summary-card kpi-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="summary-label">Monthly income</span>
          {canEditSalary && isCreditEffective && (
            <span className="pace-status-badge" style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
              ✓ Credited
            </span>
          )}
        </div>

        <span className="summary-value tabular-nums">
          {formatCurrency(incomeAmount, currencySymbol)}
        </span>

        <span className="kpi-subtext">
          {canEditSalary && isCreditEffective
            ? `Credited on ${salaryCreditedDate ? formatDisplayDate(salaryCreditedDate, true) : `day ${incomeCreditDay}`}`
            : `Credited on day ${incomeCreditDay}`}
        </span>
      </div>

      <div className="summary-card kpi-card">
        <span className="summary-label">Total expenses</span>
        <span className="summary-value tabular-nums">
          {formatCurrency(totalOutflow, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          {events.filter((e) => e.amount < 0).length} occurrences
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

export function IrregularHeroCards({ metrics = {}, currencySymbol = '₹' }) {
  const {
    runwayDisplay = 'Indefinite',
    isIndefinite = true,
    smoothedMonthlyIncome = 0,
    trailing12mIncome = 0,
    currentBalance = 0,
    avgMonthlySpending = 0,
    trailing12mSpending = 0
  } = metrics || {};

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4">
      {/* Runway Card */}
      <div className="summary-card safe-velocity-card p-4 rounded-xl border border-zinc-800 bg-zinc-950">
        <span className="summary-label text-xs uppercase tracking-wider text-zinc-400 font-mono">
          Emergency Runway
        </span>
        <div className="safe-velocity-hero my-2">
          <span className="safe-velocity-value tabular-nums text-2xl font-bold text-white">
            {runwayDisplay}
          </span>
        </div>
        <div className="safe-velocity-footer text-xs text-zinc-400">
          {isIndefinite ? 'Zero expenses recorded' : 'Current Balance / Avg Monthly Burn'}
        </div>
      </div>

      {/* Smoothed Monthly Income Card */}
      <div className="summary-card kpi-card p-4 rounded-xl border border-zinc-800 bg-zinc-950">
        <span className="summary-label text-xs uppercase tracking-wider text-zinc-400 font-mono">
          Smoothed Income
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold text-emerald-400">
            {formatCurrency(smoothedMonthlyIncome, currencySymbol)}
          </span>
          <span className="text-xs text-zinc-400 ml-1">/ mo</span>
        </div>
        <div className="kpi-subtext text-xs text-zinc-400">
          T12M: <strong className="text-zinc-200 tabular-nums">{formatCurrency(trailing12mIncome, currencySymbol)}</strong>
        </div>
      </div>

      {/* Current Total Balance Card */}
      <div className="summary-card kpi-card p-4 rounded-xl border border-zinc-800 bg-zinc-950">
        <span className="summary-label text-xs uppercase tracking-wider text-zinc-400 font-mono">
          Total Liquid Balance
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold text-white">
            {formatCurrency(currentBalance, currencySymbol)}
          </span>
        </div>
        <div className="kpi-subtext text-xs text-zinc-400">
          Across all accounts
        </div>
      </div>

      {/* Average Monthly Spending Card */}
      <div className="summary-card kpi-card p-4 rounded-xl border border-zinc-800 bg-zinc-950">
        <span className="summary-label text-xs uppercase tracking-wider text-zinc-400 font-mono">
          Avg Monthly Spending
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold text-zinc-200">
            {formatCurrency(avgMonthlySpending, currencySymbol)}
          </span>
          <span className="text-xs text-zinc-400 ml-1">/ mo</span>
        </div>
        <div className="kpi-subtext text-xs text-zinc-400">
          T12M: <strong className="text-zinc-200 tabular-nums">{formatCurrency(trailing12mSpending, currencySymbol)}</strong>
        </div>
      </div>
    </div>
  );
}

export function QuarterlyBreakdownTable({ quarters = [], currencySymbol = '₹' }) {
  if (!quarters || quarters.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-zinc-800 bg-zinc-950/60 text-zinc-400">
        <p className="text-sm">No quarterly transaction history found yet.</p>
        <p className="text-xs text-zinc-400 mt-1">Transactions you log will be automatically aggregated by quarter and year.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-zinc-400 uppercase">
            <th className="py-3 px-4">Period</th>
            <th className="py-3 px-4">Income</th>
            <th className="py-3 px-4">Spending</th>
            <th className="py-3 px-4">Net Savings</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {quarters.map((q) => (
            <tr key={q.key} className="hover:bg-zinc-900/40 transition-colors">
              <td className="py-3 px-4 font-semibold text-white font-mono">{q.key}</td>
              <td className="py-3 px-4 tabular-nums text-emerald-400">+{formatCurrency(q.income, currencySymbol)}</td>
              <td className="py-3 px-4 tabular-nums text-zinc-300">-{formatCurrency(q.spending, currencySymbol)}</td>
              <td className={`py-3 px-4 tabular-nums font-semibold ${q.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {q.net >= 0 ? '+' : ''}{formatCurrency(q.net, currencySymbol)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
