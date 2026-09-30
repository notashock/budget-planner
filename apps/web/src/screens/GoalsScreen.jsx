import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function GoalsScreen({
  month,
  goals = [],
  onCreateGoal,
  onConvertGoalToItem,
  onDeferGoal,
  onDeleteGoal,
  onSaveMonthSettings
}) {
  // Goal creation inputs
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalSubmitting, setGoalSubmitting] = useState(false);

  // Current month overrides
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCreditDate, setIncomeCreditDate] = useState('');
  const [safetyFloor, setSafetyFloor] = useState('');
  const [unplannedAllowance, setUnplannedAllowance] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('₹');

  const [monthSaved, setMonthSaved] = useState(false);

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
      setUnplannedAllowance(month.unplannedAllowance ? (month.unplannedAllowance / 100).toString() : '');
      setCurrencySymbol(month.currencySymbol || '₹');
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
      safetyFloor: Math.round(Number(safetyFloor || 0) * 100),
      unplannedAllowance: Math.round(Number(unplannedAllowance || 0) * 100),
      currencySymbol: currencySymbol.trim() || '₹'
    });
    setMonthSaved(true);
    setTimeout(() => setMonthSaved(false), 2500);
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
            style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: '13px' }}
            disabled={goalSubmitting || !goalName || !goalAmount}
          >
            {goalSubmitting ? 'Evaluating...' : '+ Set purchase goal'}
          </button>
        </form>

        {/* List of goals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {goals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No purchase goals logged yet for this month.
            </div>
          ) : (
            goals.map((goal) => (
              <div
                key={goal._id}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '15px' }}>{goal.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            goal.status === 'scheduled'
                              ? 'var(--success-subtle)'
                              : goal.status === 'deferred'
                              ? 'var(--warning-subtle)'
                              : 'var(--surface-subtle)',
                          color:
                            goal.status === 'scheduled'
                              ? 'var(--success)'
                              : goal.status === 'deferred'
                              ? 'var(--warning)'
                              : 'var(--text-secondary)'
                        }}
                      >
                        {goal.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Target price: {formatCurrency(goal.targetAmount, currencySymbol)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-subtle"
                    style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger)' }}
                    onClick={() => onDeleteGoal(goal._id)}
                  >
                    Delete
                  </button>
                </div>

                {goal.status === 'active' && goal.recommendation && (
                  <div
                    style={{
                      marginTop: '4px',
                      padding: '10px',
                      borderRadius: 'var(--radius)',
                      background: (goal.recommendation.feasible && goal.recommendation.recommendedDate) ? 'var(--surface-subtle)' : 'var(--danger-subtle)',
                      border: `1px solid ${(goal.recommendation.feasible && goal.recommendation.recommendedDate) ? 'var(--border)' : 'var(--danger-border)'}`,
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    {goal.recommendation.feasible && goal.recommendation.recommendedDate ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                            Recommended date: {formatDisplayDate(goal.recommendation.recommendedDate, true)}
                          </span>
                        </div>
                        <div>
                          Buying on this date maximizes cash reserve with a safety buffer of{' '}
                          <strong>{formatCurrency(goal.recommendation.savingsBuffer, currencySymbol)}</strong>.
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '12px', marginTop: '4px' }}
                          onClick={() => onConvertGoalToItem(goal._id)}
                        >
                          Schedule on {formatDisplayDate(goal.recommendation.recommendedDate, true)}
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                            Price is too high for this month. Wait for next month.
                          </span>
                        </div>
                        <div>
                          Purchasing this month would breach your safety floor by{' '}
                          <strong>
                            {formatCurrency(Math.abs(goal.recommendation.projectedFloorDeficit || 0), currencySymbol)}
                          </strong>
                          {goal.recommendation.lowestDate ? ` on ${formatDisplayDate(goal.recommendation.lowestDate, true)}.` : '.'}
                        </div>
                        <button
                          type="button"
                          className="btn-subtle"
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 12px',
                            fontSize: '12px',
                            marginTop: '4px',
                            border: '1px solid var(--border)'
                          }}
                          onClick={() => onDeferGoal(goal._id)}
                        >
                          Defer to next month
                        </button>
                      </>
                    )}
                  </div>
                )}

                {goal.status === 'scheduled' && (
                  <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '2px' }}>
                    Scheduled as a planned budget purchase.
                  </div>
                )}

                {goal.status === 'deferred' && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Deferred to next month.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Month Specific Overrides */}
      {month && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Current month settings ({month.month}/{month.year})</span>
          </div>

          <form onSubmit={handleSaveMonth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Monthly income ({currencySymbol})</label>
                <input
                  type="number"
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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Safety floor threshold ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={safetyFloor}
                  onChange={(e) => setSafetyFloor(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Monthly unplanned allowance ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1000"
                  value={unplannedAllowance}
                  onChange={(e) => setUnplannedAllowance(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Currency symbol</label>
              <input
                type="text"
                maxLength="5"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--success)' }}>
                {monthSaved ? 'Month settings updated.' : ''}
              </span>
              <button type="submit" className="btn-primary">
                Save month settings
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
