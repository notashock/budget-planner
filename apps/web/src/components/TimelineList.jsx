import React, { useState } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { MapPinIcon, ZapIcon } from './Icons.jsx';

export function TimelineList({
  events = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  selectedDay = null,
  onSelectDay = null,
  currentDay = null,
  month = null
}) {
  const [filterType, setFilterType] = useState('all');

  if (!events || events.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No timeline events generated for this month.
      </div>
    );
  }

  // Count filter items
  const counts = {
    all: events.length,
    incomes: events.filter((e) => e.amount > 0).length,
    planned: events.filter((e) => !e.isActual && e.amount < 0).length,
    pending: events.filter((e) => e.isPending).length,
    actuals: events.filter((e) => e.isActual).length,
    breaches: events.filter((e) => e.balanceAfter < safetyFloor).length
  };

  // Apply filters
  let filteredEvents = events.filter((evt) => {
    // 1. Day selection from chart
    if (selectedDay !== null && evt.day !== selectedDay) {
      return false;
    }

    // 2. Type filter pill
    if (filterType === 'incomes') return evt.amount > 0;
    if (filterType === 'planned') return !evt.isActual && evt.amount < 0;
    if (filterType === 'pending') return Boolean(evt.isPending);
    if (filterType === 'actuals') return evt.isActual;
    if (filterType === 'breaches') return evt.balanceAfter < safetyFloor;
    return true;
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-title">Interactive timeline</span>
        </div>

        {selectedDay !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                borderRadius: '12px',
                fontWeight: 600
              }}
            >
              Day {selectedDay} filtered
            </span>
            <button
              type="button"
              className="btn-subtle"
              style={{ fontSize: '11px', padding: '2px 6px' }}
              onClick={() => onSelectDay?.(null)}
            >
              Show all days
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs / Pills */}
      <div className="timeline-filters-row">
        {[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'incomes', label: 'Incomes', count: counts.incomes },
          { id: 'planned', label: 'Planned', count: counts.planned },
          ...(counts.pending > 0 ? [{ id: 'pending', label: 'Pending', count: counts.pending }] : []),
          { id: 'actuals', label: 'Actuals', count: counts.actuals },
          { id: 'breaches', label: 'Breaches', count: counts.breaches }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`timeline-filter-btn ${filterType === tab.id ? 'active' : ''}`}
            onClick={() => setFilterType(tab.id)}
          >
            <span>{tab.label}</span>
            <span className="filter-count tabular-nums">{tab.count}</span>
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No events match the selected filter.
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="btn-subtle"
              style={{ fontSize: '12px' }}
              onClick={() => {
                setFilterType('all');
                onSelectDay?.(null);
              }}
            >
              Reset all filters
            </button>
          </div>
        </div>
      ) : (
        <div className="timeline-list">
          {filteredEvents.map((evt, idx) => {
            const isIncome = evt.amount > 0;
            const isBreach = evt.balanceAfter < safetyFloor;
            const isPreMonth = evt.day < 0;
            const isSelected = selectedDay === evt.day;
            const isToday = currentDay !== null && evt.day === currentDay;

            // Check if we should insert the "Today" marker right before this event
            // when this is the first event on or after currentDay
            const showTodayMarker =
              currentDay !== null &&
              selectedDay === null &&
              evt.day >= currentDay &&
              (idx === 0 || filteredEvents[idx - 1].day < currentDay);

            return (
              <React.Fragment key={`${evt.date}-${evt.sourceIndex || idx}`}>
                {showTodayMarker && (
                  <div className="timeline-today-divider">
                    <div className="today-line" />
                    <span className="today-badge">
                      <MapPinIcon size={12} color="currentColor" />
                      Today ({formatDisplayDate(todayStr, true)})
                    </span>
                    <div className="today-line" />
                  </div>
                )}

                <div
                  className={`timeline-event-row ${isSelected ? 'selected' : ''} ${isBreach ? 'row-breached' : ''}`}
                  onClick={() => onSelectDay?.(isSelected ? null : evt.day)}
                  title="Click to focus this day on the balance chart"
                >
                  <div className="timeline-event-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="timeline-event-label">{evt.label}</span>
                      {evt.isPending && (
                        <span
                          className="pending-status-pill"
                          title={`Scheduled for Day ${evt.originalDay} but unpaid; cash remains in today's balance.`}
                        >
                          Pending
                        </span>
                      )}
                    </div>
                    <span className="timeline-event-type">
                      {evt.itemType} {evt.isActual ? '• actual' : evt.isPending ? `• pending (orig. Day ${evt.originalDay})` : '• planned'}
                      {evt.isFixed ? ' • fixed' : ''}
                    </span>
                  </div>

                  <div className="timeline-event-date">
                    <div className="event-date-text tabular-nums">{formatDisplayDate(evt.date, true)}</div>
                    {isPreMonth && (
                      <span className="day-offset-pill tabular-nums">
                        Day {evt.day}
                      </span>
                    )}
                    {isToday && !isPreMonth && (
                      <span className="today-pill">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="timeline-event-numbers">
                    <span
                      className={`timeline-event-amount tabular-nums ${isIncome ? 'positive' : ''}`}
                    >
                      {isIncome ? '+' : ''}{formatCurrency(evt.amount, currencySymbol)}
                    </span>
                    <span
                      className={`timeline-event-balance tabular-nums ${isBreach ? 'text-breached' : ''}`}
                    >
                      {isBreach && <span className="inline-breach-glyph">▲ </span>}
                      bal: {formatCurrency(evt.balanceAfter, currencySymbol)}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
