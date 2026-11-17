import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRightLeftIcon, ChevronDownIcon, CheckIcon } from './Icons.jsx';

/**
 * Compact sort control for the search capsule: a button that opens a styled
 * listbox (instead of the OS-native <select> popup, which ignored the app's
 * type, colours and dark mode on desktop browsers).
 * Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter selects, Esc closes.
 */
export function SortMenu({ value, options, onChange, label = 'Sort' }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    listRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const openMenu = () => {
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (idx) => {
    const opt = options[idx];
    if (opt) onChange(opt.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(activeIdx);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') buttonRef.current?.focus();
    }
  };

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`sort-menu-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onButtonKey}
      >
        <ArrowRightLeftIcon size={12} />
        <span className="sort-menu-current">{current.short || current.label}</span>
        <ChevronDownIcon size={10} className="sort-menu-chevron" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-opt-${activeIdx}`}
          className="sort-menu-list"
          onKeyDown={onListKey}
        >
          <li className="sort-menu-heading" role="presentation">Sort by</li>
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              id={`${listId}-opt-${idx}`}
              role="option"
              aria-selected={opt.value === value}
              className={`sort-menu-option ${idx === activeIdx ? 'is-active' : ''} ${opt.value === value ? 'is-selected' : ''}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(idx)}
            >
              <span>{opt.label}</span>
              <span className="sort-menu-check" aria-hidden="true">{opt.value === value ? <CheckIcon size={13} strokeWidth={2.4} /> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
