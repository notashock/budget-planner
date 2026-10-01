import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDisplayDate, recommendPurchaseDate } from '@budget/engine';
import { PlusIcon, AlertTriangleIcon, CheckCircleIcon, CalendarIcon } from '../components/Icons.jsx';

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

  return (
    <div className="screen-content">
      <h2>Goals & settings</h2>

      {/* Purchase Goals Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Purchase goals</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Set a target purchase for this month. The simulation calculates the safest date to buy so your cash reserves are maximized, or recommends waiting for next month if the price would breach your floor.
        </p>

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
                  <input
                    type="date"
                    required
                    value={incomeCreditDate}
                    onChange={(e) => setIncomeCreditDate(e.target.value)}
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
