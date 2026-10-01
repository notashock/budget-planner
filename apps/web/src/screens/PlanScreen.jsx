import React, { useState } from 'react';
import { SafeVelocityCard, DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { PlusIcon } from '../components/Icons.jsx';

export function PlanScreen({
  month,
  items,
  simulation,
  onOpenUnifiedEntry,
  onOpenReview
}) {
  const [selectedDay, setSelectedDay] = useState(null);

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
    todayBalance,
    lowestBalance = 0,
    lowestDate = '',
    floorBreached = false,
    unplannedAllowance = 0,
    allowanceLeft = 0,
    daysLeft = 1,
    safeToSpendPerDay = 0
  } = simulation || {};

  const now = new Date();
  const isCurrentCalendarMonth = month.year === now.getFullYear() && month.month === (now.getMonth() + 1);
  const currentDay = isCurrentCalendarMonth ? now.getDate() : null;

  return (
    <div className="dashboard-layout">
      {/* Top Split: Top-Left Insights and Top-Right Timeline Curve */}
      <div className="dashboard-top-grid">
        {/* COMPONENT 1: TOP-LEFT INSIGHTS */}
        <div className="dashboard-insights-panel">
          {/* Safe Velocity Card */}
          <SafeVelocityCard
            safeVelocity={simulation?.safeVelocity}
            daysLeft={daysLeft}
            safeToSpendPerDay={safeToSpendPerDay}
            allowanceLeft={allowanceLeft}
            currencySymbol={month.currencySymbol}
          />

          {/* Action Bar: Unified Entry & Month Review */}
          <div className="action-bar-container">
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => onOpenUnifiedEntry?.('log')}
            >
              <PlusIcon size={15} />
              <span>New Entry</span>
            </button>
            <button
              type="button"
              onClick={onOpenReview}
              style={{ padding: '10px 8px', fontSize: '12px' }}
            >
              Month review
            </button>
          </div>

          {/* Detailed KPI Cards */}
          <DetailedKpiGrid
            incomeAmount={month.incomeAmount}
            incomeCreditDay={month.incomeCreditDay}
            events={events}
            endingBalance={endingBalance}
            todayBalance={todayBalance}
            lowestBalance={lowestBalance}
            lowestDate={lowestDate}
            safetyFloor={month.safetyFloor}
            currencySymbol={month.currencySymbol}
          />
        </div>

        {/* COMPONENT 2: TOP-RIGHT TIMELINE CHART (CURVED LINE) */}
        <div className="dashboard-chart-panel">
          <StepLineChart
            dailyBalances={dailyBalances}
            events={events}
            safetyFloor={month.safetyFloor}
            currencySymbol={month.currencySymbol}
            floorBreached={floorBreached}
            lowestDate={lowestDate}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            currentDay={currentDay}
          />
        </div>
      </div>

      {/* COMPONENT 3: BOTTOM FULL-WIDTH INTERACTIVE TIMELINE */}
      <div className="dashboard-bottom-timeline">
        <TimelineList
          events={events}
          safetyFloor={month.safetyFloor}
          currencySymbol={month.currencySymbol}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          currentDay={currentDay}
          month={month}
        />
      </div>
    </div>
  );
}
