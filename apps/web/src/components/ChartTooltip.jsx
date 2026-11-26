import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * Compact hover label for the balance chart: date, closing balance and the
 * change from the day before, on one line. It sits above the hovered point
 * (or below it when the point is near the top) and centred on it, so it never
 * covers the line at that day. Pins to the card edge near either end. Hidden
 * on touch screens (CSS), where the day panel is the detail view.
 */
export function ChartTooltip({ xPct, yPct, date, day, balance, change, belowFloorBy = 0, currencySymbol = '₹' }) {
  const vertical = yPct > 40 ? 'above' : 'below';
  const horizontal = xPct < 18 ? 'start' : xPct > 82 ? 'end' : 'center';
  return (
    <div
      className={`chart-tooltip ct-${vertical} ct-${horizontal}`}
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      aria-hidden="true"
    >
      <span className="ct-date">{date ? formatDisplayDate(date, true) : `Day ${day}`}</span>
      <span className="ct-balance tabular-nums">{formatCurrency(balance, currencySymbol)}</span>
      {change !== 0 && (
        <span className={`ct-change tabular-nums ${change > 0 ? 'di-up' : 'di-down'}`}>
          {change > 0 ? '+' : '−'}{formatCurrency(Math.abs(change), currencySymbol)}
        </span>
      )}
      {belowFloorBy > 0 && (
        <span className="ct-floor">{formatCurrency(belowFloorBy, currencySymbol)} below floor</span>
      )}
    </div>
  );
}
