import React, { useState, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import {
  MapPinIcon,
  CheckCircleIcon,
  ArrowRightLeftIcon,
  AlertTriangleIcon,
  CalendarIcon,
  EditIcon
} from './Icons.jsx';

gsap.registerPlugin(useGSAP);

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
  onCreditSalary = null,
  onPayTransaction = null,
  onEditTransaction = null
}) {
  const now = new Date();

  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const targetDay = currentDay !== null && currentDay !== undefined ? currentDay : 1;

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
            : evt.itemType === 'planned-transaction'
            ? (evt.isPending ? `planned • pending (orig. Day ${evt.originalDay})` : 'planned commitment')
            : `${evt.itemType} ${evt.isActual ? '• actual' : evt.isPending ? `• pending (orig. Day ${evt.originalDay})` : (evt.isPaid ? (evt.originalDay && evt.originalDay !== evt.day ? `• paid (orig. Day ${evt.originalDay})` : '• paid') : '• planned')}${evt.isFixed ? ' • fixed' : ''}`;
          transferDetail = acctName ? `${baseType} • ${acctName}` : baseType;
        }
      }

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

  // Today's Focus event classification: Today's items + overdue/pending obligations
  const isTodayEvent = (e) => e.day === targetDay || e.date === todayStr;
  const isCarriedOverOverdue = (e) => (e.day < targetDay && !e.isActual && !e.isPaid && e.amount < 0) || e.isPending;

  // Counts for Today
  const todaySummary = useMemo(() => {
    let plannedTotal = 0;
    let spentTotal = 0;
    let overdueCount = 0;

    processedEvents.forEach((e) => {
      if (isCarriedOverOverdue(e)) {
        overdueCount++;
      } else if (isTodayEvent(e)) {
        if (e.isActual && e.amount < 0) spentTotal += Math.abs(e.amount);
        else if (!e.isActual && e.amount < 0) plannedTotal += Math.abs(e.amount);
      }
    });

    return {
      plannedTotal,
      spentTotal,
      overdueCount
    };
  }, [processedEvents, targetDay, todayStr]);

  // Quick Pay handler for carried over overdue commitments
  const handleQuickPay = async (evt) => {
    const txId = evt.transactionId || evt.itemId || evt.id || evt._id;
    if (!txId || !onPayTransaction) return;
    try {
      const amt = Math.abs(evt.amount);
      const accId = evt.bankAccountId || evt.walletId || (selectedAccountId !== 'all' ? selectedAccountId : undefined);
      await onPayTransaction(txId, {
        amount: amt,
        date: todayStr,
        accountId: accId
      });
    } catch (err) {
      console.error('Quick pay failed:', err);
    }
  };

  // Edit handler for unsettled planned transactions
  const handleEditCommitment = (evt) => {
    if (!onEditTransaction) return;
    const txId = evt.transactionId || evt.itemId || evt.id || evt._id;
    const target = evt.rawTransaction || {
      id: txId,
      _id: txId,
      name: evt.label,
      amount: evt.amount,
      plannedAmount: Math.abs(evt.amount),
      accountId: evt.bankAccountId || evt.walletId || (selectedAccountId !== 'all' ? selectedAccountId : undefined),
      date: evt.date,
      category: evt.category || evt.tag
    };
    onEditTransaction(target);
  };

  // Displayed events: strictly Today + Overdue carried-over (or selectedDay if inspected from chart)
  let displayList = [];
  if (selectedDay !== null && selectedDay !== undefined) {
    displayList = processedEvents.filter((evt) => Number(evt.day) === Number(selectedDay));
  } else {
    displayList = processedEvents
      .filter((evt) => isTodayEvent(evt) || isCarriedOverOverdue(evt))
      .sort((a, b) => {
        // Show overdue carried-over items at the very top
        const aOverdue = isCarriedOverOverdue(a);
        const bOverdue = isCarriedOverOverdue(b);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return a.day - b.day;
      });
  }

  const timelineListRef = useRef(null);

  useGSAP(() => {
    if (!timelineListRef.current) return;
    const rows = timelineListRef.current.querySelectorAll('.timeline-event-row');
    if (rows.length > 0) {
      gsap.fromTo(
        rows,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.25, stagger: 0.035, ease: 'power2.out' }
      );
    }
  }, { dependencies: [selectedDay, displayList.length], scope: timelineListRef });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="card-title">Today's transactions</span>

          {selectedDay !== null && (
            <button
              type="button"
              className="timeline-back-today-btn"
              onClick={() => onSelectDay?.(null)}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ← Back to Today
            </button>
          )}

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

        {/* Selected day indicator from chart click */}
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
              Day {selectedDay} inspected
            </span>
          </div>
        )}
      </div>

      {/* Today's High-signal Action Banner when showing Today */}
      {selectedDay === null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--surface-subtle)',
            borderRadius: 'var(--radius)',
            margin: '0 0 12px',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', color: 'var(--text)' }}>
              <MapPinIcon size={14} />
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' }}>
              Today ({formatDisplayDate(todayStr, true)})
            </span>
            {todaySummary.overdueCount > 0 && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--negative, #ef4444)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <AlertTriangleIcon size={10} />
                <span>{todaySummary.overdueCount} Carried Over</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span className="tabular-nums">
              Planned Due: <strong>{formatCurrency(todaySummary.plannedTotal, currencySymbol)}</strong>
            </span>
            <span>•</span>
            <span className="tabular-nums">
              Logged Spent: <strong>{formatCurrency(todaySummary.spentTotal, currencySymbol)}</strong>
            </span>
          </div>
        </div>
      )}

      {processedEvents.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No timeline events generated for this month.
        </div>
      ) : displayList.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {selectedDay === null ? (
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                ✓ No commitments or expenses logged for today.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                All clear on Day {targetDay}. Planned commitments will show here when due.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ margin: 0, fontSize: '13px' }}>No events recorded for Day {selectedDay}.</p>
              <button
                type="button"
                className="btn-subtle"
                style={{ marginTop: '8px', fontSize: '12px' }}
                onClick={() => onSelectDay?.(null)}
              >
                Back to Today's transactions
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="timeline-list" ref={timelineListRef}>
          {displayList.map((evt, idx) => {
            const isPreMonth = evt.day < 0;
            const isSelected = selectedDay === evt.day;
            const isToday = currentDay !== null && evt.day === currentDay;
            const isCarriedOver = isCarriedOverOverdue(evt);

            // Insert "Today" marker right before the first today/future event
            const showTodayMarker =
              currentDay !== null &&
              selectedDay === null &&
              evt.day >= currentDay &&
              (idx === 0 || displayList[idx - 1].day < currentDay);

            return (
              <React.Fragment key={`${evt.date}-${evt.sourceIndex || idx}-${evt.day}`}>
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
                  style={isCarriedOver ? { borderLeft: '3px solid var(--negative, #ef4444)' } : undefined}
                >
                  <div className="timeline-event-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                      <span className="timeline-event-label" title={evt.label}>{evt.label}</span>
                      {evt.displayAmount > 0 ? (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircleIcon size={11} color="#16a34a" />
                          <span>Inflow ({evt.isSalary ? 'Salary' : (evt.tag || evt.category || 'Income')})</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'var(--surface-subtle)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {(() => {
                            const raw = (evt.category || evt.tag || '').toString().trim().toLowerCase();
                            if (raw === 'food') return 'Food';
                            if (raw === 'travel') return 'Travel';
                            if (raw === 'health') return 'Health';
                            if (raw === 'other') return 'Other';
                            return 'General';
                          })()}
                        </span>
                      )}

                      {/* Status Badges & Action Buttons */}
                      {isCarriedOver && (
                        <>
                          <span
                            className="pending-status-pill"
                            title={`Scheduled for Day ${evt.originalDay || evt.day} but unpaid; carried over to today.`}
                            style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--negative, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
                          >
                            Overdue
                          </span>
                          {onEditTransaction && (
                            <button
                              type="button"
                              className="timeline-quick-edit-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCommitment(evt);
                              }}
                              title="Edit planned commitment"
                              style={{
                                padding: '2px 7px',
                                fontSize: '11px',
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <EditIcon size={10} />
                              <span>Edit</span>
                            </button>
                          )}
                          {onPayTransaction && (
                            <button
                              type="button"
                              className="timeline-quick-pay-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickPay(evt);
                              }}
                              title="Quick Mark as Paid (settle today with planned amount)"
                              style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <CheckCircleIcon size={11} color="var(--positive, #16a34a)" />
                              <span>Mark Paid</span>
                            </button>
                          )}
                        </>
                      )}
                      {evt.isPending && !isCarriedOver && (
                        <>
                          <span
                            className="pending-status-pill"
                            title={`Scheduled for Day ${evt.originalDay} but unpaid.`}
                          >
                            Pending
                          </span>
                          {onEditTransaction && (
                            <button
                              type="button"
                              className="timeline-quick-edit-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCommitment(evt);
                              }}
                              title="Edit planned commitment"
                              style={{
                                padding: '2px 7px',
                                fontSize: '11px',
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <EditIcon size={10} />
                              <span>Edit</span>
                            </button>
                          )}
                        </>
                      )}
                      {evt.isPaid && evt.originalDay && evt.originalDay !== evt.day && !evt.isPending && (
                        <span
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary)', fontWeight: 600 }}
                          title={`Paid on Day ${evt.day} (originally scheduled for Day ${evt.originalDay})`}
                        >
                          Orig Day {evt.originalDay}
                        </span>
                      )}
                      {evt.isPlannedTransaction && !isCarriedOver && !evt.isPending && !evt.isPaid && (
                        <>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', fontWeight: 600 }}>
                            Planned
                          </span>
                          {onEditTransaction && (
                            <button
                              type="button"
                              className="timeline-quick-edit-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCommitment(evt);
                              }}
                              title="Edit planned commitment"
                              style={{
                                padding: '2px 7px',
                                fontSize: '11px',
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <EditIcon size={10} />
                              <span>Edit</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <span className="timeline-event-type">
                      {evt.transferDetail || (
                        evt.itemType === 'actual-income'
                          ? 'income • actual credited'
                          : evt.itemType === 'planned-transaction'
                          ? (evt.isPending ? `planned • pending (orig. Day ${evt.originalDay})` : 'planned commitment')
                          : `${evt.itemType} ${evt.isActual ? '• actual' : evt.isPending ? `• pending (orig. Day ${evt.originalDay})` : (evt.isPaid ? (evt.originalDay && evt.originalDay !== evt.day ? `• paid (orig. Day ${evt.originalDay})` : '• paid') : '• planned')}${evt.isFixed ? ' • fixed' : ''}`
                      )}
                    </span>
                  </div>

                  <div className="timeline-event-numbers">
                    <span className="timeline-event-date tabular-nums">
                      {isPreMonth ? `Pre-Month (Day ${evt.day})` : formatDisplayDate(evt.date, true)}
                    </span>
                    <span className={`timeline-event-amount tabular-nums ${evt.displayAmount > 0 ? 'positive' : ''}`}>
                      {evt.displayAmount > 0 ? '+' : ''}
                      {formatCurrency(evt.displayAmount, currencySymbol)}
                    </span>
                    <span
                      className={`timeline-event-balance tabular-nums ${evt.isBreach ? 'breach' : ''}`}
                      title={evt.isBreach ? `Breaches safety floor of ${formatCurrency(safetyFloor, currencySymbol)}` : undefined}
                    >
                      {formatCurrency(evt.displayBalance, currencySymbol)}
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
