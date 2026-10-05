import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api } from '../api.js';
import { formatCurrency } from '@budget/engine';

gsap.registerPlugin(useGSAP);

export function MonthEndReviewModal({
  isOpen,
  onClose,
  month,
  items = [],
  simulation = null,
  currencySymbol = '₹',
  accountId = 'all'
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const isClosingRef = useRef(false);

  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const reviewBodyRef = useRef(null);

  // Touch gesture tracking for mobile bottom-to-top drawer
  const touchStartY = useRef(0);
  const touchStartScrollTop = useRef(0);
  const isDraggingSheet = useRef(false);
  const touchStartTime = useRef(0);

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lock outer background body scroll while modal is rendered
  useEffect(() => {
    if (shouldRender) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [shouldRender]);

  // Sync internal render state with isOpen prop
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
    } else if (shouldRender && !isClosingRef.current) {
      triggerExit();
    }
  }, [isOpen]);

  // Fetch review data on open
  useEffect(() => {
    if (isOpen && month) {
      setLoading(true);
      setError('');
      api.getMonthEndReview(month.year, month.month, accountId)
        .then((data) => setReview(data))
        .catch((err) => setError(err.message || 'Failed to load review'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, month, accountId]);

  const { contextSafe } = useGSAP({ scope: containerRef });

  // Exit animation execution
  const triggerExit = contextSafe((onDone) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const tl = gsap.timeline({
      onComplete: () => {
        setShouldRender(false);
        isClosingRef.current = false;
        if (typeof onDone === 'function') onDone();
        onClose?.();
      }
    });

    if (contentRef.current) {
      tl.to(
        contentRef.current,
        {
          y: isMobile ? '100%' : 16,
          scale: isMobile ? 1 : 0.985,
          opacity: isMobile ? 1 : 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }

    if (overlayRef.current) {
      tl.to(
        overlayRef.current,
        {
          opacity: 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }
  });

  // Entrance animation on mount
  useGSAP(() => {
    if (!shouldRender || isClosingRef.current) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    gsap.killTweensOf([overlayRef.current, contentRef.current]);

    if (overlayRef.current) {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.24, ease: 'power2.out' }
      );
    }

    if (contentRef.current) {
      gsap.fromTo(
        contentRef.current,
        {
          y: isMobile ? '100%' : 18,
          scale: isMobile ? 1 : 0.985,
          opacity: isMobile ? 1 : 0
        },
        {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.28,
          ease: 'power3.out'
        }
      );
    }
  }, { dependencies: [shouldRender], scope: containerRef });

  // Stagger review cards when review data arrives
  useGSAP(() => {
    if (!shouldRender || !review || loading || !reviewBodyRef.current) return;

    const cards = reviewBodyRef.current.querySelectorAll('.summary-card, .card');
    if (cards.length) {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, stagger: 0.03, duration: 0.24, ease: 'power2.out' }
      );
    }
  }, { dependencies: [review, loading, shouldRender], scope: containerRef });

  // Touch gesture drag-to-dismiss handlers
  const handleTouchStart = (e) => {
    if (!contentRef.current) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartScrollTop.current = contentRef.current.scrollTop;
    isDraggingSheet.current = false;
    touchStartTime.current = Date.now();
  };

  const handleTouchMove = (e) => {
    if (!contentRef.current) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    if (!isMobile) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    if ((touchStartScrollTop.current <= 0 && deltaY > 0) || isDraggingSheet.current) {
      isDraggingSheet.current = true;
      if (e.cancelable) e.preventDefault();

      // Clamp y >= 0 via gsap.utils.clamp: prevents sheet from ever translating above the top viewport edge
      const clampedY = gsap.utils.clamp(0, window.innerHeight, deltaY);
      gsap.set(contentRef.current, { y: clampedY });
      const progress = gsap.utils.clamp(0, 1, 1 - clampedY / 320);
      if (overlayRef.current) {
        gsap.set(overlayRef.current, { opacity: progress });
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!contentRef.current || !isDraggingSheet.current) return;
    isDraggingSheet.current = false;

    const currentY = e.changedTouches[0].clientY;
    const deltaY = Math.max(0, currentY - touchStartY.current);
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = deltaY / (elapsed || 1);

    if (deltaY > 80 || (velocity > 0.45 && deltaY > 25)) {
      triggerExit();
    } else {
      gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
      if (overlayRef.current) {
        gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
      }
    }
  };

  // Keyboard Escape listener
  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        triggerExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, triggerExit]);

  // Clean up active tweens on unmount
  useEffect(() => {
    return () => {
      if (contentRef.current) gsap.killTweensOf(contentRef.current);
      if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
    };
  }, []);

  if (!shouldRender) return null;

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
    <div ref={containerRef}>
      <div
        ref={overlayRef}
        className="modal-overlay"
        onClick={() => triggerExit()}
      >
        <div
          ref={contentRef}
          className="modal-content month-review-content"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ maxWidth: '580px' }}
        >
          {/* Mobile bottom-sheet grab handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  {review?.isAccountSpecific ? `Month Review: ${review.accountName}` : 'Month Review'}
                </h3>
                {review?.isAccountSpecific && (
                  <span
                    style={{
                      fontSize: '9px',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}
                  >
                    {review.accountType === 'wallet' ? 'Wallet' : 'Bank Account'}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {review?.isAccountSpecific
                  ? `Isolated cashflow audit of income, spend, and transfers for ${review.accountName}`
                  : 'Unified audit of planned baselines, recurring commitments, and dynamic survival cushion'}
              </span>
            </div>
            <button
              type="button"
              className="btn-subtle"
              onClick={() => triggerExit()}
              style={{ fontSize: '18px', padding: '4px 8px', lineHeight: 1 }}
              title="Close"
            >
              &times;
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
              <div className="summary-grid">
                <div className="skeleton-pulse" style={{ height: '76px' }} />
                <div className="skeleton-pulse" style={{ height: '76px' }} />
              </div>
              <div className="skeleton-pulse" style={{ height: '140px' }} />
              <div className="skeleton-pulse" style={{ height: '90px' }} />
            </div>
          ) : error ? (
            <div style={{ color: 'var(--danger)', fontSize: '13px', padding: '12px 0' }}>{error}</div>
          ) : review ? (
            <div ref={reviewBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
              {/* Account-Specific View */}
              {review.isAccountSpecific ? (
                <>
                  <div className="summary-grid">
                    <div className="summary-card">
                      <span className="summary-label">Account Inflows (Income)</span>
                      <span className="summary-value" style={{ color: '#10b981' }}>
                        {formatCurrency(review.totalIncome, currencySymbol)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Direct: {formatCurrency(review.directIncome, currencySymbol)} • In: {formatCurrency(review.totalTransferIn, currencySymbol)}
                      </span>
                    </div>

                    <div className="summary-card">
                      <span className="summary-label">Account Outflows (Expenses)</span>
                      <span className="summary-value" style={{ color: 'var(--text)' }}>
                        {formatCurrency(review.totalExpenses, currencySymbol)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Direct: {formatCurrency(review.directExpenses, currencySymbol)} • Out: {formatCurrency(review.totalTransferOut, currencySymbol)}
                      </span>
                    </div>
                  </div>

                  <div className="summary-grid">
                    <div className="summary-card">
                      <span className="summary-label">Net Monthly Cashflow</span>
                      <span
                        className="summary-value"
                        style={{ color: review.netCashflow >= 0 ? '#10b981' : 'var(--danger)' }}
                      >
                        {formatCurrency(review.netCashflow, currencySymbol)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {review.netCashflow >= 0 ? 'Net positive accumulation' : 'Net deficit (drawdown)'}
                      </span>
                    </div>

                    <div className="summary-card">
                      <span className="summary-label">Unplanned Account Spend</span>
                      <span className="summary-value">
                        {formatCurrency(review.totalUnplannedActual, currencySymbol)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Matched bills: {formatCurrency(review.totalMatchedActual, currencySymbol)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                /* Unified View */
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
              )}

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
    </div>
  );
}
