import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { formatCurrency } from '@budget/engine';

export function MonthEndReviewModal({
  isOpen,
  onClose,
  month,
  currencySymbol = '$'
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Month-end allowance review</h3>
          <button type="button" className="btn-subtle" onClick={onClose}>Close</button>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading review analysis...
          </div>
        ) : error ? (
          <div style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</div>
        ) : review ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Allowance vs Actual Summary */}
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Unplanned allowance</span>
                <span className="summary-value">
                  {formatCurrency(review.unplannedAllowance, currencySymbol)}
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Actual unplanned spend</span>
                <span
                  className="summary-value"
                  style={{
                    color: review.totalUnplannedActual > review.unplannedAllowance ? 'var(--danger)' : 'var(--text)'
                  }}
                >
                  {formatCurrency(review.totalUnplannedActual, currencySymbol)}
                </span>
              </div>
            </div>

            {/* Tag Breakdown */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Spending by category</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(review.tagBreakdown || {}).map(([tag, data]) => (
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
                ))}
              </div>
            </div>

            {/* Suggested Allowance (Plain Arithmetic) */}
            <div className="card" style={{ background: 'var(--surface-subtle)' }}>
              <div className="card-header">
                <span className="card-title">Suggested next-month allowance</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent)' }}>
                {formatCurrency(review.suggestedNextMonthAllowance, currencySymbol)}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Computed by plain arithmetic: actual spending + 10% buffer, rounded to the nearest 50 whole units.
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
