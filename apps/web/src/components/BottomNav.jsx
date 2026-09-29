import React from 'react';

export function BottomNav({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'plan', label: 'Plan', symbol: '●' },
    { id: 'items', label: 'Items', symbol: '≡' },
    { id: 'goals', label: 'Goals', symbol: '◬' },
    { id: 'assistant', label: 'Assistant', symbol: '✦' }
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="nav-tab-icon">{tab.symbol}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
