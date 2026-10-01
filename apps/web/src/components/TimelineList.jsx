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
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '8px' }}>
        {[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'incomes', label: 'Incomes', count: counts.incomes },
          { id: 'planned', label: 'Planned', count: counts.planned },
          { id: 'actuals', label: 'Actuals', count: counts.actuals },
          { id: 'breaches', label: 'Floor Breaches', count: counts.breaches }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={filterType === tab.id ? 'btn-primary' : 'btn-subtle'}
            onClick={() => setFilterType(tab.id)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              borderRadius: '14px',
              fontWeight: filterType === tab.id ? 600 : 400
            }}
          >
            {tab.label} ({tab.count})
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 0',
                      margin: '2px 0'
                    }}
                  >
                    <div style={{ flex: 1, height: '1px', background: 'var(--accent)', opacity: 0.4 }} />
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                        background: 'var(--accent-subtle)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <MapPinIcon size={12} color="var(--accent)" />
                      Today ({formatDisplayDate(todayStr, true)})
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--accent)', opacity: 0.4 }} />
                  </div>
                )}

                <div
                  className="timeline-event-row"
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--accent)' : undefined,
                    background: isSelected ? 'var(--accent-subtle)' : undefined,
                    boxShadow: isSelected ? '0 0 0 1px var(--accent)' : undefined,
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => onSelectDay?.(isSelected ? null : evt.day)}
                  title="Click to focus this day on the balance chart"
                >
                  <div className="timeline-event-info">
                    <span className="timeline-event-label">{evt.label}</span>
                    <span className="timeline-event-type">
                      {evt.itemType} {evt.isActual ? '• logged transaction' : '• scheduled'}
                      {evt.isFixed ? ' • fixed rollover' : ''}
                    </span>
                  </div>

                  <div className="timeline-event-date" style={{ minWidth: '80px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500 }}>{formatDisplayDate(evt.date, true)}</div>
                    {isPreMonth && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '8px',
                          background: 'var(--text)',
                          color: 'var(--bg)',
                          display: 'inline-block',
                          marginTop: '2px'
                        }}
                      >
                        Day {evt.day}
                      </span>
                    )}
                    {isToday && !isPreMonth && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '8px',
                          background: 'var(--accent)',
                          color: '#fff',
                          display: 'inline-block',
                          marginTop: '2px'
                        }}
                      >
                        Today
                      </span>
                    )}
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
                        fontWeight: isBreach ? 700 : 400
                      }}
                    >
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
