import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './Icons.jsx';

/**
 * Short confirmation after saving, with an optional Undo. Disappears after
 * `duration` ms; hovering or focusing it keeps it open.
 *
 * toast: { id, message, onUndo?, undoLabel? } | null
 */
export function AppToast({ toast, onDismiss, duration = 5000 }) {
  const [paused, setPaused] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    setUndoing(false);
  }, [toast?.id]);

  useEffect(() => {
    if (!toast || paused) return undefined;
    const t = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(t);
  }, [toast, paused, duration, onDismiss]);

  if (!toast || typeof document === 'undefined') return null;

  const handleUndo = async () => {
    if (!toast.onUndo || undoing) return;
    setUndoing(true);
    try {
      await toast.onUndo();
    } finally {
      onDismiss?.();
    }
  };

  return createPortal(
    <div
      className="app-toast"
      role="status"
      aria-live="polite"
      data-testid="app-toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="app-toast-message">{toast.message}</span>
      {toast.onUndo && (
        <button type="button" className="app-toast-action" onClick={handleUndo} disabled={undoing}>
          {undoing ? 'Undoing…' : (toast.undoLabel || 'Undo')}
        </button>
      )}
      <button type="button" className="app-toast-close" onClick={() => onDismiss?.()} aria-label="Dismiss">
        <XIcon size={12} />
      </button>
    </div>,
    document.body
  );
}
