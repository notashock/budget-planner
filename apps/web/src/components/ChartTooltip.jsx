import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * Compact hover label for the balance chart: date, closing balance and the
 * change from the day before. The full breakdown lives in the day panel under
 * the chart, so this stays small. Positioned in percent of the plot so it
 * tracks the SVG at any size; flips to the left of the cursor on the right
 * half so it never runs off the card. Hidden on touch screens (CSS), where
 * the day panel is the detail view.
 */
export function ChartTooltip({ xPct, yPct, date, day, balance, change, belowFloorBy = 0, currencySymbol = '₹' }) {
  const flip = xPct > 55;
  const style = {
    left: `${xPct}%`,
    // Kept away from the top and bottom edges so the label is never cut off
    top: `${Math.max(14, Math.min(86, yPct))}%`
  };
  return (
    <div className={`chart-tooltip ${flip ? 'flip' : ''}`} style={style} aria-hidden="true">
      <span className="ct-date">{date ? formatDisplayDate(date, true) : `Day ${day}`}</span>
      <span className="ct-balance tabular-nums">{formatCurrency(balance, currencySymbol)}</span>
      {change !== 0 && (
        <span className={`ct-change tabular-nums ${change > 0 ? 'di-up' : 'di-down'}`}>
          {change > 0 ? '▲ +' : '▼ '}{formatCurrency(change, currencySymbol)}
        </span>
      )}
      {belowFloorBy > 0 && (
        <span className="ct-floor">{formatCurrency(belowFloorBy, currencySymbol)} below floor</span>
      )}
    </div>
  );
}
