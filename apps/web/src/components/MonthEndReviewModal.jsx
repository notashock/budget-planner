import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api } from '../api.js';
import { formatCurrency } from '@budget/engine';
import { XIcon, SparklesIcon } from './Icons.jsx';

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

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
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

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
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

  // Safety cushion from safe velocity simulation or fallback
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
        >
          {/* Mobile bottom-sheet grab handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          {/* Sticky Modal Header */}
          <div className="month-review-header">
            <div className="review-box">
              <div className="review-row">
                <h3 className="review-heading">
                  {review?.isAccountSpecific ? `Month Review: ${review.accountName}` : 'Month Review'}
                </h3>
                {review?.isAccountSpecific ? (
                  <span className="review-note"
                  >
                    {review.accountType === 'wallet' ? 'Wallet' : 'Bank Account'}
                  </span>
                ) : (
                  <span className="review-note"
                  >
                    Unified View
                  </span>
                )}
              </div>
              <div className="review-note-2">
                {review?.isAccountSpecific
                  ? `Isolated cashflow audit of income, spend, and transfers for ${review.accountName}`
                  : 'How this month went against your plan, your bills and your safety cushion'}
              </div>
            </div>
            <button
              type="button"
              className="btn-icon modal-close-btn review-btn"
              onClick={() => triggerExit()}
              title="Close modal"
              aria-label="Close"
            >
              <XIcon size={14} />
            </button>
          </div>

          {/* Scrollable Modal Body */}
          <div className="month-review-scroll-body" ref={reviewBodyRef}>
            {loading ? (
              <div className="review-stack">
                <div className="skeleton-pulse review-box-2" />
                <div className="month-review-bento-row">
                  <div className="skeleton-pulse review-box-3" />
                  <div className="skeleton-pulse review-box-3" />
                </div>
                <div className="skeleton-pulse review-box-4" />
                <div className="skeleton-pulse review-box-5" />
              </div>
            ) : error ? (
              <div className="review-text">
                {error}
              </div>
            ) : review ? (
              <>
                {/* 1. Executive Hero Header */}
                {review.isAccountSpecific ? (
                  <div className="month-review-hero">
                    <div className="review-row-2">
                      <span className="summary-label review-text-2">Net Monthly Cashflow</span>
                      <span
                        style={{
                          fontSize: 'var(--fs-2xs)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: review.netCashflow >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: review.netCashflow >= 0 ? 'var(--positive)' : 'var(--danger)',
                          fontWeight: 600,
                          border: `1px solid ${review.netCashflow >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
                        }}
                      >
                        {review.netCashflow >= 0 ? 'Net Positive Accumulation' : 'Net Deficit (Drawdown)'}
                      </span>
                    </div>
                    <div
                      className="month-review-hero-value tabular-nums"
                      style={{ color: review.netCashflow >= 0 ? 'var(--positive)' : 'var(--danger)' }}
                    >
                      {review.netCashflow >= 0 ? '+' : ''}{formatCurrency(review.netCashflow, currencySymbol)}
                    </div>
                    <div className="review-row-3">
                      <span>Direct Cashflow: <strong className="tabular-nums review-text-3">{formatCurrency(review.directIncome - review.directExpenses, currencySymbol)}</strong></span>
                      <span>Transfers Net: <strong className="tabular-nums review-text-3">{formatCurrency(review.totalTransferIn - review.totalTransferOut, currencySymbol)}</strong></span>
                    </div>
                  </div>
                ) : (
                  <div className="month-review-hero">
                    <div className="review-row-2">
                      <span className="summary-label review-text-2">Safety cushion</span>
                      {paceStatus && (
                        <span className="review-note-3"
                        >
                          {paceStatus}
                        </span>
                      )}
                    </div>
                    <div className="month-review-hero-value tabular-nums review-text-3">
                      {formatCurrency(survivalCushion, currencySymbol)}
                    </div>
                    <div className="review-row-3">
                      <span>Daily spending limit: <strong className="tabular-nums review-text-3">{formatCurrency(safeVelocityPerDay, currencySymbol)}/day</strong></span>
                      <span>Actual unplanned: <strong className="tabular-nums" style={{ color: review.totalUnplannedActual > survivalCushion ? 'var(--danger)' : 'var(--text)' }}>{formatCurrency(review.totalUnplannedActual, currencySymbol)}</strong></span>
                    </div>
                  </div>
                )}

                {/* 2. Balanced Bento Row */}
                {review.isAccountSpecific ? (
                  <>
                    <div className="month-review-bento-row">
                      <div className="summary-card">
                        <span className="summary-label">Account Inflows (Income)</span>
                        <span className="summary-value tabular-nums review-text-4">
                          {formatCurrency(review.totalIncome, currencySymbol)}
                        </span>
                        <span className="review-note-4">
                          Direct: {formatCurrency(review.directIncome, currencySymbol)} • In: {formatCurrency(review.totalTransferIn, currencySymbol)}
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Account Outflows (Expenses)</span>
                        <span className="summary-value tabular-nums review-text-3">
                          {formatCurrency(review.totalExpenses, currencySymbol)}
                        </span>
                        <span className="review-note-4">
                          Direct: {formatCurrency(review.directExpenses, currencySymbol)} • Out: {formatCurrency(review.totalTransferOut, currencySymbol)}
                        </span>
                      </div>
                    </div>

                    <div className="month-review-bento-row">
                      <div className="summary-card">
                        <span className="summary-label">Unplanned Account Spend</span>
                        <span className="summary-value tabular-nums">
                          {formatCurrency(review.totalUnplannedActual, currencySymbol)}
                        </span>
                        <span className="review-note-4">
                          Discretionary spend drawn from allowance
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Matched Planned Bills</span>
                        <span className="summary-value tabular-nums">
                          {formatCurrency(review.totalMatchedActual, currencySymbol)}
                        </span>
                        <span className="review-note-4">
                          Attributed payments toward commitments
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="month-review-bento-row">
                    <div className="summary-card">
                      <span className="summary-label">Actual Unplanned Spend</span>
                      <span
                        className="summary-value tabular-nums"
                        style={{
                          color: review.totalUnplannedActual > survivalCushion ? 'var(--danger)' : 'var(--text)'
                        }}
                      >
                        {formatCurrency(review.totalUnplannedActual, currencySymbol)}
                      </span>
                      <span className="review-note-4">
                        {review.totalUnplannedActual > survivalCushion ? 'Exceeded survival cushion' : 'Within survival limits'}
                      </span>
                    </div>

                    <div className="summary-card">
                      <span className="summary-label">Committed Obligations</span>
                      <span className="summary-value tabular-nums">
                        {formatCurrency(totalRecurringCommitted, currencySymbol)}
                      </span>
                      <span className="review-note-4">
                        {fixedItems.length} fixed rollovers • {variableRecurring.length} variable
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Fixed & Recurring Commitments Section */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Fixed & recurring commitments</span>
                    <span className="review-note-4">
                      Total: <strong className="tabular-nums review-text-3">{formatCurrency(totalRecurringCommitted, currencySymbol)}</strong>
                    </span>
                  </div>

                  <div className="review-grid">
                    <div className="review-box-6">
                      <div className="review-note-5">Fixed Rollovers</div>
                      <div className="tabular-nums review-text-5">
                        {formatCurrency(totalFixedCommitted, currencySymbol)}
                      </div>
                      <div className="review-note-6">
                        {fixedItems.length} fixed item{fixedItems.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="review-box-6">
                      <div className="review-note-5">Monthly Variable</div>
                      <div className="tabular-nums review-text-5">
                        {formatCurrency(totalRecurringCommitted - totalFixedCommitted, currencySymbol)}
                      </div>
                      <div className="review-note-6">
                        {variableRecurring.length} variable item{variableRecurring.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {recurringItems.length === 0 ? (
                    <div className="review-note-7">
                      No recurring commitments configured for this month.
                    </div>
                  ) : (
                    <div className="review-stack-2">
                      {recurringItems.map((item) => (
                        <div className="review-row-4"
                          key={item._id}
                        >
                          <div className="review-row-5">
                            <span className="review-note-8">
                              Day {item.dayOfMonth || 1}
                            </span>
                            <span className="review-text-6">
                              {item.name}
                            </span>
                            {item.isFixed && (
                              <span className="review-note-9">
                                Fixed Rollover
                              </span>
                            )}
                          </div>
                          <span className="tabular-nums review-text-7">
                            {formatCurrency(item.amount, currencySymbol)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Spending by Category (Modern Banking Distribution Bars) */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Spending by category</span>
                    <span className="review-note-4">
                      {Object.keys(review.tagBreakdown || {}).length} categories
                    </span>
                  </div>
                  <div className="review-stack-3">
                    {Object.keys(review.tagBreakdown || {}).length === 0 ? (
                      <div className="review-note-10">
                        No categorized spending recorded this month.
                      </div>
                    ) : (
                      (() => {
                        const totalCatSpend = Object.values(review.tagBreakdown || {}).reduce((s, d) => s + (d.total || 0), 0) || 1;
                        const sortedCats = Object.entries(review.tagBreakdown || {}).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
                        return sortedCats.map(([tag, data]) => {
                          const pct = Math.round(((data.total || 0) / totalCatSpend) * 100);
                          return (
                            <div key={tag} className="review-cat-item">
                              <div className="review-cat-row-top">
                                <div className="review-row-6">
                                  <span className="review-text-8">
                                    {tag}
                                  </span>
                                  <span className="review-note-11">
                                    {data.count} {data.count === 1 ? 'entry' : 'entries'}
                                  </span>
                                </div>
                                <div className="review-row-7">
                                  <span className="review-note-12">
                                    {pct}%
                                  </span>
                                  <span className="tabular-nums review-text-9">
                                    {formatCurrency(data.total, currencySymbol)}
                                  </span>
                                </div>
                              </div>
                              <div className="review-cat-bar-track">
                                <div
                                  className="review-cat-bar-fill"
                                  style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>

                {/* 5. Suggested safety cushion for next month */}
                <div className="month-review-projection">
                  <div className="review-row-2">
                    <span className="summary-label review-text-2">Suggested safety cushion for next month</span>
                    <span className="review-note-13">
                      Your pace + 10% buffer
                    </span>
                  </div>
                  <div className="tabular-nums review-text-10">
                    {formatCurrency(review.suggestedNextMonthAllowance, currencySymbol)}
                  </div>
                  <p className="review-text-11">
                    Based on how fast you actually spent this month, plus a 10% buffer to protect your safety floor and bills.
                  </p>
                </div>

                {/* 6. Optional AI Pattern Explanation */}
                {review.aiExplanation && (
                  <div className="card review-box-7">
                    <div className="card-header review-box-8">
                      <span className="card-title review-row-8">
                        <SparklesIcon size={13} /> Assistant Spending Insight
                      </span>
                    </div>
                    <p className="review-text-12">
                      {review.aiExplanation}
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
