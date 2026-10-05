import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatDate, getRelativeDay } from '@budget/engine';
import { CalendarIcon } from './Icons.jsx';

export function DatePicker({
  value = '',
  onChange,
  placeholder = 'Select date',
  disabled = false,
  month = null,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState('down');
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef(null);

  // Parse current value or fallback to today/month
  const today = new Date();
  const parsedDate = value ? new Date(value + 'T00:00:00') : null;

  const defaultYear = parsedDate
    ? parsedDate.getFullYear()
    : month?.year || today.getFullYear();
  const defaultMonth = parsedDate
    ? parsedDate.getMonth()
    : (month?.month ? month.month - 1 : today.getMonth());

  const [viewYear, setViewYear] = useState(defaultYear);
  const [viewMonth, setViewMonth] = useState(defaultMonth);

  // Sync view when value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Dynamically evaluate whether popover should pop up or down based on available space
  const updatePlacement = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // If zeroed (e.g. unmounted or headless test runner)
    if (rect.top === 0 && rect.bottom === 0 && rect.width === 0 && rect.height === 0) {
      return;
    }

    // Horizontal bounds: if opening to the right would overflow the viewport, align right
    const POPOVER_WIDTH = 270;
    if (rect.left + POPOVER_WIDTH > window.innerWidth - 12) {
      setAlignRight(true);
    } else {
      setAlignRight(false);
    }

    // Find scrollable parent (e.g. .modal-content or element with overflow-y)
    let parent = containerRef.current.parentElement;
    let scrollParent = null;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (['auto', 'scroll'].includes(style.overflowY) || parent.classList.contains('modal-content')) {
        scrollParent = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const spaceAboveViewport = rect.top;
    const spaceBelowViewport = window.innerHeight - rect.bottom;

    let spaceAbove = spaceAboveViewport;
    let spaceBelow = spaceBelowViewport;

    if (scrollParent) {
      const pRect = scrollParent.getBoundingClientRect();
      spaceAbove = Math.min(spaceAboveViewport, rect.top - pRect.top);
      spaceBelow = Math.min(spaceBelowViewport, pRect.bottom - rect.bottom);
    }

    const POPOVER_HEIGHT = 280;

    // Prefer popping down if there is adequate room, otherwise pop up
    if (spaceBelow >= POPOVER_HEIGHT) {
      setPlacement('down');
    } else if (spaceAbove >= POPOVER_HEIGHT) {
      setPlacement('up');
    } else if (spaceBelow >= spaceAbove) {
      setPlacement('down');
    } else {
      setPlacement('up');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePlacement();
      const parentFormGroup = containerRef.current?.closest('.form-group');
      const parentFormRow = containerRef.current?.closest('.form-row');
      if (parentFormGroup) {
        parentFormGroup.classList.add('has-open-datepicker');
      }
      if (parentFormRow) {
        parentFormRow.classList.add('has-open-datepicker');
      }
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, true);
      return () => {
        if (parentFormGroup) {
          parentFormGroup.classList.remove('has-open-datepicker');
        }
        if (parentFormRow) {
          parentFormRow.classList.remove('has-open-datepicker');
        }
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement, true);
      };
    }
  }, [isOpen, updatePlacement]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (dayNum, targetYear, targetMonth) => {
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${targetYear}-${pad(targetMonth + 1)}-${pad(dayNum)}`;
    onChange?.(formatted);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    onChange?.(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange?.('');
    setIsOpen(false);
  };

  // Build calendar matrix
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const days = [];

  // Prev month filler days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: daysInPrevMonth - i,
      month: viewMonth === 0 ? 11 : viewMonth - 1,
      year: viewMonth === 0 ? viewYear - 1 : viewYear,
      isCurrentMonth: false
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      day: i,
      month: viewMonth,
      year: viewYear,
      isCurrentMonth: true
    });
  }

  // Next month filler days (fill up to multiple of 7)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        month: viewMonth === 11 ? 0 : viewMonth + 1,
        year: viewMonth === 11 ? viewYear + 1 : viewYear,
        isCurrentMonth: false
      });
    }
  }

  // Formatted trigger label
  const renderTriggerLabel = () => {
    if (!value) {
      return <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>;
    }

    const d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return value;

    const monthStr = monthNames[d.getMonth()]?.slice(0, 3);
    const dayStr = d.getDate();
    const yearStr = d.getFullYear();

    // Check if pre-month
    if (month?.year && month?.month) {
      const relDay = getRelativeDay(value, month.year, month.month);
      if (relDay < 0) {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>Day {relDay}</span>
            <span>·</span>
            <span>{monthStr} {dayStr}, {yearStr}</span>
          </span>
        );
      }
    }

    return `${monthStr} ${dayStr}, ${yearStr}`;
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div ref={containerRef} className={`datepicker-container ${isOpen ? 'open is-open' : ''}`}>
      <button
        type="button"
        className={`datepicker-trigger ${isOpen ? 'open' : ''}`}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={14} color="var(--text-secondary)" />
          {renderTriggerLabel()}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className={`datepicker-popover placement-${placement} ${alignRight ? 'align-right' : ''}`} role="dialog" aria-label="Choose Date">
          {/* Header */}
          <div className="datepicker-header">
            <button
              type="button"
              className="datepicker-nav-btn"
              onClick={handlePrevMonth}
              title="Previous month"
            >
              ◀
            </button>
            <span className="datepicker-title">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="datepicker-nav-btn"
              onClick={handleNextMonth}
              title="Next month"
            >
              ▶
            </button>
          </div>

          {/* Weekday labels */}
          <div className="datepicker-weekdays">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="datepicker-days-grid">
            {days.map((item, index) => {
              const pad = (n) => String(n).padStart(2, '0');
              const cellDateStr = `${item.year}-${pad(item.month + 1)}-${pad(item.day)}`;
              const isSelected = value === cellDateStr;
              const isToday = todayStr === cellDateStr;

              return (
                <button
                  key={`${item.year}-${item.month}-${item.day}-${index}`}
                  type="button"
                  className={`datepicker-day ${item.isCurrentMonth ? '' : 'outside-month'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => handleSelectDay(item.day, item.year, item.month)}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Quick Shortcuts */}
          <div className="datepicker-footer">
            <button
              type="button"
              className="btn-subtle"
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={handleSelectToday}
            >
              Today
            </button>
            {!required && value && (
              <button
                type="button"
                className="btn-subtle"
                style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--text-muted)' }}
                onClick={handleClear}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
