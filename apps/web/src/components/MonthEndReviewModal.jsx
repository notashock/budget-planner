import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { formatCurrency } from '@budget/engine';

export function MonthEndReviewModal({
  isOpen,
  onClose,
  month,
  items = [],
  simulation = null,
  currencySymbol = '₹'
}) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && month) {
      setLoading(true);
      setError('');
      api.getMonthEndReview(month.year, month.month)
        .then((data) => setReview(data))
        .catch((err) => setError(err.message || 'Failed to load review'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, month]);

  if (!isOpen) return null;

  // Breakdown of recurring and fixed commitments
  const recurringItems = (items || []).filter((i) => i.type === 'recurring');
  const fixedItems = recurringItems.filter((i) => i.isFixed);
  const variableRecurring = recurringItems.filter((i) => !i.isFixed);
  const totalRecurringCommitted = recurringItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalFixedCommitted = fixedItems.reduce((sum, i) => sum + (i.amount || 0), 0);

  // Dynamic Survival Cushion from safe velocity simulation or fallback
  const survivalCushion = simulation?.safeVelocity?.freeSurplus != null
    ? simulation.safeVelocity.freeSurplus
    : (simulation?.allowanceLeft != null ? simulation.allowanceLeft : (review?.unplannedAllowance || 0));
  const safeVelocityPerDay = simulation?.safeVelocity?.safeVelocityPerDay ?? (simulation?.safeToSpendPerDay ?? 0);
  const paceStatus = simulation?.safeVelocity?.paceStatus || null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div className="modal-drag-handle" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Month Review</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Audit of planned baselines, recurring commitments, and dynamic survival cushion
            </span>
          </div>
          <button
            type="button"
            className="btn-subtle"
            onClick={onClose}
            style={{ fontSize: '18px', padding: '4px 8px', lineHeight: 1 }}
            title="Close"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading review analysis...
          </div>
        ) : error ? (
          <div style={{ color: 'var(--danger)', fontSize: '13px', padding: '12px 0' }}>{error}</div>
        ) : review ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {/* Dynamic Survival Cushion vs Actual Spend */}
            <div className="summary-grid">
              <div className="summary-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="summary-label">Dynamic survival cushion</span>
                  {paceStatus && (
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}
                    >
                      {paceStatus}
                    </span>
                  )}
                </div>
                <span className="summary-value">
                  {formatCurrency(survivalCushion, currencySymbol)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {formatCurrency(safeVelocityPerDay, currencySymbol)}/day safe pace
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Actual unplanned spend</span>
                <span
                  className="summary-value"
                  style={{
                    color: review.totalUnplannedActual > survivalCushion ? 'var(--danger)' : 'var(--text)'
                  }}
                >
                  {formatCurrency(review.totalUnplannedActual, currencySymbol)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {review.totalUnplannedActual > survivalCushion ? 'Exceeded cushion' : 'Within survival limits'}
                </span>
              </div>
            </div>

            {/* Fixed & Recurring Commitments Section */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Fixed & recurring commitments</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Total: {formatCurrency(totalRecurringCommitted, currencySymbol)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
                <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Fixed Rollovers</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                    {formatCurrency(totalFixedCommitted, currencySymbol)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {fixedItems.length} fixed item{fixedItems.length !== 1 ? 's' : ''}
                  </div>
                </div>

                <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Variable</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                    {formatCurrency(totalRecurringCommitted - totalFixedCommitted, currencySymbol)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {variableRecurring.length} variable item{variableRecurring.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {recurringItems.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>
                  No recurring commitments configured for this month.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {recurringItems.map((item) => (
                    <div
                      key={item._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '13px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                        {item.isFixed && (
                          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600 }}>
                            Fixed Rollover
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Day {item.dayOfMonth || 1}
                        </span>
                      </div>
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(item.amount, currencySymbol)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tag Breakdown */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Spending by category</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {Object.keys(review.tagBreakdown || {}).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px' }}>
                    No categorized spending recorded this month.
                  </div>
                ) : (
                  Object.entries(review.tagBreakdown || {}).map(([tag, data]) => (
                    <div
                      key={tag}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '13px'
                      }}
                    >
                      <span>{tag} ({data.count} entries)</span>
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(data.total, currencySymbol)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Suggested Survival Cushion */}
            <div className="card" style={{ background: 'var(--surface-subtle)' }}>
              <div className="card-header">
                <span className="card-title">Suggested next-month survival cushion</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent)' }}>
                {formatCurrency(review.suggestedNextMonthAllowance, currencySymbol)}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Dynamically projected based on actual spending velocity + 10% safety buffer to safeguard your salary floor and active commitments.
              </p>
            </div>

            {/* Optional AI Pattern Explanation */}
            {review.aiExplanation && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Assistant spending insight</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {review.aiExplanation}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
