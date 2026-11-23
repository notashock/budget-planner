import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
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
  EditIcon,
  InboxIcon,
  SendIcon,
  ArrowRightLeftIcon,
  EyeIcon,
  UserIcon,
  CreditCardIcon
} from '../components/Icons.jsx';
import { SortMenu } from '../components/SortMenu.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { ReclassifyHeldLentModal } from '../components/ReclassifyHeldLentModal.jsx';
import { SettleForm } from '../components/SettleForm.jsx';

// Held & Lent money (ADR 0069): moves cash, never income or spending
const PASS_THROUGH_IN = ['held_in', 'lent_repaid'];
const PASS_THROUGH_OUT = ['held_return', 'lent_out'];
const PASS_THROUGH_TAG = { held_in: 'Held', held_return: 'Returned', lent_out: 'Lent', lent_repaid: 'Repaid' };

function pad(n) {
  return String(n).padStart(2, '0');
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent', short: 'Recent' },
  { value: 'oldest', label: 'Oldest first', short: 'Oldest' },
  { value: 'amount-desc', label: 'Amount: high to low', short: 'Amount ↓' },
  { value: 'amount-asc', label: 'Amount: low to high', short: 'Amount ↑' }
];

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
  onDeleteTransaction,
  onHeldLentChanged,
  // Held/lent rows: delete and open the form again with the same details
  onRelogHeldLent,
  creditCards = [],
  simulation = null
}) {
  // Main view segment: 'transactions' (successful) vs 'planned' (commitments)
  const [activeSegment, setActiveSegment] = useState('transactions'); // 'transactions' | 'planned'
  
  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'spot' | 'planned' | 'goal'
  const [reclassifyTx, setReclassifyTx] = useState(null);
  const [relogTx, setRelogTx] = useState(null);
  const [relogging, setRelogging] = useState(false);
  const [relogError, setRelogError] = useState('');
  const [plannedFilter, setPlannedFilter] = useState('all'); // 'all' | 'due' | 'overdue' | 'upcoming'
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'oldest' | 'amount-desc' | 'amount-asc'

  // Modals for Actions
  const [payingTx, setPayingTx] = useState(null);
  const [settleError, setSettleError] = useState('');
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  // Errors from one-tap actions (quick mark paid), shown above the list
  const [actionError, setActionError] = useState('');
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
      ...wallets.map((w) => ({ ...w, accountType: 'wallet' })),
      ...creditCards.map((c) => ({ ...c, accountType: 'credit_card' }))
    ];
  }, [bankAccounts, wallets, creditCards]);


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
      setActionError('');
    } catch (err) {
      setActionError(err?.message || `Could not mark ${tx.name || 'this bill'} as paid.`);
    }
  };

  // O(1) Indexed Account Map for lightning-fast search & filtering
  const accountLookupMap = useMemo(() => {
    const map = new Map();
    for (const acc of allAccounts) {
      const id = acc.id || acc._id;
      if (id) {
        map.set(String(id), {
          id: String(id),
          name: acc.name,
          nameLower: (acc.name || '').toLowerCase(),
          accountType: acc.accountType
        });
      }
    }
    return map;
  }, [allAccounts]);

  // React 18 useDeferredValue for 120fps responsive typing
  const deferredSearch = useDeferredValue(searchQuery);

  // Pre-tokenized search query (split once per search query change, not per transaction)
  const searchTokens = useMemo(() => {
    const q = deferredSearch?.trim()?.toLowerCase();
    if (!q) return null;
    return q.split(/\s+/).filter(Boolean);
  }, [deferredSearch]);

  // High-performance transaction comparator avoiding localeCompare overhead
  const compareTransactions = (a, b, sortType, isPlanned = false) => {
    if (sortType === 'amount-desc') {
      const amtA = isPlanned ? Math.abs(a.plannedAmount ?? a.amount ?? 0) : Math.abs(a.amount ?? 0);
      const amtB = isPlanned ? Math.abs(b.plannedAmount ?? b.amount ?? 0) : Math.abs(b.amount ?? 0);
      return amtB - amtA;
    }
    if (sortType === 'amount-asc') {
      const amtA = isPlanned ? Math.abs(a.plannedAmount ?? a.amount ?? 0) : Math.abs(a.amount ?? 0);
      const amtB = isPlanned ? Math.abs(b.plannedAmount ?? b.amount ?? 0) : Math.abs(b.amount ?? 0);
      return amtA - amtB;
    }
    if (sortType === 'oldest') {
      const dateA = (isPlanned ? (a.plannedDate || a.date) : a.date) || '';
      const dateB = (isPlanned ? (b.plannedDate || b.date) : b.date) || '';
      return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
    }
    // Default 'recent'
    if (isPlanned) {
      if (a.derivedStatus === 'overdue' && b.derivedStatus !== 'overdue') return -1;
      if (b.derivedStatus === 'overdue' && a.derivedStatus !== 'overdue') return 1;
      if (a.derivedStatus === 'due' && b.derivedStatus !== 'due') return -1;
      if (b.derivedStatus === 'due' && a.derivedStatus !== 'due') return 1;
      const dateA = a.plannedDate || a.date || '';
      const dateB = b.plannedDate || b.date || '';
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    }
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
  };

  // Fast single-pass filtered and sorted successful transactions
  const displayedSuccessful = useMemo(() => {
    if (!successfulTransactions.length) return [];
    const list = [];
    for (let i = 0; i < successfulTransactions.length; i++) {
      const tx = successfulTransactions[i];
      if (originFilter !== 'all' && tx.origin !== originFilter) continue;
      if (selectedAccountFilter !== 'all') {
        if (tx.origin === 'transfer') {
          if (tx.accountId !== selectedAccountFilter && tx.destinationAccountId !== selectedAccountFilter) continue;
        } else if (tx.accountId !== selectedAccountFilter) {
          continue;
        }
      }
      if (searchTokens) {
        const acc = accountLookupMap.get(String(tx.accountId));
        const destAcc = accountLookupMap.get(String(tx.destinationAccountId));
        const haystack = `${tx.name || ''} ${tx.note || ''} ${tx.category || ''} ${acc?.nameLower || ''} ${destAcc?.nameLower || ''}`.toLowerCase();
        let matches = true;
        for (let t = 0; t < searchTokens.length; t++) {
          if (!haystack.includes(searchTokens[t])) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }
      list.push(tx);
    }
    return list.sort((a, b) => compareTransactions(a, b, sortBy, false));
  }, [successfulTransactions, originFilter, selectedAccountFilter, searchTokens, accountLookupMap, sortBy]);

  // Fast single-pass filtered and sorted planned transactions
  const displayedPlanned = useMemo(() => {
    if (!plannedTransactions.length) return [];
    const list = [];
    for (let i = 0; i < plannedTransactions.length; i++) {
      const tx = plannedTransactions[i];
      if (originFilter !== 'all' && tx.origin !== originFilter) continue;
      if (selectedAccountFilter !== 'all') {
        if (tx.origin === 'transfer') {
          if (tx.accountId !== selectedAccountFilter && tx.destinationAccountId !== selectedAccountFilter) continue;
        } else if (tx.accountId !== selectedAccountFilter) {
          continue;
        }
      }
      if (plannedFilter !== 'all') {
        if (plannedFilter === 'due' && tx.derivedStatus !== 'due') continue;
        if (plannedFilter === 'overdue' && tx.derivedStatus !== 'overdue') continue;
        if (plannedFilter === 'upcoming' && tx.derivedStatus !== 'planned') continue;
      }
      if (searchTokens) {
        const acc = accountLookupMap.get(String(tx.accountId));
        const destAcc = accountLookupMap.get(String(tx.destinationAccountId));
        const haystack = `${tx.name || ''} ${tx.note || ''} ${tx.category || ''} ${acc?.nameLower || ''} ${destAcc?.nameLower || ''}`.toLowerCase();
        let matches = true;
        for (let t = 0; t < searchTokens.length; t++) {
          if (!haystack.includes(searchTokens[t])) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }
      list.push(tx);
    }
    return list.sort((a, b) => compareTransactions(a, b, sortBy, true));
  }, [plannedTransactions, originFilter, selectedAccountFilter, plannedFilter, searchTokens, accountLookupMap, sortBy]);

  // Payment prompt opener
  const openPayPrompt = (tx) => {
    setSettleError('');
    setPayingTx(tx);
  };

  // Payment confirmation (from the Settle form)
  const handleConfirmPay = async (payment) => {
    if (!payingTx) return;
    setSettleError('');
    setSettleSubmitting(true);
    try {
      await onPayTransaction?.(payingTx.id || payingTx._id, payment);
      setPayingTx(null);
    } catch (err) {
      setSettleError(err?.message || 'Could not mark this bill as paid.');
    } finally {
      setSettleSubmitting(false);
    }
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

  const hasUrgentCommitments = overdueCount > 0 || dueCount > 0;

  return (
    <div className="transactions-screen" style={{ paddingBottom: '90px' }}>
      {actionError && (
        <div className="form-error tx-action-error" role="alert">
          <span>{actionError}</span>
          <button type="button" className="tx-btn-icon-subtle" onClick={() => setActionError('')} aria-label="Dismiss">
            <XIcon size={12} />
          </button>
        </div>
      )}
      {/* =========================================================================
          ROW 1: APPLE TITLE & EMBEDDED SEARCH-SORT CAPSULE
          ========================================================================= */}
      <div className="apple-tx-header-row-1">
        {/* Left: Cupertino Large Title & Subtitle */}
        <ScreenHeader
          className="apple-tx-title-group tx-desktop-header"
          title="Transactions"
         
        />

        {/* Right: Integrated Search-Sort Capsule + Desktop-only Action */}
        <div className="apple-tx-row1-actions">
          {/* NOTE: intentionally no legacy `tx-search-*` classes here — their higher-specificity
              rules (e.g. `.tx-search-box.compact .tx-search-input`) re-add a border, pill radius
              and 32px left padding to the input, and absolutely position the clear button over
              the sort control, which misaligns the whole capsule. */}
          <div className="apple-search-sort-capsule">
            <span className="apple-search-icon">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              className="apple-search-input"
              placeholder="Search transactions, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search transactions"
            />
            {searchQuery && (
              <button
                type="button"
                className="apple-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <XIcon size={12} />
              </button>
            )}

            <span className="apple-search-sort-divider" />

            {/* Styled sort menu (replaces the OS-native select popup) */}
            <SortMenu
              value={sortBy}
              onChange={setSortBy}
              label="Sort transactions"
              options={SORT_OPTIONS}
            />
          </div>

          {/* New lives in the toolbar (web) and the Today bar (phone) */}

          {isReviewMode && (
            <span className="review-badge-tag desktop-only" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}>
              <EyeIcon size={13} /> Read-Only Review
            </span>
          )}
        </div>
      </div>

      {/* =========================================================================
          ROW 2: UNIFIED CONTINUOUS INLINE FILTER STRIP (NO BACKGROUND CONTAINER)
          ========================================================================= */}
      <div className="apple-filter-strip-row account-filter-scroll-row" role="toolbar" aria-label="Filters and Sections">
        {/* Apple Segmented Switcher in Title Case (First letter caps) */}
        <div className="apple-segmented-bar tx-section-tabs-bar" role="tablist" aria-label="Transaction Sections">
          <button
            type="button"
            role="tab"
            id="tab-transactions"
            data-testid="tab-transactions"
            aria-selected={activeSegment === 'transactions'}
            aria-controls="panel-transactions"
            className={`apple-segmented-tab tx-section-tab ${activeSegment === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveSegment('transactions')}
          >
            <InboxIcon size={14} />
            <span className="tx-section-tab-label">Transactions</span>
            <span className="apple-segmented-count tx-section-tab-count">{displayedSuccessful.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-planned"
            data-testid="tab-planned"
            aria-selected={activeSegment === 'planned'}
            aria-controls="panel-planned"
            className={`apple-segmented-tab tx-section-tab ${activeSegment === 'planned' ? 'active' : ''}`}
            onClick={() => setActiveSegment('planned')}
          >
            <SendIcon size={13} />
            <span className="tx-section-tab-label">Planned</span>
            {hasUrgentCommitments ? (
              <span className="tx-tab-urgent-pill">
                {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueCount} Due`}
              </span>
            ) : (
              <span className="apple-segmented-count tx-section-tab-count">{displayedPlanned.length}</span>
            )}
          </button>
        </div>

        {/* Subtle Hairline Separator */}
        <span className="apple-filter-strip-divider" aria-hidden="true" />

        {/* Continuous Account Filter Quick-Chips */}
        <div className="apple-account-chips-inline">
          <button
            type="button"
            className={`filter-pill account-filter-pill apple-chip ${selectedAccountFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedAccountFilter('all')}
          >
            All Accounts
          </button>
          {bankAccounts.map((b) => (
            <button
              key={b.id || b._id}
              type="button"
              className={`filter-pill account-filter-pill apple-chip ${selectedAccountFilter === (b.id || b._id) ? 'active' : ''}`}
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
              className={`filter-pill account-filter-pill apple-chip ${selectedAccountFilter === (w.id || w._id) ? 'active' : ''}`}
              onClick={() => setSelectedAccountFilter(w.id || w._id)}
            >
              <WalletIcon size={12} />
              <span>{w.name}</span>
            </button>
          ))}
        </div>

        {/* Contextual Commitment Status Chips when in Planned view */}
        {activeSegment === 'planned' && (
          <>
            <span className="apple-filter-strip-divider" aria-hidden="true" />
            <div className="apple-status-chips-inline">
              <button
                type="button"
                className={`filter-pill apple-chip ${plannedFilter === 'all' ? 'active' : ''}`}
                onClick={() => setPlannedFilter('all')}
              >
                All Status
              </button>
              <button
                type="button"
                className={`filter-pill apple-chip ${plannedFilter === 'due' ? 'active' : ''}`}
                onClick={() => setPlannedFilter('due')}
              >
                Due Only
              </button>
              <button
                type="button"
                className={`filter-pill apple-chip ${plannedFilter === 'overdue' ? 'active' : ''}`}
                onClick={() => setPlannedFilter('overdue')}
              >
                Overdue Only
              </button>
              <button
                type="button"
                className={`filter-pill apple-chip ${plannedFilter === 'upcoming' ? 'active' : ''}`}
                onClick={() => setPlannedFilter('upcoming')}
              >
                Upcoming
              </button>
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      {activeSegment === 'transactions' ? (
        <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions">
          {displayedSuccessful.length === 0 ? (
            <div className="apple-tx-empty-state tx-empty-state">
              <div className="apple-tx-empty-icon">
                <CheckCircleIcon size={24} />
              </div>
              <div className="apple-tx-empty-title tx-empty-text">ALL TRANSACTIONS LOGGED</div>
              <p className="apple-tx-empty-sub" style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                No completed transactions found for the selected filter.
              </p>
            </div>
          ) : (
            <div className="apple-tx-group tx-cards-container">
              {displayedSuccessful.map((tx) => {
                const isTransfer = tx.origin === 'transfer';
                const sourceAcc = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                const destAcc = allAccounts.find((a) => (a.id || a._id) === tx.destinationAccountId);
                const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);

                const isPassThrough = PASS_THROUGH_IN.includes(tx.origin) || PASS_THROUGH_OUT.includes(tx.origin);
                const isIncome = Boolean(tx.isIncome);
                const isRefund = tx.amount < 0 && !isIncome && !isPassThrough;
                const isCredit = isIncome || isRefund || PASS_THROUGH_IN.includes(tx.origin);
                const canReclassify = !isPassThrough && !isTransfer && tx.origin !== 'goal' && tx.origin !== 'salary' && !tx.goalId;

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

                let glyphClass = 'bank';
                let glyphIcon = <BuildingLibraryIcon size={16} />;
                if (isTransfer) {
                  glyphClass = 'transfer';
                  glyphIcon = <ArrowRightLeftIcon size={16} />;
                } else if (tx.origin === 'goal') {
                  glyphClass = 'goal';
                  glyphIcon = <TargetIcon size={16} />;
                } else if (isCredit) {
                  glyphClass = 'income';
                  glyphIcon = <BuildingLibraryIcon size={16} />;
                } else if (account?.accountType === 'wallet') {
                  glyphClass = 'wallet';
                  glyphIcon = <WalletIcon size={16} />;
                }

                return (
                  <div key={tx.id || tx._id} className="apple-tx-row tx-card">
                    {/* Left Glyph Badge */}
                    <div className={`apple-tx-icon-box ${glyphClass}`}>
                      {glyphIcon}
                    </div>

                    {/* Left Zone: Description (Title) + Bank Account Underneath */}
                    <div className="tx-card-left">
                      <div className="tx-card-headline">
                        <span className="tx-card-title">
                          {isTransfer ? (tx.name || 'Inter-Account Transfer') : (tx.name || tx.note || tx.category || 'Transaction')}
                        </span>
                        {isTransfer && (
                          <span className="apple-tx-tag tag-transfer tx-tag">
                            ⇄ Transfer
                          </span>
                        )}
                        {tx.origin === 'goal' && (
                          <span className="apple-tx-tag tag-goal tx-tag">
                            <TargetIcon size={10} />
                            <span>Goal</span>
                          </span>
                        )}
                        {tx.origin === 'planned' && (
                          <span className="apple-tx-tag tag-settled tx-tag">
                            Settled
                          </span>
                        )}
                        {isPassThrough && (
                          <span className="apple-tx-tag tag-held tx-tag" title="Not income or spending">
                            <UserIcon size={10} />
                            <span>{PASS_THROUGH_TAG[tx.origin]}</span>
                          </span>
                        )}
                        {isRefund && tx.refundTargetTransactionId && (() => {
                          const original = transactions.find((o) => String(o.id || o._id) === String(tx.refundTargetTransactionId));
                          return (
                            <span className="apple-tx-tag tx-tag" data-testid="refund-for-tag">
                              Refund for {original ? (original.title || original.name || 'a spend') : 'an earlier spend'}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="tx-card-account">
                        {isTransfer ? (
                          <span className="tx-account-name">
                            {sourceAcc?.accountType === 'credit_card' ? <CreditCardIcon size={11} /> : (sourceAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />)}
                            <span>{sourceAcc?.name || 'Source'}</span>
                            <span className="tx-arrow">&rarr;</span>
                            {destAcc?.accountType === 'credit_card' ? <CreditCardIcon size={11} /> : (destAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />)}
                            <span>{destAcc?.name || 'Destination'}</span>
                          </span>
                        ) : account ? (
                          <span className="tx-account-name">
                            {account.accountType === 'credit_card' ? <CreditCardIcon size={11} /> : (account.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />)}
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
                          {canReclassify && (
                            <button
                              type="button"
                              className="apple-tx-btn-action tx-btn-action"
                              onClick={() => setReclassifyTx(tx)}
                              title="Move to Held & Lent (not income or spending)"
                              aria-label="Move to Held and Lent"
                            >
                              <UserIcon size={13} />
                            </button>
                          )}
                          {!isPassThrough && (
                            <button
                              type="button"
                              className="apple-tx-btn-action tx-btn-action"
                              onClick={() => onEditTransaction?.(tx)}
                              title="Edit transaction"
                              aria-label="Edit transaction"
                            >
                              <EditIcon size={13} />
                            </button>
                          )}
                          {isPassThrough && onRelogHeldLent && (
                            <button
                              type="button"
                              className="apple-tx-btn-action tx-btn-action"
                              onClick={() => {
                                setRelogError('');
                                setRelogTx(tx);
                              }}
                              title="Change (delete and log again)"
                              aria-label="Change held or lent entry"
                            >
                              <EditIcon size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="apple-tx-btn-action delete tx-btn-action"
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
            <div className="apple-tx-empty-state tx-empty-state">
              <div className="apple-tx-empty-icon">
                <SendIcon size={24} />
              </div>
              <div className="apple-tx-empty-title tx-empty-text">ALL COMMITMENTS SETTLED</div>
              <p className="apple-tx-empty-sub" style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                No planned commitments found for this filter.
              </p>
            </div>
          ) : (
            <div className="apple-tx-group tx-cards-container">
              {displayedPlanned.map((tx) => {
                const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                const isOverdue = tx.derivedStatus === 'overdue';
                const isDue = tx.derivedStatus === 'due';
                const plannedAmt = tx.plannedAmount !== undefined && tx.plannedAmount !== null ? tx.plannedAmount : Math.abs(tx.amount || 0);

                let glyphClass = 'upcoming';
                let glyphIcon = <CalendarIcon size={16} />;
                if (isOverdue) {
                  glyphClass = 'overdue';
                  glyphIcon = <AlertTriangleIcon size={16} />;
                } else if (isDue) {
                  glyphClass = 'due';
                  glyphIcon = <CalendarIcon size={16} />;
                } else if (tx.origin === 'goal') {
                  glyphClass = 'goal';
                  glyphIcon = <TargetIcon size={16} />;
                } else if (account?.accountType === 'wallet') {
                  glyphClass = 'wallet';
                  glyphIcon = <WalletIcon size={16} />;
                }

                return (
                  <div
                    key={tx.id || tx._id}
                    className={`apple-tx-row tx-card planned ${isOverdue ? 'overdue' : (isDue ? 'due' : '')}`}
                  >
                    {/* Left Glyph Badge */}
                    <div className={`apple-tx-icon-box ${glyphClass}`}>
                      {glyphIcon}
                    </div>

                    {/* Left Zone: Description + Bank Account Underneath */}
                    <div className="tx-card-left">
                      <div className="tx-card-headline">
                        <span className="tx-card-title">{tx.name || tx.category}</span>
                        {isOverdue && (
                          <span className="apple-tx-tag tag-overdue tx-tag">
                            <AlertTriangleIcon size={10} />
                            <span>Overdue</span>
                          </span>
                        )}
                        {isDue && (
                          <span className="apple-tx-tag tag-due tx-tag">
                            <CalendarIcon size={10} />
                            <span>Due</span>
                          </span>
                        )}
                        {!isOverdue && !isDue && (
                          <span className="apple-tx-tag tag-upcoming tx-tag">
                            Upcoming
                          </span>
                        )}
                        {tx.origin === 'goal' && (
                          <span className="apple-tx-tag tag-goal tx-tag">
                            <TargetIcon size={10} />
                            <span>Goal</span>
                          </span>
                        )}
                      </div>

                      <div className="tx-card-account">
                        {account ? (
                          <span className="tx-account-name">
                            {account.accountType === 'credit_card' ? <CreditCardIcon size={11} /> : (account.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />)}
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
                            className="apple-tx-btn-settle tx-btn-settle"
                            onClick={() => openPayPrompt(tx)}
                            title={tx.isIncome ? "Confirm salary deposit" : "Mark as paid (confirm actual amount and date)"}
                            aria-label="Mark Paid"
                          >
                            <CheckCircleIcon size={12} />
                            <span>Mark as Paid</span>
                          </button>

                          <button
                            type="button"
                            className="apple-tx-btn-action delete tx-btn-action"
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

      {/* Settle (mark as paid): the shared Settle form */}
      <AnimatedModal
        isOpen={Boolean(payingTx)}
        onClose={() => setPayingTx(null)}
        maxWidth="440px"
      >
        {payingTx && (
          <div className="settle-modal">
            <div className="settle-modal-head">
              <div>
                <h3 className="settle-modal-title">Confirm payment</h3>
                <span className="settle-modal-sub">Enter what you actually paid and when</span>
              </div>
              <button
                type="button"
                className="tx-btn-icon-subtle"
                onClick={() => setPayingTx(null)}
                title="Close"
                aria-label="Close"
              >
                <XIcon size={14} />
              </button>
            </div>
            <SettleForm
              bill={payingTx}
              bankAccounts={bankAccounts}
              wallets={wallets}
              creditCards={creditCards}
              currencySymbol={currencySymbol}
              simulation={simulation}
              onSubmit={handleConfirmPay}
              onCancel={() => setPayingTx(null)}
              submitting={settleSubmitting}
              error={settleError}
            />
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
              <h3 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text)' }}>
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

            <p style={{ margin: '0 0 16px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This planned transaction is linked to your goal <strong>{cancellingGoalTx.name}</strong>. What should happen to the goal?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleConfirmCancelGoal('return_to_logged')}
                style={{ justifyContent: 'center', padding: '10px', fontSize: 'var(--fs-sm)' }}
              >
                Return to Logged (Keep goal active to schedule later)
              </button>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => handleConfirmCancelGoal('dropped')}
                style={{ justifyContent: 'center', padding: '10px', fontSize: 'var(--fs-sm)', color: 'var(--negative)' }}
              >
                Mark as Dropped (Cancel the goal)
              </button>
            </div>
          </div>
        )}
      </AnimatedModal>

      {/* Held & Lent entries can't be edited in place: delete and log again */}
      <AnimatedModal isOpen={Boolean(relogTx)} onClose={() => setRelogTx(null)} maxWidth="420px" dataTestId="relog-held-lent">
        {relogTx && (
          <div className="form-stack">
            <div className="settle-modal-head">
              <h3 className="settle-modal-title">Change this entry</h3>
              <button type="button" className="tx-btn-icon-subtle" onClick={() => setRelogTx(null)} aria-label="Close">
                <XIcon size={14} />
              </button>
            </div>
            <p className="field-hint">
              Held and lent entries can't be edited directly, so the right amount stays owed. This deletes{' '}
              <strong>{relogTx.name || relogTx.title || 'this entry'}</strong> ({formatCurrency(Math.abs(relogTx.amount || 0), currencySymbol)})
              and opens the form with the same details so you can log it again.
            </p>
            {relogError && <div className="form-error" role="alert">{relogError}</div>}
            <div className="form-footer">
              <button type="button" className="btn-subtle" onClick={() => setRelogTx(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                disabled={relogging}
                onClick={async () => {
                  setRelogging(true);
                  setRelogError('');
                  try {
                    await onRelogHeldLent(relogTx);
                    setRelogTx(null);
                  } catch (err) {
                    setRelogError(err?.message || 'Could not delete this entry.');
                  } finally {
                    setRelogging(false);
                  }
                }}
              >
                {relogging ? 'Deleting…' : 'Delete and log again'}
              </button>
            </div>
          </div>
        )}
      </AnimatedModal>

      <ReclassifyHeldLentModal
        transaction={reclassifyTx}
        currencySymbol={currencySymbol}
        onClose={() => setReclassifyTx(null)}
        onDone={() => {
          setReclassifyTx(null);
          onHeldLentChanged?.();
        }}
      />
    </div>
  );
}
