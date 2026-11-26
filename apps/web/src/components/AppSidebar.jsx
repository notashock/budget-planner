import React from 'react';
import { formatCurrencyWhole } from '@budget/engine';
import { LayoutDashboardIcon, ListOrderedIcon, TargetIcon, WalletIcon, SparklesIcon, PlusIcon } from './Icons.jsx';
import { AnimatedLogo } from './AnimatedLogo.jsx';
import { liveBalance } from '../utils/liveBalance.js';

export const NAV_TABS = [
  { id: 'plan', label: 'Plan', Icon: LayoutDashboardIcon },
  { id: 'transactions', label: 'Transactions', Icon: ListOrderedIcon },
  { id: 'goals', label: 'Goals', Icon: TargetIcon },
  { id: 'accounts', label: 'Accounts', Icon: WalletIcon },
];

/** Web sidebar (≥768px): nav, every account with its live balance, Assistant at the foot. */
export function AppSidebar({
  activeTab,
  onSelectTab,
  accounts = [],
  simulation,
  month,
  selectedAccountId = 'all',
  onSelectAccount,
  onNew = null,
  youMenu = null,
}) {
  const symbol = month?.currencySymbol ?? '₹';

  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      <div className="app-sidebar-brand">
        <AnimatedLogo size={24} />
        <span className="app-sidebar-label">Budget Planner</span>
      </div>

      {onNew && (
        <button type="button" className="btn btn-primary app-sidebar-new" title="New" onClick={onNew}>
          <PlusIcon size={15} color="currentColor" />
          <span className="app-sidebar-label">New</span>
        </button>
      )}

      <nav className="app-sidebar-nav" aria-label="Main Navigation">
        {NAV_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`app-sidebar-item${activeTab === id ? ' active' : ''}`}
            aria-current={activeTab === id ? 'page' : undefined}
            title={label}
            onClick={() => onSelectTab(id)}
          >
            <Icon size={17} color="currentColor" />
            <span className="app-sidebar-label">{label}</span>
          </button>
        ))}
      </nav>

      {accounts.length > 0 && (
        <div className="app-sidebar-section">
          <div className="app-sidebar-heading app-sidebar-label">Accounts</div>
          {accounts.map((acc) => {
            const id = String(acc._id || acc.id);
            const isActive = activeTab === 'plan' && String(selectedAccountId) === id;
            return (
              <button
                key={id}
                type="button"
                className={`app-sidebar-account${isActive ? ' active' : ''}`}
                title={acc.name}
                onClick={() => {
                  onSelectAccount?.(id);
                  onSelectTab('plan');
                }}
              >
                <span className="app-sidebar-account-initial" aria-hidden="true">{(acc.name || '?').charAt(0)}</span>
                <span className="app-sidebar-label app-sidebar-account-name">{acc.name}</span>
                <span className="app-sidebar-label tabular-nums">
                  {formatCurrencyWhole(liveBalance(acc, simulation?.accounts?.[id], month), symbol)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="app-sidebar-foot">
        <button
          type="button"
          className={`app-sidebar-item${activeTab === 'assistant' ? ' active' : ''}`}
          title="Assistant"
          onClick={() => onSelectTab('assistant')}
        >
          <SparklesIcon size={17} color="currentColor" />
          <span className="app-sidebar-label">Assistant</span>
        </button>
        {youMenu}
      </div>
    </aside>
  );
}
