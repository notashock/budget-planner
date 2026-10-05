import React, { useState } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { PlusIcon, BuildingLibraryIcon, WalletIcon } from '../components/Icons.jsx';

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

  const pendingCount = items.filter((i) => !i.isPaid).length;

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'transactions') return false;
    if (filter === 'pending') return !item.isPaid;
    return item.type === filter;
  });

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
                {t === 'pending' ? pendingCount : transactions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Transactions View */}
      {filter === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {transactions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No transactions logged yet this month. Tap "New Entry" to log an expense or credit.
            </div>
          ) : (
            transactions.map((tx) => {
              const linkedAccount = tx.accountType === 'wallet'
                ? wallets.find(w => (w._id || w.id) === (tx.walletId?._id || tx.walletId))
                : bankAccounts.find(b => (b._id || b.id) === (tx.bankAccountId?._id || tx.bankAccountId));

              return (
                <div key={tx._id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      {tx.note || tx.tag}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                      <span className="tabular-nums">{formatDisplayDate(tx.date, true)}</span> • {tx.tag} {tx.plannedItemId ? '• matched planned item' : '• unexpected'}
                      {linkedAccount && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-secondary)', padding: '1px 5px', background: 'var(--surface-subtle)', borderRadius: '3px', border: '1px solid var(--border)' }}>
                          {tx.accountType === 'wallet' ? <WalletIcon size={10} /> : <BuildingLibraryIcon size={10} />}
                          {linkedAccount.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                      {formatCurrency(tx.amount, currencySymbol)}
                    </span>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                      onClick={() => onDeleteTransaction(tx._id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Items View */}
      {filter !== 'transactions' && (
        <div>
          {filteredItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No budget items found in this view.
            </div>
          ) : (
            <div className="items-grid">
              {filteredItems.map((item) => {
                const netInfo = simulation?.itemNetMap?.[item._id];
                const hasRefund = Boolean(netInfo?.hasRefund);

                let amountDisplay = '';
                let details = '';

                if (item.type === 'one-time') {
                  amountDisplay = hasRefund
                    ? formatCurrency(netInfo.netAmount, currencySymbol)
                    : formatCurrency(item.amount, currencySymbol);
                  details = `Scheduled: Day ${item.day}`;
                } else {
                  amountDisplay = hasRefund
                    ? formatCurrency(netInfo.netAmount, currencySymbol)
                    : formatCurrency(item.amount || 0, currencySymbol);
                  details = `Recurring: Day ${item.dayOfMonth || 1} each month`;
                }

                const pVal = item.priority ?? 0;
                const pTier = pVal === 0
                  ? { label: 'High', bars: 3, color: 'var(--text)' }
                  : pVal === 1
                  ? { label: 'Med', bars: 2, color: 'var(--text-secondary)' }
                  : { label: 'Low', bars: 1, color: 'var(--text-muted)' };

                return (
                  <div key={item._id} className="item-bento-card">
                    {/* Bento Header: Title & Priority */}
                    <div>
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

                      <div className="item-bento-badges">
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
                              color: 'var(--accent)',
                              background: 'var(--accent-subtle)',
                              border: '1px solid var(--accent)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 500
                            }}
                          >
                            Fixed
                          </span>
                        )}
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
                        {hasRefund && (
                          <span
                            style={{
                              fontSize: '10px',
                              color: 'var(--success)',
                              background: 'var(--success-subtle)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 500
                            }}
                          >
                            Net after refund
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bento Body: Prominent Amount & Schedule */}
                    <div className="item-bento-body">
                      <div className="item-bento-amount">
                        {amountDisplay}
                      </div>
                      <div className="item-bento-schedule">
                        {details}
                      </div>
                      {hasRefund && (
                        <div className="item-bento-refund">
                          Original: {formatCurrency(netInfo.originalAmount, currencySymbol)} (-{formatCurrency(netInfo.refundTotal, currencySymbol)})
                        </div>
                      )}
                    </div>

                    {/* Bento Footer: Status & Actions */}
                    <div className="item-bento-footer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            color: item.isPaid ? 'var(--text)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                          onClick={() => onTogglePaid?.(item._id, !item.isPaid)}
                          title={item.isPaid ? 'Payment completed - click to mark pending' : 'Payment pending - click to mark paid'}
                        >
                          {item.type === 'recurring'
                            ? (item.isPaid ? '✓ Billed this month' : '○ Unpaid this month')
                            : (item.isPaid ? '✓ Paid' : '○ Pending')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn-subtle"
                          onClick={() => onEditItem(item)}
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => onDeleteItem(item._id)}
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
