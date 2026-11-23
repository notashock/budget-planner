import React from 'react';
import { formatCurrencyWhole as formatCurrency, buildCashAllocation } from '@budget/engine';

const SEGMENT_META = {
  committed: { label: 'Upcoming bills', className: 'alloc-committed' },
  held: { label: 'Held for others', className: 'alloc-held' },
  cards: { label: 'Owed on cards', className: 'alloc-cards' },
  floor: { label: 'Keep at least', className: 'alloc-floor' },
  goals: { label: 'Goal savings', className: 'alloc-goals' },
  free: { label: 'Free to spend', className: 'alloc-free' },
  shortfall: { label: 'Shortfall', className: 'alloc-shortfall' }
};

/**
 * Thin segmented bar: where today's balance is already promised.
 * Bills → floor reserve → free surplus, plus a shortfall part when bills and
 * floor exceed the balance. Identity is carried by the legend (name + amount),
 * a 2px surface gap between parts and a hatch on the floor reserve, so the
 * bar never relies on colour alone.
 */
export function CashAllocationBar({
  todayBalance = 0,
  committedUpcomingItems = 0,
  safetyFloor = 0,
  goalReserve = 0,
  heldReserve = 0,
  cardReserve = 0,
  freeSurplus,
  currencySymbol = '₹'
}) {
  const alloc = buildCashAllocation({ todayBalance, committedUpcomingItems, safetyFloor, goalReserve, heldReserve, cardReserve, freeSurplus });

  if (alloc.total <= 0) {
    return null;
  }

  const parts = alloc.segments.map((s) => ({
    ...s,
    ...SEGMENT_META[s.key],
    share: s.amount / alloc.total
  }));

  const summary = parts
    .map((p) => `${p.label} ${formatCurrency(p.amount, currencySymbol)} (${Math.round(p.share * 100)}%)`)
    .join(', ');

  return (
    <div className="alloc">
      <div className="alloc-head">
        <span className="alloc-title">After today's bills</span>
        <span className="alloc-total tabular-nums">{formatCurrency(Math.max(0, todayBalance), currencySymbol)}</span>
      </div>

      <div className="alloc-bar" role="img" aria-label={`Today's balance split: ${summary}`}>
        {parts.map((p) => (
          <div
            key={p.key}
            className={`alloc-seg ${p.className}`}
            style={{ flexGrow: p.amount }}
            title={`${p.label}: ${formatCurrency(p.amount, currencySymbol)} (${Math.round(p.share * 100)}%)`}
          />
        ))}
      </div>

      <ul className="alloc-legend">
        {parts.map((p) => (
          <li key={p.key} className="alloc-legend-item">
            <span className={`alloc-swatch ${p.className}`} aria-hidden="true" />
            <span className="alloc-legend-label">{p.label}</span>
            <span className="alloc-legend-value tabular-nums">{formatCurrency(p.amount, currencySymbol)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
