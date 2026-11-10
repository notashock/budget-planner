import React, { useState } from 'react';
import {
  ZapIcon,
  XIcon,
  BuildingLibraryIcon,
  WalletIcon,
  SparklesIcon
} from './Icons.jsx';
import { formatCurrency } from '@budget/engine';
import { AnimatedModal } from './AnimatedModal.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function MonthRolloverModal({
  isOpen,
  onClose,
  month,
  bankAccounts = [],
  wallets = [],
  currencySymbol = '₹',
  onConfirmRollover
}) {
  const [carryBalance, setCarryBalance] = useState(true);
  const [rolloverUnpaid, setRolloverUnpaid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!month) return null;

  const currentMonthNum = Number(month.month);
  const currentYear = Number(month.year);
  let nextMonthNum = currentMonthNum + 1;
  let nextYear = currentYear;
  if (nextMonthNum > 12) {
    nextMonthNum = 1;
    nextYear += 1;
  }
  const currentMonthName = MONTH_NAMES[currentMonthNum - 1] || `Month ${currentMonthNum}`;
  const nextMonthName = MONTH_NAMES[nextMonthNum - 1] || `Month ${nextMonthNum}`;
  const targetLabel = `${nextMonthName} ${nextYear}`;

  const allAccounts = [
    ...bankAccounts.map((b) => ({ ...b, accountCategory: 'bank' })),
    ...wallets.map((w) => ({ ...w, accountCategory: 'wallet' }))
  ];

  const handleSubmit = async (e, requestClose) => {
    e?.preventDefault?.();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirmRollover?.(carryBalance, rolloverUnpaid);
      if (typeof requestClose === 'function') {
        requestClose();
      }
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to roll over into next month');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="480px"
      dataTestId="month-rollover-modal"
      style={{ padding: '24px' }}
    >
      {({ requestClose }) => (
        <form onSubmit={(e) => handleSubmit(e, requestClose)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--emerald, #10b981)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ZapIcon size={16} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                  Start {targetLabel}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Cycle rollover from {currentMonthName} {currentYear}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={() => {
                if (typeof requestClose === 'function') requestClose();
                else onClose?.();
              }}
              title="Close"
              aria-label="Close"
            >
              <XIcon size={14} />
            </button>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Advance your budget from <strong>{currentMonthName} {currentYear}</strong> to <strong>{targetLabel}</strong>.
            Your account ending balances will safely transition as opening balances.
          </p>

          {/* Account Opening Balance Preview */}
          <div
            style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              marginBottom: '16px'
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>Opening Balances Preview</span>
              <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {carryBalance ? 'Carrying Ending Balances' : 'Resetting to Zero'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
              {allAccounts.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
                  No accounts linked yet
                </div>
              ) : (
                allAccounts.map((acc) => {
                  const closing = month.closingBalances?.[acc._id || acc.id]?.closingBalance;
                  const balance = carryBalance
                    ? (closing !== undefined ? closing : (acc.openingBalance || 0))
                    : 0;
                  const Icon = acc.accountCategory === 'bank' ? BuildingLibraryIcon : WalletIcon;

                  return (
                    <div
                      key={acc._id || acc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12.5px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon size={13} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text)' }}>{acc.name}</span>
                      </div>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }}>
                        {formatCurrency(balance, currencySymbol)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Rollover Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12.5px',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                data-testid="rollover-unpaid-checkbox"
                checked={rolloverUnpaid}
                onChange={(e) => setRolloverUnpaid(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <div>
                <strong>Roll over unpaid planned items</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Carries forward unfulfilled one-time expenses and re-adjusts initial balances.
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12.5px',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                data-testid="carry-balance-checkbox"
                checked={carryBalance}
                onChange={(e) => setCarryBalance(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <div>
                <strong>Carry forward ending account balances</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Snapshots closing balances as new opening balances for {targetLabel}.
                </div>
              </div>
            </label>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--negative, #ef4444)',
                fontSize: '12px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (typeof requestClose === 'function') requestClose();
                else onClose?.();
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="confirm-rollover-btn"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <SparklesIcon size={14} />
              <span>{loading ? 'Starting Month...' : `Confirm & Start ${targetLabel}`}</span>
            </button>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
}
