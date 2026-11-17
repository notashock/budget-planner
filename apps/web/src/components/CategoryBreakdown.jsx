import React from 'react';
import { formatCurrency, groupSpendByCategory } from '@budget/engine';

/**
 * Spending by category, largest first. Each bar is one hue split into
 * paid (solid) and still-planned (lighter step of the same hue) with a 2px
 * surface gap; amounts sit at the bar end in text colour. Top 5 + Other.
 */
export function CategoryBreakdown({ events = [], currencySymbol = '₹', topN = 5 }) {
  const { categories, total, max } = groupSpendByCategory(events, { topN });
  if (categories.length === 0 || total <= 0) return null;

  const hasPlanned = categories.some((c) => c.planned > 0);
  const hasPaid = categories.some((c) => c.paid > 0);

  return (
    <section className="summary-card plan-insight-card plan-category-card" aria-labelledby="category-title">
      <div className="pic-head">
        <h3 id="category-title" className="pic-title">Spending by category</h3>
        <span className="pic-total tabular-nums">{formatCurrency(total, currencySymbol)}</span>
      </div>

      {hasPaid && hasPlanned && (
        <ul className="cat-legend" aria-label="Legend">
          <li><span className="cat-swatch cat-paid" aria-hidden="true" />Paid</li>
          <li><span className="cat-swatch cat-planned" aria-hidden="true" />Planned</li>
        </ul>
      )}

      <ul className="cat-list">
        {categories.map((c) => {
          const paidPct = max > 0 ? (c.paid / max) * 100 : 0;
          const plannedPct = max > 0 ? (c.planned / max) * 100 : 0;
          return (
            <li
              key={c.name}
              className="cat-row"
              title={`${c.name}: ${formatCurrency(c.paid, currencySymbol)} paid, ${formatCurrency(c.planned, currencySymbol)} planned (${Math.round(c.share * 100)}% of spending)`}
            >
              <span className="cat-name">{c.name}</span>
              <span
                className="cat-track"
                role="img"
                aria-label={`${c.name}: ${formatCurrency(c.total, currencySymbol)}, ${Math.round(c.share * 100)}% of spending; ${formatCurrency(c.paid, currencySymbol)} paid, ${formatCurrency(c.planned, currencySymbol)} planned`}
              >
                {c.paid > 0 && <span className="cat-bar cat-paid" style={{ width: `${paidPct}%` }} />}
                {c.planned > 0 && <span className="cat-bar cat-planned" style={{ width: `${plannedPct}%` }} />}
              </span>
              <span className="cat-value tabular-nums">{formatCurrency(c.total, currencySymbol)}</span>
              <span className="cat-share tabular-nums">{Math.round(c.share * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
