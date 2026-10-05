import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { MapPinIcon } from './Icons.jsx';

export function TimelineList({
  events = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  selectedDay = null,
  onSelectDay = null,
  currentDay = null,
  month = null,
  selectedAccountId = 'all',
  selectedAccount = null,
  bankAccounts = [],
  wallets = [],
  onCreditSalary = null
}) {
  const [filterType, setFilterType] = useState('all');

  // Fast lookup map for account names (banks and wallets)
  const accountMap = useMemo(() => {
    const map = new Map();
    (bankAccounts || []).forEach((b) => {
      if (b._id) map.set(String(b._id), b.name);
      if (b.id) map.set(String(b.id), b.name);
    });
    (wallets || []).forEach((w) => {
      if (w._id) map.set(String(w._id), w.name);
      if (w.id) map.set(String(w.id), w.name);
    });
    return map;
  }, [bankAccounts, wallets]);

  const normSelectedId = String(selectedAccountId || '');
  const isFilteringAccount = Boolean(normSelectedId && normSelectedId !== 'all');

  // Enriched events with account-specific amounts, running balances, transfer details, and breaches
  const processedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];

    let fallbackRunningBalance = Number(selectedAccount?.openingBalance) || 0;

    return events.map((evt, idx) => {
      let displayAmount = evt.amount;
      let displayBalance = evt.balanceAfter;
      let transferDetail = null;
      let isTransferOut = false;
      let isTransferIn = false;

      if (isFilteringAccount) {
        if (evt.itemType === 'transfer') {
          const sBank = evt.sourceBankAccountId
            ? String(evt.sourceBankAccountId._id || evt.sourceBankAccountId.id || evt.sourceBankAccountId)
            : '';
          const sWall = evt.sourceWalletId
            ? String(evt.sourceWalletId._id || evt.sourceWalletId.id || evt.sourceWalletId)
            : '';
          const dBank = evt.destinationBankAccountId
            ? String(evt.destinationBankAccountId._id || evt.destinationBankAccountId.id || evt.destinationBankAccountId)
            : '';
          const dWall = evt.destinationWalletId
            ? String(evt.destinationWalletId._id || evt.destinationWalletId.id || evt.destinationWalletId)
            : '';

          const isSource = Boolean((sBank && sBank === normSelectedId) || (sWall && sWall === normSelectedId));
          const isDest = Boolean((dBank && dBank === normSelectedId) || (dWall && dWall === normSelectedId));
          const trAmt = Math.abs(Number(evt.transferAmount) || 0);

          if (isSource) {
            isTransferOut = true;
            displayAmount = -trAmt;
            const destName = accountMap.get(dBank || dWall) || (evt.destinationType === 'wallet' ? 'Wallet' : 'Bank Account');
            transferDetail = `transfer • sent to ${destName}`;
            displayBalance = evt.sourceAccountBalanceAfter;
          } else if (isDest) {
            isTransferIn = true;
            displayAmount = trAmt;
            const srcName = accountMap.get(sBank || sWall) || (evt.sourceType === 'wallet' ? 'Wallet' : 'Bank Account');
            transferDetail = `transfer • received from ${srcName}`;
            displayBalance = evt.destinationAccountBalanceAfter;
          } else {
            displayAmount = evt.amount;
            transferDetail = 'transfer';
            displayBalance = evt.accountBalanceAfter;
          }
        } else {
          displayAmount = evt.amount;
          displayBalance = evt.accountBalanceAfter;
        }

        // Robust fallback for running balance if engine accountBalanceAfter is missing
        if (displayBalance === null || displayBalance === undefined) {
          fallbackRunningBalance += displayAmount;
          displayBalance = fallbackRunningBalance;
        } else {
          fallbackRunningBalance = displayBalance;
        }
      } else {
        // Unified mode
        displayAmount = evt.amount;
        displayBalance = evt.balanceAfter;

        if (evt.itemType === 'transfer') {
          const sBank = evt.sourceBankAccountId ? String(evt.sourceBankAccountId._id || evt.sourceBankAccountId.id || evt.sourceBankAccountId) : '';
          const sWall = evt.sourceWalletId ? String(evt.sourceWalletId._id || evt.sourceWalletId.id || evt.sourceWalletId) : '';
          const dBank = evt.destinationBankAccountId ? String(evt.destinationBankAccountId._id || evt.destinationBankAccountId.id || evt.destinationBankAccountId) : '';
          const dWall = evt.destinationWalletId ? String(evt.destinationWalletId._id || evt.destinationWalletId.id || evt.destinationWalletId) : '';
          const srcName = accountMap.get(sBank || sWall) || 'Account';
          const dstName = accountMap.get(dBank || dWall) || 'Account';
          transferDetail = `transfer • ${srcName} → ${dstName} (net ${currencySymbol}0)`;
        } else {
          const bId = evt.bankAccountId ? String(evt.bankAccountId._id || evt.bankAccountId.id || evt.bankAccountId) : '';
          const wId = evt.walletId ? String(evt.walletId._id || evt.walletId.id || evt.walletId) : '';
          const acctName = accountMap.get(bId || wId);
          const baseType = evt.itemType === 'actual-income'
            ? 'income • actual credited'
            : `${evt.itemType} ${evt.isActual ? '• actual' : evt.isPending ? `• pending (orig. Day ${evt.originalDay})` : (evt.isPaid ? (evt.originalDay && evt.originalDay !== evt.day ? `• paid (orig. Day ${evt.originalDay})` : '• paid') : '• planned')}${evt.isFixed ? ' • fixed' : ''}`;
          transferDetail = acctName ? `${baseType} • ${acctName}` : baseType;
        }
      }

      // Check breach against active safety floor (account minimum balance in account mode, unified floor in unified mode)
      const isBreach = displayBalance < safetyFloor;

      return {
        ...evt,
        displayAmount,
        displayBalance,
        transferDetail,
        isTransferOut,
        isTransferIn,
        isBreach
      };
    });
  }, [events, isFilteringAccount, normSelectedId, selectedAccount, accountMap, safetyFloor, currencySymbol]);

  if (!processedEvents || processedEvents.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No timeline events generated for this month.
      </div>
    );
  }

  // Count filter items using account-specific display values
  const counts = {
    all: processedEvents.length,
    incomes: processedEvents.filter((e) => e.displayAmount > 0).length,
    planned: processedEvents.filter((e) => !e.isActual && e.displayAmount < 0).length,
    pending: processedEvents.filter((e) => e.isPending).length,
    actuals: processedEvents.filter((e) => e.isActual).length,
    breaches: processedEvents.filter((e) => e.isBreach).length
  };

  // Apply filters
  let filteredEvents = processedEvents.filter((evt) => {
    // 1. Day selection from chart
    if (selectedDay !== null && evt.day !== selectedDay) {
      return false;
    }

    // 2. Type filter pill
    if (filterType === 'incomes') return evt.displayAmount > 0;
    if (filterType === 'planned') return !evt.isActual && evt.displayAmount < 0;
    if (filterType === 'pending') return Boolean(evt.isPending);
    if (filterType === 'actuals') return evt.isActual;
    if (filterType === 'breaches') return evt.isBreach;
    return true;
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="card-title">Interactive timeline</span>
          {isFilteringAccount && selectedAccount && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>{selectedAccount.name}</span>
              {safetyFloor > 0 && (
                <span style={{ opacity: 0.75 }}>• Min Floor: {formatCurrency(safetyFloor, currencySymbol)}</span>
              )}
            </span>
          )}
        </div>

        {selectedDay !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                borderRadius: '12px',
                fontWeight: 600
              }}
            >
              Day {selectedDay} filtered
            </span>
            <button
              type="button"
              className="btn-subtle"
              style={{ fontSize: '11px', padding: '2px 6px' }}
              onClick={() => onSelectDay?.(null)}
            >
              Show all days
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs / Pills */}
      <div className="timeline-filters-row">
        {[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'incomes', label: 'Incomes', count: counts.incomes },
          { id: 'planned', label: 'Planned', count: counts.planned },
          ...(counts.pending > 0 ? [{ id: 'pending', label: 'Pending', count: counts.pending }] : []),
          { id: 'actuals', label: 'Actuals', count: counts.actuals },
          { id: 'breaches', label: 'Breaches', count: counts.breaches }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`timeline-filter-btn ${filterType === tab.id ? 'active' : ''}`}
            onClick={() => setFilterType(tab.id)}
          >
            <span>{tab.label}</span>
            <span className="filter-count tabular-nums">{tab.count}</span>
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No events match the selected filter.
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="btn-subtle"
              style={{ fontSize: '12px' }}
              onClick={() => {
                setFilterType('all');
                onSelectDay?.(null);
              }}
            >
              Reset all filters
            </button>
          </div>
        </div>
      ) : (
        <div className="timeline-list">
          {filteredEvents.map((evt, idx) => {
            const isPreMonth = evt.day < 0;
            const isSelected = selectedDay === evt.day;
            const isToday = currentDay !== null && evt.day === currentDay;

            // Check if we should insert the "Today" marker right before this event
            // when this is the first event on or after currentDay
            const showTodayMarker =
              currentDay !== null &&
              selectedDay === null &&
              evt.day >= currentDay &&
              (idx === 0 || filteredEvents[idx - 1].day < currentDay);

            return (
              <React.Fragment key={`${evt.date}-${evt.sourceIndex || idx}`}>
                {showTodayMarker && (
                  <div className="timeline-today-divider">
                    <div className="today-line" />
                    <span className="today-badge">
                      <MapPinIcon size={12} color="currentColor" />
                      Today ({formatDisplayDate(todayStr, true)})
                    </span>
                    <div className="today-line" />
                  </div>
                )}

                <div
                  className={`timeline-event-row ${isSelected ? 'selected' : ''} ${evt.isBreach ? 'row-breached' : ''}`}
                  onClick={() => onSelectDay?.(isSelected ? null : evt.day)}
                  title="Click to focus this day on the balance chart"
                >
                  <div className="timeline-event-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="timeline-event-label">{evt.label}</span>
                      {evt.isPending && (
                        <span
                          className="pending-status-pill"
                          title={`Scheduled for Day ${evt.originalDay} but unpaid; cash remains in today's balance.`}
                        >
                          Pending
                        </span>
                      )}
                      {evt.isSalary && evt.isActual && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', fontWeight: 600 }}>
                          ✓ Credited
                        </span>
                      )}
                      {evt.isPaid && evt.originalDay && evt.originalDay !== evt.day && !evt.isPending && (
                        <span
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary)', fontWeight: 600 }}
                          title={`Paid on Day ${evt.day} (originally scheduled for Day ${evt.originalDay})`}
                        >
                          Orig Day {evt.originalDay}
                        </span>
                      )}
                    </div>
                    <span className="timeline-event-type">
                      {evt.transferDetail || (
                        evt.itemType === 'actual-income'
                          ? 'income • actual credited'
                          : `${evt.itemType} ${evt.isActual ? '• actual' : evt.isPending ? `• pending (orig. Day ${evt.originalDay})` : (evt.isPaid ? (evt.originalDay && evt.originalDay !== evt.day ? `• paid (orig. Day ${evt.originalDay})` : '• paid') : '• planned')}${evt.isFixed ? ' • fixed' : ''}`
                      )}
                    </span>
                  </div>

                  <div className="timeline-event-date">
                    <div className="event-date-text tabular-nums">{formatDisplayDate(evt.date, true)}</div>
                    {isPreMonth && (
                      <span className="day-offset-pill tabular-nums">
                        Day {evt.day}
                      </span>
                    )}
                    {isToday && !isPreMonth && (
                      <span className="today-pill">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="timeline-event-numbers">
                    <span
                      className={`timeline-event-amount tabular-nums ${evt.displayAmount > 0 ? 'positive' : ''}`}
                    >
                      {evt.itemType === 'transfer' && !isFilteringAccount
                        ? `⇄ ${formatCurrency(evt.transferAmount, currencySymbol)}`
                        : `${evt.displayAmount > 0 ? '+' : ''}${formatCurrency(evt.displayAmount, currencySymbol)}`
                      }
                    </span>
                    <span
                      className={`timeline-event-balance tabular-nums ${evt.isBreach ? 'text-breached' : ''}`}
                    >
                      {evt.isBreach && <span className="inline-breach-glyph">▲ </span>}
                      bal: {formatCurrency(evt.displayBalance, currencySymbol)}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

