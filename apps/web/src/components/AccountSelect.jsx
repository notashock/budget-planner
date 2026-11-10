import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '@budget/engine';
import { BuildingLibraryIcon, WalletIcon, ChevronDownIcon } from './Icons.jsx';

/**
 * Unified Grouped Account Selector.
 * Merges Bank Accounts and Wallets into a single accessible selector with
 * live balances, account masking, and safety floor indicators.
 */
export function AccountSelect({
  accountType = 'bank',
  accountId = '',
  onChange,
  bankAccounts = [],
  wallets = [],
  currencySymbol = '₹',
  simulation = null,
  accountSimulations = {},
  disabled = false,
  id,
  dataTestId,
  className = '',
  style = {},
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
        if (!dropUp && spaceBelow < 240 && rect.top > 220) {
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

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Find active selected account
  const selectedAccount = accountType === 'bank'
    ? bankAccounts.find((b) => String(b._id || b.id) === String(accountId))
    : wallets.find((w) => String(w._id || w.id) === String(accountId));

  // Determine fallback if not found
  const activeAccount = selectedAccount || (
    accountType === 'bank'
      ? (bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || wallets[0])
      : (wallets.find((w) => w.isPrimary) || wallets[0] || bankAccounts[0])
  );

  const activeType = selectedAccount
    ? accountType
    : (bankAccounts.some((b) => String(b._id || b.id) === String(activeAccount?._id || activeAccount?.id)) ? 'bank' : 'wallet');

  const getAccountBalance = (acc) => {
    if (!acc) return 0;
    const aId = String(acc.id || acc._id || '');
    if (aId) {
      if (accountSimulations?.[aId]?.todayBalance !== undefined) {
        return accountSimulations[aId].todayBalance;
      }
      if (simulation?.accounts?.[aId]?.todayBalance !== undefined) {
        return simulation.accounts[aId].todayBalance;
      }
    }
    return acc.currentBalance ?? acc.balance ?? acc.openingBalance ?? 0;
  };

  const handleSelect = (type, targetId) => {
    onChange?.({ accountType: type, accountId: targetId });
    setIsOpen(false);
  };

  const hasAnyAccount = bankAccounts.length > 0 || wallets.length > 0;

  if (!hasAnyAccount) {
    return (
      <div
        className={`app-select-trigger disabled ${className}`}
        style={{
          opacity: 0.6,
          cursor: 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          ...style
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No Accounts Available</span>
      </div>
    );
  }

  const activeBalance = getAccountBalance(activeAccount);
  const activeMinBal = activeAccount?.minimumBalance || 0;
  const isFloorBreached = activeMinBal > 0 && activeBalance < activeMinBal;

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${isOpen ? 'is-open' : ''} ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: isOpen ? 80 : 1,
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
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '9px 12px',
          minHeight: '40px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
            {activeType === 'bank' ? <BuildingLibraryIcon size={14} /> : <WalletIcon size={14} />}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: '13px' }}>
            {activeAccount?.name || 'Select Account'}
            {activeAccount?.accountNumberMasked ? ` (••••${activeAccount.accountNumberMasked})` : ''}
          </span>
          {activeAccount?.isPrimary && (
            <span
              style={{
                fontSize: '9.5px',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'var(--surface-subtle)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                flexShrink: 0
              }}
            >
              Primary
            </span>
          )}
          {isFloorBreached && (
            <span
              title="Below safety floor"
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--rose, #f43f5e)',
                flexShrink: 0
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
          <span
            className="tabular-nums"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: isFloorBreached ? 'var(--rose, #f43f5e)' : 'var(--text)'
            }}
          >
            {formatCurrency(activeBalance, currencySymbol)}
          </span>
          <span
            style={{
              display: 'inline-flex',
              color: 'var(--text-secondary)',
              transition: 'transform 0.15s ease',
              transform: isOpen ? 'rotate(180deg)' : 'none'
            }}
          >
            <ChevronDownIcon size={12} />
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          className="app-dropdown-menu custom-select-dropdown"
          role="listbox"
          style={{
            position: 'absolute',
            ...(computedDropUp ? { bottom: '100%', top: 'auto', marginBottom: '6px' } : { top: '100%', marginTop: '6px' }),
            left: 0,
            right: 0,
            width: '100%',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0,0,0,0.3))',
            borderRadius: '10px',
            padding: '4px'
          }}
        >
          {/* Section: Bank Accounts */}
          {bankAccounts.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-tertiary)',
                  padding: '6px 10px 3px 10px'
                }}
              >
                Bank Accounts
              </div>
              {bankAccounts.map((b) => {
                const bId = b._id || b.id;
                const isSelected = activeType === 'bank' && String(activeAccount?._id || activeAccount?.id) === String(bId);
                const bal = getAccountBalance(b);
                const breached = (b.minimumBalance || 0) > 0 && bal < b.minimumBalance;

                return (
                  <button
                    key={`bank-${bId}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelect('bank', bId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      width: '100%'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ display: 'inline-flex', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <BuildingLibraryIcon size={14} />
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                        {b.name}{b.accountNumberMasked ? ` (••••${b.accountNumberMasked})` : ''}
                      </span>
                      {b.isPrimary && (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            background: 'var(--surface-subtle)',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            flexShrink: 0
                          }}
                        >
                          Primary
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {breached && (
                        <span style={{ fontSize: '10px', color: 'var(--rose, #f43f5e)', fontWeight: 500 }}>
                          Below floor
                        </span>
                      )}
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '11.5px',
                          fontWeight: isSelected ? 600 : 500,
                          color: breached ? 'var(--rose, #f43f5e)' : isSelected ? 'var(--text)' : 'var(--text-secondary)'
                        }}
                      >
                        {formatCurrency(bal, currencySymbol)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section: Wallets */}
          {wallets.length > 0 && (
            <div style={{ marginTop: bankAccounts.length > 0 ? '4px' : '0' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-tertiary)',
                  padding: '6px 10px 3px 10px'
                }}
              >
                Wallets & Envelopes
              </div>
              {wallets.map((w) => {
                const wId = w._id || w.id;
                const isSelected = activeType === 'wallet' && String(activeAccount?._id || activeAccount?.id) === String(wId);
                const bal = getAccountBalance(w);

                return (
                  <button
                    key={`wallet-${wId}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`app-dropdown-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelect('wallet', wId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      width: '100%'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ display: 'inline-flex', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <WalletIcon size={14} />
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                        {w.name}
                      </span>
                      {w.isPrimary && (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            background: 'var(--surface-subtle)',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            flexShrink: 0
                          }}
                        >
                          Primary
                        </span>
                      )}
                    </div>
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: '11.5px',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? 'var(--text)' : 'var(--text-secondary)',
                        flexShrink: 0
                      }}
                    >
                      {formatCurrency(bal, currencySymbol)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default AccountSelect;
