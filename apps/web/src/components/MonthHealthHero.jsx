import React from 'react';
import { formatCurrency, formatCurrencyWhole, formatDisplayDate, getMonthVerdict } from '@budget/engine';
import { CheckCircleIcon, AlertTriangleIcon, ShieldAlertIcon } from './Icons.jsx';
import { CashAllocationBar } from './CashAllocationBar.jsx';

// Re-exported for existing imports; the verdict now lives in the engine.
export { getMonthVerdict };

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
  verdict: verdictProp = null,
  currencySymbol = '₹'
}) {
  const rate = safeVelocity?.safeVelocityPerDay ?? safeVelocity?.rate ?? safeToSpendPerDay ?? 0;
  const remainingDays = safeVelocity?.daysLeft || daysLeft || 1;
  const committed = safeVelocity?.committedUpcomingItems ?? safeVelocity?.committedBills ?? 0;
  const burn = safeVelocity?.burnRatePerDay ?? safeVelocity?.burnRate ?? 0;
  const paceStatus = safeVelocity?.paceStatus || safeVelocity?.status || '';
  const goalReserve = safeVelocity?.goalReserve ?? 0;
  const heldReserve = safeVelocity?.heldReserve ?? 0;

  const verdict = verdictProp || getMonthVerdict({ lowestBalance, safetyFloor, paceStatus, safeRate: rate });
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
          <span className="mh-value">{formatCurrencyWhole(Math.floor(Math.max(0, rate) / 100) * 100, currencySymbol)}</span>
          <span className="mh-unit">/ day</span>
        </div>
        <p className="mh-explain">
          After {formatCurrency(committed, currencySymbol)} of upcoming bills, your{' '}
          {formatCurrency(safetyFloor, currencySymbol)} safety floor
          {goalReserve > 0 && <> and {formatCurrency(goalReserve, currencySymbol)} set aside for goals this month</>}
          {heldReserve > 0 && <>, keeping aside {formatCurrency(heldReserve, currencySymbol)} you hold for others</>}
          , spread over {remainingDays} days.
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
        goalReserve={goalReserve}
        heldReserve={heldReserve}
        freeSurplus={safeVelocity?.freeSurplus}
        currencySymbol={currencySymbol}
      />
    </section>
  );
}
