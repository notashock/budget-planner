import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency, formatDisplayDate, evaluateGoalsWithReservation } from '@budget/engine';
import { PlusIcon, AlertTriangleIcon, CheckCircleIcon, CalendarIcon, BuildingLibraryIcon, WalletIcon } from '../components/Icons.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import { DatePicker } from '../components/DatePicker.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { GoalEditForm } from '../components/GoalEditForm.jsx';

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
        const rawAmount = Number(activeGoals[i].targetAmount) || 0;
        const goalCost = rawAmount > 100000 ? Math.round(rawAmount / 100) : rawAmount;
        totalCost += goalCost;
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
  isReviewMode = false,
  onCreateGoal,
  onConvertGoalToItem,
  onDeferGoal,
  onReactivateGoal,
  onDeleteGoal,
  onUpdateGoal
}) {
  // Goal being edited (null when the edit form is closed)
  const [editingGoal, setEditingGoal] = useState(null);
  // Goal creation inputs
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [priority, setPriority] = useState(0);
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const goalSubmittingRef = useRef(false);
  const [actingGoalId, setActingGoalId] = useState(null);
  const actingGoalIdRef = useRef(null);
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
    return evaluatedGoals.filter((g) => 
      g.status !== 'completed' && g.status !== 'cancelled' && g.status !== 'dropped'
    );
  }, [evaluatedGoals]);

  const affordableBundles = useMemo(() => {
    return computeAffordableGoalBundles(activeGoals, availableCushion);
  }, [activeGoals, availableCushion]);

  const handleAction = async (actionFn, goalId) => {
    if (actingGoalIdRef.current || !actionFn) return;
    actingGoalIdRef.current = goalId;
    setActingGoalId(goalId);
    try {
      await actionFn(goalId);
    } finally {
      actingGoalIdRef.current = null;
      setActingGoalId(null);
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (goalSubmittingRef.current || !goalName.trim() || !goalAmount || isNaN(Number(goalAmount))) return;
    goalSubmittingRef.current = true;
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
      goalSubmittingRef.current = false;
      setGoalSubmitting(false);
    }
  };

  return (
    <div className="screen-content">
      <div className="goals-row">
        <ScreenHeader title="Goals" />
        <div className="goals-row-2">
          {isReviewMode && (
            <span className="review-badge-tag goals-note">
              Review Archive
            </span>
          )}
          <span className="goals-row-3">
            <span>Safety cushion:</span>
            <strong className="tabular-nums goals-text">{formatCurrency(availableCushion, currencySymbol)}</strong>
          </span>
        </div>
      </div>

      <div className="goals-two-column-layout">
        {/* Left Column: Target Purchase Input & Combinations */}
        <div className="goals-input-panel">
          {isReviewMode ? (
            <div className="card goals-box">
              <div className="card-header goals-box-2">
                <span className="card-title">Goal Scorecard (Archive)</span>
              </div>
              <div className="goals-text-2">
                You are reviewing goals evaluated during this closed cycle. New goals and scheduling actions are locked in review mode.
              </div>
              <div className="goals-stack">
                <div className="goals-row-4">
                  <span className="goals-text-3">Total Evaluated</span>
                  <span className="tabular-nums goals-text-4">{goals.length}</span>
                </div>
                <div className="goals-row-4">
                  <span className="goals-text-3">Scheduled / Ready</span>
                  <span className="tabular-nums goals-text-5">
                    {goals.filter(g => g.status === 'scheduled' || g.status === 'ready').length}
                  </span>
                </div>
                <div className="goals-row-5">
                  <span className="goals-text-3">Deferred</span>
                  <span className="tabular-nums goals-text-4">
                    {goals.filter(g => g.status === 'deferred').length}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card goals-box">
              <div className="card-header goals-box-3">
                <span className="card-title">Set Target Purchase</span>
              </div>

              <form className="goals-stack-2" onSubmit={handleAddGoal}>
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
                  <div className="goals-grid-2">
                    <button
                      type="button"
                      className={`timeline-filter-btn ${priority === 0 ? 'active' : ''} goals-btn`}
                      onClick={() => setPriority(0)}
                    >
                      High (P0)
                    </button>
                    <button
                      type="button"
                      className={`timeline-filter-btn ${priority === 1 ? 'active' : ''} goals-btn`}
                      onClick={() => setPriority(1)}
                    >
                      Medium (P1)
                    </button>
                    <button
                      type="button"
                      className={`timeline-filter-btn ${priority === 2 ? 'active' : ''} goals-btn`}
                      onClick={() => setPriority(2)}
                    >
                      Low (P2)
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary goals-btn-2"
                  disabled={goalSubmitting || !goalName || !goalAmount}
                >
                  <PlusIcon size={14} />
                  <span>{goalSubmitting ? 'Evaluating...' : 'Set purchase goal'}</span>
                </button>
              </form>
            </div>
          )}

          {/* Affordable Combinations Card */}
          <div className="card goals-box-4">
            <div className="goals-row-6">
              <span className="goals-note-2">
                Affordable Combinations
              </span>
              {affordableBundles.length > 0 && (
                <span className="goals-note-3"
                >
                  Safe to Buy
                </span>
              )}
            </div>

            {activeGoals.length === 0 ? (
              <div className="goals-note-4">
                No active goals
              </div>
            ) : affordableBundles.length === 0 ? (
              <div className="goals-note-4">
                Cushion insufficient for current goals
              </div>
            ) : (
              <div className="goals-stack-3">
                {affordableBundles.map((bundle, bIdx) => (
                  <div className="goals-row-7"
                    key={bIdx}
                  >
                    <div className="goals-row-8">
                      <span className="goals-note-5"
                      >
                        {bundle.itemCount === 1 ? 'Single' : `${bundle.itemCount} Combo`}
                      </span>
                      <span className="goals-text-6">
                        {bundle.goals.map((g) => g.name).join(' + ')}
                      </span>
                    </div>

                    <div className="goals-row-9">
                      <span className="tabular-nums goals-text-4">
                        {formatCurrency(bundle.totalCost, currencySymbol)}
                      </span>
                      <span className="tabular-nums goals-note-6">
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
            <div className="card goals-text-7">
              No purchase goals this month
            </div>
          ) : (
            <div className="goals-grid goals-box-5">
              {evaluatedGoals.map((goal) => {
                const isActive = !goal.status || goal.status === 'logged' || goal.status === 'active' || goal.status === 'evaluating';
                const isScheduled = goal.status === 'scheduled' || goal.status === 'ready';
                const isDeferred = goal.status === 'deferred';
                const rec = goal.recommendation;

                return (
                  <div key={goal._id} className="goal-card goals-stack-4">
                    {/* Card Header & Price */}
                    <div>
                      <div className="goal-card-header">
                        <span className="goal-card-title" title={goal.name}>{goal.name}</span>
                        <div className="goals-row-10">
                          <span
                            style={{
                              fontSize: 'var(--fs-2xs)',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: goal.priority === 0 ? 'rgba(239, 68, 68, 0.12)' : goal.priority === 1 ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-subtle)',
                              color: goal.priority === 0 ? 'var(--bad-ink)' : goal.priority === 1 ? 'var(--warn-ink)' : 'var(--text-secondary)',
                              border: `1px solid ${goal.priority === 0 ? 'var(--rose-border)' : goal.priority === 1 ? 'var(--amber-border)' : 'var(--border)'}`,
                              textTransform: 'uppercase'
                            }}
                          >
                            {goal.priority === 0 ? 'P0 • High' : goal.priority === 1 ? 'P1 • Med' : 'P2 • Low'}
                          </span>
                          <span
                            style={{
                              fontSize: 'var(--fs-2xs)',
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

                      <div className="goals-box-6">
                        <div className="goal-card-amount tabular-nums">
                          {formatCurrency(goal.targetAmount, currencySymbol)}
                        </div>
                        <div className="goals-row-11">
                          <span className="goals-note-6">
                            Target price
                          </span>
                          {/* Funding Account Badge */}
                          {(() => {
                            const linkedAccount = goal.fundingSourceType === 'wallet'
                              ? wallets.find(w => (w._id || w.id) === (goal.fundingWalletId?._id || goal.fundingWalletId))
                              : bankAccounts.find(b => (b._id || b.id) === (goal.fundingBankAccountId?._id || goal.fundingBankAccountId));
                            if (!linkedAccount) return null;
                            return (
                              <span className="goals-row-12">
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
                            <div className="goals-row-13">
                              <CalendarIcon size={13} />
                              <span>Safe Date: {formatDisplayDate(rec.recommendedDate, true)}</span>
                            </div>
                            <div className="goals-note-7">
                              Preserves safe buffer of <strong className="tabular-nums">{formatCurrency(rec.savingsBuffer, currencySymbol)}</strong>.
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="goals-row-13">
                              <AlertTriangleIcon size={13} />
                              <span>Floor breach risk</span>
                            </div>
                            <div className="goals-note-7">
                              Goes below your floor by {formatCurrency(Math.abs(rec.projectedFloorDeficit || 0), currencySymbol)}
                              {rec.lowestDate ? ` on ${formatDisplayDate(rec.lowestDate, true)}` : ''}.
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {isScheduled && (
                      <div
                        className="goal-card-recommendation goals-row-14"
                      >
                        <CheckCircleIcon size={14} />
                        <span className="goals-text-8">Fitted into planned budget.</span>
                      </div>
                    )}

                    {isDeferred && (
                      <div
                        className="goal-card-recommendation goals-box-7"
                      >
                        <div className="goals-row-15">
                          <AlertTriangleIcon size={13} />
                          <span>{goal.deferredReason || 'Deferred to next month.'}</span>
                        </div>
                      </div>
                    )}

                    {/* Card Action Footer */}
                    {!isReviewMode && (
                      <div className="goal-card-footer goals-box-8">
                        <div>
                          {isActive && rec?.feasible && rec?.recommendedDate && (
                            <button
                              type="button"
                              className="btn-primary goals-btn-3"
                              onClick={() => handleAction(onConvertGoalToItem, goal._id)}
                              disabled={actingGoalId === goal._id}
                            >
                              {actingGoalId === goal._id ? 'Scheduling...' : 'Schedule'}
                            </button>
                          )}
                          {isActive && (!rec?.feasible || !rec?.recommendedDate) && (
                            <button
                              type="button"
                              className="btn-subtle goals-btn-4"
                              onClick={() => handleAction(onDeferGoal, goal._id)}
                              disabled={actingGoalId === goal._id}
                            >
                              {actingGoalId === goal._id ? 'Deferring...' : 'Defer'}
                            </button>
                          )}
                          {isDeferred && onReactivateGoal && (
                            <button
                              type="button"
                              className="btn-subtle goals-btn-4"
                              onClick={() => handleAction(onReactivateGoal, goal._id)}
                              disabled={actingGoalId === goal._id}
                            >
                              {actingGoalId === goal._id ? 'Reactivating...' : 'Reactivate'}
                            </button>
                          )}
                        </div>

                        {onUpdateGoal && (
                          <button
                            type="button"
                            className="btn-subtle goals-btn-5"
                            onClick={() => setEditingGoal(goal)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-subtle goals-btn-5"
                          onClick={() => onDeleteGoal(goal._id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatedModal isOpen={Boolean(editingGoal)} onClose={() => setEditingGoal(null)} maxWidth="440px" dataTestId="goal-edit-modal">
        {editingGoal && (
          <GoalEditForm
            goal={editingGoal}
            bankAccounts={bankAccounts}
            wallets={wallets}
            currencySymbol={currencySymbol}
            onCancel={() => setEditingGoal(null)}
            onSubmit={async (updates) => {
              await onUpdateGoal(editingGoal._id || editingGoal.id, updates);
              setEditingGoal(null);
            }}
          />
        )}
      </AnimatedModal>
    </div>
  );
}
