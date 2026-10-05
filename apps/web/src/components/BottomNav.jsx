import React from 'react';
import {
  LayoutDashboardIcon,
  ListOrderedIcon,
  TargetIcon,
  SparklesIcon,
  WalletIcon
} from './Icons.jsx';

export function BottomNav({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'plan', label: 'Plan', Icon: LayoutDashboardIcon },
    { id: 'items', label: 'Items', Icon: ListOrderedIcon },
    { id: 'goals', label: 'Goals', Icon: TargetIcon },
    { id: 'accounts', label: 'Accounts', Icon: WalletIcon },
    { id: 'assistant', label: 'Assistant', Icon: SparklesIcon }
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
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
