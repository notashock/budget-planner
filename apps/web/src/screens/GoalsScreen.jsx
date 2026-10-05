import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDisplayDate, evaluateGoalsWithReservation } from '@budget/engine';
import { PlusIcon, AlertTriangleIcon, CheckCircleIcon, CalendarIcon, BuildingLibraryIcon, WalletIcon } from '../components/Icons.jsx';
import { DatePicker } from '../components/DatePicker.jsx';

function computeAffordableGoalBundles(activeGoals, availableCushion) {
  if (!activeGoals || activeGoals.length === 0 || availableCushion <= 0) return [];

  const results = [];
  const n = Math.min(activeGoals.length, 10); // cap subset combinations to 10 goals

  for (let mask = 1; mask < (1 << n); mask++) {
    const bundle = [];
    let totalCost = 0;
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) {
        bundle.push(activeGoals[i]);
        totalCost += activeGoals[i].targetAmount;
      }
    }
    if (totalCost <= availableCushion) {
      results.push({
        goals: bundle,
        totalCost,
        remainingCushion: availableCushion - totalCost,
        itemCount: bundle.length
      });
    }
  }

  // Sort by item count descending (multi-item bundles first), then total value descending
  results.sort((a, b) => {
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return b.totalCost - a.totalCost;
  });

  return results.slice(0, 3);
}

export function GoalsScreen({
  month,
  goals = [],
  items = [],
  transactions = [],
  simulation = null,
  bankAccounts = [],
  wallets = [],
  onCreateGoal,
  onConvertGoalToItem,
  onDeferGoal,
  onReactivateGoal,
  onDeleteGoal
}) {
  // Goal creation inputs
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [priority, setPriority] = useState(0);
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
  const defaultSourceKey = primaryBank ? `bank_${primaryBank._id || primaryBank.id}` : (wallets[0] ? `wallet_${wallets[0]._id || wallets[0].id}` : '');
  const [fundingSourceKey, setFundingSourceKey] = useState(defaultSourceKey);

  useEffect(() => {
    if (!fundingSourceKey && (bankAccounts.length > 0 || wallets.length > 0)) {
      const pb = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
      setFundingSourceKey(pb ? `bank_${pb._id || pb.id}` : (wallets[0] ? `wallet_${wallets[0]._id || wallets[0].id}` : ''));
    }
  }, [bankAccounts, wallets]);

  const currencySymbol = month?.currencySymbol || '₹';

  // Live evaluation of purchase goals against running-balance timeline with sequential priority reservation
  const evaluatedGoals = useMemo(() => {
    if (!month) return goals;
    const allAccs = [
      ...(bankAccounts || []).map((b) => ({ ...b, type: 'bank' })),
      ...(wallets || []).map((w) => ({ ...w, type: 'wallet' }))
    ];
    return evaluateGoalsWithReservation({
      settings: {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: simulation?.safeVelocity?.freeSurplus || 0,
        currentDay: new Date().getDate(),
        scale: 100
      },
      items,
      month: { year: month.year, month: month.month },
      goals,
      transactions,
      transfers: simulation?.transfers || [],
      accounts: allAccs
    });
  }, [goals, month, items, transactions, simulation, bankAccounts, wallets]);

  // Available Survival Cushion for Goals
  const availableCushion = simulation?.safeVelocity?.freeSurplus ?? simulation?.allowanceLeft ?? 0;
  const activeGoals = useMemo(() => {
    return evaluatedGoals.filter((g) => g.status === 'active' || g.status === 'evaluating');
  }, [evaluatedGoals]);

  const affordableBundles = useMemo(() => {
    return computeAffordableGoalBundles(activeGoals, availableCushion);
  }, [activeGoals, availableCushion]);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!goalName.trim() || !goalAmount || isNaN(Number(goalAmount))) return;
    setGoalSubmitting(true);

    let fundingSourceType = null;
    let fundingBankAccountId = null;
    let fundingWalletId = null;

    if (fundingSourceKey) {
      if (fundingSourceKey.startsWith('bank_')) {
        fundingSourceType = 'bank';
        fundingBankAccountId = fundingSourceKey.replace('bank_', '');
      } else if (fundingSourceKey.startsWith('wallet_')) {
        fundingSourceType = 'wallet';
        fundingWalletId = fundingSourceKey.replace('wallet_', '');
      }
    }

    try {
      const payload = {
        name: goalName.trim(),
        targetAmount: Math.round(Number(goalAmount) * 100),
        priority: Number(priority) || 0
      };
      if (fundingSourceType) payload.fundingSourceType = fundingSourceType;
      if (fundingBankAccountId) payload.fundingBankAccountId = fundingBankAccountId;
      if (fundingWalletId) payload.fundingWalletId = fundingWalletId;

      await onCreateGoal?.(payload);
      setGoalName('');
      setGoalAmount('');
      setPriority(0);
    } catch (err) {
      alert(err.message || 'Failed to create goal');
    } finally {
      setGoalSubmitting(false);
    }
  };

  return (
    <div className="screen-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2>Purchase goals</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Plan non-essential purchases without violating your safety floor.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-subtle)', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span>Survival Cushion:</span>
            <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(availableCushion, currencySymbol)}</strong>
          </span>
        </div>
      </div>

      <div className="goals-two-column-layout">
        {/* Left Column: Target Purchase Input & Combinations */}
        <div className="goals-input-panel">
          <div className="card" style={{ padding: '16px' }}>
            <div className="card-header" style={{ marginBottom: '12px' }}>
              <span className="card-title">Set Target Purchase</span>
            </div>

            <form onSubmit={handleAddGoal} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Goal Item</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Noise Cancelling Headphones, Laptop"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Price ({currencySymbol})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                />
              </div>

              {(bankAccounts.length > 0 || wallets.length > 0) && (
                <div className="form-group">
                  <label className="form-label">Funding Account *</label>
                  <select
                    value={fundingSourceKey}
                    onChange={(e) => setFundingSourceKey(e.target.value)}
                    required
                  >
                    {bankAccounts.map((b) => (
                      <option key={b._id || b.id} value={`bank_${b._id || b.id}`}>
                        Bank: {b.name} {b.isPrimary ? '[Primary]' : ''}
                      </option>
                    ))}
                    {wallets.map((w) => (
                      <option key={w._id || w.id} value={`wallet_${w._id || w.id}`}>
                        Wallet: {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Priority</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <button
                    type="button"
                    className={`timeline-filter-btn ${priority === 0 ? 'active' : ''}`}
                    onClick={() => setPriority(0)}
                    style={{ justifyContent: 'center' }}
                  >
                    High (P0)
                  </button>
                  <button
                    type="button"
                    className={`timeline-filter-btn ${priority === 1 ? 'active' : ''}`}
                    onClick={() => setPriority(1)}
                    style={{ justifyContent: 'center' }}
                  >
                    Medium (P1)
                  </button>
                  <button
                    type="button"
                    className={`timeline-filter-btn ${priority === 2 ? 'active' : ''}`}
                    onClick={() => setPriority(2)}
                    style={{ justifyContent: 'center' }}
                  >
                    Low (P2)
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ marginTop: '4px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                disabled={goalSubmitting || !goalName || !goalAmount}
              >
                <PlusIcon size={14} />
                <span>{goalSubmitting ? 'Evaluating...' : 'Set purchase goal'}</span>
              </button>
            </form>
          </div>

          {/* Affordable Combinations Card */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Affordable Combinations
              </span>
              {affordableBundles.length > 0 && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}
                >
                  Safe to Buy
                </span>
              )}
            </div>

            {activeGoals.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                No active goals logged. Target purchases will be analyzed against your available cushion.
              </div>
            ) : affordableBundles.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Cushion ({formatCurrency(availableCushion, currencySymbol)}) is currently insufficient for active goals without breaching your safety floor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {affordableBundles.map((bundle, bIdx) => (
                  <div
                    key={bIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: 'var(--surface-subtle)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          flexShrink: 0
                        }}
                      >
                        {bundle.itemCount === 1 ? 'Single' : `${bundle.itemCount} Combo`}
                      </span>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bundle.goals.map((g) => g.name).join(' + ')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                      <span className="tabular-nums" style={{ fontWeight: 600 }}>
                        {formatCurrency(bundle.totalCost, currencySymbol)}
                      </span>
                      <span className="tabular-nums" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        (+{formatCurrency(bundle.remainingCushion, currencySymbol)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Goals Bento Grid */}
        <div className="goals-cards-panel">
          {evaluatedGoals.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              No purchase goals logged yet for this month. Set a target purchase on the left to simulate the safest purchase date.
            </div>
          ) : (
            <div className="goals-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {evaluatedGoals.map((goal) => {
                const isActive = goal.status === 'active' || goal.status === 'evaluating';
                const isScheduled = goal.status === 'scheduled' || goal.status === 'ready';
                const isDeferred = goal.status === 'deferred';
                const rec = goal.recommendation;

                return (
                  <div key={goal._id} className="goal-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px' }}>
                    {/* Card Header & Price */}
                    <div>
                      <div className="goal-card-header">
                        <span className="goal-card-title" title={goal.name}>{goal.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: goal.priority === 0 ? 'rgba(239, 68, 68, 0.12)' : goal.priority === 1 ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-subtle)',
                              color: goal.priority === 0 ? '#ef4444' : goal.priority === 1 ? '#f59e0b' : 'var(--text-secondary)',
                              border: `1px solid ${goal.priority === 0 ? '#ef444433' : goal.priority === 1 ? '#f59e0b33' : 'var(--border)'}`,
                              textTransform: 'uppercase'
                            }}
                          >
                            {goal.priority === 0 ? 'P0 • High' : goal.priority === 1 ? 'P1 • Med' : 'P2 • Low'}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'var(--surface-subtle)',
                              border: '1px solid var(--border)',
                              color: isScheduled
                                ? 'var(--text)'
                                : isDeferred
                                ? 'var(--text-muted)'
                                : 'var(--text-secondary)',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                              letterSpacing: '0.04em',
                              flexShrink: 0
                            }}
                          >
                            {isScheduled ? 'Scheduled' : isDeferred ? 'Deferred' : 'Active'}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <div className="goal-card-amount tabular-nums">
                          {formatCurrency(goal.targetAmount, currencySymbol)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Target price
                          </span>
                          {/* Funding Account Badge */}
                          {(() => {
                            const linkedAccount = goal.fundingSourceType === 'wallet'
                              ? wallets.find(w => (w._id || w.id) === (goal.fundingWalletId?._id || goal.fundingWalletId))
                              : bankAccounts.find(b => (b._id || b.id) === (goal.fundingBankAccountId?._id || goal.fundingBankAccountId));
                            if (!linkedAccount) return null;
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-secondary)', padding: '1px 6px', background: 'var(--surface-subtle)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                {goal.fundingSourceType === 'wallet' ? <WalletIcon size={10} /> : <BuildingLibraryIcon size={10} />}
                                {linkedAccount.name}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Recommendation / Status Insight */}
                    {isActive && rec && (
                      <div
                        className="goal-card-recommendation"
                        style={{
                          background: rec.feasible && rec.recommendedDate ? 'var(--surface-subtle)' : 'var(--surface)',
                          borderColor: rec.feasible && rec.recommendedDate ? 'var(--border)' : 'var(--border-strong)',
                          margin: 0
                        }}
                      >
                        {rec.feasible && rec.recommendedDate ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
                              <CalendarIcon size={13} />
                              <span>Safe Date: {formatDisplayDate(rec.recommendedDate, true)}</span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.3, marginTop: '2px' }}>
                              Preserves safe buffer of <strong className="tabular-nums">{formatCurrency(rec.savingsBuffer, currencySymbol)}</strong>.
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
                              <AlertTriangleIcon size={13} />
                              <span>Floor breach risk</span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.3, marginTop: '2px' }}>
                              Breaches floor by {formatCurrency(Math.abs(rec.projectedFloorDeficit || 0), currencySymbol)}
                              {rec.lowestDate ? ` on ${formatDisplayDate(rec.lowestDate, true)}` : ''}.
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {isScheduled && (
                      <div
                        className="goal-card-recommendation"
                        style={{ background: 'var(--surface-subtle)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '12px' }}
                      >
                        <CheckCircleIcon size={14} />
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>Fitted into planned budget.</span>
                      </div>
                    )}

                    {isDeferred && (
                      <div
                        className="goal-card-recommendation"
                        style={{ background: 'var(--surface-subtle)', margin: 0 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          <AlertTriangleIcon size={13} />
                          <span>{goal.deferredReason || 'Deferred to next month.'}</span>
                        </div>
                      </div>
                    )}

                    {/* Card Action Footer */}
                    <div className="goal-card-footer" style={{ marginTop: 'auto', paddingTop: '6px' }}>
                      <div>
                        {isActive && rec?.feasible && rec?.recommendedDate && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => onConvertGoalToItem(goal._id)}
                          >
                            Schedule
                          </button>
                        )}
                        {isActive && (!rec?.feasible || !rec?.recommendedDate) && (
                          <button
                            type="button"
                            className="btn-subtle"
                            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)' }}
                            onClick={() => onDeferGoal(goal._id)}
                          >
                            Defer
                          </button>
                        )}
                        {isDeferred && onReactivateGoal && (
                          <button
                            type="button"
                            className="btn-subtle"
                            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)' }}
                            onClick={() => onReactivateGoal(goal._id)}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn-subtle"
                        style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-muted)' }}
                        onClick={() => onDeleteGoal(goal._id)}
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
      </div>
    </div>
  );
}
