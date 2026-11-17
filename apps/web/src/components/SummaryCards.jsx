import React from 'react';
import {
  formatCurrency,
  formatDisplayDate,
  getNetPosition,
  splitPaidAndPlanned,
  getHeadroom
} from '@budget/engine';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  WalletIcon,
  ShieldAlertIcon
} from './Icons.jsx';

const formatPercent = (ratio) => `${Math.round(ratio * 100)}%`;

/**
 * KPI strip for the month, built around net position:
 * Income · Expenses (paid vs still planned) · Net & savings rate · Lowest point
 * (with headroom against the safety floor). Today's balance lives in the
 * Month Health hero, so it is not repeated here.
 */
export function DetailedKpiGrid({
  incomeAmount = 0,
  incomeCreditDay = 1,
  events = [],
  totalExpenses,
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

  const { paid, planned } = splitPaidAndPlanned(events);
  const totalOutflow = totalExpenses !== undefined && totalExpenses !== null
    ? totalExpenses
    : paid + planned;

  const { net, savingsRate } = getNetPosition(incomeAmount, totalOutflow);
  const headroom = getHeadroom(lowestBalance, safetyFloor);
  const floorBreached = headroom.status === 'breached';

  return (
    <div className="detailed-kpi-grid summary-grid">
      <div className="summary-card kpi-card">
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className="kpi-icon-badge kpi-income" aria-hidden="true">
              <TrendingUpIcon size={13} strokeWidth={2.4} />
            </span>
            <span className="summary-label">Monthly income</span>
          </div>
          {canEditSalary && isCreditEffective && (
            <span className="pace-status-badge on-pace" style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
              ✓ Credited
            </span>
          )}
        </div>

        <span className="summary-value">
          {formatCurrency(incomeAmount, currencySymbol)}
        </span>

        <span className="kpi-subtext">
          {canEditSalary && isCreditEffective
            ? `Credited on ${salaryCreditedDate ? formatDisplayDate(salaryCreditedDate, true) : `day ${incomeCreditDay}`}`
            : `Credited on day ${incomeCreditDay}`}
        </span>
      </div>

      <div className="summary-card kpi-card">
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className="kpi-icon-badge kpi-expense" aria-hidden="true">
              <TrendingDownIcon size={13} strokeWidth={2.4} />
            </span>
            <span className="summary-label">Total expenses</span>
          </div>
        </div>
        <span className="summary-value">
          {formatCurrency(totalOutflow, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          {paid + planned > 0
            ? <>{formatCurrency(paid, currencySymbol)} paid · {formatCurrency(planned, currencySymbol)} planned</>
            : 'Nothing planned yet'}
        </span>
      </div>

      <div className={`summary-card kpi-card ${net < 0 ? 'kpi-card-negative' : ''}`}>
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className={`kpi-icon-badge ${net < 0 ? 'kpi-expense' : 'kpi-balance'}`} aria-hidden="true">
              <WalletIcon size={13} strokeWidth={2.2} />
            </span>
            <span className="summary-label">Net this month</span>
          </div>
        </div>
        <span className={`summary-value ${net < 0 ? 'text-breached' : 'text-net-positive'}`}>
          {net > 0 ? '+' : ''}{formatCurrency(net, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          {savingsRate === null
            ? 'No income recorded'
            : net >= 0
              ? `${formatPercent(savingsRate)} of income saved`
              : `Spending ${formatPercent(Math.abs(savingsRate))} more than income`}
        </span>
      </div>

      <div className={`summary-card kpi-card ${floorBreached ? 'kpi-card-breached' : ''}`}>
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className={`kpi-icon-badge ${floorBreached ? 'kpi-breach' : 'kpi-lowest'}`} aria-hidden="true">
              <ShieldAlertIcon size={13} strokeWidth={2.2} />
            </span>
            <span className="summary-label">Lowest balance</span>
          </div>
          {floorBreached && (
            <span className="kpi-breach-badge">
              ▲ Below floor
            </span>
          )}
        </div>
        <span className={`summary-value ${floorBreached ? 'text-breached' : ''}`}>
          {formatCurrency(lowestBalance, currencySymbol)}
        </span>
        <span className="kpi-subtext">
          {lowestDate ? formatDisplayDate(lowestDate, true) : 'No date'}
          {safetyFloor > 0 && (
            <>
              {' · '}
              {formatCurrency(Math.abs(headroom.amount), currencySymbol)} {floorBreached ? 'under' : 'above'} floor
            </>
          )}
        </span>
      </div>
    </div>
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
