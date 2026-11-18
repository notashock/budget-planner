import React from 'react';
import { formatCurrency } from '@budget/engine';
import { AlertTriangleIcon } from './Icons.jsx';

/**
 * Inline safety-floor warning shown above a form's footer while the entered
 * outflow would take an account below its floor. The form keeps working: its
 * submit button reads "… anyway", so seeing this notice is the confirmation.
 */
export function FloorBreachNotice({ check, currencySymbol = '₹' }) {
  if (!check?.breaches) return null;
  const short = check.minimumBalance - check.balanceAfter;
  return (
    <div className="floor-breach-notice" role="alert" data-testid="floor-breach-notice">
      <AlertTriangleIcon size={14} />
      <span>
        This takes <strong>{check.accountName}</strong> to{' '}
        <strong className="tabular-nums">{formatCurrency(check.balanceAfter, currencySymbol)}</strong>,{' '}
        <span className="tabular-nums">{formatCurrency(short, currencySymbol)}</span> below your{' '}
        <span className="tabular-nums">{formatCurrency(check.minimumBalance, currencySymbol)}</span> safety floor.
      </span>
    </div>
  );
}

/** Submit label for a form whose outflow breaches the floor. */
export function anywayLabel(label, check) {
  return check?.breaches ? `${label} anyway` : label;
}
