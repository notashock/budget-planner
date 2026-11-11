import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import {
  BuildingLibraryIcon,
  WalletIcon,
  TrashIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  XIcon,
  TargetIcon,
  SearchIcon,
  SparklesIcon,
  EditIcon,
  PlusIcon,
  InboxIcon,
  SendIcon
} from '../components/Icons.jsx';
import { DatePicker } from '../components/DatePicker.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function TransactionsScreen({
  transactions = [],
  currencySymbol = '₹',
  bankAccounts = [],
  wallets = [],
  isReviewMode = false,
  onOpenUnifiedEntry,
  onEditTransaction,
  onPayTransaction,
  onCancelTransaction,
  onDeleteTransaction
}) {
  // Main view segment: 'transactions' (successful) vs 'planned' (commitments)
  const [activeSegment, setActiveSegment] = useState('transactions'); // 'transactions' | 'planned'
  
  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'spot' | 'planned' | 'goal'
  const [plannedFilter, setPlannedFilter] = useState('all'); // 'all' | 'due' | 'overdue' | 'upcoming'
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'oldest' | 'amount-desc' | 'amount-asc'

  // Modals for Actions
  const [payingTx, setPayingTx] = useState(null);
  const [actualAmount, setActualAmount] = useState('');
  const [actualDate, setActualDate] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [cancellingGoalTx, setCancellingGoalTx] = useState(null);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (payingTx) setPayingTx(null);
        if (cancellingGoalTx) setCancellingGoalTx(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payingTx, cancellingGoalTx]);

  // Combined accounts list
  const allAccounts = useMemo(() => {
    return [
      ...bankAccounts.map((b) => ({ ...b, accountType: 'bank' })),
      ...wallets.map((w) => ({ ...w, accountType: 'wallet' }))
    ];
  }, [bankAccounts, wallets]);

  // Payment account options for Settlement modal CustomSelect
  const paymentAccountOptions = useMemo(() => {
    const primaryAcc = allAccounts.find((a) => a.isPrimary) || allAccounts[0];
    const defaultAccId = primaryAcc ? (primaryAcc.id || primaryAcc._id) : '';
    return [
      { value: defaultAccId, label: primaryAcc ? `Default (${primaryAcc.name})` : 'Default Account' },
      ...bankAccounts.map((b) => ({
        value: b.id || b._id,
        label: b.name,
        icon: <BuildingLibraryIcon size={14} />,
        badge: 'Bank'
      })),
      ...wallets.map((w) => ({
        value: w.id || w._id,
        label: w.name,
        icon: <WalletIcon size={14} />,
        badge: 'Wallet'
      }))
    ];
  }, [allAccounts, bankAccounts, wallets]);

  // Partition transactions
  const successfulTransactions = useMemo(() => {
    return transactions.filter((t) => t.status === 'successful');
  }, [transactions]);

  const plannedTransactions = useMemo(() => {
    return transactions.filter((t) => t.status === 'planned');
  }, [transactions]);

  const dueCount = useMemo(() => {
    return plannedTransactions.filter((t) => t.derivedStatus === 'due').length;
  }, [plannedTransactions]);

  const overdueCount = useMemo(() => {
    return plannedTransactions.filter((t) => t.derivedStatus === 'overdue').length;
  }, [plannedTransactions]);

  // Quick Mark as Paid handler: settles instantly with planned amount and today's date
  const handleQuickMarkPaid = async (tx) => {
    try {
      const amt = tx.plannedAmount !== undefined && tx.plannedAmount !== null ? tx.plannedAmount : Math.abs(tx.amount || 0);
      const primaryAcc = allAccounts.find((a) => a.isPrimary) || allAccounts[0];
      await onPayTransaction?.(tx.id || tx._id, {
        amount: amt,
        date: todayStr,
        accountId: tx.accountId || primaryAcc?.id || primaryAcc?._id
      });
    } catch (err) {
      console.error('Quick pay failed:', err);
    }
  };

  // Filtering function for search, origin, and account
  const matchesFilter = (tx) => {
    if (originFilter !== 'all' && tx.origin !== originFilter) return false;
    if (selectedAccountFilter !== 'all') {
      if (tx.origin === 'transfer') {
        const srcId = tx.accountId;
        const dstId = tx.destinationAccountId;
        if (srcId !== selectedAccountFilter && dstId !== selectedAccountFilter) {
          return false;
        }
      } else {
        const accId = tx.accountId;
        if (accId !== selectedAccountFilter) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (tx.name || '').toLowerCase();
      const note = (tx.note || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
      const destAccount = allAccounts.find((a) => (a.id || a._id) === tx.destinationAccountId);
      const accName = account ? account.name.toLowerCase() : '';
      const destName = destAccount ? destAccount.name.toLowerCase() : '';
      if (!name.includes(q) && !note.includes(q) && !cat.includes(q) && !accName.includes(q) && !destName.includes(q)) {
        return false;
      }
    }
    return true;
  };

  // Filtered successful transactions with sorting
  const displayedSuccessful = useMemo(() => {
    return [...successfulTransactions]
      .filter(matchesFilter)
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return (b.date || '').localeCompare(a.date || '');
        }
        if (sortBy === 'oldest') {
          return (a.date || '').localeCompare(b.date || '');
        }
        if (sortBy === 'amount-desc') {
          return Math.abs(b.amount || 0) - Math.abs(a.amount || 0);
        }
        if (sortBy === 'amount-asc') {
          return Math.abs(a.amount || 0) - Math.abs(b.amount || 0);
        }
        return (b.date || '').localeCompare(a.date || '');
      });
  }, [successfulTransactions, matchesFilter, sortBy]);

  // Filtered planned transactions with sorting
  const displayedPlanned = useMemo(() => {
    return [...plannedTransactions]
      .filter((tx) => {
        if (!matchesFilter(tx)) return false;
        if (plannedFilter === 'all') return true;
        if (plannedFilter === 'due') return tx.derivedStatus === 'due';
        if (plannedFilter === 'overdue') return tx.derivedStatus === 'overdue';
        if (plannedFilter === 'upcoming') return tx.derivedStatus === 'planned';
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'amount-desc') {
          return Math.abs(b.plannedAmount || b.amount || 0) - Math.abs(a.plannedAmount || a.amount || 0);
        }
        if (sortBy === 'amount-asc') {
          return Math.abs(a.plannedAmount || a.amount || 0) - Math.abs(b.plannedAmount || b.amount || 0);
        }
        if (sortBy === 'oldest') {
          const dateA = a.plannedDate || a.date || '';
          const dateB = b.plannedDate || b.date || '';
          return dateA.localeCompare(dateB);
        }
        // Default 'recent': Sort priority: overdue first, then due, then by plannedDate asc
        if (a.derivedStatus === 'overdue' && b.derivedStatus !== 'overdue') return -1;
        if (b.derivedStatus === 'overdue' && a.derivedStatus !== 'overdue') return 1;
        if (a.derivedStatus === 'due' && b.derivedStatus !== 'due') return -1;
        if (b.derivedStatus === 'due' && a.derivedStatus !== 'due') return 1;
        const dateA = a.plannedDate || a.date || '';
        const dateB = b.plannedDate || b.date || '';
        return dateA.localeCompare(dateB);
      });
  }, [plannedTransactions, matchesFilter, plannedFilter, sortBy]);

  // Payment prompt opener
  const openPayPrompt = (tx) => {
    setPayingTx(tx);
    const prefillAmount = tx.plannedAmount !== undefined && tx.plannedAmount !== null
      ? tx.plannedAmount / 100
      : (tx.amount ? Math.abs(tx.amount) / 100 : '');
    setActualAmount(String(prefillAmount));
    setActualDate(todayStr);
    const primaryAcc = allAccounts.find((a) => a.isPrimary) || allAccounts[0];
    setSelectedAccountId(tx.accountId || primaryAcc?.id || primaryAcc?._id || '');
  };

  // Payment confirmation
  const handleConfirmPay = async (e) => {
    e.preventDefault();
    if (!payingTx) return;
    const numAmount = Math.round(Number(actualAmount) * 100);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid actual amount');
      return;
    }
    const primaryAcc = allAccounts.find((a) => a.isPrimary) || allAccounts[0];
    const resolvedAccountId = selectedAccountId || payingTx.accountId || primaryAcc?.id || primaryAcc?._id;
    await onPayTransaction?.(payingTx.id || payingTx._id, {
      amount: numAmount,
      date: actualDate || todayStr,
      accountId: resolvedAccountId
    });
    setPayingTx(null);
  };

  // Cancellation prompt
  const handlePromptCancel = (tx) => {
    if (tx.origin === 'goal' || tx.goalId) {
      setCancellingGoalTx(tx);
    } else {
      if (window.confirm(`Cancel scheduled transaction "${tx.name}"? It will be removed from your forecast.`)) {
        onCancelTransaction?.(tx.id || tx._id);
      }
    }
  };

  const handleConfirmCancelGoal = async (action) => {
    if (!cancellingGoalTx) return;
    await onCancelTransaction?.(cancellingGoalTx.id || cancellingGoalTx._id, { goalAction: action });
    setCancellingGoalTx(null);
  };

  // Settlement Live Variance calculation inside modal
  const enteredAmountCents = Math.round(Number(actualAmount || 0) * 100);
  const plannedAmountCents = payingTx
    ? (payingTx.plannedAmount !== undefined && payingTx.plannedAmount !== null ? payingTx.plannedAmount : Math.abs(payingTx.amount || 0))
    : 0;
  const settlementVariance = plannedAmountCents - enteredAmountCents;

  const hasUrgentCommitments = overdueCount > 0 || dueCount > 0;

  return (
    <div className="transactions-screen" style={{ paddingBottom: '90px' }}>
      {/* Desktop Header */}
      <div className="tx-desktop-header">
        <h1 className="tx-header-title">Transactions</h1>
        <p className="tx-header-sub">Unified record of commitments and actual cash movement.</p>
      </div>
      {/* Top Controls Row: Search on Left, New Entry on Right */}
      <div className="tx-header-top-row">
        <div className="tx-search-box compact">
          <span className="tx-search-icon">
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            className="tx-search-input"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search transactions"
          />
          {searchQuery && (
            <button
              type="button"
              className="tx-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <XIcon size={11} />
            </button>
          )}
        </div>

        <div className="tx-header-top-actions">
          {!isReviewMode && (
            <button
              type="button"
              className="btn-primary"
              style={{
                height: '34px',
                padding: '0 14px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => onOpenUnifiedEntry?.('log')}
              title="Add a new transaction or planned expense"
            >
              <PlusIcon size={13} />
              <span>New Entry</span>
            </button>
          )}

          {isReviewMode && (
            <span className="review-badge-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}>
              <span>👁️</span> Read-Only Review
            </span>
          )}
        </div>
      </div>

      {/* Second Row: Clean Section Switcher (Application Themed Style) */}
      <div className="tx-section-tabs-bar" role="tablist" aria-label="Transaction Sections">
        <button
          type="button"
          role="tab"
          id="tab-transactions"
          data-testid="tab-transactions"
          aria-selected={activeSegment === 'transactions'}
          aria-controls="panel-transactions"
          className={`tx-section-tab ${activeSegment === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveSegment('transactions')}
        >
          <InboxIcon size={15} />
          <span className="tx-section-tab-label">TRANSACTIONS</span>
          <span className="tx-section-tab-count">{displayedSuccessful.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-planned"
          data-testid="tab-planned"
          aria-selected={activeSegment === 'planned'}
          aria-controls="panel-planned"
          className={`tx-section-tab ${activeSegment === 'planned' ? 'active' : ''}`}
          onClick={() => setActiveSegment('planned')}
        >
          <SendIcon size={14} />
          <span className="tx-section-tab-label">PLANNED</span>
          {hasUrgentCommitments ? (
            <span className="tx-tab-urgent-pill">
              {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueCount} Due`}
            </span>
          ) : (
            <span className="tx-section-tab-count">{displayedPlanned.length}</span>
          )}
        </button>
      </div>

      {/* Account Filter Pills Row */}
      {allAccounts.length > 0 && (
        <div className="account-filter-scroll-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 16px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            type="button"
            className={`filter-pill account-filter-pill ${selectedAccountFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedAccountFilter('all')}
          >
            All Accounts
          </button>
          {bankAccounts.map((b) => (
            <button
              key={b.id || b._id}
              type="button"
              className={`filter-pill account-filter-pill ${selectedAccountFilter === (b.id || b._id) ? 'active' : ''}`}
              onClick={() => setSelectedAccountFilter(b.id || b._id)}
            >
              <BuildingLibraryIcon size={12} />
              <span>{b.name}</span>
            </button>
          ))}
          {wallets.map((w) => (
            <button
              key={w.id || w._id}
              type="button"
              className={`filter-pill account-filter-pill ${selectedAccountFilter === (w.id || w._id) ? 'active' : ''}`}
              onClick={() => setSelectedAccountFilter(w.id || w._id)}
            >
              <WalletIcon size={12} />
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      {activeSegment === 'transactions' ? (
        <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions">
          {displayedSuccessful.length === 0 ? (
            <div className="tx-empty-state">
              <div className="tx-empty-text">ALL TRANSACTIONS LOGGED</div>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                No completed transactions found for the selected filter.
              </p>
            </div>
          ) : (
            <div className="tx-cards-container">
              {displayedSuccessful.map((tx) => {
                const isTransfer = tx.origin === 'transfer';
                const sourceAcc = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                const destAcc = allAccounts.find((a) => (a.id || a._id) === tx.destinationAccountId);
                const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);

                const isIncome = Boolean(tx.isIncome);
                const isRefund = tx.amount < 0 && !isIncome;
                const isCredit = isIncome || isRefund;

                // Sign formatting: +XXX for credit, -XXX for debit, XXXX for transfer/neutral
                let formattedAmount = '';
                let amountClass = 'amount-debit';
                if (isTransfer) {
                  formattedAmount = formatCurrency(Math.abs(tx.amount), currencySymbol);
                  amountClass = 'amount-neutral';
                } else if (isCredit) {
                  formattedAmount = `+${formatCurrency(Math.abs(tx.amount), currencySymbol)}`;
                  amountClass = 'amount-credit';
                } else {
                  formattedAmount = `-${formatCurrency(Math.abs(tx.amount), currencySymbol)}`;
                  amountClass = 'amount-debit';
                }

                return (
                  <div key={tx.id || tx._id} className="tx-card">
                    {/* Left Zone: Description (Title) + Bank Account Underneath (Category Removed) */}
                    <div className="tx-card-left">
                      <div className="tx-card-headline">
                        <span className="tx-card-title">
                          {isTransfer ? (tx.name || 'Inter-Account Transfer') : (tx.name || tx.note || tx.category || 'Transaction')}
                        </span>
                        {isTransfer && (
                          <span className="tx-tag tag-transfer">
                            ⇄ Transfer
                          </span>
                        )}
                        {tx.origin === 'goal' && (
                          <span className="tx-tag tag-goal">
                            <TargetIcon size={10} />
                            <span>Goal</span>
                          </span>
                        )}
                        {tx.origin === 'planned' && (
                          <span className="tx-tag tag-settled">
                            Settled
                          </span>
                        )}
                      </div>

                      <div className="tx-card-account">
                        {isTransfer ? (
                          <span className="tx-account-name">
                            {sourceAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                            <span>{sourceAcc?.name || 'Source'}</span>
                            <span className="tx-arrow">&rarr;</span>
                            {destAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                            <span>{destAcc?.name || 'Destination'}</span>
                          </span>
                        ) : account ? (
                          <span className="tx-account-name">
                            {account.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                            <span>{account.name}</span>
                          </span>
                        ) : (
                          <span className="tx-account-name muted">Default Account</span>
                        )}
                        <span className="tx-meta-dot">•</span>
                        <span className="tx-date-inline tabular-nums">{formatDisplayDate(tx.date, true)}</span>
                        {tx.note && tx.note !== tx.name && (
                          <span className="tx-note-snippet" title={tx.note}>• {tx.note}</span>
                        )}
                      </div>
                    </div>

                    {/* Center Zone: Date */}
                    <div className="tx-card-center">
                      <span className="tx-date-badge tabular-nums">
                        {formatDisplayDate(tx.date, true)}
                      </span>
                    </div>

                    {/* Right Zone: Amount on Top Right, Edit & Delete Underneath */}
                    <div className="tx-card-right">
                      <span className={`tx-amount-display tabular-nums ${amountClass}`}>
                        {formattedAmount}
                      </span>

                      {!isReviewMode && (
                        <div className="tx-card-actions">
                          <button
                            type="button"
                            className="tx-btn-action"
                            onClick={() => onEditTransaction?.(tx)}
                            title="Edit transaction"
                            aria-label="Edit transaction"
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="tx-btn-action delete"
                            onClick={() => onDeleteTransaction?.(tx.id || tx._id)}
                            title={isTransfer ? "Delete transfer" : "Delete transaction"}
                            aria-label="Delete transaction"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div id="panel-planned" role="tabpanel" aria-labelledby="tab-planned">
          {displayedPlanned.length === 0 ? (
            <div className="tx-empty-state">
              <div className="tx-empty-text">ALL COMMITMENTS SETTLED</div>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                No planned commitments found for this filter.
              </p>
            </div>
          ) : (
            <div className="tx-cards-container">
              {displayedPlanned.map((tx) => {
                const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                const isOverdue = tx.derivedStatus === 'overdue';
                const isDue = tx.derivedStatus === 'due';
                const plannedAmt = tx.plannedAmount !== undefined && tx.plannedAmount !== null ? tx.plannedAmount : Math.abs(tx.amount || 0);

                return (
                  <div
                    key={tx.id || tx._id}
                    className={`tx-card planned ${isOverdue ? 'overdue' : (isDue ? 'due' : '')}`}
                  >
                    {/* Left Zone: Description + Bank Account Underneath (Category Removed) */}
                    <div className="tx-card-left">
                      <div className="tx-card-headline">
                        <span className="tx-card-title">{tx.name || tx.category}</span>
                        {isOverdue && (
                          <span className="tx-tag tag-overdue">
                            <AlertTriangleIcon size={10} />
                            <span>Overdue</span>
                          </span>
                        )}
                        {isDue && (
                          <span className="tx-tag tag-due">
                            <CalendarIcon size={10} />
                            <span>Due</span>
                          </span>
                        )}
                        {!isOverdue && !isDue && (
                          <span className="tx-tag tag-upcoming">
                            Upcoming
                          </span>
                        )}
                        {tx.origin === 'goal' && (
                          <span className="tx-tag tag-goal">
                            <TargetIcon size={10} />
                            <span>Goal</span>
                          </span>
                        )}
                      </div>

                      <div className="tx-card-account">
                        {account ? (
                          <span className="tx-account-name">
                            {account.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                            <span>{account.name}</span>
                          </span>
                        ) : (
                          <span className="tx-account-name muted">Default Account</span>
                        )}
                        <span className="tx-meta-dot">•</span>
                        <span className="tx-date-inline tabular-nums">{formatDisplayDate(tx.plannedDate || tx.date, true)}</span>
                      </div>
                    </div>

                    {/* Center Zone: Planned Date */}
                    <div className="tx-card-center">
                      <span className={`tx-date-badge tabular-nums ${isOverdue ? 'date-overdue' : (isDue ? 'date-due' : '')}`}>
                        {formatDisplayDate(tx.plannedDate || tx.date, true)}
                      </span>
                    </div>

                    {/* Right Zone: Planned Amount on Top Right, Actions Directly Below */}
                    <div className="tx-card-right">
                      <span className="tx-amount-display tabular-nums">
                        {tx.origin === 'salary' && plannedAmt === 0 ? '—' : formatCurrency(plannedAmt, currencySymbol)}
                      </span>

                      {!isReviewMode && (
                        <div className="tx-card-actions">
                          <button
                            type="button"
                            className="tx-btn-settle"
                            onClick={() => openPayPrompt(tx)}
                            title={tx.isIncome ? "Confirm salary deposit" : "Mark as paid (confirm actual amount and date)"}
                            aria-label="Mark Paid"
                          >
                            <CheckCircleIcon size={12} />
                            <span>Mark as Paid</span>
                          </button>

                          <button
                            type="button"
                            className="tx-btn-action delete"
                            onClick={() => handlePromptCancel(tx)}
                            title="Cancel planned transaction"
                            aria-label="Cancel commitment"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Precision Settlement Popup (Unified Entry Modal Style with AnimatedModal) */}
      <AnimatedModal
        isOpen={Boolean(payingTx)}
        onClose={() => setPayingTx(null)}
        maxWidth="440px"
      >
        {payingTx && (
          <div style={{ padding: '6px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--surface-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text)'
                  }}
                >
                  <CheckCircleIcon size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                    Confirm Payment Settlement
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Reconcile commitment against actual cash
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="tx-btn-icon-subtle"
                onClick={() => setPayingTx(null)}
                title="Close"
              >
                <XIcon size={14} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Confirm actual amount and date paid for <strong>{payingTx.name}</strong>.
            </p>

            {/* Plan vs Actual Comparison & Live Variance Card */}
            <div className="tx-settle-comparison">
              <div className="tx-settle-box">
                <span className="tx-settle-box-label">Planned Commitment</span>
                <span className="tx-settle-box-val">{formatCurrency(plannedAmountCents, currencySymbol)}</span>
              </div>
              <div className="tx-settle-box">
                <span className="tx-settle-box-label">Actual Entered</span>
                <span className="tx-settle-box-val">{formatCurrency(enteredAmountCents, currencySymbol)}</span>
              </div>

              {settlementVariance > 0 ? (
                <div className="tx-variance-banner under">
                  <SparklesIcon size={12} />
                  <span>{formatCurrency(settlementVariance, currencySymbol)} under planned budget (saving cash)</span>
                </div>
              ) : settlementVariance < 0 ? (
                <div className="tx-variance-banner over">
                  <AlertTriangleIcon size={12} />
                  <span>+{formatCurrency(Math.abs(settlementVariance), currencySymbol)} over planned budget</span>
                </div>
              ) : (
                <div className="tx-variance-banner exact">
                  <span>Matches planned budget exactly</span>
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmPay} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Actual Amount ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  className="input"
                  style={{ width: '100%', fontVariantNumeric: 'tabular-nums', fontSize: '15px', fontWeight: 600 }}
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Actual Date Paid
                </label>
                <DatePicker
                  value={actualDate}
                  onChange={(d) => setActualDate(d)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Payment Account
                </label>
                <CustomSelect
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  options={paymentAccountOptions}
                  placeholder="Select payment account"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-subtle"
                  onClick={() => setPayingTx(null)}
                  style={{ padding: '8px 16px', fontSize: '12.5px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Confirm Paid
                </button>
              </div>
            </form>
          </div>
        )}
      </AnimatedModal>

      {/* Goal Cancellation Destination Prompt Modal */}
      <AnimatedModal
        isOpen={Boolean(cancellingGoalTx)}
        onClose={() => setCancellingGoalTx(null)}
        maxWidth="420px"
      >
        {cancellingGoalTx && (
          <div style={{ padding: '6px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                Cancel Scheduled Goal
              </h3>
              <button
                type="button"
                className="tx-btn-icon-subtle"
                onClick={() => setCancellingGoalTx(null)}
                title="Close"
              >
                <XIcon size={14} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This planned transaction is linked to your goal <strong>{cancellingGoalTx.name}</strong>. What should happen to the goal?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleConfirmCancelGoal('return_to_logged')}
                style={{ justifyContent: 'center', padding: '10px', fontSize: '12.5px' }}
              >
                Return to Logged (Keep goal active to schedule later)
              </button>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => handleConfirmCancelGoal('dropped')}
                style={{ justifyContent: 'center', padding: '10px', fontSize: '12.5px', color: 'var(--negative, #ef4444)' }}
              >
                Mark as Dropped (Cancel the goal)
              </button>
            </div>
          </div>
        )}
      </AnimatedModal>
    </div>
  );
}
