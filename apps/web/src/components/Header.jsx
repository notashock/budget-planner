import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatCurrency, formatCurrencyWhole, getSalaryWindowStatus, getUnifiedVerdict } from '@budget/engine';
import {
  PlusIcon,
  ZapIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  SparklesIcon,
  BuildingLibraryIcon,
  LockIcon,
  UserIcon,
  TrashIcon,
  MonitorIcon,
  ChevronDownIcon
} from './Icons.jsx';
import { AnimatedLogo } from './AnimatedLogo.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function Header({
  user,
  months = [],
  currentMonth,
  simulation,
  onSelectMonth,
  isReviewMode = false,
  hasActivePlanningMonth = true,
  onOpenRollover,
  nextMonthLabel = 'Next Month',
  onOpenSalarySafeline,
  onDeleteMonth,
  onLogout,
  themeMode = 'system',
  onCycleTheme,
  activeTab = 'plan',
  verdict: pageVerdict = null,
  onSelectTab,
  onNew
}) {
  const [activeDropdown, setActiveDropdown] = useState(null); // 'month' | 'user' | null
  const headerRef = useRef(null);

  const monthDropdownOpen = activeDropdown === 'month';
  const userMenuOpen = activeDropdown === 'user';

  // Mutual collapse & outside click listener
  useEffect(() => {
    function handleClickOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    }
    if (activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [activeDropdown]);

  const monthLabel = currentMonth
    ? (currentMonth.name || (currentMonth.month ? `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}` : 'Select month'))
    : 'Select month';

  const currencySymbol = currentMonth?.currencySymbol ?? '₹';
  // Same verdict as the Plan page: the page reports its own (for the account
  // being viewed); elsewhere the header derives the all-accounts verdict from
  // the engine with the same function, the engine's floor and the upcoming low.
  const verdict = pageVerdict || getUnifiedVerdict(simulation);
  const verdictClass = verdict ? { good: 'safe', tight: 'tight', critical: 'breached' }[verdict.key] : 'safe';
  const headroomAmount = verdict?.headroom?.amount ?? 0;
  const verdictScope = pageVerdict?.scope || 'All accounts';
  // Today lozenge: the same number the Plan hero leads with
  const safeToday = simulation?.safeVelocity?.safeVelocityPerDay ?? simulation?.safeToSpendPerDay ?? 0;
  const daysLeft = simulation?.safeVelocity?.daysLeft || simulation?.daysLeft || 1;
  const showMonthPicker = activeTab === 'plan' || activeTab === 'transactions';

  const salaryLockStatus = useMemo(() => {
    return getSalaryWindowStatus(currentMonth);
  }, [currentMonth]);

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
    <header ref={headerRef} className={`app-header ${activeDropdown ? 'has-active-dropdown' : ''}`}>
      <div className="app-header-inner">
        {/* Zone 1: Identity & Month Context */}
        <div className="app-header-left">
          <span className="app-brand app-brand--toolbar">
            <AnimatedLogo size={24} />
            <span className="app-brand-text">Budget Planner</span>
            <span className="beta-badge">beta</span>
          </span>

          {showMonthPicker && <div style={{ position: 'relative', zIndex: monthDropdownOpen ? 99999 : 'auto' }}>
            <button
              type="button"
              className="month-picker-btn"
              onClick={() => setActiveDropdown((prev) => (prev === 'month' ? null : 'month'))}
              aria-label="Select month"
              aria-expanded={monthDropdownOpen}
              style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>{monthLabel}</span>
              {isReviewMode && (
                <span className="review-badge-tag" style={{ fontSize: 'var(--fs-2xs)', padding: '1px 5px' }}>
                  Preview
                </span>
              )}
              <span style={{ display: 'inline-flex', opacity: 0.5, transform: monthDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                <ChevronDownIcon size={11} />
              </span>
            </button>

            {monthDropdownOpen && (
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
                          setActiveDropdown(null);
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
                            setActiveDropdown(null);
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
                              setActiveDropdown(null);
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
          </div>}

          {isReviewMode && activePlanningMonths.length > 0 && (
            <button
              type="button"
              className="desktop-header-rollover-btn"
              onClick={() => onSelectMonth(activePlanningMonths[0].year, activePlanningMonths[0].month)}
              data-testid="desktop-header-return-btn"
              title="Return to Current Month"
              style={{ background: 'var(--surface-subtle)', color: 'var(--text)' }}
            >
              <span>Return to Current Month →</span>
            </button>
          )}

          {isReviewMode && !hasActivePlanningMonth && onOpenRollover && (
            <button
              type="button"
              className="desktop-header-rollover-btn"
              onClick={onOpenRollover}
              data-testid="desktop-header-rollover-btn"
              title={`Start ${nextMonthLabel || 'Next Month'}`}
            >
              <ZapIcon size={12} />
              <span>Start ${nextMonthLabel || 'Next Month'}</span>
            </button>
          )}
        </div>

        {/* Zone 2: Today lozenge. On Plan the page's own hero shows the number */}
        <div className="app-header-center">
          {currentMonth && verdict && activeTab !== 'plan' && !isReviewMode && (
            <button type="button" className="header-today" onClick={() => onSelectTab?.('plan')}>
              <span
                className={`header-today-lozenge ${verdictClass}`}
                role="status"
                title={`${verdictScope}: ${verdict.label}. ${headroomAmount < 0
                  ? `${formatCurrency(Math.abs(headroomAmount), currencySymbol)} below the safety floor at the lowest point.`
                  : `${formatCurrency(headroomAmount, currencySymbol)} above the safety floor at the lowest point.`}`}
              >
                <span className={`header-today-dot ${verdictClass}`} aria-hidden="true" />
                <span className="tabular-nums">{formatCurrencyWhole(safeToday, currencySymbol)}</span>
                <span className="header-today-caption">safe today · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
              </span>
            </button>
          )}
        </div>

        {/* Zone 3: New, then the You menu */}
        <div className="app-header-right">
          {onNew && !isReviewMode && (
            <button type="button" className="btn btn-primary btn-sm header-new-btn" onClick={onNew}>
              <PlusIcon size={13} color="currentColor" />
              <span>New</span>
            </button>
          )}

          {/* User Settings Dropdown */}
          {user && (
            <div style={{ position: 'relative', zIndex: userMenuOpen ? 99999 : 'auto' }}>
              <button
                type="button"
                className="header-avatar-btn"
                onClick={() => setActiveDropdown((prev) => (prev === 'user' ? null : 'user'))}
                title={`Account: ${user.name || user.email || 'User'}`}
                aria-label="Account Settings"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
              >
                <UserIcon size={15} />
              </button>

              {userMenuOpen && (
                <div
                  className="app-dropdown-menu"
                  style={{ right: 0, left: 'auto', minWidth: '190px' }}
                  onClick={() => setActiveDropdown(null)}
                >
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text)' }}>
                      {user.name || 'User'}
                    </div>
                    {user.email && (
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </div>
                    )}
                  </div>

                  {currentMonth && (
                    <button
                      type="button"
                      className="app-dropdown-item"
                      data-testid="link-salary-safeline-btn"
                      style={{ fontSize: 'var(--fs-xs)' }}
                      onClick={() => {
                        onOpenSalarySafeline?.();
                      }}
                    >
                      {salaryLockStatus.isLocked ? <LockIcon size={13} /> : <BuildingLibraryIcon size={13} />}
                      <span>Salary schedule</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="app-dropdown-item"
                    data-testid="open-assistant-btn"
                    style={{ fontSize: 'var(--fs-xs)' }}
                    onClick={() => onSelectTab?.('assistant')}
                  >
                    <SparklesIcon size={13} />
                    <span>Assistant</span>
                  </button>

                  <button
                    type="button"
                    className="app-dropdown-item"
                    data-testid="cycle-theme-btn"
                    style={{ fontSize: 'var(--fs-xs)' }}
                    onClick={onCycleTheme}
                  >
                    {themeMode === 'system' ? <MonitorIcon size={13} /> : themeMode === 'dark' ? <MoonIcon size={13} /> : <SunIcon size={13} />}
                    <span>Appearance: {themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light'}</span>
                  </button>

                  <div className="app-dropdown-divider" />

                  <button
                    type="button"
                    className="app-dropdown-item"
                    style={{ fontSize: 'var(--fs-xs)', color: 'var(--negative)' }}
                    onClick={onLogout}
                  >
                    <LogOutIcon size={13} color="currentColor" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
