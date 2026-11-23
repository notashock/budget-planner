import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { formatCurrency, formatCurrencyWhole, formatDisplayDate, groupSpendByCategory } from '@budget/engine';
import { XIcon, SearchIcon, EyeIcon, CheckIcon } from '../components/Icons.jsx';
import { SortMenu } from '../components/SortMenu.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { ReclassifyHeldLentModal } from '../components/ReclassifyHeldLentModal.jsx';
import { SettleForm } from '../components/SettleForm.jsx';
import { ActionMenu } from '../components/ActionMenu.jsx';
import { CategoryBreakdown } from '../components/CategoryBreakdown.jsx';

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

const PLANNED_FILTERS = [['all', 'All statuses'], ['due', 'Due'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming']];

/** Day header for a YYYY-MM-DD date: "Today · Mon 23", "Yesterday · Sun 22", else "Thu, Nov 5". */
export function dayLabel(dateStr, todayStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'No date';
  const diff = Math.round((d - new Date(`${todayStr}T00:00:00`)) / 86400000);
  const short = `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`;
  if (diff === 0) return `Today · ${short}`;
  if (diff === -1) return `Yesterday · ${short}`;
  if (diff === 1) return `Tomorrow · ${short}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Groups an already-sorted list by day, keeping its order. pinOverdue puts overdue items first under "Overdue". */
export function groupByDay(list, getDate, todayStr, { pinOverdue = false } = {}) {
  const groups = [];
  const byKey = new Map();
  for (const tx of list) {
    const overdue = pinOverdue && tx.derivedStatus === 'overdue';
    const day = (getDate(tx) || '').slice(0, 10);
    const key = overdue ? 'overdue' : (day || 'none');
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: overdue ? 'Overdue' : (day ? dayLabel(day, todayStr) : 'No date'), overdue, items: [] };
      byKey.set(key, group);
      if (overdue) groups.unshift(group); else groups.push(group);
    }
    group.items.push(tx);
  }
  return groups;
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
  onDeleteTransaction,
  onHeldLentChanged,
  // Held/lent rows: delete and open the form again with the same details
  onRelogHeldLent,
  creditCards = [],
  simulation = null,
  month = null
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
  const [showBreakdown, setShowBreakdown] = useState(false);

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

  const accountName = (id) => accountLookupMap.get(String(id))?.name;
  // Day headers only make sense when the list is in date order
  const isGrouped = sortBy === 'recent' || sortBy === 'oldest';
  const groupsFor = (list, getDate, pinOverdue) => (isGrouped
    ? groupByDay(list, getDate, todayStr, { pinOverdue })
    : [{ key: 'all', label: null, items: list }]);

  // "Spending in November": gross paid spend this month, by category
  const spendEvents = useMemo(() => successfulTransactions
    .filter((t) => !t.isIncome && t.origin !== 'transfer'
      && !PASS_THROUGH_IN.includes(t.origin) && !PASS_THROUGH_OUT.includes(t.origin) && t.amount > 0)
    .map((t) => ({ amount: -Math.abs(t.amount), category: t.category, origin: t.origin, isActual: true })), [successfulTransactions]);
  const spending = useMemo(() => groupSpendByCategory(spendEvents, { topN: 5 }), [spendEvents]);
  const monthName = month?.month
    ? new Date(month.year, month.month - 1, 1).toLocaleDateString('en-US', { month: 'long' })
    : 'this month';

  const filterItems = [
    { heading: 'Account' },
    { label: 'All accounts', checked: selectedAccountFilter === 'all', onClick: () => setSelectedAccountFilter('all') },
    ...allAccounts.map((a) => {
      const id = a.id || a._id;
      return { label: a.name, checked: selectedAccountFilter === id, onClick: () => setSelectedAccountFilter(id) };
    }),
    ...(activeSegment === 'planned' ? [
      { heading: 'Status' },
      ...PLANNED_FILTERS.map(([value, label]) => ({
        label,
        checked: plannedFilter === value,
        onClick: () => setPlannedFilter(value),
      })),
    ] : []),
  ];

  const activeFilterChips = [
    selectedAccountFilter !== 'all' && {
      key: 'account',
      label: accountName(selectedAccountFilter) || 'Account',
      clear: () => setSelectedAccountFilter('all'),
    },
    activeSegment === 'planned' && plannedFilter !== 'all' && {
      key: 'status',
      label: PLANNED_FILTERS.find(([value]) => value === plannedFilter)?.[1],
      clear: () => setPlannedFilter('all'),
    },
  ].filter(Boolean);

  const renderPaidRow = (tx) => {
    const isTransfer = tx.origin === 'transfer';
    const isPassThrough = PASS_THROUGH_IN.includes(tx.origin) || PASS_THROUGH_OUT.includes(tx.origin);
    const isIncome = Boolean(tx.isIncome);
    const isRefund = tx.amount < 0 && !isIncome && !isPassThrough;
    const isCredit = isIncome || isRefund || PASS_THROUGH_IN.includes(tx.origin);
    const canReclassify = !isPassThrough && !isTransfer && tx.origin !== 'goal' && tx.origin !== 'salary' && !tx.goalId;

    const amount = formatCurrency(Math.abs(tx.amount), currencySymbol);
    const formattedAmount = isTransfer ? amount : `${isCredit ? '+' : '-'}${amount}`;
    const amountClass = isTransfer ? 'amount-neutral' : (isCredit ? 'amount-credit' : 'amount-debit');
    const title = isTransfer ? (tx.name || 'Inter-Account Transfer') : (tx.name || tx.note || tx.category || 'Transaction');
    const accountText = isTransfer
      ? `${accountName(tx.accountId) || 'Source'} → ${accountName(tx.destinationAccountId) || 'Destination'}`
      : (accountName(tx.accountId) || 'Default Account');
    const categoryText = isTransfer ? 'Transfer'
      : isPassThrough ? PASS_THROUGH_TAG[tx.origin]
        : isIncome ? 'Income' : (tx.category || 'Uncategorised');
    const refundOriginal = isRefund && tx.refundTargetTransactionId
      ? transactions.find((o) => String(o.id || o._id) === String(tx.refundTargetTransactionId))
      : undefined;
    const caption = [accountText, categoryText, !isGrouped && formatDisplayDate(tx.date, true), tx.note && tx.note !== tx.name && tx.note]
      .filter(Boolean).join(' · ');

    const actions = isReviewMode ? [] : [
      !isPassThrough && { label: 'Edit', ariaLabel: 'Edit transaction', onClick: () => onEditTransaction?.(tx) },
      isPassThrough && onRelogHeldLent && {
        label: 'Change',
        ariaLabel: 'Change held or lent entry',
        onClick: () => { setRelogError(''); setRelogTx(tx); },
      },
      canReclassify && { label: 'Move to Held & Lent', ariaLabel: 'Move to Held and Lent', onClick: () => setReclassifyTx(tx) },
      { label: 'Delete', ariaLabel: 'Delete transaction', danger: true, onClick: () => onDeleteTransaction?.(tx.id || tx._id) },
    ].filter(Boolean);

    return (
      <div key={tx.id || tx._id} className="tx-row">
        <div className="tx-row-main">
          <div className="tx-row-title">
            <span className="tx-card-title">{title}</span>
            {tx.origin === 'goal' && <span className="apple-tx-tag tag-goal tx-tag">Goal</span>}
            {isPassThrough && (
              <span className="apple-tx-tag tag-held tx-tag" title="Not income or spending">{PASS_THROUGH_TAG[tx.origin]}</span>
            )}
            {isRefund && tx.refundTargetTransactionId && (
              <span className="apple-tx-tag tx-tag" data-testid="refund-for-tag">
                Refund for {refundOriginal ? (refundOriginal.title || refundOriginal.name || 'a spend') : 'an earlier spend'}
              </span>
            )}
          </div>
          <div className="tx-row-caption">{caption}</div>
        </div>
        <span className="tx-col tx-col-category">{categoryText}</span>
        <span className="tx-col tx-col-account">{accountText}</span>
        <span className="tx-col tx-col-date tabular-nums">{formatDisplayDate(tx.date, true)}</span>
        <span className={`tx-amount-display tabular-nums ${amountClass}`}>{formattedAmount}</span>
        <div className="tx-row-actions">
          {actions.length > 0 && <ActionMenu label={`Actions for ${title}`} items={actions} />}
        </div>
      </div>
    );
  };

  const renderPlannedRow = (tx) => {
    const isOverdue = tx.derivedStatus === 'overdue';
    const isDue = tx.derivedStatus === 'due';
    const plannedAmt = tx.plannedAmount !== undefined && tx.plannedAmount !== null ? tx.plannedAmount : Math.abs(tx.amount || 0);
    const date = tx.plannedDate || tx.date;
    const title = tx.name || tx.category;
    const accountText = accountName(tx.accountId) || 'Default Account';
    const categoryText = tx.isIncome ? 'Income' : (tx.category || 'Uncategorised');
    const caption = [accountText, categoryText, (!isGrouped || isOverdue) && formatDisplayDate(date, true)]
      .filter(Boolean).join(' · ');

    return (
      <div key={tx.id || tx._id} className={`tx-row planned${isOverdue ? ' overdue' : ''}${isDue ? ' due' : ''}`}>
        {isReviewMode ? <span className="tx-mark-paid-spacer" aria-hidden="true" /> : (
          <button
            type="button"
            className="tx-mark-paid"
            onClick={() => openPayPrompt(tx)}
            title={tx.isIncome ? 'Confirm salary deposit' : 'Mark as paid'}
            aria-label="Mark Paid"
          >
            <CheckIcon size={12} />
          </button>
        )}
        <div className="tx-row-main">
          <div className="tx-row-title">
            <span className="tx-card-title">{title}</span>
            {isDue && <span className="apple-tx-tag tag-due tx-tag">Due</span>}
            {tx.origin === 'goal' && <span className="apple-tx-tag tag-goal tx-tag">Goal</span>}
          </div>
          <div className="tx-row-caption">{caption}</div>
        </div>
        <span className="tx-col tx-col-category">{categoryText}</span>
        <span className="tx-col tx-col-account">{accountText}</span>
        <span className="tx-col tx-col-date tabular-nums">{formatDisplayDate(date, true)}</span>
        <span className="tx-amount-display tabular-nums">
          {tx.origin === 'salary' && plannedAmt === 0 ? '—' : formatCurrency(plannedAmt, currencySymbol)}
        </span>
        <div className="tx-row-actions">
          {!isReviewMode && (
            <ActionMenu
              label={`Actions for ${title}`}
              items={[{ label: 'Cancel', ariaLabel: 'Cancel commitment', danger: true, onClick: () => handlePromptCancel(tx) }]}
            />
          )}
        </div>
      </div>
    );
  };

  const renderList = (list, getDate, renderRow, planned) => (
    <div className={`tx-list${planned ? ' planned' : ''}`}>
      <div className="tx-col-head" aria-hidden="true">
        {planned && <span />}
        <span>Name</span><span>Category</span><span>Account</span><span>Date</span>
        <span className="tx-col-amount">Amount</span><span />
      </div>
      {groupsFor(list, getDate, planned).map((group) => (
        <section key={group.key} className="tx-day" aria-label={group.label || 'Transactions'}>
          {group.label && <h3 className={`tx-day-header${group.overdue ? ' overdue' : ''}`}>{group.label}</h3>}
          {group.items.map(renderRow)}
        </section>
      ))}
    </div>
  );

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

      <div className="apple-tx-header-row-1">
        <ScreenHeader
          className="apple-tx-title-group tx-desktop-header"
          title="Transactions"
          actions={<ActionMenu label="Filter transactions" className="tx-filter-menu" items={filterItems} />}
        />

        <div className="apple-tx-row1-actions">
          {/* No legacy `tx-search-*` classes here: their rules re-add a border and padding to the input */}
          <div className="apple-search-sort-capsule">
            <span className="apple-search-icon">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              className="apple-search-input"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search transactions"
            />
            {searchQuery && (
              <button type="button" className="apple-search-clear" onClick={() => setSearchQuery('')} title="Clear search">
                <XIcon size={12} />
              </button>
            )}
            <span className="apple-search-sort-divider" />
            <SortMenu value={sortBy} onChange={setSortBy} label="Sort transactions" options={SORT_OPTIONS} />
          </div>

          {isReviewMode && (
            <span className="review-badge-tag desktop-only" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}>
              <EyeIcon size={13} /> Read-Only Review
            </span>
          )}
        </div>
      </div>

      <div className="tx-segment-row">
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
            <span className="tx-section-tab-label">Paid</span>
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

        {activeFilterChips.map((chip) => (
          <button key={chip.key} type="button" className="tx-active-filter" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`}>
            <span>{chip.label}</span>
            <XIcon size={11} />
          </button>
        ))}
      </div>

      {activeSegment === 'transactions' ? (
        <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions">
          {spending.total > 0 && (
            <>
              <button
                type="button"
                className="tx-spend-shelf"
                aria-expanded={showBreakdown}
                aria-controls="tx-category-breakdown"
                onClick={() => setShowBreakdown((v) => !v)}
              >
                <span className="tx-spend-shelf-label">Spending in {monthName}</span>
                <span className={`tx-spend-shelf-chev${showBreakdown ? ' open' : ''}`} aria-hidden="true">›</span>
                <span className="tx-spend-shelf-bars" aria-hidden="true">
                  {spending.categories.map((c) => (
                    <span key={c.name} style={{ height: `${Math.max(18, (c.total / spending.max) * 100)}%` }} />
                  ))}
                </span>
                <span className="tx-spend-shelf-total tabular-nums">{formatCurrencyWhole(spending.total, currencySymbol)}</span>
              </button>
              {showBreakdown && (
                <div id="tx-category-breakdown" className="tx-category-breakdown">
                  <CategoryBreakdown events={spendEvents} currencySymbol={currencySymbol} />
                </div>
              )}
            </>
          )}

          {displayedSuccessful.length === 0 ? (
            <div className="apple-tx-empty-state tx-empty-state">
              <div className="apple-tx-empty-title tx-empty-text">Nothing here yet</div>
              <p className="apple-tx-empty-sub">No paid transactions match this filter.</p>
            </div>
          ) : renderList(displayedSuccessful, (tx) => tx.date, renderPaidRow, false)}
        </div>
      ) : (
        <div id="panel-planned" role="tabpanel" aria-labelledby="tab-planned">
          {displayedPlanned.length === 0 ? (
            <div className="apple-tx-empty-state tx-empty-state">
              <div className="apple-tx-empty-title tx-empty-text">All settled</div>
              <p className="apple-tx-empty-sub">No planned payments match this filter.</p>
            </div>
          ) : renderList(displayedPlanned, (tx) => tx.plannedDate || tx.date, renderPlannedRow, true)}
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
