import React from 'react';
import {
  LayoutDashboardIcon,
  ListOrderedIcon,
  TargetIcon,
  WalletIcon,
  PlusIcon
} from './Icons.jsx';

export function BottomNav({ activeTab, onSelectTab, onOpenUnifiedEntry }) {
  const leftTabs = [
    { id: 'plan', label: 'Plan', Icon: LayoutDashboardIcon },
    { id: 'items', label: 'Items', Icon: ListOrderedIcon }
  ];

  const rightTabs = [
    { id: 'accounts', label: 'Accounts', Icon: WalletIcon },
    { id: 'goals', label: 'Goals', Icon: TargetIcon }
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {leftTabs.map((tab) => {
          const IconComponent = tab.Icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="nav-tab-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconComponent size={18} color="currentColor" strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}

        {/* Central Symmetrical Quick-Action (+) Button */}
        <div className="nav-action-wrapper">
          <button
            type="button"
            className="bottom-nav-action-btn"
            onClick={() => onOpenUnifiedEntry?.('log')}
            title="Log or Plan Entry"
            aria-label="Quick Add Entry"
          >
            <PlusIcon size={19} color="currentColor" strokeWidth={2.4} />
          </button>
        </div>

        {rightTabs.map((tab) => {
          const IconComponent = tab.Icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="nav-tab-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconComponent size={18} color="currentColor" strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
