import React from 'react';
import { formatCurrency, formatDisplayDate, getUpcomingOutflows } from '@budget/engine';
import { AlertTriangleIcon, CalendarIcon, CheckCircleIcon } from './Icons.jsx';

const MAX_ROWS = 6;

/**
 * The next week's planned outflows, overdue items pinned first, with a total
 * and how many days until the next salary. The most actionable list on the
 * page, lifted out of the full-month timeline.
 */
export function UpcomingOutflows({
  events = [],
  todayStr = null,
  windowDays = 7,
  currencySymbol = '₹',
  isReviewMode = false,
  onPay = null
}) {
  if (!todayStr) return null;
  const { items, total, overdueCount, daysToSalary } = getUpcomingOutflows(events, todayStr, windowDays);

  const shown = items.slice(0, MAX_ROWS);
  const hidden = items.length - shown.length;

  return (
    <section className="summary-card plan-insight-card plan-upcoming-card" aria-labelledby="upcoming-title">
      <div className="pic-head">
        <h3 id="upcoming-title" className="pic-title">Next {windowDays} days</h3>
        <span className="pic-total tabular-nums">{formatCurrency(total, currencySymbol)}</span>
      </div>

      <p className="pic-sub">
        {items.length === 0
          ? 'No planned payments due.'
          : `${items.length} payment${items.length === 1 ? '' : 's'}${overdueCount ? ` · ${overdueCount} overdue` : ''}`}
        {daysToSalary !== null && (
          <> · {daysToSalary === 0 ? 'salary due today' : `${daysToSalary} day${daysToSalary === 1 ? '' : 's'} to salary`}</>
        )}
      </p>

      {items.length === 0 ? (
        <div className="upcoming-empty">
          <CheckCircleIcon size={16} />
          <span>Nothing to pay this week.</span>
        </div>
      ) : (
        <ul className="upcoming-list">
          {shown.map((item, idx) => {
            const targetId = item.transactionId || item.itemId || item._id || item.id;
            const when = item.isOverdue
              ? `Overdue · ${formatDisplayDate(item.dueDate, true)}`
              : item.isDueToday
                ? 'Due today'
                : formatDisplayDate(item.date, true);
            return (
              <li
                key={`${targetId || item.label}-${item.date}-${idx}`}
                className={`upcoming-row ${item.isOverdue ? 'is-overdue' : item.isDueToday ? 'is-today' : ''}`}
              >
                <span className="upcoming-icon" aria-hidden="true">
                  {item.isOverdue ? <AlertTriangleIcon size={13} /> : <CalendarIcon size={13} />}
                </span>
                <span className="upcoming-main">
                  <span className="upcoming-name">{item.label || item.name || 'Planned payment'}</span>
                  <span className="upcoming-when">{when}</span>
                </span>
                <span className="upcoming-amount tabular-nums">{formatCurrency(item.outflow, currencySymbol)}</span>
                {!isReviewMode && onPay && targetId && (
                  <button
                    type="button"
                    className="upcoming-pay"
                    onClick={() => onPay(item)}
                    aria-label={`Mark ${item.label || 'payment'} as paid`}
                    title="Mark as paid"
                  >
                    <CheckCircleIcon size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <p className="pic-note">+{hidden} more in the timeline below.</p>
      )}
    </section>
  );
}
