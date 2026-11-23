import React from 'react';
import { PlusIcon, ZapIcon } from './Icons.jsx';
import { NAV_TABS } from './AppSidebar.jsx';

export function BottomNav({
  activeTab,
  onSelectTab,
  onOpenUnifiedEntry,
  isReviewMode = false,
  hasActivePlanningMonth = true,
  onOpenRollover,
  nextMonthLabel = 'Next Month'
}) {
  const tabs = NAV_TABS;

  const tabButton = (tab) => {
    const IconComponent = tab.Icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        className={`nav-tab ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onSelectTab(tab.id)}
      >
        <span className="nav-tab-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconComponent size={18} color="currentColor" strokeWidth={isActive ? 2.2 : 1.8} />
        </span>
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <div className="bottom-dock">
      {/* Today bar: the one way to add, where the mini-player sits in Apple Music */}
      {!isReviewMode ? (
        <button
          type="button"
          className="today-bar"
          onClick={() => onOpenUnifiedEntry?.('log')}
          aria-label="Quick Add Entry"
        >
          <PlusIcon size={16} color="currentColor" strokeWidth={2.4} />
          <span>Add spend…</span>
        </button>
      ) : !hasActivePlanningMonth && onOpenRollover ? (
        <button
          type="button"
          className="today-bar today-bar--rollover"
          onClick={onOpenRollover}
          aria-label={`Start ${nextMonthLabel || 'Next Month'}`}
          data-testid="bottom-nav-rollover-btn"
        >
          <ZapIcon size={14} /><span>Start {nextMonthLabel || 'Next Month'}</span>
        </button>
      ) : null}

      <nav className="bottom-nav" aria-label="Tabs">
        <div className="bottom-nav-inner">{tabs.map(tabButton)}</div>
      </nav>
    </div>
  );
}
