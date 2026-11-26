import React, { useState, useMemo, useRef, useEffect } from 'react';
import { getSalaryWindowStatus } from '@budget/engine';
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  LogOutIcon,
  SparklesIcon,
  LockIcon,
  UserIcon,
  BuildingLibraryIcon
} from './Icons.jsx';

/** The "You" menu: on the phone dock and at the foot of the web sidebar. Opens upward. */
export function YouMenu({
  user,
  currentMonth,
  onOpenSalarySafeline,
  onLogout,
  themeMode = 'system',
  onCycleTheme,
  onSelectTab,
  className = ''
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

  const salaryLockStatus = useMemo(() => {
    return getSalaryWindowStatus(currentMonth);
  }, [currentMonth]);


  if (!user) return null;

  return (
    <div ref={ref} className={`you-menu ${className}`.trim()} style={{ position: 'relative', zIndex: open ? 99999 : 'auto' }}>
        <button
          type="button"
          className="header-avatar-btn"
          onClick={() => setOpen((v) => !v)}
          title={`Account: ${user.name || user.email || 'User'}`}
          aria-label="Account Settings"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <UserIcon size={15} />
        </button>

        {open && (
          <div
            className="app-dropdown-menu"
            style={{ minWidth: '190px' }}
            onClick={() => setOpen(false)}
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
  );
}
