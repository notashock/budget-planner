import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon } from './Icons.jsx';

/**
 * A "⋯" button with a small menu: row actions (edit, delete…) and the
 * Transactions filters. Items: { label, onClick, ariaLabel?, danger?, checked? }
 * or { heading } for a section label. Esc or a click outside closes it.
 */
export function ActionMenu({ label, items, className = '', triggerContent = '⋯' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`action-menu ${className}`.trim()}>
      <button
        type="button"
        className="action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {triggerContent}
      </button>
      {open && (
        <div className="app-dropdown-menu action-menu-list" role="menu">
          {items.map((item, i) => (item.heading ? (
            <div key={`h-${item.heading}`} className="action-menu-heading">{item.heading}</div>
          ) : (
            <button
              key={`${item.label}-${i}`}
              type="button"
              role="menuitem"
              className={`app-dropdown-item${item.danger ? ' danger' : ''}`}
              aria-label={item.ariaLabel || item.label}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
            >
              <span>{item.label}</span>
              {item.checked && <CheckIcon size={13} />}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
