import React, { useState, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import {
  MapPinIcon,
  CheckCircleIcon,
  ArrowRightLeftIcon,
  BuildingLibraryIcon,
  WalletIcon
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
  const targetDay = currentDay !== null && currentDay !== undefined ? currentDay : now.getDate();

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

  // Enriched events with minimal what / how / when / amount data
  const processedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events.map((evt, idx) => {
      let displayAmount = evt.amount;
      let accountAttribution = 'Default Account';
      let isTransfer = evt.itemType === 'transfer';

      if (isTransfer) {
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

        const srcName = accountMap.get(sBank || sWall) || (evt.sourceType === 'wallet' ? 'Wallet' : 'Bank Account');
        const destName = accountMap.get(dBank || dWall) || (evt.destinationType === 'wallet' ? 'Wallet' : 'Bank Account');

        if (isFilteringAccount) {
          const isSource = Boolean((sBank && sBank === normSelectedId) || (sWall && sWall === normSelectedId));
          const isDest = Boolean((dBank && dBank === normSelectedId) || (dWall && dWall === normSelectedId));
          const trAmt = Math.abs(Number(evt.transferAmount) || 0);

          if (isSource) {
            displayAmount = -trAmt;
            accountAttribution = `Sent to ${destName}`;
          } else if (isDest) {
            displayAmount = trAmt;
            accountAttribution = `Received from ${srcName}`;
          } else {
            accountAttribution = `${srcName} → ${destName}`;
          }
        } else {
          accountAttribution = `${srcName} → ${destName}`;
        }
      } else {
        const bId = evt.bankAccountId ? String(evt.bankAccountId._id || evt.bankAccountId.id || evt.bankAccountId) : '';
        const wId = evt.walletId ? String(evt.walletId._id || evt.walletId.id || evt.walletId) : '';
        const acctName = accountMap.get(bId || wId);
        accountAttribution = acctName || 'Default Account';
        displayAmount = evt.amount;
      }

      return {
        ...evt,
        displayAmount,
        accountAttribution,
        isTransfer
      };
    });
  }, [events, isFilteringAccount, normSelectedId, accountMap]);

  // Strictly Today's event filter
  const isTodayEvent = (e) => {
    if (e.date && e.date === todayStr) return true;
    return Number(e.day) === Number(targetDay);
  };

  // Quick Pay / Settle handler for today's planned commitments
  const handleQuickPay = async (evt) => {
    const txId = evt.transactionId || evt.itemId || evt.id || evt._id;
    if (!txId || !onPayTransaction) return;
    try {
      const amt = Math.abs(evt.amount);
      const accId = evt.bankAccountId || evt.walletId || (selectedAccountId !== 'all' ? selectedAccountId : undefined);
      await onPayTransaction(txId, {
        amount: amt,
        date: evt.date || todayStr,
        accountId: accId
      });
    } catch (err) {
      console.error('Settle failed:', err);
    }
  };

  // Display list: Strictly Today's transactions unless a specific day is clicked from the balance chart
  const displayList = useMemo(() => {
    if (selectedDay !== null && selectedDay !== undefined) {
      return processedEvents.filter((evt) => Number(evt.day) === Number(selectedDay));
    }
    // Strictly display today's transactions (planned, committed, and transfers)
    return processedEvents.filter(isTodayEvent);
  }, [processedEvents, selectedDay, targetDay, todayStr]);

  const timelineListRef = useRef(null);

  useGSAP(() => {
    if (!timelineListRef.current) return;
    const rows = timelineListRef.current.querySelectorAll('.timeline-event-row');
    if (rows.length > 0) {
      gsap.fromTo(
        rows,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out' }
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
            </span>
          )}
        </div>

        {selectedDay !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--accent-subtle, rgba(99, 102, 241, 0.1))',
                color: 'var(--accent, #6366f1)',
                borderRadius: '12px',
                fontWeight: 600
              }}
            >
              Day {selectedDay} inspected
            </span>
          </div>
        )}
      </div>

      {processedEvents.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No timeline events generated for this month.
        </div>
      ) : displayList.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {selectedDay === null ? (
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                ✓ No transactions for today.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Planned, committed, and transfer transactions occurring today will appear here.
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
            const isSelected = selectedDay === evt.day;
            const isPlanned = evt.itemType === 'planned-transaction' || evt.isPlannedTransaction || (!evt.isActual && !evt.isPaid && evt.amount < 0);
            const isIncome = evt.displayAmount > 0;
            const isTransfer = evt.isTransfer;

            let formattedAmount = '';
            let amountClass = 'timeline-amount-debit';

            if (isTransfer) {
              formattedAmount = formatCurrency(Math.abs(evt.displayAmount), currencySymbol);
              amountClass = 'timeline-amount-neutral';
            } else if (isIncome) {
              formattedAmount = `+${formatCurrency(Math.abs(evt.displayAmount), currencySymbol)}`;
              amountClass = 'timeline-amount-credit';
            } else {
              formattedAmount = `-${formatCurrency(Math.abs(evt.displayAmount), currencySymbol)}`;
              amountClass = 'timeline-amount-debit';
            }

            return (
              <div
                key={`${evt.date}-${evt.sourceIndex || idx}-${evt.day}`}
                className={`timeline-event-row minimal ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectDay?.(isSelected ? null : evt.day)}
                title="Click to focus this day on the balance chart"
              >
                {/* 1. What & 2. How */}
                <div className="timeline-event-main">
                  <span className="timeline-event-title" title={evt.label}>
                    {evt.label}
                  </span>
                  <div className="timeline-event-how">
                    {isTransfer ? (
                      <ArrowRightLeftIcon size={11} />
                    ) : (
                      <BuildingLibraryIcon size={11} />
                    )}
                    <span>{evt.accountAttribution}</span>
                  </div>
                </div>

                {/* 3. When */}
                <div className="timeline-event-when">
                  <span className="timeline-when-badge tabular-nums">
                    {formatDisplayDate(evt.date || todayStr, false)}
                  </span>
                </div>

                {/* 4. Amount & Settle action */}
                <div className="timeline-event-end">
                  <span className={`timeline-event-amount tabular-nums ${amountClass}`}>
                    {formattedAmount}
                  </span>

                  {isPlanned && onPayTransaction && (
                    <button
                      type="button"
                      className="timeline-quick-pay-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickPay(evt);
                      }}
                      title="Settle commitment"
                      aria-label="Settle"
                    >
                      <CheckCircleIcon size={11} />
                      <span>Settle</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
