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
        >
          {/* Mobile bottom-sheet grab handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          {/* Sticky Modal Header */}
          <div className="month-review-header">
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  {review?.isAccountSpecific ? `Month Review: ${review.accountName}` : 'Month Review'}
                </h3>
                {review?.isAccountSpecific ? (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}
                  >
                    {review.accountType === 'wallet' ? 'Wallet' : 'Bank Account'}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}
                  >
                    Unified View
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.3 }}>
                {review?.isAccountSpecific
                  ? `Isolated cashflow audit of income, spend, and transfers for ${review.accountName}`
                  : 'Unified audit of planned baselines, recurring commitments, and dynamic survival cushion'}
              </div>
            </div>
            <button
              type="button"
              className="btn-icon modal-close-btn"
              onClick={() => triggerExit()}
              title="Close modal"
              aria-label="Close"
              style={{
                fontSize: '13px',
                width: '28px',
                height: '28px',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                marginLeft: '12px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable Modal Body */}
          <div className="month-review-scroll-body" ref={reviewBodyRef}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
                <div className="skeleton-pulse" style={{ height: '96px', borderRadius: 'var(--radius-lg)' }} />
                <div className="month-review-bento-row">
                  <div className="skeleton-pulse" style={{ height: '80px', borderRadius: 'var(--radius)' }} />
                  <div className="skeleton-pulse" style={{ height: '80px', borderRadius: 'var(--radius)' }} />
                </div>
                <div className="skeleton-pulse" style={{ height: '140px', borderRadius: 'var(--radius)' }} />
                <div className="skeleton-pulse" style={{ height: '90px', borderRadius: 'var(--radius)' }} />
              </div>
            ) : error ? (
              <div style={{ color: 'var(--danger)', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                {error}
              </div>
            ) : review ? (
              <>
                {/* 1. Executive Hero Header */}
                {review.isAccountSpecific ? (
                  <div className="month-review-hero">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="summary-label" style={{ color: 'var(--text-secondary)' }}>Net Monthly Cashflow</span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: review.netCashflow >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: review.netCashflow >= 0 ? '#10b981' : 'var(--danger)',
                          fontWeight: 600,
                          border: `1px solid ${review.netCashflow >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
                        }}
                      >
                        {review.netCashflow >= 0 ? 'Net Positive Accumulation' : 'Net Deficit (Drawdown)'}
                      </span>
                    </div>
                    <div
                      className="month-review-hero-value tabular-nums"
                      style={{ color: review.netCashflow >= 0 ? '#10b981' : 'var(--danger)' }}
                    >
                      {review.netCashflow >= 0 ? '+' : ''}{formatCurrency(review.netCashflow, currencySymbol)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <span>Direct Cashflow: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(review.directIncome - review.directExpenses, currencySymbol)}</strong></span>
                      <span>Transfers Net: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(review.totalTransferIn - review.totalTransferOut, currencySymbol)}</strong></span>
                    </div>
                  </div>
                ) : (
                  <div className="month-review-hero">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="summary-label" style={{ color: 'var(--text-secondary)' }}>Dynamic Survival Cushion</span>
                      {paceStatus && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            fontWeight: 600
                          }}
                        >
                          {paceStatus}
                        </span>
                      )}
                    </div>
                    <div className="month-review-hero-value tabular-nums" style={{ color: 'var(--text)' }}>
                      {formatCurrency(survivalCushion, currencySymbol)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <span>Safe velocity pace: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(safeVelocityPerDay, currencySymbol)}/day</strong></span>
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
                        <span className="summary-value tabular-nums" style={{ color: '#10b981' }}>
                          {formatCurrency(review.totalIncome, currencySymbol)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Direct: {formatCurrency(review.directIncome, currencySymbol)} • In: {formatCurrency(review.totalTransferIn, currencySymbol)}
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Account Outflows (Expenses)</span>
                        <span className="summary-value tabular-nums" style={{ color: 'var(--text)' }}>
                          {formatCurrency(review.totalExpenses, currencySymbol)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
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
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Discretionary spend drawn from allowance
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Matched Planned Bills</span>
                        <span className="summary-value tabular-nums">
                          {formatCurrency(review.totalMatchedActual, currencySymbol)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
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
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {review.totalUnplannedActual > survivalCushion ? 'Exceeded survival cushion' : 'Within survival limits'}
                      </span>
                    </div>

                    <div className="summary-card">
                      <span className="summary-label">Committed Obligations</span>
                      <span className="summary-value tabular-nums">
                        {formatCurrency(totalRecurringCommitted, currencySymbol)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {fixedItems.length} fixed rollovers • {variableRecurring.length} variable
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Fixed & Recurring Commitments Section */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Fixed & recurring commitments</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Total: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(totalRecurringCommitted, currencySymbol)}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Fixed Rollovers</div>
                      <div className="tabular-nums" style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: 'var(--text)' }}>
                        {formatCurrency(totalFixedCommitted, currencySymbol)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {fixedItems.length} fixed item{fixedItems.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Variable</div>
                      <div className="tabular-nums" style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: 'var(--text)' }}>
                        {formatCurrency(totalRecurringCommitted - totalFixedCommitted, currencySymbol)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {variableRecurring.length} variable item{variableRecurring.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {recurringItems.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>
                      No recurring commitments configured for this month.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {recurringItems.map((item) => (
                        <div
                          key={item._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 8px',
                            borderRadius: 'var(--radius)',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '13px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--surface-subtle)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
                              Day {item.dayOfMonth || 1}
                            </span>
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </span>
                            {item.isFixed && (
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                                Fixed Rollover
                              </span>
                            )}
                          </div>
                          <span className="tabular-nums" style={{ fontWeight: 600, flexShrink: 0 }}>
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
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {Object.keys(review.tagBreakdown || {}).length} categories
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {Object.keys(review.tagBreakdown || {}).length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px' }}>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tag}
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', background: 'var(--surface-subtle)', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)', flexShrink: 0 }}>
                                    {data.count} {data.count === 1 ? 'entry' : 'entries'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {pct}%
                                  </span>
                                  <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--text)' }}>
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

                {/* 5. Suggested Next-Month Survival Cushion */}
                <div className="month-review-projection">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span className="summary-label" style={{ color: 'var(--text-secondary)' }}>Suggested Next-Month Survival Cushion</span>
                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600 }}>
                      Velocity + 10% Buffer
                    </span>
                  </div>
                  <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>
                    {formatCurrency(review.suggestedNextMonthAllowance, currencySymbol)}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Dynamically projected based on actual spending velocity + 10% safety buffer to safeguard your salary floor and active commitments.
                  </p>
                </div>

                {/* 6. Optional AI Pattern Explanation */}
                {review.aiExplanation && (
                  <div className="card" style={{ borderLeft: '3px solid var(--accent)', padding: '14px 16px' }}>
                    <div className="card-header" style={{ marginBottom: '6px' }}>
                      <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✦</span> Assistant Spending Insight
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
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
