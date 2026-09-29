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
  onOpenAddItem
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
    floorBreached = false
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

      {/* Summary KPI Cards */}
      <SummaryCards
        incomeAmount={month.incomeAmount}
        incomeCreditDay={month.incomeCreditDay}
        openingBalance={month.openingBalance}
        events={events}
        endingBalance={endingBalance}
        lowestBalance={lowestBalance}
        lowestDate={lowestDate}
        safetyFloor={month.safetyFloor}
        currencySymbol={month.currencySymbol}
      />

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

      {/* Quick Add Button */}
      <button
        type="button"
        className="btn-primary"
        style={{ padding: '12px', fontSize: '14px', width: '100%' }}
        onClick={onOpenAddItem}
      >
        + Add budget item
      </button>
    </div>
  );
}
