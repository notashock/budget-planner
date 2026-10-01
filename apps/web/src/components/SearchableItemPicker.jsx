import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '@budget/engine';

/**
 * Unified Searchable Item Picker Popover.
 * Provides an interactive floating dropdown card matching the header month picker style,
 * with instant filter search, grouped categories, and tactile keyboard/touch support.
 */
export function SearchableItemPicker({
  items = [],
  selectedId = '',
  onSelect,
  currencySymbol = '₹',
  placeholder = 'Unexpected spending (draws down unplanned allowance)'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Autofocus search when popover opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const selectedItem = (items || []).find((it) => it._id === selectedId);

  const filteredItems = (items || []).filter((it) =>
    it.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleChoose = (id) => {
    onSelect?.(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`app-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {selectedItem ? (
            <>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedItem.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                ({formatCurrency(selectedItem.amount, currencySymbol)})
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'var(--surface-subtle)',
                  color: 'var(--text-secondary)',
                  textTransform: 'capitalize',
                  flexShrink: 0
                }}
              >
                {selectedItem.type}
              </span>
              {selectedItem.isFixed && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'var(--accent-subtle)',
                    color: 'var(--accent)',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                >
                  Fixed
                </span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {placeholder}
            </span>
          )}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px', flexShrink: 0 }}>
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {/* Floating Popover Dropdown Card */}
      {isOpen && (
        <div
          className="app-dropdown-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            width: '100%',
            maxHeight: '280px',
            overflowY: 'auto',
            zIndex: 70,
            padding: '6px'
          }}
          role="listbox"
        >
          {/* Quick Search Input */}
          {(items || []).length > 2 && (
            <div style={{ padding: '2px 4px 6px 4px' }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search planned items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px' }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Unexpected / Unmatched Default Option */}
          <button
            type="button"
            className={`app-dropdown-item ${!selectedId ? 'active' : ''}`}
            onClick={() => handleChoose('')}
            role="option"
            aria-selected={!selectedId}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600 }}>Unexpected spending</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Draws down unplanned allowance
              </span>
            </div>
            {!selectedId && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>●</span>}
          </button>

          {/* Unified continuous list of all matching items */}
          {filteredItems.map((item) => (
            <button
              key={item._id}
              type="button"
              className={`app-dropdown-item ${selectedId === item._id ? 'active' : ''}`}
              onClick={() => handleChoose(item._id)}
              role="option"
              aria-selected={selectedId === item._id}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {formatCurrency(item.amount, currencySymbol)}
                  </span>
                  {item.type === 'recurring' && (
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        textTransform: 'capitalize',
                        flexShrink: 0
                      }}
                    >
                      Recurring
                    </span>
                  )}
                  {item.isFixed && (
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        flexShrink: 0
                      }}
                    >
                      Fixed
                    </span>
                  )}
                </div>
                {selectedId === item._id && <span style={{ fontSize: '11px', color: 'var(--accent)', flexShrink: 0, marginLeft: '6px' }}>●</span>}
              </div>
            </button>
          ))}

          {filteredItems.length === 0 && search && (
            <div style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No planned items match "{search}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
