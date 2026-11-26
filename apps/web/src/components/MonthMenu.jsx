import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PlusIcon, ChevronDownIcon } from './Icons.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Month picker, shown in the Plan and Transactions screen headers. */
export function MonthMenu({
  months = [],
  currentMonth,
  onSelectMonth,
  isReviewMode = false,
  onOpenRollover,
  nextMonthLabel = 'Next Month'
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const monthLabel = currentMonth
    ? (currentMonth.name || (currentMonth.month ? `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}` : 'Select month'))
    : 'Select month';

  const activePlanningMonths = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    return months.filter((m) => {
      const isPast = m.endDate
        ? m.endDate < todayIso
        : (m.year < currentYear || (m.year === currentYear && m.month < currentMonthNum));
      const isFuture = (m.startDate && m.startDate > todayIso) ||
        (m.year > currentYear || (m.year === currentYear && m.month > currentMonthNum));
      return !isPast && !isFuture && !m.isClosed;
    });
  }, [months]);

  const previousPreviewMonths = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    return months.filter((m) => {
      const isPast = m.endDate
        ? m.endDate < todayIso
        : (m.year < currentYear || (m.year === currentYear && m.month < currentMonthNum));
      return isPast;
    });
  }, [months]);


  return (
    <div ref={ref} className="month-menu" style={{ position: 'relative', zIndex: open ? 99999 : 'auto' }}>
      <button
        type="button"
        className="month-picker-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Select month"
        aria-expanded={open}
        style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <span>{monthLabel}</span>
        {isReviewMode && (
          <span className="review-badge-tag" style={{ fontSize: 'var(--fs-2xs)', padding: '1px 5px' }}>
            Preview
          </span>
        )}
        <span style={{ display: 'inline-flex', opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
          <ChevronDownIcon size={11} />
        </span>
      </button>

      {open && (
        <div className="app-dropdown-menu" style={{ minWidth: '240px' }}>
          {/* Active Cycles Section */}
          <div style={{ padding: '6px 12px', fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Planning Cycle
          </div>
          {activePlanningMonths.length === 0 ? (
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '8px' }}>
                No active planning cycle
              </div>
              {onOpenRollover && (
                <button
                  type="button"
                  className="app-dropdown-item active"
                  data-testid="header-start-month-btn"
                  onClick={() => {
                    onOpenRollover();
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-xs)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    cursor: 'pointer'
                  }}
                >
                  <PlusIcon size={13} color="currentColor" />
                  <span>Start {nextMonthLabel || 'Current Month'}</span>
                </button>
              )}
            </div>
          ) : (
            activePlanningMonths.map((m) => {
              const isSelected = currentMonth?.year === m.year && currentMonth?.month === m.month;
              return (
                <div
                  key={`active-${m.year}-${m.month}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'background 0.15s ease'
                  }}
                  className={`app-dropdown-item-row ${isSelected ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingRight: '6px'
                    }}
                    onClick={() => {
                      onSelectMonth(m.year, m.month);
                      setOpen(false);
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>{MONTH_NAMES[m.month - 1]} {m.year}</span>
                      <span className="active-cycle-tag" style={{ fontSize: 'var(--fs-2xs)', padding: '0 4px' }}>
                        Current
                      </span>
                    </span>
                    {isSelected && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text)' }}>●</span>}
                  </button>
                </div>
              );
            })
          )}

          {/* Previous Month Previews Section */}
          {previousPreviewMonths.length > 0 && (
            <>
              <div className="app-dropdown-divider" />
              <div style={{ padding: '6px 12px', fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Previous Month Previews (Read-Only)</span>
              </div>
              {previousPreviewMonths.map((m) => {
                const isSelected = currentMonth?.year === m.year && currentMonth?.month === m.month;
                return (
                  <div
                    key={`review-${m.year}-${m.month}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'background 0.15s ease'
                    }}
                    className={`app-dropdown-item-row ${isSelected ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingRight: '6px'
                      }}
                      onClick={() => {
                        onSelectMonth(m.year, m.month);
                        setOpen(false);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span>{MONTH_NAMES[m.month - 1]} {m.year}</span>
                        <span className="review-badge-tag" style={{ fontSize: 'var(--fs-2xs)', padding: '0 4px' }}>
                          Preview
                        </span>
                      </span>
                      {isSelected && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text)' }}>●</span>}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
