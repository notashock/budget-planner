import React, { useState, useRef, useEffect } from 'react';

/**
 * Reusable Rich Select Dropdown matching the UI's Swiss minimalist aesthetic.
 * Uses .app-select-trigger and .app-dropdown-menu with tactile options, icons, and balances.
 */
export function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  disabled = false,
  id,
  className = '',
  style = {},
  dataTestId,
  dropUp = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const [computedDropUp, setComputedDropUp] = useState(dropUp);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (!dropUp && spaceBelow < 220 && rect.top > 200) {
          setComputedDropUp(true);
        } else if (!dropUp) {
          setComputedDropUp(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isOpen, dropUp]);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const handleSelect = (val) => {
    onChange?.({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${isOpen ? 'is-open' : ''} ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: isOpen ? 70 : 1,
        ...style
      }}
    >
      <button
        id={id}
        type="button"
        disabled={disabled}
        data-testid={dataTestId}
        className={`app-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          {selectedOption?.icon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
              {selectedOption.icon}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedOption ? 500 : 400 }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'var(--surface-subtle)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                flexShrink: 0
              }}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '8px', flexShrink: 0, transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          className="app-dropdown-menu custom-select-dropdown"
          role="listbox"
          style={{
            position: 'absolute',
            ...(computedDropUp ? { bottom: '100%', top: 'auto', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
            left: 0,
            right: 0,
            width: '100%',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 1000
          }}
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '7px 10px',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  {opt.icon && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                      {opt.icon}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                    {opt.label}
                  </span>
                  {opt.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        flexShrink: 0
                      }}
                    >
                      {opt.badge}
                    </span>
                  )}
                </div>
                {opt.sublabel && (
                  <span className="tabular-nums" style={{ fontSize: '11px', color: isSelected ? 'var(--text)' : 'var(--text-secondary)', flexShrink: 0, fontWeight: isSelected ? 600 : 500 }}>
                    {opt.sublabel}
                  </span>
                )}
                {isSelected && !opt.sublabel && (
                  <span style={{ fontSize: '10px', color: 'var(--text)', flexShrink: 0 }}>●</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
