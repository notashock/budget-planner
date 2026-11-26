import React from 'react';
import { formatCurrencyWhole, getMonthVerdict } from '@budget/engine';

// Re-exported for existing imports; the verdict now lives in the engine.
export { getMonthVerdict };

/** Past days drawn in the accent colour, planned days muted; a dot marks today. */
export function Sparkline({ dailyBalances = [], currentDay = null }) {
  const values = dailyBalances.map((d) => Number(d.balance) || 0);
  if (values.length < 2) return null;
  const W = 300, H = 48, P = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i) => P + (i / (values.length - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / (max - min || 1)) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const today = currentDay ? Math.min(Math.max(currentDay, 1), values.length) - 1 : values.length - 1;
  return (
    <svg className="mh-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} className="mh-spark-plan" />
      <polyline points={pts.slice(0, today + 1).join(' ')} className="mh-spark-past" />
      <circle cx={x(today)} cy={y(values[today])} r="3.5" className="mh-spark-dot" />
    </svg>
  );
}

/**
 * The top of the Plan page: one number (safe to spend today), one caption line and a sparkline.
 * Tapping it opens the details (chart, tiles, timeline). Explanations live one tap deeper.
 */
export function MonthHealthHero({
  safeVelocity = null,
  safeToSpendPerDay = 0,
  daysLeft = 1,
  lowestBalance = 0,
  safetyFloor = 0,
  verdict: verdictProp = null,
  currencySymbol = '₹',
  dailyBalances = [],
  currentDay = null,
  detailsOpen = false,
  onToggleDetails = null
}) {
  const rate = safeVelocity?.safeVelocityPerDay ?? safeVelocity?.rate ?? safeToSpendPerDay ?? 0;
  const remainingDays = safeVelocity?.daysLeft || daysLeft || 1;
  const paceStatus = safeVelocity?.paceStatus || safeVelocity?.status || '';
  const verdict = verdictProp || getMonthVerdict({ lowestBalance, safetyFloor, paceStatus, safeRate: rate });
  const amount = formatCurrencyWhole(Math.floor(Math.max(0, rate) / 100) * 100, currencySymbol);

  const body = (
    <>
      <span className="mh-value tabular-nums">{amount}</span>
      <span className="mh-caption">
        <span className={`mh-dot verdict-${verdict.key}`} aria-hidden="true" />
        safe to spend today · {remainingDays} {remainingDays === 1 ? 'day' : 'days'} left
      </span>
      <Sparkline dailyBalances={dailyBalances} currentDay={currentDay} />
    </>
  );

  return (
    <section className={`summary-card month-health-hero verdict-${verdict.key}`} aria-label="Month health">
      {onToggleDetails ? (
        <button
          type="button"
          className="mh-hit"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          aria-controls="plan-details"
          aria-label={`${amount} safe to spend today, ${verdict.label}, ${remainingDays} days left. ${detailsOpen ? 'Hide' : 'Show'} details`}
        >
          {body}
        </button>
      ) : <div className="mh-hit">{body}</div>}
    </section>
  );
}
