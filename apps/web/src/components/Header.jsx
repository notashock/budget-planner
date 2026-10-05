import React, { useState, useMemo } from 'react';
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
  LockIcon
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
  { id: 'accounts', label: 'Accounts', Icon: WalletIcon },
  { id: 'assistant', label: 'Assistant', Icon: SparklesIcon }
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
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-title-group" style={{ position: 'relative' }}>
          <span className="app-brand">
            <AnimatedLogo size={24} />
            <span>Budget Planner</span>
            <span className="beta-badge">BETA</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="month-picker-btn"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {monthLabel} ▾
            </button>

            {currentMonth && (
              <button
                type="button"
                className="btn-subtle"
                data-testid="link-salary-safeline-btn"
                disabled={salaryLockStatus.isLocked}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: salaryLockStatus.isLocked ? 'var(--surface-subtle)' : 'var(--surface)',
                  cursor: salaryLockStatus.isLocked ? 'not-allowed' : 'pointer',
                  opacity: salaryLockStatus.isLocked ? 0.65 : 1
                }}
                title={salaryLockStatus.tooltip || 'Log Salary'}
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
                <span>Log Salary</span>
              </button>
            )}

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
                    ? `Floor Breached (-${formatCurrency(deficit, currencySymbol)})`
                    : `Floor: ${formatCurrency(safetyFloor, currencySymbol)} Safe`}
                </span>
              </div>
            )}
          </div>

        {dropdownOpen && (
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
                    setDropdownOpen(false);
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
                setDropdownOpen(false);
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
                  setDropdownOpen(false);
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

      {/* Desktop Segmented Navigation Bar */}
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

      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          className="btn-subtle header-action-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
          <span className="header-btn-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        {user && (
          <button
            type="button"
            className="btn-subtle header-action-btn"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <LogOutIcon size={14} />
            <span className="header-btn-text">Sign out</span>
          </button>
        )}
      </div>
    </div>
  </header>
  );
}
