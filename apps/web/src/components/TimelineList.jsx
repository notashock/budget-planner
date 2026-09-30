import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function TimelineList({ events = [], safetyFloor = 0, currencySymbol = '₹' }) {
  if (!events || events.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No timeline events generated for this month.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Event timeline</span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {events.length} event{events.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="timeline-list">
        {events.map((evt, idx) => {
          const isIncome = evt.amount > 0;
          const isBreach = evt.balanceAfter < safetyFloor;

          return (
            <div key={`${evt.date}-${idx}`} className="timeline-event-row">
              <div className="timeline-event-date" style={{ minWidth: '75px', fontWeight: 500 }}>
                {formatDisplayDate(evt.date, true)}
              </div>

              <div className="timeline-event-info">
                <span className="timeline-event-label">{evt.label}</span>
                <span className="timeline-event-type">
                  {evt.itemType} {evt.isActual ? '• actual' : ''}
                </span>
              </div>

              <div className="timeline-event-numbers">
                <span
                  className={`timeline-event-amount ${isIncome ? 'positive' : ''}`}
                >
                  {isIncome ? '+' : ''}{formatCurrency(evt.amount, currencySymbol)}
                </span>
                <span
                  className="timeline-event-balance"
                  style={{
                    color: isBreach ? 'var(--danger)' : 'var(--text-secondary)',
                    fontWeight: isBreach ? 600 : 400
                  }}
                >
                  bal: {formatCurrency(evt.balanceAfter, currencySymbol)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
