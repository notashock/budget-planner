import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { formatCurrency, formatCurrencyWhole, formatDisplayDate, summarizeLowPoints } from '@budget/engine';
import { formatChartTick, getStepPath, getStepAreaPath, niceTicks, findBreachRuns } from './chartGeometry.js';
import { ChartTooltip } from './ChartTooltip.jsx';
import { BalanceTable } from './BalanceTable.jsx';

// Existing imports read the tick formatter from this module
export { formatChartTick };

const PAD_RIGHT = 18;
const PAD_TOP = 28;
const PAD_BOTTOM = 34;

/**
 * Daily balance chart for the Plan page.
 *
 * A step line: a balance holds its level through the day and changes only when
 * money moves, so the line is flat between days with a vertical jump on the day
 * of each entry. Solid up to today, dashed for the projection. Marks the
 * upcoming low, the safety floor and any days below it, and shows each day's
 * entries as one marker (income ▲, planned bill ▽, paid •, with a count when a
 * day has several).
 *
 * Hover shows a compact tooltip; the day panel below carries the full
 * breakdown. The plot is keyboard-operable (←/→, Home/End, Enter, Esc) and the
 * numbers are available as a table.
 */
export function StepLineChart({
  dailyBalances = [],
  events = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  floorBreached = false,
  lowestDate = '',
  upcomingLow = null,
  selectedDay = null,
  onSelectDay = null,
  currentDay = null,
  onOpenReview = null,
  selectedAccountId = 'all',
  selectedAccount = null,
  safeDailyRate = null
}) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoverSource, setHoverSource] = useState(null); // 'pointer' | 'keyboard' | null
  const [showTable, setShowTable] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const containerRef = useRef(null);
  // Measured drawing area: the SVG is drawn at its real pixel size (viewBox matches),
  // so text stays legible and the chart fills its card at every breakpoint.
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fillHeight, setFillHeight] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches
  );

  const hasChartData = Array.isArray(dailyBalances) && dailyBalances.length > 0;

  // Measure synchronously before paint (and on window resize), and keep a
  // ResizeObserver for container-only changes such as the sidebar or grid reflowing.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (w, h) => {
      const next = { w: Math.round(w), h: Math.round(h) };
      setSize((prev) => (Math.abs(prev.w - next.w) > 1 || Math.abs(prev.h - next.h) > 1 ? next : prev));
    };
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) apply(r.width, r.height);
    };
    measure();
    window.addEventListener('resize', measure);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r && r.width > 0) apply(r.width, r.height);
      });
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [hasChartData]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setFillHeight(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---- Account filtering ----
  const isFilteringAccount = Boolean(selectedAccountId && selectedAccountId !== 'all');
  const accountIds = [String(selectedAccountId || ''), String(selectedAccount?._id || ''), String(selectedAccount?.id || ''), String(selectedAccount?.altId || '')]
    .filter(Boolean);
  const isSelectedId = (val) => {
    if (!val) return false;
    return accountIds.includes(String(val._id || val.id || val));
  };

  // Strict attribution: when an event names its account(s), only those count.
  // The balance snapshot (accountBalances) lists every account, so it is used
  // only for events with no account ids at all.
  const belongsToSelectedAccount = (ev) => {
    if (!isFilteringAccount) return true;
    if (!ev) return false;
    const ids = [
      ev.bankAccountId, ev.walletId, ev.accountId,
      ev.sourceBankAccountId, ev.sourceWalletId, ev.sourceAccountId,
      ev.destinationBankAccountId, ev.destinationWalletId, ev.destinationAccountId
    ].filter(Boolean);
    if (ids.length > 0) return ids.some(isSelectedId);
    return Boolean(ev.accountBalances && accountIds.some((id) => ev.accountBalances[id] !== undefined));
  };

  // ---- Per-day rows: one source for the markers, panel, tooltip and table ----
  const rows = useMemo(() => {
    if (!hasChartData) return [];
    return dailyBalances.map((pt, i) => {
      const raw = (pt.intradayEvents && pt.intradayEvents.length > 0)
        ? pt.intradayEvents
        : (events || []).filter((e) => e.day === pt.day || e.date === pt.date);
      const evts = raw.filter(belongsToSelectedAccount);
      const inflow = evts.reduce((sum, e) => (e.amount > 0 && e.itemType !== 'transfer' ? sum + e.amount : sum), 0);
      const outflow = evts.reduce((sum, e) => (e.amount < 0 && e.itemType !== 'transfer' ? sum + Math.abs(e.amount) : sum), 0);
      const opening = i > 0
        ? dailyBalances[i - 1].balance
        : pt.balance - evts.reduce((sum, e) => sum + (e.amount || 0), 0);
      return { day: pt.day, date: pt.date, closing: pt.balance, opening, inflow, outflow, evts };
    });
    // belongsToSelectedAccount only depends on the account props listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyBalances, events, hasChartData, selectedAccountId, selectedAccount]);

  // ---- Scales and paths ----
  const chart = useMemo(() => {
    if (!hasChartData) return null;
    const balances = dailyBalances.map((d) => d.balance);
    if (safetyFloor > 0) balances.push(safetyFloor);
    const dataMin = Math.min(...balances);
    const dataMax = Math.max(...balances, 1000);
    // The axis starts at 0 unless the balance goes negative.
    const ticks = niceTicks(Math.min(0, dataMin), dataMax, isMobile ? 3 : 4);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];

    const tickLabels = ticks.map((v) => formatChartTick(v, currencySymbol));
    const maxTickLen = Math.max(...tickLabels.map((t) => t.length), 4);
    const paddingLeft = Math.max(isMobile ? 48 : 56, Math.round(maxTickLen * 7 + 14));

    const measuredW = size.w > 0 ? size.w : (isMobile ? 540 : 600);
    const width = Math.max(300, measuredW);
    const height = fillHeight && size.h > 0
      ? Math.max(240, Math.min(560, size.h))
      : Math.max(220, Math.min(300, Math.round(width * 0.58)));
    const chartWidth = width - paddingLeft - PAD_RIGHT;
    const chartHeight = height - PAD_TOP - PAD_BOTTOM;

    const minDay = dailyBalances[0].day;
    const maxDay = dailyBalances[dailyBalances.length - 1].day;
    const span = maxDay - minDay || 1;
    const getX = (day) => paddingLeft + ((day - minDay) / span) * chartWidth;
    const getY = (val) => PAD_TOP + (1 - (val - yMin) / (yMax - yMin || 1)) * chartHeight;

    const points = dailyBalances.map((d) => ({ day: d.day, date: d.date, balance: d.balance, x: getX(d.day), y: getY(d.balance) }));
    const baselineY = getY(Math.max(yMin, 0));
    const pathD = getStepPath(points);
    const areaD = getStepAreaPath(points, baselineY);

    let realizedPathD = '';
    let projectedPathD = '';
    if (typeof currentDay === 'number' && currentDay >= minDay && currentDay < maxDay) {
      realizedPathD = getStepPath(points.filter((p) => p.day <= currentDay));
      projectedPathD = getStepPath(points.filter((p) => p.day >= currentDay));
    }

    // Date labels on the x-axis, pruned so neighbours never collide.
    const minGap = isMobile ? 46 : 54;
    const candidates = [minDay, ...[8, 15, 22].filter((d) => d > minDay && d < maxDay), maxDay];
    if (minDay < 1 && maxDay >= 1) candidates.splice(1, 0, 1);
    const xTicks = [];
    candidates.forEach((day) => {
      const x = getX(day);
      const prev = xTicks[xTicks.length - 1];
      if (prev === undefined || x - getX(prev) >= minGap) {
        xTicks.push(day);
      } else if (day === maxDay) {
        xTicks[xTicks.length - 1] = maxDay;
      }
    });

    return {
      width, height, paddingLeft, chartWidth, chartHeight, minDay, maxDay,
      getX, getY, points, pathD, areaD, realizedPathD, projectedPathD,
      ticks, tickLabels, xTicks, baselineY,
      floorY: getY(safetyFloor)
    };
  }, [dailyBalances, hasChartData, safetyFloor, currencySymbol, isMobile, currentDay, size.w, size.h, fillHeight]);

  if (!hasChartData || !chart) {
    return (
      <div className="card chart-empty">
        No balance history available for this month.
      </div>
    );
  }

  const {
    width, height, paddingLeft, chartWidth, minDay, maxDay,
    getX, getY, points, pathD, areaD, realizedPathD, projectedPathD,
    ticks, tickLabels, xTicks, baselineY, floorY
  } = chart;
  const plotBottom = height - PAD_BOTTOM;
  const dayWidth = chartWidth / Math.max(1, maxDay - minDay);
  const fmtDate = (date, day, weekday = false) => (date ? formatDisplayDate(date, weekday) : `Day ${day}`);

  // ---- Low point and breaches ----
  const low = (upcomingLow && typeof upcomingLow.balance === 'number' && upcomingLow.date)
    ? upcomingLow
    : summarizeLowPoints(dailyBalances, { currentDay, floor: safetyFloor }).upcoming;
  const lowPoint = points.find((p) => p.date === low?.date) || null;
  const lowUnderFloor = Boolean(lowPoint && safetyFloor > 0 && lowPoint.balance < safetyFloor);
  const breachRuns = findBreachRuns(dailyBalances, safetyFloor);
  const runForDay = (day) => breachRuns.find((r) => day >= r.startDay && day <= r.endDay) || null;
  const runLabel = (r) => (r.startDay === r.endDay
    ? fmtDate(r.startDate, r.startDay)
    : `${fmtDate(r.startDate, r.startDay)} – ${fmtDate(r.endDate, r.endDay)}`);

  const lastPoint = points[points.length - 1];
  const todayPoint = typeof currentDay === 'number' ? points.find((p) => p.day === currentDay) : null;
  const hasToday = Boolean(todayPoint);
  const lowName = hasToday ? 'Lowest from today' : 'Lowest point';

  // ---- Markers: one per day with entries ----
  const markerFor = (row) => {
    if (!row || row.evts.length === 0) return null;
    const hasIncome = row.evts.some((e) => e.amount > 0 && e.itemType !== 'transfer');
    const hasPlannedBill = row.evts.some((e) => e.amount < 0 && (e.isPlannedTransaction || !e.isActual));
    const kind = hasIncome ? 'income' : hasPlannedBill ? 'bill' : 'paid';
    return { kind, count: row.evts.length };
  };
  const hasIncomeMarkers = rows.some((r) => markerFor(r)?.kind === 'income');
  const hasBillMarkers = rows.some((r) => markerFor(r)?.kind === 'bill');
  const hasPaidMarkers = rows.some((r) => markerFor(r)?.kind === 'paid');

  // ---- Active day: hover/keyboard first, then the selected day ----
  const activeDay = hoveredDay !== null ? hoveredDay : selectedDay;
  const activePoint = activeDay !== null ? points.find((p) => p.day === activeDay) : null;
  const activeRow = activeDay !== null ? rows.find((r) => r.day === activeDay) : null;

  // ---- Day panel: active day, else today, else month-end ----
  const insightDay = activeDay ?? (todayPoint ? todayPoint.day : lastPoint.day);
  const insightRow = rows.find((r) => r.day === insightDay) || null;
  let insight = null;
  if (insightRow) {
    const change = insightRow.closing - insightRow.opening;
    const headroom = insightRow.closing - safetyFloor;
    const maxOut = Math.max(...rows.map((r) => r.outflow));
    const unplannedOut = insightRow.evts.reduce((sum, e) => (e.amount < 0 && e.itemType === 'unplanned-transaction' ? sum + Math.abs(e.amount) : sum), 0);
    const run = runForDay(insightRow.day);

    const flags = [];
    if (insightRow.date && insightRow.date === lowestDate) {
      flags.push({ key: 'low', text: 'Lowest point of the month' });
    } else if (hasToday && insightRow.date && insightRow.date === low?.date) {
      flags.push({ key: 'low', text: 'Lowest point from today' });
    }
    if (insightRow.evts.some((e) => e.isSalary || e.itemType === 'salary')) flags.push({ key: 'pay', text: 'Payday' });
    if (insightRow.outflow > 0 && insightRow.outflow === maxOut) flags.push({ key: 'big', text: 'Biggest spending day' });
    if (safetyFloor > 0 && headroom < 0) {
      flags.push({ key: 'breach', text: `${formatCurrency(Math.abs(headroom), currencySymbol)} below floor${run && run.startDay !== run.endDay ? ` (${runLabel(run)})` : ''}` });
    }
    if (typeof safeDailyRate === 'number' && safeDailyRate > 0 && unplannedOut > safeDailyRate) {
      flags.push({ key: 'pace', text: `${formatCurrency(unplannedOut - safeDailyRate, currencySymbol)} over the daily safe amount` });
    }
    const phase = typeof currentDay === 'number'
      ? (insightRow.day === currentDay ? 'Today' : insightRow.day > currentDay ? 'Projected' : 'Actual')
      : null;
    insight = { row: insightRow, change, headroom, flags, phase };
  }

  // ---- Screen-reader summary ----
  const firstPoint = points[0];
  const chartSummary = `Balance starts at ${formatCurrency(firstPoint.balance, currencySymbol)} and is projected to end the month at ${formatCurrency(lastPoint.balance, currencySymbol)}. `
    + (lowPoint ? `${hasToday ? 'Lowest point from today' : 'Lowest point'} ${formatCurrency(lowPoint.balance, currencySymbol)} on ${fmtDate(lowPoint.date, lowPoint.day, true)}, ` : '')
    + (safetyFloor > 0
      ? (lowUnderFloor
        ? `${formatCurrency(safetyFloor - lowPoint.balance, currencySymbol)} below the amount you keep aside.`
        : `above the amount you keep aside, ${formatCurrency(safetyFloor, currencySymbol)}.`)
      : 'no minimum set.')
    + ' Use the left and right arrow keys to move between days.';

  // ---- Interaction ----
  const nearestDayFromClientX = (clientX) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width) return null;
    const relX = ((clientX - rect.left) / rect.width) * width;
    const raw = Math.round(minDay + ((relX - paddingLeft) / (chartWidth || 1)) * (maxDay - minDay));
    return Math.max(minDay, Math.min(maxDay, raw));
  };
  const toggleSelect = (day) => onSelectDay?.(selectedDay === day ? null : day);

  const handleMouseMove = (e) => {
    const day = nearestDayFromClientX(e.clientX);
    if (day !== null && (day !== hoveredDay || hoverSource !== 'pointer')) {
      setHoveredDay(day);
      setHoverSource('pointer');
    }
  };
  const clearHover = () => { setHoveredDay(null); setHoverSource(null); };

  // Tap selects the nearest day and keeps it; dragging scrubs across days.
  const handleTouch = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const day = nearestDayFromClientX(e.touches[0].clientX);
    if (day === null) return;
    setHoveredDay(day);
    setHoverSource('touch');
    if (day !== selectedDay) onSelectDay?.(day);
  };

  const handleKeyDown = (e) => {
    const base = hoveredDay ?? selectedDay ?? (todayPoint ? todayPoint.day : minDay);
    let next = null;
    if (e.key === 'ArrowRight') next = Math.min(maxDay, base + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(minDay, base - 1);
    else if (e.key === 'Home') next = minDay;
    else if (e.key === 'End') next = maxDay;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSelect(base);
      return;
    } else if (e.key === 'Escape') {
      clearHover();
      onSelectDay?.(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setHoveredDay(next);
      setHoverSource('keyboard');
    }
  };

  // Tooltip: pointer hover only (keyboard and touch use the panel)
  const tooltip = hoverSource === 'pointer' && activePoint && activeRow ? {
    xPct: (activePoint.x / width) * 100,
    yPct: (activePoint.y / height) * 100,
    date: activePoint.date,
    day: activePoint.day,
    balance: activeRow.closing,
    change: activeRow.closing - activeRow.opening,
    belowFloorBy: safetyFloor > 0 && activeRow.closing < safetyFloor ? safetyFloor - activeRow.closing : 0
  } : null;

  // Low-point label placement: below the point (it is the lowest point from
  // today, so the line beside it is never lower), or above it when there is no
  // room under it. Anchored inward near either end of the plot.
  // On phones the plot is too narrow for a direct label without covering the
  // line or markers, so the low is stated in a line under the title instead.
  const lowText = lowPoint
    ? (lowUnderFloor
      ? `${formatCurrencyWhole(safetyFloor - lowPoint.balance, currencySymbol)} under floor · ${fmtDate(lowPoint.date, lowPoint.day)}`
      : `Low ${formatCurrencyWhole(lowPoint.balance, currencySymbol)} · ${fmtDate(lowPoint.date, lowPoint.day)}`)
    : '';
  let lowLabel = null;
  if (lowPoint && !isMobile) {
    const text = lowText;
    const nearRight = lowPoint.x > paddingLeft + chartWidth * 0.8;
    const nearLeft = lowPoint.x < paddingLeft + chartWidth * 0.2;
    // Below the point, unless that runs off the plot or into the floor line and its label
    const belowY = lowPoint.y + 22;
    const hitsFloor = safetyFloor > 0 && floorY > lowPoint.y && floorY < belowY + 18;
    const below = belowY < plotBottom - 6 && !hitsFloor;
    lowLabel = {
      text,
      x: nearRight ? lowPoint.x - 8 : nearLeft ? lowPoint.x + 8 : lowPoint.x,
      y: below ? lowPoint.y + 22 : lowPoint.y - 12,
      anchor: nearRight ? 'end' : nearLeft ? 'start' : 'middle'
    };
  }
  // Floor label: above its line at the left. If the low label would sit on it,
  // try just below the line, then the right end of the line; with no clear spot
  // it is left out (the legend still shows the floor). Text widths estimated at 11px.
  const floorLabelText = `Safety floor: ${formatCurrency(safetyFloor, currencySymbol)}`;
  let floorLabel = safetyFloor > 0 ? { x: paddingLeft + 4, y: floorY - 6, anchor: 'start' } : null;
  if (floorLabel && lowLabel) {
    const textW = (s) => s.length * 6.2;
    const span = (x, anchor, w) => (anchor === 'start' ? [x, x + w] : anchor === 'end' ? [x - w, x] : [x - w / 2, x + w / 2]);
    const [lx1, lx2] = span(lowLabel.x, lowLabel.anchor, textW(lowLabel.text));
    const clashes = (c) => {
      const [fx1, fx2] = span(c.x, c.anchor, textW(floorLabelText));
      return fx1 < lx2 && lx1 < fx2 && Math.abs(lowLabel.y - c.y) < 14;
    };
    if (clashes(floorLabel)) {
      const candidates = [
        { x: paddingLeft + 4, y: floorY + 14, anchor: 'start' },
        { x: width - PAD_RIGHT - 4, y: floorY - 6, anchor: 'end' }
      ].filter((c) => c.y < plotBottom - 2 && c.y > PAD_TOP + 10);
      floorLabel = candidates.find((c) => !clashes(c)) || null;
    }
  }

  // Month-end label only when it says something the low label does not
  const showMonthEndLabel = projectedPathD && lastPoint && (!lowPoint || lastPoint.balance !== lowPoint.balance);

  return (
    <div className="card balance-chart">
      <div className="card-header balance-chart-head">
        <span className="card-title">Daily balance timeline</span>
        {isFilteringAccount && selectedAccount?.name && (
          <span className="bc-account">{selectedAccount.name}</span>
        )}
        {selectedDay !== null && (
          <button
            type="button"
            className="selected-day-tag tabular-nums"
            onClick={() => onSelectDay?.(null)}
            title="Clear the selected day"
          >
            Day {selectedDay} <span aria-hidden="true">&times;</span>
          </button>
        )}
      </div>
      {lowPoint && isMobile && (
        <p className={`bc-low-note ${lowUnderFloor ? 'under' : ''}`}>
          <span className="chart-key key-low" aria-hidden="true" />
          {lowUnderFloor ? lowText : `${hasToday ? 'Lowest from today' : 'Lowest'}: ${lowText.replace(/^Low /, '')}`}
        </p>
      )}

      <div
        ref={containerRef}
        className="chart-container"
        tabIndex={0}
        role="application"
        aria-roledescription="balance chart"
        aria-label={chartSummary}
        onMouseMove={handleMouseMove}
        onMouseLeave={clearHover}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={clearHover}
        onTouchCancel={clearHover}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (hoverSource === 'keyboard') clearHover(); }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={`chart-svg ${fillHeight ? 'chart-svg-fill' : ''}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Plot background: clicking anywhere selects the nearest day */}
          <rect
            className="bc-plot-hit"
            x={paddingLeft}
            y={PAD_TOP}
            width={chartWidth}
            height={plotBottom - PAD_TOP}
            fill="transparent"
            onClick={(e) => {
              const day = nearestDayFromClientX(e.clientX);
              if (day !== null) toggleSelect(day);
            }}
          />

          {/* Grid and y-axis: round values */}
          {ticks.map((v, i) => (
            <g key={v}>
              <line className="bc-grid" x1={paddingLeft} y1={getY(v)} x2={width - PAD_RIGHT} y2={getY(v)} />
              <text className="chart-axis-text" x={paddingLeft - 8} y={getY(v) + 4} textAnchor="end">{tickLabels[i]}</text>
            </g>
          ))}

          {/* Below-floor zone and floor line */}
          {safetyFloor > 0 && floorY < plotBottom && (
            <rect className="bc-floor-zone" x={paddingLeft} y={floorY} width={chartWidth} height={Math.max(0, plotBottom - floorY)} />
          )}
          {safetyFloor > 0 && (
            <>
              <line className={`bc-floor ${floorBreached ? 'breached' : ''}`} x1={paddingLeft} y1={floorY} x2={width - PAD_RIGHT} y2={floorY} />
              {floorLabel && (
                <text className={`bc-floor-label ${floorBreached ? 'breached' : ''}`} x={floorLabel.x} y={floorLabel.y} textAnchor={floorLabel.anchor}>
                  {floorLabelText}
                </text>
              )}
            </>
          )}

          {/* Area under the line */}
          {areaD && <path className="bc-area" d={areaD} />}

          {/* Today */}
          {todayPoint && (
            <g className="bc-today">
              <line x1={todayPoint.x} y1={PAD_TOP} x2={todayPoint.x} y2={plotBottom} />
              <rect x={todayPoint.x - 22} y={PAD_TOP - 15} width="44" height="15" rx="3.5" />
              <text x={todayPoint.x} y={PAD_TOP - 4} textAnchor="middle">TODAY</text>
            </g>
          )}

          {/* Crosshair on the active day */}
          {activePoint && (
            <line className="bc-crosshair" x1={activePoint.x} y1={PAD_TOP} x2={activePoint.x} y2={plotBottom} />
          )}

          {/* Step line: solid up to today, dashed projection after */}
          {realizedPathD && projectedPathD ? (
            <>
              <path className="bc-line bc-line-actual" d={realizedPathD} />
              <path className="bc-line bc-line-projected" d={projectedPathD} />
            </>
          ) : (
            <path className="bc-line bc-line-actual" d={pathD} />
          )}

          {/* Days below the floor, as a band along the axis */}
          {breachRuns.map((r) => {
            const x1 = getX(r.startDay);
            const x2 = r.endDay >= maxDay ? getX(maxDay) : getX(r.endDay + 1);
            return <rect key={r.startDay} className="bc-breach-band" x={x1} y={plotBottom - 4} width={Math.max(3, x2 - x1)} height="4" />;
          })}

          {/* Entry markers: one per day */}
          {rows.map((row) => {
            const m = markerFor(row);
            const pt = points.find((p) => p.day === row.day);
            if (!m || !pt) return null;
            const active = activeDay === row.day;
            const s = active ? 6.5 : 5.5;
            return (
              <g key={`m-${row.day}`} className={`bc-marker bc-marker-${m.kind} ${active ? 'active' : ''}`}>
                {m.kind === 'income' && (
                  <path d={`M ${pt.x} ${pt.y - s - 1} L ${pt.x + s} ${pt.y + s - 2} L ${pt.x - s} ${pt.y + s - 2} Z`} />
                )}
                {m.kind === 'bill' && (
                  <path d={`M ${pt.x} ${pt.y + s + 1} L ${pt.x + s} ${pt.y - s + 2} L ${pt.x - s} ${pt.y - s + 2} Z`} />
                )}
                {m.kind === 'paid' && <circle cx={pt.x} cy={pt.y} r={active ? 5 : 4} />}
                {m.count > 1 && (
                  <text className="bc-count" x={pt.x + s + 3} y={pt.y - s}>{m.count}</text>
                )}
              </g>
            );
          })}

          {/* Upcoming low */}
          {lowPoint && (
            <g className={`bc-low ${lowUnderFloor ? 'under' : ''}`}>
              {/* An outer ring, so that day's entry marker stays visible inside it */}
              <circle cx={lowPoint.x} cy={lowPoint.y} r="9" />
              {lowLabel && <text x={lowLabel.x} y={lowLabel.y} textAnchor={lowLabel.anchor}>{lowLabel.text}</text>}
            </g>
          )}

          {/* Selected/hovered day point */}
          {activePoint && <circle className="bc-active-point" cx={activePoint.x} cy={activePoint.y} r="5" />}

          {/* Month-end value at the end of the projection */}
          {showMonthEndLabel && (
            <text className="bc-end-label" x={lastPoint.x - 4} y={Math.max(PAD_TOP + 12, lastPoint.y - 10)} textAnchor="end">
              {`Month-end ${formatCurrencyWhole(lastPoint.balance, currencySymbol)}`}
            </text>
          )}

          {/* Per-day hit areas (pointer and click) */}
          {points.map((pt) => (
            <circle
              key={`h-${pt.day}`}
              className="bc-hit"
              cx={pt.x}
              cy={pt.y}
              r={Math.max(10, Math.min(18, dayWidth / 2))}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => toggleSelect(pt.day)}
            />
          ))}

          {/* Date labels */}
          {xTicks.map((day) => {
            const pt = points.find((p) => p.day === day);
            const anchor = day === minDay ? 'start' : day === maxDay ? 'end' : 'middle';
            return (
              <text
                key={`x-${day}`}
                className={`chart-axis-text bc-x ${selectedDay === day ? 'selected' : ''}`}
                x={getX(day)}
                y={height - 10}
                textAnchor={anchor}
                onClick={() => toggleSelect(day)}
              >
                {fmtDate(pt?.date, day)}
              </text>
            );
          })}
        </svg>

        {tooltip && <ChartTooltip {...tooltip} currencySymbol={currencySymbol} />}
      </div>

      <ul className="chart-legend" aria-label="Chart legend">
        <li><span className="chart-key key-actual" aria-hidden="true" />{projectedPathD ? 'Actual' : 'Balance'}</li>
        {projectedPathD && <li><span className="chart-key key-projected" aria-hidden="true" />Projected</li>}
        {hasIncomeMarkers && <li><span className="chart-key key-income" aria-hidden="true" />Income</li>}
        {hasBillMarkers && <li><span className="chart-key key-bill" aria-hidden="true" />Planned bill</li>}
        {hasPaidMarkers && <li><span className="chart-key key-paid" aria-hidden="true" />Paid</li>}
        {lowPoint && <li><span className="chart-key key-low" aria-hidden="true" />{lowName}</li>}
        {safetyFloor > 0 && (
          <li><span className="chart-key key-floor" aria-hidden="true" /><span>{`Floor: ${formatCurrency(safetyFloor, currencySymbol)}`}</span></li>
        )}
      </ul>

      {insight && (
        <div className="day-insight" aria-live="polite">
          <div className="di-head">
            <span className="di-date">{fmtDate(insight.row.date, insight.row.day, true)}</span>
            {insight.phase && <span className={`di-phase phase-${insight.phase.toLowerCase()}`}>{insight.phase}</span>}
            <span className="di-hint">
              {hoverSource === 'keyboard'
                ? 'Enter selects · Esc clears'
                : hoveredDay !== null
                  ? 'Hovering'
                  : selectedDay !== null
                    ? 'Selected day'
                    : 'Hover, tap or use the arrow keys to inspect a day'}
            </span>
          </div>

          <dl className="di-stats">
            <div className="di-stat">
              <dt>Closing balance</dt>
              <dd className="tabular-nums">{formatCurrency(insight.row.closing, currencySymbol)}</dd>
            </div>
            <div className="di-stat">
              <dt>Change from day before</dt>
              <dd className={`tabular-nums ${insight.change > 0 ? 'di-up' : insight.change < 0 ? 'di-down' : ''}`}>
                {insight.change > 0 ? '▲ +' : insight.change < 0 ? '▼ ' : ''}{formatCurrency(insight.change, currencySymbol)}
              </dd>
              <span className="di-sub tabular-nums">Opened at {formatCurrency(insight.row.opening, currencySymbol)}</span>
            </div>
            <div className="di-stat">
              <dt>Money in / out</dt>
              <dd className="tabular-nums">
                <span className="di-up">+{formatCurrency(insight.row.inflow, currencySymbol)}</span>
                {' / '}
                <span>-{formatCurrency(insight.row.outflow, currencySymbol)}</span>
              </dd>
            </div>
            <div className="di-stat">
              <dt>{safetyFloor > 0 ? 'Left above minimum' : 'Keep at least'}</dt>
              <dd className={`tabular-nums ${safetyFloor > 0 && insight.headroom < 0 ? 'di-down' : ''}`}>
                {safetyFloor > 0 ? formatCurrency(insight.headroom, currencySymbol) : 'Not set'}
              </dd>
            </div>
          </dl>

          {insight.flags.length > 0 && (
            <ul className="di-flags">
              {insight.flags.map((f) => (
                <li key={f.key} className={`di-flag flag-${f.key}`}>{f.text}</li>
              ))}
            </ul>
          )}

          {insight.row.evts.length > 0 ? (
            <ul className="di-events">
              {insight.row.evts.slice(0, 4).map((e, i) => (
                <li key={`${e.transactionId || e.itemId || e.label}-${i}`} className="di-event">
                  <span className="di-event-name">{e.label || e.name || 'Entry'}</span>
                  <span className={`di-event-amt tabular-nums ${e.amount > 0 ? 'di-up' : ''}`}>
                    {e.itemType === 'transfer' && !isFilteringAccount
                      ? `⇄ ${formatCurrency(e.transferAmount || 0, currencySymbol)}`
                      : `${e.amount > 0 ? '+' : ''}${formatCurrency(e.amount, currencySymbol)}`}
                  </span>
                </li>
              ))}
              {insight.row.evts.length > 4 && <li className="di-more">+{insight.row.evts.length - 4} more in the timeline</li>}
            </ul>
          ) : (
            <p className="di-quiet">No money moved on this day.</p>
          )}
        </div>
      )}

      <div className="bc-footer">
        <button
          type="button"
          className="btn-subtle btn-sm bc-table-toggle"
          aria-expanded={showTable}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
        {onOpenReview && (
          <button type="button" className="btn-secondary btn-sm" onClick={onOpenReview}>
            Review month
          </button>
        )}
      </div>

      {showTable && (
        <BalanceTable
          rows={rows}
          safetyFloor={safetyFloor}
          currentDay={currentDay}
          currencySymbol={currencySymbol}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
        />
      )}
    </div>
  );
}
