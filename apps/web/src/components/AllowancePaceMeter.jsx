import React from 'react';
import { formatCurrency, getAllowancePace } from '@budget/engine';
import { CheckCircleIcon, AlertTriangleIcon, TrendingDownIcon } from './Icons.jsx';

const STATUS = {
  on: { label: 'On pace', Icon: CheckCircleIcon },
  under: { label: 'Under pace', Icon: TrendingDownIcon },
  over: { label: 'Over pace', Icon: AlertTriangleIcon }
};

/**
 * Envelope pacing for the unplanned allowance: how much has gone vs how much
 * "should" have gone by today if spent evenly across the month.
 */
export function AllowancePaceMeter({
  unplannedAllowance = 0,
  totalUnplannedSpent = 0,
  daysElapsed = 1,
  daysInMonth = 30,
  currencySymbol = '₹'
}) {
  const pace = getAllowancePace({ unplannedAllowance, totalUnplannedSpent, daysElapsed, daysInMonth });
  if (!pace) return null;

  const { label, Icon } = STATUS[pace.status];
  const gap = Math.abs(pace.delta);

  let message;
  if (pace.status === 'over') {
    message = `${formatCurrency(gap, currencySymbol)} ahead of an even pace for day ${daysElapsed}.`;
  } else if (pace.status === 'under') {
    message = `${formatCurrency(gap, currencySymbol)} behind an even pace, so there is room to spare.`;
  } else {
    message = `Spending evenly for day ${daysElapsed} of ${daysInMonth}.`;
  }

  return (
    <section className="summary-card plan-insight-card plan-pace-card" aria-labelledby="pace-title">
      <div className="pic-head">
        <h3 id="pace-title" className="pic-title">Unplanned allowance</h3>
        <span className={`pic-status status-${pace.status}`}>
          <Icon size={12} />
          <span>{label}</span>
        </span>
      </div>

      <div className="pace-figures">
        <span className="pace-spent">{formatCurrency(pace.spent, currencySymbol)}</span>
        <span className="pace-of">of {formatCurrency(pace.allowance, currencySymbol)} used</span>
      </div>

      <div
        className={`pace-meter status-${pace.status}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={pace.allowance}
        aria-valuenow={Math.min(pace.spent, pace.allowance)}
        aria-label={`Allowance used: ${formatCurrency(pace.spent, currencySymbol)} of ${formatCurrency(pace.allowance, currencySymbol)}; expected by today ${formatCurrency(pace.expectedByToday, currencySymbol)}`}
      >
        <div className="pace-fill" style={{ width: `${pace.usedRatio * 100}%` }} />
        <div className="pace-mark" style={{ left: `${pace.expectedRatio * 100}%` }} title={`Expected by today: ${formatCurrency(pace.expectedByToday, currencySymbol)}`} />
      </div>

      <div className="pace-scale">
        <span>Expected by today <strong className="tabular-nums">{formatCurrency(pace.expectedByToday, currencySymbol)}</strong></span>
        <span>
          {pace.left >= 0 ? 'Left ' : 'Over by '}
          <strong className="tabular-nums">{formatCurrency(Math.abs(pace.left), currencySymbol)}</strong>
        </span>
      </div>

      <p className={`pic-note status-${pace.status}`}>{message}</p>
    </section>
  );
}
