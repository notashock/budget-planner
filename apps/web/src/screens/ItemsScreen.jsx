import React, { useState } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { PlusIcon, BuildingLibraryIcon, WalletIcon, EditIcon, TrashIcon } from '../components/Icons.jsx';

export function ItemsScreen({
  items = [],
  transactions = [],
  simulation = null,
  currencySymbol = '₹',
  bankAccounts = [],
  wallets = [],
  onOpenUnifiedEntry,
  onEditItem,
  onTogglePaid,
  onDeleteItem,
  onDeleteTransaction
}) {
  const [filter, setFilter] = useState('all');

  const getItemDay = (item) => {
    if (item.type === 'one-time') return item.day ?? 1;
    return item.dayOfMonth ?? item.day ?? 1;
  };

  const sortItemsDesc = (arr) => [...arr].sort((a, b) => getItemDay(b) - getItemDay(a));
  const sortTransactionsDesc = (arr) => [...arr].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedItems = sortItemsDesc(items);
  const sortedTransactions = sortTransactionsDesc(transactions);

  const pendingItems = sortedItems.filter((i) => !i.isPaid);
  const paidItems = sortedItems.filter((i) => i.isPaid);
  const pendingCount = pendingItems.length;

  const filteredItems = sortedItems.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'transactions') return false;
    if (filter === 'pending') return !item.isPaid;
    return item.type === filter;
  });

  const renderTransactionCard = (tx) => {
    const linkedAccount = tx.accountType === 'wallet'
      ? wallets.find(w => (w._id || w.id) === (tx.walletId?._id || tx.walletId))
      : bankAccounts.find(b => (b._id || b.id) === (tx.bankAccountId?._id || tx.bankAccountId));

    return (
      <div
        key={tx._id}
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          minWidth: 0,
          gap: '12px'
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: 'var(--text)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              wordBreak: 'break-word',
              lineHeight: 1.35
            }}
            title={tx.note || tx.tag}
          >
            {tx.note || tx.tag}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              marginTop: '4px'
            }}
          >
            <span className="tabular-nums">{formatDisplayDate(tx.date, true)}</span> • {tx.tag} {tx.plannedItemId ? '• matched planned item' : '• unexpected'}
            {linkedAccount && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  padding: '1px 5px',
                  background: 'var(--surface-subtle)',
                  borderRadius: '3px',
                  border: '1px solid var(--border)'
                }}
              >
                {tx.accountType === 'wallet' ? <WalletIcon size={10} /> : <BuildingLibraryIcon size={10} />}
                {linkedAccount.name}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
            {formatCurrency(tx.amount, currencySymbol)}
          </span>
          <button
            type="button"
            className="btn-danger"
            style={{ padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => onDeleteTransaction(tx._id)}
            title="Delete transaction"
            aria-label="Delete transaction"
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderItemCard = (item, isEditable = true) => {
    const netInfo = simulation?.itemNetMap?.[item._id];
    const hasRefund = Boolean(netInfo?.hasRefund);

    let amountDisplay = '';
    let details = '';

    if (item.type === 'one-time') {
      amountDisplay = hasRefund
        ? formatCurrency(netInfo.netAmount, currencySymbol)
        : formatCurrency(item.amount, currencySymbol);
      if (item.isPaid && item.originalDay && item.originalDay !== item.day) {
        details = `Paid: Day ${item.day} (Orig: Day ${item.originalDay})`;
      } else if (item.isPaid) {
        details = `Paid: Day ${item.day}`;
      } else {
        details = `Scheduled: Day ${item.day}`;
      }
    } else {
      amountDisplay = hasRefund
        ? formatCurrency(netInfo.netAmount, currencySymbol)
        : formatCurrency(item.amount || 0, currencySymbol);
      if (item.isPaid && item.originalDay && item.originalDay !== (item.dayOfMonth || item.day)) {
        details = `Paid: Day ${item.day || item.dayOfMonth} (Orig: Day ${item.originalDay})`;
      } else if (item.isPaid) {
        details = `Paid: Day ${item.day || item.dayOfMonth}`;
      } else {
        details = `Recurring: Day ${item.dayOfMonth || 1} each month`;
      }
    }

    const pVal = item.priority ?? 0;
    const pTier = pVal === 0
      ? { label: 'High', bars: 3, color: 'var(--text)' }
      : pVal === 1
      ? { label: 'Med', bars: 2, color: 'var(--text-secondary)' }
      : { label: 'Low', bars: 1, color: 'var(--text-muted)' };

    return (
      <div key={item._id} className="item-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px' }}>
        {/* Bento Header: Title & Priority */}
        <div style={{ minWidth: 0 }}>
          <div className="item-bento-header">
            <span className="item-bento-title" title={item.name}>{item.name}</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: pTier.color,
                background: 'var(--surface-subtle)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500,
                flexShrink: 0
              }}
              title={`Priority: ${pTier.label}`}
            >
              <span className="priority-bars-icon" style={{ height: '11px' }}>
                <span className={`priority-bar bar-1 ${pTier.bars >= 1 ? 'active' : ''}`} style={{ width: '2px', height: '4px' }} />
                <span className={`priority-bar bar-2 ${pTier.bars >= 2 ? 'active' : ''}`} style={{ width: '2px', height: '7px' }} />
                <span className={`priority-bar bar-3 ${pTier.bars >= 3 ? 'active' : ''}`} style={{ width: '2px', height: '10px' }} />
              </span>
              {pTier.label}
            </span>
          </div>

          <div className="item-bento-badges" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                background: 'var(--surface-subtle)',
                padding: '1px 6px',
                borderRadius: '4px',
                textTransform: 'capitalize'
              }}
            >
              {item.type}
            </span>
            {(() => {
              const accId = item.bankAccountId?._id || item.bankAccountId || item.walletId?._id || item.walletId;
              const linkedAccount = simulation?.accounts?.[accId] || simulation?.accountsMap?.[accId];
              const linkedAccountName = linkedAccount ? linkedAccount.name : (item.bankAccountId ? 'Bank' : (item.walletId ? 'Wallet' : ''));
              if (!linkedAccountName) return null;
              return (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    padding: '1px 6px',
                    borderRadius: '4px'
                  }}
                  title={`Drawn from: ${linkedAccountName}`}
                >
                  {linkedAccountName}
                </span>
              );
            })()}
            {item.type === 'recurring' && item.isFixed && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text)',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 500
                }}
              >
                Fixed
              </span>
            )}
            {hasRefund && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text)',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 600
                }}
              >
                Net Refund
              </span>
            )}
            {item.isPaid && item.originalDay && item.originalDay !== (item.type === 'one-time' ? item.day : (item.dayOfMonth || item.day)) && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--primary)',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 500
                }}
                title={`Rescheduled upon payment from Day ${item.originalDay} to Day ${item.day || item.dayOfMonth}`}
              >
                Orig: Day {item.originalDay}
              </span>
            )}
          </div>
        </div>

        {/* Bento Body: Prominent Amount & Schedule */}
        <div className="item-bento-body" style={{ margin: '4px 0', minWidth: 0 }}>
          <div className="item-bento-amount tabular-nums" style={{ fontSize: '20px', fontWeight: 700 }}>
            {amountDisplay}
          </div>
          <div className="item-bento-schedule" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {details}
          </div>
          {hasRefund && (
            <div className="item-bento-refund tabular-nums" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Original: {formatCurrency(netInfo.originalAmount, currencySymbol)} (-{formatCurrency(netInfo.refundTotal, currencySymbol)})
            </div>
          )}
        </div>

        {/* Bento Footer: Status & Actions */}
        <div className="item-bento-footer" style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            className="recurring-toggle-switch"
            onClick={() => onTogglePaid?.(item._id, !item.isPaid)}
            title={item.isPaid ? 'Payment completed - click to mark pending' : 'Payment pending - click to mark paid'}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePaid?.(item._id, !item.isPaid);
              }
            }}
          >
            <div className={`recurring-toggle-track ${item.isPaid ? 'active' : ''}`}>
              <div className="recurring-toggle-thumb" />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: item.isPaid ? 'var(--text)' : 'var(--text-secondary)' }}>
              {item.isPaid ? 'Paid' : 'Pending'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isEditable ? (
              <button
                type="button"
                className="btn-subtle"
                onClick={() => onEditItem(item)}
                style={{ padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="Edit item"
                aria-label="Edit item"
              >
                <EditIcon size={14} />
              </button>
            ) : (
              <span
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-subtle)',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  cursor: 'not-allowed',
                  fontWeight: 500
                }}
                title="Paid items are locked from editing. Revert to pending to make changes."
              >
                🔒 Paid
              </span>
            )}
            <button
              type="button"
              className="btn-subtle"
              onClick={() => onDeleteItem(item._id)}
              style={{ padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger, #ef4444)' }}
              title="Delete item"
              aria-label="Delete item"
            >
              <TrashIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>Budget & spending</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onOpenUnifiedEntry?.('log')}
          style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusIcon size={14} />
          <span>New Entry</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="timeline-filters-row">
        {['all', 'recurring', 'one-time', 'pending', 'transactions'].map((t) => (
          <button
            key={t}
            type="button"
            className={`timeline-filter-btn ${filter === t ? 'active' : ''}`}
            onClick={() => setFilter(t)}
            style={{ textTransform: 'capitalize' }}
          >
            <span>{t}</span>
            {(t === 'pending' || t === 'transactions') && (
              <span className="filter-count tabular-nums">
                {t === 'pending' ? pendingCount : sortedTransactions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Dedicated Transactions Tab View */}
      {filter === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedTransactions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No transactions logged yet this month. Tap "New Entry" to log an expense or credit.
            </div>
          ) : (
            sortedTransactions.map(renderTransactionCard)
          )}
        </div>
      )}

      {/* All Tab: Sectioned Mixed Feed */}
      {filter === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: Active & Pending Budget Items */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Active & Pending Budget Items ({pendingItems.length})
              </h3>
            </div>
            {pendingItems.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                No active or pending budget items. All scheduled items have been paid or none were added.
              </div>
            ) : (
              <div className="items-grid">
                {pendingItems.map((item) => renderItemCard(item, true))}
              </div>
            )}
          </div>

          {/* Section 2: Logged Transactions & Paid Items */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Logged Transactions & Paid Items ({paidItems.length + sortedTransactions.length})
              </h3>
            </div>
            {paidItems.length === 0 && sortedTransactions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                No settled items or transactions logged yet this month.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {paidItems.length > 0 && (
                  <div className="items-grid">
                    {paidItems.map((item) => renderItemCard(item, false))}
                  </div>
                )}
                {sortedTransactions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sortedTransactions.map(renderTransactionCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Specific Filtered Items Views (recurring, one-time, pending) */}
      {filter !== 'transactions' && filter !== 'all' && (
        <div>
          {filteredItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No budget items found in this view.
            </div>
          ) : (
            <div className="items-grid">
              {filteredItems.map((item) => renderItemCard(item, !item.isPaid))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
