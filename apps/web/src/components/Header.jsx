import React, { useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function Header({
  user,
  months = [],
  currentMonth,
  onSelectMonth,
  onOpenCreateMonth,
  onOpenRollover,
  onLogout,
  theme,
  onToggleTheme
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const monthLabel = currentMonth
    ? `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`
    : 'Select month';

  return (
    <header className="app-header">
      <div className="app-title-group">
        <span className="app-brand">Budget planner</span>
        <button
          type="button"
          className="month-picker-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          {monthLabel} ▾
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '55px',
              left: '16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              zIndex: 40,
              minWidth: '220px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'none'
            }}
          >
            {months.map((m) => (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                className="btn-subtle"
                style={{
                  justifyContent: 'flex-start',
                  fontWeight: currentMonth?.year === m.year && currentMonth?.month === m.month ? 600 : 400,
                  padding: '8px 12px',
                  borderRadius: 0,
                  borderBottom: '1px solid var(--border)'
                }}
                onClick={() => {
                  onSelectMonth(m.year, m.month);
                  setDropdownOpen(false);
                }}
              >
                {MONTH_NAMES[m.month - 1]} {m.year}
              </button>
            ))}

            <button
              type="button"
              className="btn-subtle"
              style={{
                justifyContent: 'flex-start',
                padding: '8px 12px',
                color: 'var(--accent)',
                fontWeight: 500,
                borderRadius: 0,
                borderBottom: '1px solid var(--border)'
              }}
              onClick={() => {
                setDropdownOpen(false);
                onOpenCreateMonth();
              }}
            >
              + Create new month
            </button>

            {currentMonth && (
              <button
                type="button"
                className="btn-subtle"
                style={{
                  justifyContent: 'flex-start',
                  padding: '8px 12px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  borderRadius: 0
                }}
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenRollover();
                }}
              >
                ↻ Rollover to next month
              </button>
            )}
          </div>
        )}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="btn-subtle"
          onClick={onToggleTheme}
          title="Toggle light/dark theme"
          style={{ padding: '6px 10px', fontSize: '12px' }}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>

        {user && (
          <button
            type="button"
            className="btn-subtle"
            onClick={onLogout}
            style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--text-secondary)' }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
