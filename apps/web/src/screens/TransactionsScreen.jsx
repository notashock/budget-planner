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
  ChevronDownIcon,
  EditIcon,
  PlusIcon
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
  
  // Search, Sorting & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'spot' | 'planned' | 'goal'
  const [plannedFilter, setPlannedFilter] = useState('all'); // 'all' | 'due' | 'overdue' | 'upcoming'
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'oldest' | 'amount-desc' | 'amount-asc'

  // Unified Filter Dropdown State
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef(null);

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
        if (showFilterDropdown) setShowFilterDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payingTx, cancellingGoalTx, showFilterDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setShowFilterDropdown(false);
      }
    }
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showFilterDropdown]);

  // Combined accounts list
  const allAccounts = useMemo(() => {
    return [
      ...bankAccounts.map((b) => ({ ...b, accountType: 'bank' })),
      ...wallets.map((w) => ({ ...w, accountType: 'wallet' }))
    ];
  }, [bankAccounts, wallets]);

  // Account filter options for CustomSelect
  const accountFilterOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Accounts', icon: <BuildingLibraryIcon size={14} /> },
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
  }, [bankAccounts, wallets]);

  // Payment account options for Settlement modal CustomSelect
  const paymentAccountOptions = useMemo(() => {
    return [
      { value: '', label: 'Default Account' },
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
  }, [bankAccounts, wallets]);

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
      await onPayTransaction?.(tx.id || tx._id, {
        amount: amt,
        date: todayStr,
        accountId: tx.accountId || allAccounts[0]?.id || allAccounts[0]?._id
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

  // Running balance computation:
  // Sort ALL successful transactions chronologically (oldest -> newest) to calculate continuous running balance
  const runningBalanceMap = useMemo(() => {
    const sortedChronological = [...successfulTransactions].sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.id || a._id || '').localeCompare(b.id || b._id || '');
    });

    let running = 0;
    const map = new Map();
    sortedChronological.forEach((tx) => {
      let amt = 0;
      if (tx.origin === 'transfer') {
        if (selectedAccountFilter !== 'all') {
          if (tx.destinationAccountId === selectedAccountFilter) {
            amt = Math.abs(tx.amount || 0);
          } else if (tx.accountId === selectedAccountFilter) {
            amt = -Math.abs(tx.amount || 0);
          }
        } else {
          amt = 0;
        }
      } else {
        amt = tx.isIncome ? Math.abs(tx.amount || 0) : -Math.abs(tx.amount || 0);
      }
      running += amt;
      map.set(tx.id || tx._id, running);
    });
    return map;
  }, [successfulTransactions, selectedAccountFilter]);

  // Filtered successful transactions with sorting (defaulted to recent transactions first)
  const displayedSuccessful = useMemo(() => {
    return [...successfulTransactions]
      .filter(matchesFilter)
      .map((tx) => ({
        ...tx,
        runningBalance: runningBalanceMap.get(tx.id || tx._id) ?? 0
      }))
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
  }, [successfulTransactions, matchesFilter, sortBy, runningBalanceMap]);

  // Filtered planned transactions with sorting (defaulted to urgent/recent first)
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

  // Chronologically grouped successful transactions (by Day)
  const groupedSuccessful = useMemo(() => {
    const groups = [];
    const map = new Map();

    displayedSuccessful.forEach((tx) => {
      const d = tx.date || 'Undated';
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d).push(tx);
    });

    map.forEach((items, dateKey) => {
      let daySum = 0;
      items.forEach((item) => {
        if (item.isIncome) daySum += item.amount;
        else daySum -= Math.abs(item.amount);
      });

      let label = dateKey;
      if (dateKey === todayStr) {
        label = 'Today';
      } else {
        const dObj = new Date(dateKey + 'T00:00:00');
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
        if (dateKey === yStr) {
          label = 'Yesterday';
        } else if (!isNaN(dObj.getTime())) {
          label = formatDisplayDate(dateKey, true);
        }
      }

      groups.push({
        dateKey,
        label,
        items,
        daySum
      });
    });

    return groups;
  }, [displayedSuccessful, todayStr]);

  // Grouped planned commitments (Overdue, Due Today, Upcoming)
  const groupedPlanned = useMemo(() => {
    const overdue = [];
    const due = [];
    const upcoming = [];

    displayedPlanned.forEach((tx) => {
      if (tx.derivedStatus === 'overdue') overdue.push(tx);
      else if (tx.derivedStatus === 'due') due.push(tx);
      else upcoming.push(tx);
    });

    const groups = [];
    if (overdue.length > 0) {
      const sum = overdue.reduce((acc, t) => acc + (t.plannedAmount || Math.abs(t.amount || 0)), 0);
      groups.push({
        type: 'overdue',
        title: 'Overdue Commitments',
        badgeClass: 'overdue-title',
        items: overdue,
        sum
      });
    }
    if (due.length > 0) {
      const sum = due.reduce((acc, t) => acc + (t.plannedAmount || Math.abs(t.amount || 0)), 0);
      groups.push({
        type: 'due',
        title: 'Due Today / Imminent',
        badgeClass: 'due-title',
        items: due,
        sum
      });
    }
    if (upcoming.length > 0) {
      const sum = upcoming.reduce((acc, t) => acc + (t.plannedAmount || Math.abs(t.amount || 0)), 0);
      groups.push({
        type: 'upcoming',
        title: 'Upcoming Commitments',
        badgeClass: '',
        items: upcoming,
        sum
      });
    }

    return groups;
  }, [displayedPlanned]);

  // Payment prompt opener
  const openPayPrompt = (tx) => {
    setPayingTx(tx);
    const prefillAmount = tx.plannedAmount !== undefined && tx.plannedAmount !== null
      ? tx.plannedAmount / 100
      : (tx.amount ? Math.abs(tx.amount) / 100 : '');
    setActualAmount(String(prefillAmount));
    setActualDate(todayStr);
    setSelectedAccountId(tx.accountId || '');
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
    await onPayTransaction?.(payingTx.id || payingTx._id, {
      amount: numAmount,
      date: actualDate || todayStr,
      accountId: selectedAccountId || payingTx.accountId
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

  const hasActiveFilters =
    selectedAccountFilter !== 'all' ||
    originFilter !== 'all' ||
    plannedFilter !== 'all' ||
    sortBy !== 'recent';

  const filterTriggerLabel = useMemo(() => {
    let count = 0;
    if (selectedAccountFilter !== 'all') count++;
    if (originFilter !== 'all') count++;
    if (plannedFilter !== 'all') count++;
    if (sortBy !== 'recent') count++;
    return count > 0 ? `Filters (${count})` : 'Filter & Sort';
  }, [selectedAccountFilter, originFilter, plannedFilter, sortBy]);

  return (
    <div className="transactions-screen" style={{ paddingBottom: '90px' }}>
      {/* Top Header: Title on Left, Controls (Search + Filter & Sort) on Right */}
      <div className="tx-header-wrap">
        <div className="tx-header-left-col">
          <h1 className="tx-header-title">Transactions</h1>
          <p className="tx-header-sub">Unified record of commitments and actual cash movement.</p>
        </div>

        <div className="tx-header-actions">
          {/* Compact Instant Search Box */}
          <div className="tx-search-box compact">
            <span className="tx-search-icon">
              <SearchIcon size={13} />
            </span>
            <input
              type="text"
              className="tx-search-input"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Filter & Sort Dropdown */}
          <div className="tx-filter-dropdown-wrap" ref={filterDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`filter-pill filter-dropdown-trigger ${hasActiveFilters ? 'has-filters' : ''}`}
              style={{
                height: '30px',
                padding: '0 10px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              aria-expanded={showFilterDropdown}
              aria-label="Filter and Sort"
              title="Filter and Sort"
            >
              <span>{filterTriggerLabel}</span>
              <ChevronDownIcon size={12} />
            </button>

            {showFilterDropdown && (
              <div
                className="filter-dropdown-menu"
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: 'var(--surface-card, #1e293b)',
                  border: '1px solid var(--border, #334155)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '220px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  View Mode
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className={`filter-menu-item ${activeSegment === 'transactions' ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSegment === 'transactions' ? 'var(--surface-hover, rgba(255,255,255,0.08))' : 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'left'
                  }}
                  onClick={() => {
                    setActiveSegment('transactions');
                    setShowFilterDropdown(false);
                  }}
                >
                  <span>Bank Statement / Successful</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`filter-menu-item ${activeSegment === 'planned' ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSegment === 'planned' ? 'var(--surface-hover, rgba(255,255,255,0.08))' : 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'left'
                  }}
                  onClick={() => {
                    setActiveSegment('planned');
                    setShowFilterDropdown(false);
                  }}
                >
                  <span>Planned Commitments</span>
                  {hasUrgentCommitments && (
                    <span className="badge-pill overdue" style={{ fontSize: '10px' }}>
                      {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueCount} Due`}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* New Entry Button */}
          {!isReviewMode && (
            <button
              type="button"
              className="btn-primary"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
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

      {/* Main Content */}
      {activeSegment === 'transactions' ? (
        <div className="statement-view-container">
          {/* Pending Commitments / Memo Section at Top of Statement */}
          {displayedPlanned.length > 0 && !isReviewMode && (
            <div className="statement-pending-card">
              <div className="statement-pending-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="statement-pending-badge">Pending Memo</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                    Upcoming & Due Commitments
                  </span>
                  <span className="statement-pending-count">{displayedPlanned.length}</span>
                </div>
                {hasUrgentCommitments && (
                  <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>
                    {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueCount} Due Today`}
                  </span>
                )}
              </div>

              <div className="statement-pending-list">
                {displayedPlanned.slice(0, 4).map((tx) => {
                  const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                  const isOverdue = tx.derivedStatus === 'overdue';
                  const isDue = tx.derivedStatus === 'due';

                  return (
                    <div key={tx.id || tx._id} className="statement-pending-row">
                      <div className="statement-pending-col-date">
                        <span className="tabular-nums" style={{ fontSize: '11.5px', color: isOverdue ? 'var(--danger)' : isDue ? 'var(--accent, #3b82f6)' : 'var(--text-secondary)' }}>
                          {tx.plannedDate || tx.date}
                        </span>
                      </div>
                      <div className="statement-pending-col-name">
                        <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>
                          {tx.name || tx.category}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{tx.category || 'General'}</span>
                          {account && <span>• {account.name}</span>}
                        </div>
                      </div>
                      <div className="statement-pending-col-amount">
                        <span className="tabular-nums" style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text)' }}>
                          {formatCurrency(tx.plannedAmount || tx.amount, currencySymbol)}
                        </span>
                      </div>
                      <div className="statement-pending-col-action">
                        <button
                          type="button"
                          className="tx-btn-icon-subtle"
                          onClick={() => onEditTransaction?.(tx)}
                          title="Edit planned commitment"
                        >
                          <EditIcon size={12} />
                        </button>
                        <button
                          type="button"
                          className="tx-btn-quick-pay"
                          onClick={() => handleQuickMarkPaid(tx)}
                          title="Quick Pay: Settle immediately"
                        >
                          <CheckCircleIcon size={11} />
                          <span>Settle</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {displayedPlanned.length > 4 && (
                  <button
                    type="button"
                    className="statement-view-all-pending"
                    onClick={() => setActiveSegment('planned')}
                  >
                    View all {displayedPlanned.length} planned commitments &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Official Bank Statement Ledger */}
          {displayedSuccessful.length === 0 ? (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontSize: '13px' }}>No transactions recorded for the selected criteria.</p>
            </div>
          ) : (
            <div className="statement-ledger-card">
              <div className="statement-table-wrapper">
                <table className="bank-statement-table">
                  <colgroup>
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '155px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '115px' }} />
                    <col style={{ width: '115px' }} />
                    <col style={{ width: '125px' }} />
                    {!isReviewMode && <col style={{ width: '46px' }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Account</th>
                      <th>Particulars & Narrative</th>
                      <th className="col-amount">Withdrawal (-)</th>
                      <th className="col-amount">Deposit (+)</th>
                      <th className="col-amount">Balance</th>
                      {!isReviewMode && <th style={{ textAlign: 'center' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSuccessful.map((tx) => {
                      const isTransfer = tx.origin === 'transfer';
                      const isFilteredAccount = selectedAccountFilter !== 'all';
                      const isDestination = isTransfer && isFilteredAccount && tx.destinationAccountId === selectedAccountFilter;
                      const isSource = isTransfer && isFilteredAccount && tx.accountId === selectedAccountFilter;

                      const sourceAcc = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                      const destAcc = allAccounts.find((a) => (a.id || a._id) === tx.destinationAccountId);
                      const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);

                      const isIncome = Boolean(tx.isIncome);
                      const isRefund = tx.amount < 0 && !isIncome;

                      let withdrawalAmt = null;
                      let depositAmt = null;

                      if (isTransfer) {
                        if (isFilteredAccount) {
                          if (isSource) {
                            withdrawalAmt = Math.abs(tx.amount);
                          } else if (isDestination) {
                            depositAmt = Math.abs(tx.amount);
                          }
                        }
                      } else {
                        withdrawalAmt = !isIncome && !isRefund ? Math.abs(tx.amount) : null;
                        depositAmt = isIncome || isRefund ? Math.abs(tx.amount) : null;
                      }

                      return (
                        <tr key={tx.id || tx._id} className="statement-row">
                          {/* Value Date */}
                          <td className="statement-cell-date">
                            <span className="tabular-nums">
                              {formatDisplayDate(tx.date, false)}
                            </span>
                          </td>

                          {/* Account (Positioned to the left, full pill display) */}
                          <td className="statement-cell-account">
                            {isTransfer ? (
                              isFilteredAccount ? (
                                <span className="statement-account-badge" title={(isDestination ? destAcc : sourceAcc)?.name}>
                                  {(isDestination ? destAcc : sourceAcc)?.accountType === 'wallet' ? <WalletIcon size={12} /> : <BuildingLibraryIcon size={12} />}
                                  <span>{(isDestination ? destAcc : sourceAcc)?.name || 'Account'}</span>
                                </span>
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', flexWrap: 'wrap' }}>
                                  <span className="statement-account-badge" title={sourceAcc?.name || 'Source Account'}>
                                    {sourceAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                                    <span>{sourceAcc?.name || 'Source'}</span>
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>&rarr;</span>
                                  <span className="statement-account-badge" title={destAcc?.name || 'Destination Account'}>
                                    {destAcc?.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                                    <span>{destAcc?.name || 'Dest'}</span>
                                  </span>
                                </div>
                              )
                            ) : account ? (
                              <span className="statement-account-badge" title={account.name}>
                                {account.accountType === 'wallet' ? <WalletIcon size={12} /> : <BuildingLibraryIcon size={12} />}
                                <span>{account.name}</span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                            )}
                          </td>

                          {/* Particulars */}
                          <td className="statement-cell-narrative">
                            <div className="statement-narrative-wrap">
                              <div className="statement-narrative-main">
                                <span className="statement-tx-title">
                                  {isTransfer ? (
                                    isFilteredAccount ? (
                                      isDestination ? `Transfer from ${sourceAcc?.name || 'Account'}` : `Transfer to ${destAcc?.name || 'Account'}`
                                    ) : (
                                      tx.name || 'Inter-Account Transfer'
                                    )
                                  ) : (
                                    tx.name || tx.note || tx.category
                                  )}
                                </span>
                                {isTransfer && (
                                  <span className="tx-tag" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent, #6366f1)' }}>
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
                                  <span className="tx-tag" style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)' }}>
                                    Settled
                                  </span>
                                )}
                              </div>
                              <div className="statement-narrative-sub">
                                <span>
                                  {isTransfer
                                    ? (isFilteredAccount ? (isDestination ? 'Deposit (Inflow)' : 'Withdrawal (Outflow)') : `${sourceAcc?.name || 'Source'} → ${destAcc?.name || 'Dest'}`)
                                    : (tx.category || 'General')}
                                </span>
                                {tx.note && tx.note !== tx.name && (
                                  <>
                                    <span>•</span>
                                    <span className="statement-note">{tx.note}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Withdrawal (Debit) */}
                          <td className="statement-cell-debit">
                            {withdrawalAmt !== null ? (
                              <span className="statement-amount-debit tabular-nums">
                                {formatCurrency(withdrawalAmt, currencySymbol)}
                              </span>
                            ) : (
                              <span className="statement-empty-col">—</span>
                            )}
                          </td>

                          {/* Deposit (Credit) */}
                          <td className="statement-cell-credit">
                            {isTransfer && !isFilteredAccount ? (
                              <span className="tabular-nums" style={{ fontSize: '11px', color: 'var(--accent, #6366f1)', fontWeight: 600 }} title="Neutral zero-sum transfer between accounts">
                                ⇄ {formatCurrency(Math.abs(tx.amount), currencySymbol)} (net {currencySymbol}0)
                              </span>
                            ) : depositAmt !== null ? (
                              <span className="statement-amount-credit tabular-nums">
                                +{formatCurrency(depositAmt, currencySymbol)}
                              </span>
                            ) : (
                              <span className="statement-empty-col">—</span>
                            )}
                          </td>

                          {/* Running Balance */}
                          <td className="statement-cell-balance">
                            <span className="statement-running-balance tabular-nums">
                              {formatCurrency(tx.runningBalance, currencySymbol)}
                            </span>
                          </td>

                          {/* Actions */}
                          {!isReviewMode && (
                            <td className="statement-cell-actions">
                              <button
                                type="button"
                                className="tx-btn-icon-subtle"
                                onClick={() => onDeleteTransaction?.(tx.id || tx._id)}
                                title={isTransfer ? "Delete transfer" : "Delete transaction"}
                              >
                                <TrashIcon size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        displayedPlanned.length === 0 ? (
          <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0, fontSize: '13px' }}>No planned commitments found for this filter.</p>
          </div>
        ) : (
          <div className="tx-groups-container">
            {groupedPlanned.map((group) => (
              <div key={group.type} className="tx-group">
                <div className="tx-group-header">
                  <div className="tx-group-title-wrap">
                    <span className={`tx-group-title ${group.badgeClass}`}>{group.title}</span>
                    <span className="tx-group-count">{group.items.length}</span>
                  </div>
                  <span className="tx-group-sum">
                    Group Total: {formatCurrency(group.sum, currencySymbol)}
                  </span>
                </div>

                <div className="tx-group-items">
                  {group.items.map((tx) => {
                    const account = allAccounts.find((a) => (a.id || a._id) === tx.accountId);
                    const isOverdue = tx.derivedStatus === 'overdue';
                    const isDue = tx.derivedStatus === 'due';

                    return (
                      <div
                        key={tx.id || tx._id}
                        className={`tx-row ${isOverdue ? 'row-overdue' : (isDue ? 'row-due' : 'row-upcoming')}`}
                      >
                        <div className="tx-row-left">
                          <div className="tx-row-headline">
                            <span className="tx-row-title">{tx.name || tx.category}</span>

                            {/* Restrained status badges */}
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
                              <span className="tx-tag" style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)' }}>
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

                          <div className="tx-row-meta">
                            <span>{tx.category || 'General'}</span>
                            {account && (
                              <>
                                <span>•</span>
                                <span className="tx-meta-account">
                                  {account.accountType === 'wallet' ? <WalletIcon size={11} /> : <BuildingLibraryIcon size={11} />}
                                  <span>{account.name}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="tx-row-right">
                          <span className="tx-amount">
                            {formatCurrency(tx.plannedAmount || tx.amount, currencySymbol)}
                          </span>

                          {!isReviewMode && (
                            <div className="tx-row-actions">
                              {/* Edit Planned Commitment Button */}
                              <button
                                type="button"
                                className="tx-btn-icon-subtle"
                                onClick={() => onEditTransaction?.(tx)}
                                title="Edit planned commitment"
                              >
                                <EditIcon size={12} />
                              </button>

                              {/* Quick Mark as Paid Button (Instant 1-tap with planned amount & today's date) */}
                              <button
                                type="button"
                                className="tx-btn-quick-pay"
                                onClick={() => handleQuickMarkPaid(tx)}
                                title="Quick Pay: Settle immediately with planned amount and today's date"
                              >
                                <CheckCircleIcon size={12} />
                                <span>Quick Pay</span>
                              </button>

                              {/* Standard Mark as Paid Button */}
                              <button
                                type="button"
                                className="tx-btn-mark-paid"
                                onClick={() => openPayPrompt(tx)}
                                title={tx.isIncome ? "Confirm salary deposit (confirm actual amount and date)" : "Mark as paid (confirm actual amount and date)"}
                              >
                                <CheckCircleIcon size={12} />
                                <span>{tx.isIncome ? 'Confirm Credit' : 'Mark Paid'}</span>
                              </button>

                              <button
                                type="button"
                                className="tx-btn-icon-subtle"
                                onClick={() => handlePromptCancel(tx)}
                                title="Cancel planned transaction"
                              >
                                <XIcon size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
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
