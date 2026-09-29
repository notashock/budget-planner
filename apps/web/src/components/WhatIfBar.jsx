import React, { useState } from 'react';
import { formatCurrency } from '@budget/engine';

export function WhatIfBar({
  items = [],
  whatIfOverrides = {},
  onOverrideChange,
  onReset,
  currencySymbol = '$'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const activeOverrideCount = Object.keys(whatIfOverrides).length;

  return (
    <div className="what-if-banner">
      <div className="what-if-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>What-if exploration</span>
          {activeOverrideCount > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
              ({activeOverrideCount} item{activeOverrideCount > 1 ? 's' : ''} modified)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {activeOverrideCount > 0 && (
            <button
              type="button"
              className="btn-subtle"
              onClick={onReset}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="btn-subtle"
            onClick={() => setIsOpen(!isOpen)}
            style={{ padding: '2px 8px', fontSize: '11px' }}
          >
            {isOpen ? 'Hide items' : 'Explore changes'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="what-if-controls">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Adjust any item amount below to test impact on running balance and safety floor. No changes are saved to the server.
          </p>

          {items.map((item) => {
            const currentAmount = whatIfOverrides[item._id]?.amount ?? item.amount;
            return (
              <div key={item._id} className="what-if-item-row">
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name} ({item.type})
                </span>
                <div className="what-if-input-wrapper">
                  <input
                    type="number"
                    step="1"
                    value={currentAmount ? currentAmount / 100 : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Math.round(Number(e.target.value) * 100);
                      onOverrideChange(item._id, val);
                    }}
                    style={{ padding: '4px 6px', fontSize: '12px', textAlign: 'right' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {currencySymbol}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
