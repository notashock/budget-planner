import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatCurrency, getSalaryWindowStatus } from '@budget/engine';
import {
  PlusIcon,
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
  UserIcon
} from './Icons.jsx';
import { AnimatedLogo } from './AnimatedLogo.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const NAV_TABS = [
  { id: 'plan', label: 'Plan', Icon: LayoutDashboardIcon },
  { id: 'items', label: 'Items', Icon: ListOrderedIcon },
  { id: 'goals', label: 'Goals', Icon: TargetIcon },
  { id: 'accounts', label: 'Accounts', Icon: WalletIcon }
];

export function Header({
  user,
  months = [],
  currentMonth,
  simulation,
  onSelectMonth,
  onOpenCreateMonth,
  onOpenRollover,
  onOpenSalarySafeline,
  onLogout,
  theme,
  onToggleTheme,
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
    ? `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`
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

  return (
    <header ref={headerRef} className="app-header">
      <div className="app-header-inner">
        {/* Zone 1: Identity & Month Context */}
        <div className="app-header-left">
          <span className="app-brand">
            <AnimatedLogo size={24} />
            <span className="app-brand-text">Budget Planner</span>
            <span className="beta-badge">BETA</span>
          </span>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="month-picker-btn"
              onClick={() => setActiveDropdown((prev) => (prev === 'month' ? null : 'month'))}
              aria-label="Select month"
              aria-expanded={monthDropdownOpen}
              style={{ fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>{monthLabel}</span>
              <span style={{ fontSize: '11px', opacity: 0.6, transform: monthDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▼</span>
            </button>

            {monthDropdownOpen && (
              <div className="app-dropdown-menu">
                {months.map((m) => {
                  const isSelected = currentMonth?.year === m.year && currentMonth?.month === m.month;
                  return (
                    <button
                      key={`${m.year}-${m.month}`}
                      type="button"
                      className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        onSelectMonth(m.year, m.month);
                        setActiveDropdown(null);
                      }}
                    >
                      <span>{MONTH_NAMES[m.month - 1]} {m.year}</span>
                      {isSelected && <span style={{ fontSize: '11px', color: 'var(--text)' }}>●</span>}
                    </button>
                  );
                })}

                <div className="app-dropdown-divider" />

                <button
                  type="button"
                  className="app-dropdown-item"
                  style={{ color: 'var(--text)', fontWeight: 600 }}
                  onClick={() => {
                    setActiveDropdown(null);
                    onOpenCreateMonth();
                  }}
                >
                  <PlusIcon size={14} color="currentColor" />
                  <span>Create new month</span>
                </button>

                {currentMonth && (
                  <button
                    type="button"
                    className="app-dropdown-item"
                    style={{ fontSize: '12px' }}
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenRollover();
                    }}
                  >
                    <RefreshIcon size={13} />
                    <span>Rollover to next month</span>
                  </button>
                )}
              </div>
            )}
          </div>
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
                  <span>{tab.label}</span>
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
              <span className={`floor-indicator-glyph ${floorBreached ? 'breached' : 'safe'}`}>
                {floorBreached ? '▲' : '✓'}
              </span>
              <span className="header-floor-text">
                {floorBreached
                  ? `-${formatCurrency(deficit, currencySymbol)}`
                  : `Floor Safe`}
              </span>
            </div>
          )}

          {currentMonth && (
            <button
              type="button"
              className="btn-subtle desktop-only-btn header-link-salary-btn"
              data-testid="link-salary-safeline-btn"
              disabled={salaryLockStatus.isLocked}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                padding: '5px 9px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: salaryLockStatus.isLocked ? 'var(--surface-subtle)' : 'var(--surface)',
                cursor: salaryLockStatus.isLocked ? 'not-allowed' : 'pointer',
                opacity: salaryLockStatus.isLocked ? 0.65 : 1
              }}
              title={salaryLockStatus.tooltip || 'Link Salary & Safeline'}
              onClick={() => {
                if (!salaryLockStatus.isLocked) {
                  onOpenSalarySafeline?.();
                }
              }}
            >
              {salaryLockStatus.isLocked ? (
                <LockIcon size={13} />
              ) : (
                <BuildingLibraryIcon size={13} />
              )}
              <span className="header-btn-text">Link Salary & Safeline</span>
            </button>
          )}

          <button
            type="button"
            className="btn-subtle header-action-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{ padding: '6px 9px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
            <span className="header-btn-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {/* User Settings Dropdown */}
          {user && (
            <div style={{ position: 'relative' }}>
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
                      disabled={salaryLockStatus.isLocked}
                      style={{ fontSize: '12px', opacity: salaryLockStatus.isLocked ? 0.6 : 1 }}
                      onClick={() => {
                        if (!salaryLockStatus.isLocked) {
                          onOpenSalarySafeline?.();
                        }
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
