import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  WalletIcon,
  ShieldAlertIcon
} from './Icons.jsx';

export function SafeVelocityCard({
  safeVelocity = null,
  daysLeft = 1,
  safeToSpendPerDay = 0,
  allowanceLeft = 0,
  currencySymbol = '₹'
}) {
  const [showInfo, setShowInfo] = useState(false);
  const popoverRef = useRef(null);

  // Mutual collapse & outside click listener for popover explanation
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowInfo(false);
      }
    }
    if (showInfo) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showInfo]);

  const rawPace = (safeVelocity?.paceStatus || '').toLowerCase();
  const rate = safeVelocity?.safeVelocityPerDay ?? safeToSpendPerDay;

  // Calibrate glowing status micro-indicators: expanding, tight, critical, stable
  let statusKey = 'stable';
  let statusLabel = safeVelocity?.paceStatus || 'On Pace';
  if (rawPace.includes('expand')) {
    statusKey = 'expanding';
    statusLabel = 'Expanding Pace';
  } else if (rawPace.includes('tight') || rawPace.includes('contract') || rawPace.includes('warn') || rawPace.includes('slow')) {
    statusKey = 'tight';
    statusLabel = 'Pacing Tight';
  } else if (rawPace.includes('crit') || rate <= 0) {
    statusKey = 'critical';
    statusLabel = 'Critical Deficit';
  }

  const remainingDays = safeVelocity?.daysLeft || daysLeft;
  const committed = safeVelocity?.committedUpcomingItems ?? safeVelocity?.committedBills ?? 0;
  const burn = safeVelocity?.burnRatePerDay ?? safeVelocity?.burnRate ?? 0;

  return (
    <div className="summary-card safe-velocity-card apple-hero-card">
      <div className="card-top-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="summary-label apple-hero-label">
            Safe Velocity
          </span>
          <div
            className={`pace-status-badge velocity-status-indicator apple-status-capsule ${statusKey}`}
            title={`Status: ${statusLabel}`}
          >
            <span className={`status-micro-dot ${statusKey}`} />
            <span>{statusLabel}</span>
          </div>
          <button
            type="button"
            className="velocity-info-btn apple-info-trigger"
            onClick={() => setShowInfo((prev) => !prev)}
            aria-label="Safe Velocity Explanation"
            title="What is Safe Velocity? Click for breakdown"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>
        <span className="days-remaining-pill apple-hero-days">
          {remainingDays} days left
        </span>
      </div>

      {/* Interactive Glassmorphism Explanation Popover */}
      {showInfo && (
        <div ref={popoverRef} className="velocity-popover apple-glass-popover">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Safe Velocity Mechanics
            </span>
            <button
              type="button"
              className="btn-subtle"
              style={{ padding: '0 4px', fontSize: '13px', lineHeight: 1 }}
              onClick={() => setShowInfo(false)}
            >
              &times;
            </button>
          </div>
          <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.45 }}>
            Safe Velocity calculates the exact discretionary cash allowance you can spend each day without breaching your Safety Floor or jeopardizing committed upcoming bills.
          </p>
          <div style={{ background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Formula:</span>
              <span style={{ fontWeight: 600 }}>Uncommitted Surplus ÷ Days Remaining</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Committed Upcoming Items:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatCurrency(committed, currencySymbol)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Days Remaining:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>{remainingDays} days</span>
            </div>
          </div>
        </div>
      )}

      <div className="safe-velocity-hero apple-velocity-hero">
        <span className="safe-velocity-value apple-hero-number tabular-nums">
          {formatCurrency(rate, currencySymbol)}
        </span>
        <span className="safe-velocity-per-day apple-hero-unit">/ day</span>
      </div>

      <div className="safe-velocity-footer apple-hero-footer">
        <span className="safe-velocity-meta-item">
          Committed: <strong className="tabular-nums">{formatCurrency(committed, currencySymbol)}</strong>
        </span>
        {(safeVelocity?.burnRatePerDay !== undefined || safeVelocity?.burnRate !== undefined) && (
          <span className="safe-velocity-meta-item">
            Burn pace: <strong className="tabular-nums">{formatCurrency(burn, currencySymbol)}/day</strong>
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
    <div className="detailed-kpi-grid summary-grid apple-bento-grid">
      <div className="summary-card kpi-card apple-bento-card">
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className="kpi-icon-badge apple-kpi-icon-box kpi-income" aria-hidden="true">
              <TrendingUpIcon size={14} strokeWidth={2.4} />
            </span>
            <span className="summary-label apple-kpi-label">Monthly income</span>
          </div>
          {canEditSalary && isCreditEffective && (
            <span className="pace-status-badge on-pace apple-chip" style={{ fontSize: '10px', height: '20px', padding: '0 6px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
              ✓ Credited
            </span>
          )}
        </div>

        <span className="summary-value apple-bento-value tabular-nums">
          {formatCurrency(incomeAmount, currencySymbol)}
        </span>

        <span className="kpi-subtext apple-bento-subtext">
          {canEditSalary && isCreditEffective
            ? `Credited on ${salaryCreditedDate ? formatDisplayDate(salaryCreditedDate, true) : `day ${incomeCreditDay}`}`
            : `Credited on day ${incomeCreditDay}`}
        </span>
      </div>

      <div className="summary-card kpi-card apple-bento-card">
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className="kpi-icon-badge apple-kpi-icon-box kpi-expense" aria-hidden="true">
              <TrendingDownIcon size={14} strokeWidth={2.4} />
            </span>
            <span className="summary-label apple-kpi-label">Total expenses</span>
          </div>
        </div>
        <span className="summary-value apple-bento-value tabular-nums">
          {formatCurrency(totalOutflow, currencySymbol)}
        </span>
        <span className="kpi-subtext apple-bento-subtext">
          {events.filter((e) => e.amount < 0).length} occurrences
        </span>
      </div>

      <div className="summary-card kpi-card apple-bento-card">
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className="kpi-icon-badge apple-kpi-icon-box kpi-balance" aria-hidden="true">
              <WalletIcon size={14} strokeWidth={2.2} />
            </span>
            <span className="summary-label apple-kpi-label">Today's balance</span>
          </div>
        </div>
        <span className="summary-value apple-bento-value tabular-nums">
          {formatCurrency(todayBalance !== undefined ? todayBalance : endingBalance, currencySymbol)}
        </span>
        <span className="kpi-subtext apple-bento-subtext">
          Month-end: <span className="tabular-nums">{formatCurrency(endingBalance, currencySymbol)}</span>
        </span>
      </div>

      <div className={`summary-card kpi-card apple-bento-card ${floorBreached ? 'kpi-card-breached' : ''}`}>
        <div className="kpi-card-header">
          <div className="kpi-title-with-icon">
            <span className={`kpi-icon-badge apple-kpi-icon-box ${floorBreached ? 'kpi-breach' : 'kpi-lowest'}`} aria-hidden="true">
              <ShieldAlertIcon size={14} strokeWidth={2.2} />
            </span>
            <span className="summary-label apple-kpi-label">Lowest balance</span>
          </div>
          {floorBreached && (
            <span className="kpi-breach-badge apple-chip breached" style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}>
              ▲ BREACH
            </span>
          )}
        </div>
        <span className={`summary-value apple-bento-value tabular-nums ${floorBreached ? 'text-breached' : ''}`}>
          {formatCurrency(lowestBalance, currencySymbol)}
        </span>
        <span className="kpi-subtext apple-bento-subtext">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-3">
      {/* Runway Card */}
      <div className="summary-card safe-velocity-card apple-bento-card p-4 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <span className="summary-label text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--text-secondary)' }}>
          Emergency Runway
        </span>
        <div className="safe-velocity-hero my-2">
          <span className="safe-velocity-value tabular-nums text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {runwayDisplay}
          </span>
        </div>
        <div className="safe-velocity-footer text-xs" style={{ color: 'var(--text-muted)' }}>
          {isIndefinite ? 'Zero expenses recorded' : 'Current Balance / Avg Monthly Burn'}
        </div>
      </div>

      {/* Smoothed Monthly Income Card */}
      <div className="summary-card kpi-card apple-bento-card p-4 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <span className="summary-label text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--text-secondary)' }}>
          Smoothed Income
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold" style={{ color: 'var(--success, #10b981)' }}>
            {formatCurrency(smoothedMonthlyIncome, currencySymbol)}
          </span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>/ mo</span>
        </div>
        <div className="kpi-subtext text-xs" style={{ color: 'var(--text-muted)' }}>
          T12M: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(trailing12mIncome, currencySymbol)}</strong>
        </div>
      </div>

      {/* Current Total Balance Card */}
      <div className="summary-card kpi-card apple-bento-card p-4 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <span className="summary-label text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--text-secondary)' }}>
          Total Liquid Balance
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {formatCurrency(currentBalance, currencySymbol)}
          </span>
        </div>
        <div className="kpi-subtext text-xs" style={{ color: 'var(--text-muted)' }}>
          Across all accounts
        </div>
      </div>

      {/* Average Monthly Spending Card */}
      <div className="summary-card kpi-card apple-bento-card p-4 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <span className="summary-label text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--text-secondary)' }}>
          Avg Monthly Spending
        </span>
        <div className="my-2">
          <span className="summary-value tabular-nums text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {formatCurrency(avgMonthlySpending, currencySymbol)}
          </span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>/ mo</span>
        </div>
        <div className="kpi-subtext text-xs" style={{ color: 'var(--text-muted)' }}>
          T12M: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(trailing12mSpending, currencySymbol)}</strong>
        </div>
      </div>
    </div>
  );
}

export function QuarterlyBreakdownTable({ quarters = [], currencySymbol = '₹' }) {
  if (!quarters || quarters.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-sm">No quarterly transaction history found yet.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Transactions you log will be automatically aggregated by quarter and year.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b font-mono uppercase" style={{ background: 'var(--surface-subtle)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <th className="py-3 px-4">Period</th>
            <th className="py-3 px-4">Income</th>
            <th className="py-3 px-4">Spending</th>
            <th className="py-3 px-4">Net Savings</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {quarters.map((q) => (
            <tr key={q.key} className="transition-colors hover:bg-[var(--surface-hover)]">
              <td className="py-3 px-4 font-semibold font-mono" style={{ color: 'var(--text)' }}>{q.key}</td>
              <td className="py-3 px-4 tabular-nums" style={{ color: 'var(--success, #10b981)' }}>+{formatCurrency(q.income, currencySymbol)}</td>
              <td className="py-3 px-4 tabular-nums" style={{ color: 'var(--text-secondary)' }}>-{formatCurrency(q.spending, currencySymbol)}</td>
              <td className={`py-3 px-4 tabular-nums font-semibold ${q.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {q.net >= 0 ? '+' : ''}{formatCurrency(q.net, currencySymbol)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
