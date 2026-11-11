import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatCurrency, getSalaryWindowStatus } from '@budget/engine';
import {
  PlusIcon,
  ZapIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  TargetIcon,
  SparklesIcon,
  WalletIcon,
  BuildingLibraryIcon,
  LockIcon,
  UserIcon,
  TrashIcon,
  MonitorIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  AlertTriangleIcon
} from './Icons.jsx';
import { AnimatedLogo } from './AnimatedLogo.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const NAV_TABS = [
  { id: 'plan', label: 'Plan', Icon: LayoutDashboardIcon },
  { id: 'transactions', label: 'Transactions', Icon: ListOrderedIcon },
  { id: 'goals', label: 'Goals', Icon: TargetIcon },
  { id: 'accounts', label: 'Accounts', Icon: WalletIcon }
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
  onSelectTab
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

  const safetyFloor = currentMonth?.safetyFloor ?? 0;
  const currencySymbol = currentMonth?.currencySymbol ?? '₹';
  const lowestBalance = simulation?.lowestBalance ?? 0;
  const floorBreached = simulation?.floorBreached ?? false;
  const deficit = safetyFloor - lowestBalance;
  const margin = lowestBalance - safetyFloor;

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
          <span className="app-brand">
            <AnimatedLogo size={24} />
            <span className="app-brand-text">Budget Planner</span>
            <span className="beta-badge">beta</span>
          </span>

          <div style={{ position: 'relative', zIndex: monthDropdownOpen ? 99999 : 'auto' }}>
            <button
              type="button"
              className="month-picker-btn"
              onClick={() => setActiveDropdown((prev) => (prev === 'month' ? null : 'month'))}
              aria-label="Select month"
              aria-expanded={monthDropdownOpen}
              style={{ fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>{monthLabel}</span>
              {isReviewMode && (
                <span className="review-badge-tag" style={{ fontSize: '9px', padding: '1px 5px' }}>
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
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active Planning Cycle
                </div>
                {activePlanningMonths.length === 0 ? (
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
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
                          color: 'var(--primary, #059669)',
                          fontWeight: 600,
                          fontSize: '12px',
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
                            <span className="active-cycle-tag" style={{ fontSize: '9px', padding: '0 4px' }}>
                              Current
                            </span>
                          </span>
                          {isSelected && <span style={{ fontSize: '11px', color: 'var(--text)' }}>●</span>}
                        </button>
                      </div>
                    );
                  })
                )}

                {/* Previous Month Previews Section */}
                {previousPreviewMonths.length > 0 && (
                  <>
                    <div className="app-dropdown-divider" />
                    <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                              <span className="review-badge-tag" style={{ fontSize: '9px', padding: '0 4px' }}>
                                Preview
                              </span>
                            </span>
                            {isSelected && <span style={{ fontSize: '11px', color: 'var(--text)' }}>●</span>}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

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

        {/* Zone 2: True Centered Desktop Segmented Navigation */}
        <div className="app-header-center">
          <nav className="desktop-header-nav" aria-label="Main Navigation">
            {NAV_TABS.map((tab) => {
              const Icon = tab.Icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`desktop-nav-pill ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectTab?.(tab.id)}
                >
                  <Icon size={14} color="currentColor" strokeWidth={isActive ? 2.2 : 1.7} />
                  <span className="desktop-nav-pill-label">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Zone 3: Symmetrical Status & Global Utilities */}
        <div className="app-header-right">
          {currentMonth && safetyFloor > 0 && (
            <div
              className={`header-floor-pill ${floorBreached ? 'breached' : 'safe'}`}
              title={
                floorBreached
                  ? `Safety floor breached by ${formatCurrency(deficit, currencySymbol)}. Lowest balance: ${formatCurrency(lowestBalance, currencySymbol)}`
                  : `Safety floor maintained (+${formatCurrency(margin, currencySymbol)} cushion). Lowest balance: ${formatCurrency(lowestBalance, currencySymbol)}`
              }
            >
              <span className={`floor-indicator-glyph ${floorBreached ? 'breached' : 'safe'}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {floorBreached ? <AlertTriangleIcon size={11} /> : <CheckCircleIcon size={11} />}
              </span>
              <span className="header-floor-text">
                {floorBreached
                  ? `-${formatCurrency(deficit, currencySymbol)}`
                  : `Floor Safe`}
              </span>
            </div>
          )}

          <button
            type="button"
            className="header-avatar-btn header-theme-btn"
            onClick={onCycleTheme}
            title={`Theme: ${themeMode === 'system' ? 'System (Auto)' : themeMode === 'dark' ? 'Dark' : 'Light'}. Click to cycle.`}
            aria-label={`Theme: ${themeMode === 'system' ? 'System (Auto)' : themeMode === 'dark' ? 'Dark' : 'Light'}. Click to switch theme.`}
          >
            {themeMode === 'system' ? (
              <MonitorIcon size={14} />
            ) : themeMode === 'dark' ? (
              <MoonIcon size={14} />
            ) : (
              <SunIcon size={14} />
            )}
          </button>

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
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                      {user.name || 'User'}
                    </div>
                    {user.email && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </div>
                    )}
                  </div>

                  {currentMonth && (
                    <button
                      type="button"
                      className="app-dropdown-item"
                      data-testid="link-salary-safeline-btn"
                      style={{ fontSize: '12px' }}
                      onClick={() => {
                        onOpenSalarySafeline?.();
                      }}
                    >
                      {salaryLockStatus.isLocked ? <LockIcon size={13} /> : <BuildingLibraryIcon size={13} />}
                      <span>Link Salary & Safeline</span>
                    </button>
                  )}

                  <div className="app-dropdown-divider" />

                  <button
                    type="button"
                    className="app-dropdown-item"
                    style={{ fontSize: '12px', color: 'var(--negative, #ef4444)' }}
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
