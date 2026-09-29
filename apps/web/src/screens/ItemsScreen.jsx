import React, { useState } from 'react';
import { calculateFormulaCost, calculateFuelEfficiency, formatCurrency, formatDisplayDate } from '@budget/engine';

export function ItemsScreen({
  items = [],
  transactions = [],
  simulation = null,
  currencySymbol = '$',
  onOpenAddItem,
  onOpenQuickLog,
  onEditItem,
  onDeleteItem,
  onDeleteTransaction
}) {
  const [filter, setFilter] = useState('all');

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'transactions') return false;
    return item.type === filter;
  });

  return (
    <div className="screen-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>Budget & spending</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={onOpenQuickLog} style={{ padding: '6px 10px', fontSize: '12px' }}>
            ⚡ Log spending
          </button>
          <button type="button" className="btn-primary" onClick={onOpenAddItem} style={{ padding: '6px 10px', fontSize: '12px' }}>
            + Plan item
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['all', 'recurring', 'one-time', 'fuel-log', 'formula', 'transactions'].map((t) => (
          <button
            key={t}
            type="button"
            className={filter === t ? 'btn-primary' : ''}
            onClick={() => setFilter(t)}
            style={{ padding: '6px 10px', fontSize: '11px', textTransform: 'capitalize' }}
          >
            {t} {t === 'transactions' ? `(${transactions.length})` : ''}
          </button>
        ))}
      </div>

      {/* Transactions View */}
      {filter === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {transactions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No transactions logged yet this month. Tap "⚡ Log spending" to quick-log an expense.
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx._id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>
                    {tx.note || tx.tag}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {formatDisplayDate(tx.date, true)} • {tx.tag} {tx.plannedItemId ? '• matched to planned item' : '• unexpected'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 600, color: tx.amount < 0 ? 'var(--success)' : 'var(--text)' }}>
                    {formatCurrency(tx.amount, currencySymbol)}
                  </span>
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ padding: '2px 6px', fontSize: '11px' }}
                    onClick={() => onDeleteTransaction(tx._id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Items View */}
      {filter !== 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No budget items found in this view.
            </div>
          ) : (
            filteredItems.map((item) => {
              const netInfo = simulation?.itemNetMap?.[item._id];
              const hasRefund = Boolean(netInfo?.hasRefund);

              let amountDisplay = '';
              let details = '';

              if (item.type === 'one-time') {
                amountDisplay = hasRefund
                  ? formatCurrency(netInfo.netAmount, currencySymbol)
                  : formatCurrency(item.amount, currencySymbol);
                details = `Scheduled: Day ${item.day}`;
              } else if (item.type === 'recurring') {
                amountDisplay = hasRefund
                  ? formatCurrency(netInfo.netAmount, currencySymbol)
                  : formatCurrency(item.amount, currencySymbol);
                details = `Recurring: Day ${item.dayOfMonth} each month`;
              } else if (item.type === 'fuel-log') {
                const fuelRes = calculateFuelEfficiency(item.fuelStops || []);
                amountDisplay = formatCurrency(fuelRes.totalFuelCost, currencySymbol);
                details = `${item.fuelStops?.length || 0} fuel stop${(item.fuelStops?.length || 0) > 1 ? 's' : ''}`;
              } else if (item.type === 'formula') {
                const cfg = item.formulaConfig || {};
                const perCost = calculateFormulaCost({
                  distance: cfg.distance || 0,
                  efficiency: cfg.efficiency || 1,
                  fuelPrice: cfg.fuelPrice || 0,
                  extraCost: cfg.extraCost || 0,
                  scale: 100
                });
                const totalCost = perCost * (cfg.dates?.length || 0);
                amountDisplay = formatCurrency(totalCost, currencySymbol);
                details = `${cfg.dates?.length || 0} trips (days ${cfg.dates?.join(', ')})`;
              }

              return (
                <div key={item._id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '15px' }}>{item.name}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            background: 'var(--surface-subtle)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          {item.type}
                        </span>
                        {item.type === 'recurring' && item.isFixed && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--accent)',
                              background: 'var(--accent-subtle)',
                              border: '1px solid var(--accent)',
                              padding: '2px 6px',
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
                              fontSize: '11px',
                              color: 'var(--success)',
                              background: 'var(--success-subtle)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 500
                            }}
                          >
                            Net after refund
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {details}
                        {item.priority !== 0 && ` • Priority ${item.priority}`}
                        {hasRefund && ` • Original: ${formatCurrency(netInfo.originalAmount, currencySymbol)}`}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>
                        {amountDisplay}
                      </div>
                      {hasRefund && (
                        <div style={{ fontSize: '11px', color: 'var(--success)' }}>
                          -{formatCurrency(netInfo.refundTotal, currencySymbol)} refund
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bike Fuel Log Efficiency Display */}
                  {item.type === 'fuel-log' && (
                    <div className="assumptions-box" style={{ background: 'var(--surface-subtle)' }}>
                      {(() => {
                        const res = calculateFuelEfficiency(item.fuelStops || []);
                        return (
                          <>
                            <strong>Bike efficiency: </strong>
                            {res.averageEfficiency ? (
                              <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                                {res.averageEfficiency} km/L
                              </span>
                            ) : (
                              <span>Log 2nd stop to compute efficiency</span>
                            )}
                            {res.totalDistance > 0 && ` (${res.totalDistance} km traveled)`}
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                              {item.fuelStops?.map((s, idx) => (
                                <div key={idx}>
                                  Stop {idx + 1} ({formatDisplayDate(s.date, false)}): {s.odometer} km • {s.fuelVolume} L • {formatCurrency(s.fuelCost, currencySymbol)}
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Assumptions for Formula items */}
                  {item.type === 'formula' && (
                    <div className="assumptions-box">
                      <strong>Assumptions:</strong> Distance: {item.formulaConfig?.distance} units, Efficiency: {item.formulaConfig?.efficiency}, Fuel price: {formatCurrency(item.formulaConfig?.fuelPrice || 0, currencySymbol)}, Extra cost: {formatCurrency(item.formulaConfig?.extraCost || 0, currencySymbol)}.
                      <br />
                      <strong>Calculated per occurrence:</strong> {formatCurrency(calculateFormulaCost({
                        distance: item.formulaConfig?.distance || 0,
                        efficiency: item.formulaConfig?.efficiency || 1,
                        fuelPrice: item.formulaConfig?.fuelPrice || 0,
                        extraCost: item.formulaConfig?.extraCost || 0,
                        scale: 100
                      }), currencySymbol)} (rounded to whole unit).
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                    <button
                      type="button"
                      className="btn-subtle"
                      onClick={() => onEditItem(item)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => onDeleteItem(item._id)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
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
    </div>
  );
}
