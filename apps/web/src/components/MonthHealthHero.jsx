import React from 'react';
import { formatCurrency, formatDisplayDate, getHeadroom } from '@budget/engine';
import { CheckCircleIcon, AlertTriangleIcon, ShieldAlertIcon } from './Icons.jsx';
import { CashAllocationBar } from './CashAllocationBar.jsx';

/**
 * Decides the month's one-line verdict from the projected low point.
 * - critical: the balance is projected to dip below the safety floor
 * - tight:    within 15% of the floor, or spending faster than the safe pace
 * - good:     otherwise
 */
export function getMonthVerdict({ lowestBalance = 0, safetyFloor = 0, paceStatus = '', safeRate = 0 }) {
  const headroom = getHeadroom(lowestBalance, safetyFloor);
  const pace = String(paceStatus || '').toLowerCase();
  if (headroom.status === 'breached') return { key: 'critical', label: 'Below floor', headroom };
  if (headroom.status === 'warning' || pace.includes('contract') || pace.includes('crit') || safeRate <= 0) {
    return { key: 'tight', label: 'Tight month', headroom };
  }
  return { key: 'good', label: 'On track', headroom };
}

const VERDICT_ICON = {
  good: CheckCircleIcon,
  tight: AlertTriangleIcon,
  critical: ShieldAlertIcon
};

export function MonthHealthHero({
  safeVelocity = null,
  safeToSpendPerDay = 0,
  daysLeft = 1,
  todayBalance = 0,
  endingBalance = 0,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  currencySymbol = '₹'
}) {
  const rate = safeVelocity?.safeVelocityPerDay ?? safeVelocity?.rate ?? safeToSpendPerDay ?? 0;
  const remainingDays = safeVelocity?.daysLeft || daysLeft || 1;
  const committed = safeVelocity?.committedUpcomingItems ?? safeVelocity?.committedBills ?? 0;
  const burn = safeVelocity?.burnRatePerDay ?? safeVelocity?.burnRate ?? 0;
  const paceStatus = safeVelocity?.paceStatus || safeVelocity?.status || '';

  const verdict = getMonthVerdict({ lowestBalance, safetyFloor, paceStatus, safeRate: rate });
  const VerdictIcon = VERDICT_ICON[verdict.key];
  const lowDateLabel = lowestDate ? formatDisplayDate(lowestDate, true) : null;
  const gap = Math.abs(verdict.headroom.amount);

  let verdictLine;
  if (verdict.key === 'critical') {
    verdictLine = (
      <>
        Balance drops to <strong className="tabular-nums">{formatCurrency(lowestBalance, currencySymbol)}</strong>
        {lowDateLabel ? <> on {lowDateLabel}</> : null}, {' '}
        <strong className="tabular-nums">{formatCurrency(gap, currencySymbol)}</strong> under your safety floor.
      </>
    );
  } else if (endingBalance === lowestBalance) {
    verdictLine = (
      <>
        Ends the month at its lowest point, <strong className="tabular-nums">{formatCurrency(endingBalance, currencySymbol)}</strong>,{' '}
        {formatCurrency(gap, currencySymbol)} above floor.
      </>
    );
  } else {
    verdictLine = (
      <>
        Month-end <strong className="tabular-nums">{formatCurrency(endingBalance, currencySymbol)}</strong>
        {' · '}lowest point <strong className="tabular-nums">{formatCurrency(lowestBalance, currencySymbol)}</strong>
        {lowDateLabel ? <> on {lowDateLabel}</> : null}, {' '}
        {formatCurrency(gap, currencySymbol)} above floor.
      </>
    );
  }

  return (
    <section className={`summary-card month-health-hero verdict-${verdict.key}`} aria-label="Month health">
      <div className="mh-top">
        <span className={`mh-verdict verdict-${verdict.key}`}>
          <VerdictIcon size={13} />
          <span>{verdict.label}</span>
        </span>
        <span className="days-remaining-pill">{remainingDays} days left</span>
      </div>

      <div className="mh-figure">
        <span className="mh-label">Safe to spend</span>
        <div className="mh-value-row">
          <span className="mh-value">{formatCurrency(rate, currencySymbol)}</span>
          <span className="mh-unit">/ day</span>
        </div>
        <p className="mh-explain">
          After {formatCurrency(committed, currencySymbol)} of upcoming bills and your{' '}
          {formatCurrency(safetyFloor, currencySymbol)} safety floor, spread over {remainingDays} days.
          {burn > 0 && (
            <> You have averaged <span className="tabular-nums">{formatCurrency(burn, currencySymbol)}</span>/day so far.</>
          )}
        </p>
      </div>

      <p className={`mh-verdict-line verdict-${verdict.key}`}>{verdictLine}</p>

      <CashAllocationBar
        todayBalance={todayBalance}
        committedUpcomingItems={committed}
        safetyFloor={safetyFloor}
        freeSurplus={safeVelocity?.freeSurplus}
        currencySymbol={currencySymbol}
      />
    </section>
  );
}
