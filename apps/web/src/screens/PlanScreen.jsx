import React from 'react';
import { SummaryCards } from '../components/SummaryCards.jsx';
import { FloorStatus } from '../components/FloorStatus.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';
import { WhatIfBar } from '../components/WhatIfBar.jsx';
import { TimelineList } from '../components/TimelineList.jsx';

export function PlanScreen({
  month,
  items,
  simulation,
  whatIfOverrides,
  onWhatIfChange,
  onResetWhatIf,
  onOpenAddItem,
  onOpenQuickLog,
  onOpenReview
}) {
  if (!month) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '30px' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          No active budget month selected.
        </p>
      </div>
    );
  }

  const {
    events = [],
    dailyBalances = [],
    endingBalance = 0,
    lowestBalance = 0,
    lowestDate = '',
    floorBreached = false,
    unplannedAllowance = 0,
    allowanceLeft = 0,
    daysLeft = 1,
    safeToSpendPerDay = 0
  } = simulation || {};

  return (
    <div className="screen-content">
      {/* Floor Status Banner */}
      <FloorStatus
        floorBreached={floorBreached}
        lowestBalance={lowestBalance}
        lowestDate={lowestDate}
        safetyFloor={month.safetyFloor}
        currencySymbol={month.currencySymbol}
      />

      {/* Summary KPI Cards including Safe to Spend per Day */}
      <SummaryCards
        incomeAmount={month.incomeAmount}
        incomeCreditDay={month.incomeCreditDay}
        openingBalance={month.openingBalance}
        events={events}
        endingBalance={endingBalance}
        lowestBalance={lowestBalance}
        lowestDate={lowestDate}
        safetyFloor={month.safetyFloor}
        unplannedAllowance={month.unplannedAllowance || unplannedAllowance}
        allowanceLeft={allowanceLeft}
        daysLeft={daysLeft}
        safeToSpendPerDay={safeToSpendPerDay}
        currencySymbol={month.currencySymbol}
      />

      {/* Quick Action Bar: 3-Tap Log, Add Item, Review */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: '10px 14px', fontSize: '13px' }}
          onClick={onOpenQuickLog}
        >
          ⚡ Log spending (3-tap)
        </button>
        <button
          type="button"
          onClick={onOpenReview}
          style={{ padding: '10px 8px', fontSize: '12px' }}
        >
          Month review
        </button>
      </div>

      {/* Step Line SVG Chart */}
      <StepLineChart
        dailyBalances={dailyBalances}
        safetyFloor={month.safetyFloor}
        currencySymbol={month.currencySymbol}
        floorBreached={floorBreached}
        lowestDate={lowestDate}
      />

      {/* What-If Instant Recomputation Bar */}
      <WhatIfBar
        items={items}
        whatIfOverrides={whatIfOverrides}
        onOverrideChange={onWhatIfChange}
        onReset={onResetWhatIf}
        currencySymbol={month.currencySymbol}
      />

      {/* Timeline List */}
      <TimelineList
        events={events}
        safetyFloor={month.safetyFloor}
        currencySymbol={month.currencySymbol}
      />

      {/* Add Planned Item Button */}
      <button
        type="button"
        className="btn-subtle"
        style={{ padding: '12px', fontSize: '13px', width: '100%', border: '1px dashed var(--border)' }}
        onClick={onOpenAddItem}
      >
        + Add planned budget item
      </button>
    </div>
  );
}
