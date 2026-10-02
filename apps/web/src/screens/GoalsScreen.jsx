import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDisplayDate, recommendPurchaseDate } from '@budget/engine';
import { PlusIcon, AlertTriangleIcon, CheckCircleIcon, CalendarIcon } from '../components/Icons.jsx';
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
  onCreateGoal,
  onConvertGoalToItem,
  onDeferGoal,
  onReactivateGoal,
  onDeleteGoal,
  onSaveMonthSettings
}) {
  // Goal creation inputs
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Current month settings state
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCreditDate, setIncomeCreditDate] = useState('');
  const [safetyFloor, setSafetyFloor] = useState('');
  const [monthSaved, setMonthSaved] = useState(false);

  const currencySymbol = month?.currencySymbol || '₹';

  // Live evaluation of purchase goals against running-balance timeline
  const evaluatedGoals = useMemo(() => {
    if (!month) return goals;
    return goals.map((goal) => {
      if (goal.status === 'active' || goal.status === 'evaluating') {
        const liveRecommendation = recommendPurchaseDate(
          {
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
          { year: month.year, month: month.month },
          goal.targetAmount,
          transactions
        );
        return {
          ...goal,
          recommendation: liveRecommendation || goal.recommendation
        };
      }
      return goal;
    });
  }, [goals, month, items, transactions, simulation]);

  useEffect(() => {
    if (month) {
      setIncomeAmount((month.incomeAmount / 100).toString());
      if (month.incomeCreditDate) {
        setIncomeCreditDate(month.incomeCreditDate);
      } else {
        const d = String(month.incomeCreditDay || 1).padStart(2, '0');
        const m = String(month.month).padStart(2, '0');
        setIncomeCreditDate(`${month.year}-${m}-${d}`);
      }
      setSafetyFloor((month.safetyFloor / 100).toString());
    }
  }, [month]);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!goalName.trim() || !goalAmount || isNaN(Number(goalAmount))) return;
    setGoalSubmitting(true);
    try {
      await onCreateGoal({
        name: goalName.trim(),
        targetAmount: Math.round(Number(goalAmount) * 100)
      });
      setGoalName('');
      setGoalAmount('');
    } finally {
      setGoalSubmitting(false);
    }
  };

  const handleSaveMonth = (e) => {
    e.preventDefault();
    onSaveMonthSettings({
      incomeAmount: Math.round(Number(incomeAmount || 0) * 100),
      incomeCreditDate: incomeCreditDate,
      safetyFloor: Math.round(Number(safetyFloor || 0) * 100)
    });
    setIsEditingSettings(false);
    setMonthSaved(true);
    setTimeout(() => setMonthSaved(false), 2500);
  };

  const handleCancelEdit = () => {
    if (month) {
      setIncomeAmount((month.incomeAmount / 100).toString());
      if (month.incomeCreditDate) {
        setIncomeCreditDate(month.incomeCreditDate);
      } else {
        const d = String(month.incomeCreditDay || 1).padStart(2, '0');
        const m = String(month.month).padStart(2, '0');
        setIncomeCreditDate(`${month.year}-${m}-${d}`);
      }
      setSafetyFloor((month.safetyFloor / 100).toString());
    }
    setIsEditingSettings(false);
  };

  // Available Survival Cushion for Goals
  const availableCushion = simulation?.safeVelocity?.freeSurplus ?? simulation?.allowanceLeft ?? 0;
  const activeGoals = useMemo(() => {
    return evaluatedGoals.filter((g) => g.status === 'active' || g.status === 'evaluating');
  }, [evaluatedGoals]);

  const affordableBundles = useMemo(() => {
    return computeAffordableGoalBundles(activeGoals, availableCushion);
  }, [activeGoals, availableCushion]);

  return (
    <div className="screen-content">
      <h2>Goals & settings</h2>

      {/* Purchase Goals Section */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="card-title">Purchase goals</span>
            <button
              type="button"
              className="btn-subtle"
              onClick={() => setShowInfo(!showInfo)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                padding: 0,
                fontSize: '11px',
                fontWeight: 700,
                lineHeight: 1,
                border: '1px solid var(--border-strong)',
                background: showInfo ? 'var(--surface-subtle)' : 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              title="Click to view explanation"
              aria-label="Info about purchase goals"
            >
              i
            </button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Cushion: {formatCurrency(availableCushion, currencySymbol)}
          </span>
        </div>

        {/* Collapsible Info Box */}
        {showInfo && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
              marginBottom: '12px'
            }}
          >
            Set a target purchase for this month. The simulation calculates the safest date to buy so your cash reserves are maximized, or recommends waiting for next month if the price would breach your floor.
          </div>
        )}

        {/* Affordable Goal Combinations in place of paragraph */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border)',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Affordable goal combinations this month
            </span>
            {affordableBundles.length > 0 && (
              <span
                style={{
                  fontSize: '9px',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: 'var(--surface)',
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
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              No active goals logged yet. Add target purchases below to discover affordable combinations within your survival cushion.
            </div>
          ) : affordableBundles.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Current cushion ({formatCurrency(availableCushion, currencySymbol)}) is insufficient for active goals without breaching your safety floor. Focus on a single goal or defer to next month.
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
                    padding: '6px 10px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
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
                        background: 'var(--surface-subtle)',
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                    <span style={{ fontWeight: 600 }}>
                      {formatCurrency(bundle.totalCost, currencySymbol)}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      (+{formatCurrency(bundle.remainingCushion, currencySymbol)} buffer)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleAddGoal} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Goal item</label>
              <input
                type="text"
                required
                placeholder="e.g. Noise Cancelling Headphones, Laptop"
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
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
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            disabled={goalSubmitting || !goalName || !goalAmount}
          >
            <PlusIcon size={14} />
            <span>{goalSubmitting ? 'Evaluating...' : 'Set purchase goal'}</span>
          </button>
        </form>

        {/* Grid of purchase goals */}
        {evaluatedGoals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No purchase goals logged yet for this month.
          </div>
        ) : (
          <div className="goals-grid">
            {evaluatedGoals.map((goal) => {
              const isActive = goal.status === 'active' || goal.status === 'evaluating';
              const isScheduled = goal.status === 'scheduled' || goal.status === 'ready';
              const isDeferred = goal.status === 'deferred';
              const rec = goal.recommendation;

              return (
                <div key={goal._id} className="goal-card">
                  {/* Card Header & Price */}
                  <div>
                    <div className="goal-card-header">
                      <span className="goal-card-title" title={goal.name}>{goal.name}</span>
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

                    <div style={{ marginTop: '8px' }}>
                      <div className="goal-card-amount">
                        {formatCurrency(goal.targetAmount, currencySymbol)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Target purchase price
                      </div>
                    </div>
                  </div>

                  {/* Recommendation / Status Insight */}
                  {isActive && rec && (
                    <div
                      className="goal-card-recommendation"
                      style={{
                        background: rec.feasible && rec.recommendedDate ? 'var(--surface-subtle)' : 'var(--surface)',
                        borderColor: rec.feasible && rec.recommendedDate ? 'var(--border)' : 'var(--border-strong)'
                      }}
                    >
                      {rec.feasible && rec.recommendedDate ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)' }}>
                            <CalendarIcon size={13} />
                            <span>Safe Date: {formatDisplayDate(rec.recommendedDate, true)}</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            Preserves safe buffer of {formatCurrency(rec.savingsBuffer, currencySymbol)}.
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)' }}>
                            <AlertTriangleIcon size={13} />
                            <span>Floor breach risk</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>
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
                      style={{ background: 'var(--surface-subtle)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <CheckCircleIcon size={14} />
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>Fitted into planned budget.</span>
                    </div>
                  )}

                  {isDeferred && (
                    <div
                      className="goal-card-recommendation"
                      style={{ background: 'var(--surface-subtle)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <AlertTriangleIcon size={13} />
                        <span>{goal.deferredReason || 'Deferred to next month.'}</span>
                      </div>
                    </div>
                  )}

                  {/* Card Action Footer */}
                  <div className="goal-card-footer">
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

      {/* Month Specific Overrides */}
      {month && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Current month settings ({month.month}/{month.year})</span>
            {!isEditingSettings && (
              <button
                type="button"
                className="btn-subtle"
                style={{ fontSize: '12px', padding: '4px 10px', border: '1px solid var(--border)' }}
                onClick={() => setIsEditingSettings(true)}
              >
                Edit settings
              </button>
            )}
          </div>

          {monthSaved && (
            <div style={{ fontSize: '12px', color: 'var(--success)', marginBottom: '8px' }}>
              Month settings updated successfully.
            </div>
          )}

          {!isEditingSettings ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
              <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Monthly income</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{formatCurrency(month.incomeAmount, currencySymbol)}</div>
              </div>

              <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Salary credit date</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>
                  {month.incomeCreditDate ? formatDisplayDate(month.incomeCreditDate, true) : `Day ${month.incomeCreditDay || 1}`}
                </div>
              </div>

              <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Safety floor threshold</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{formatCurrency(month.safetyFloor, currencySymbol)}</div>
              </div>

              <div style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dynamic survival cushion</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                  {formatCurrency(simulation?.safeVelocity?.freeSurplus ?? simulation?.allowanceLeft ?? 0, currencySymbol)}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Auto-derived from Safe Velocity
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveMonth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Monthly income ({currencySymbol})</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    required
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Salary credit date</label>
                  <DatePicker
                    value={incomeCreditDate}
                    onChange={(d) => setIncomeCreditDate(d)}
                    month={month}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Supports preceding month-end (e.g. Sept 30) for this month's budget.
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Safety floor threshold ({currencySymbol})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={safetyFloor}
                  onChange={(e) => setSafetyFloor(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="btn-subtle" onClick={handleCancelEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save month settings
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
