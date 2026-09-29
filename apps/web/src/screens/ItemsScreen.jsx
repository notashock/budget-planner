import React, { useState } from 'react';
import { calculateFormulaCost, formatCurrency } from '@budget/engine';

export function ItemsScreen({
  items = [],
  currencySymbol = '$',
  onOpenAddItem,
  onEditItem,
  onDeleteItem
}) {
  const [filter, setFilter] = useState('all');

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  return (
    <div className="screen-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>Budget items</h2>
        <button type="button" className="btn-primary" onClick={onOpenAddItem}>
          + Add item
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['all', 'recurring', 'one-time', 'formula'].map((t) => (
          <button
            key={t}
            type="button"
            className={filter === t ? 'btn-primary' : ''}
            onClick={() => setFilter(t)}
            style={{ padding: '6px 12px', fontSize: '12px', textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
          No items found in this view.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredItems.map((item) => {
            let amountDisplay = '';
            let details = '';

            if (item.type === 'one-time') {
              amountDisplay = formatCurrency(item.amount, currencySymbol);
              details = `Due day ${item.day}`;
            } else if (item.type === 'recurring') {
              amountDisplay = formatCurrency(item.amount, currencySymbol);
              details = `Recurring on day ${item.dayOfMonth} each month`;
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
              details = `${cfg.dates?.length || 0} trip${(cfg.dates?.length || 0) > 1 ? 's' : ''} (days ${cfg.dates?.join(', ')})`;
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
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {details}
                      {item.priority !== 0 && ` • Priority ${item.priority}`}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>
                      {amountDisplay}
                    </div>
                  </div>
                </div>

                {/* Explicit Assumptions box for Formula items */}
                {item.type === 'formula' && (
                  <div className="assumptions-box">
                    <strong>Assumptions:</strong> Distance: {item.formulaConfig?.distance} units, Efficiency: {item.formulaConfig?.efficiency}, Fuel price: {formatCurrency(item.formulaConfig?.fuelPrice || 0, currencySymbol)}, Extra cost: {formatCurrency(item.formulaConfig?.extraCost || 0, currencySymbol)}.
                    <br />
                    <strong>Calculated cost per occurrence:</strong> {formatCurrency(calculateFormulaCost({
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
          })}
        </div>
      )}
    </div>
  );
}
