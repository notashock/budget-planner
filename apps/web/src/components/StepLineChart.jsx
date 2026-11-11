import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * Computes a smooth monotonic cubic spline path (Fritsch-Carlson algorithm).
 * Guarantees zero overshoot/undershoot on steep slopes, eliminating unnatural upward/downward bulges.
 */
function getMonotoneCubicSplinePath(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (n === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  // 1. Calculate secant slopes
  const dxs = [];
  const dys = [];
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    dxs.push(dx);
    dys.push(dy);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  // 2. Initialize tangents
  const m = new Array(n);
  m[0] = slopes[0];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }
  m[n - 1] = slopes[n - 2];

  // 3. Fritsch-Carlson monotonicity check & scale
  for (let i = 0; i < n - 1; i++) {
    if (dys[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / slopes[i];
      const beta = m[i + 1] / slopes[i];
      if (alpha < 0) m[i] = 0;
      if (beta < 0) m[i + 1] = 0;
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * alpha * slopes[i];
        m[i + 1] = tau * beta * slopes[i];
      }
    }
  }

  // 4. Build SVG Cubic Bezier Path
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = dxs[i];

    const cp1x = p1.x + dx / 3;
    const cp1y = p1.y + (m[i] * dx) / 3;
    const cp2x = p2.x - dx / 3;
    const cp2y = p2.y - (m[i + 1] * dx) / 3;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

export function formatChartTick(val, symbol) {
  const major = Math.abs(val) / 100;
  const sign = val < 0 ? '-' : '';

  if (major >= 1000000) {
    const formatted = (major / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}m`;
  }
  if (major >= 10000) {
    const formatted = (major / 1000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}k`;
  }
  return `${sign}${symbol}${Math.round(major)}`;
}

/**
 * Interactive SVG Step Line Balance Chart.
 * Displays daily running balance across the month, supports relative negative pre-month days (-1, -2),
 * and provides interactive tooltips synchronized with timeline selection.
 */
export function StepLineChart({
  dailyBalances = [],
  events = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  floorBreached = false,
  lowestDate = '',
  selectedDay = null,
  onSelectDay = null,
  currentDay = null,
  onOpenReview = null,
  bankAccounts = [],
  wallets = []
}) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoveredPointId, setHoveredPointId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const containerRef = useRef(null);

  // Fast account lookup for tooltip account identification
  const accountMap = useMemo(() => {
    const map = new Map();
    (bankAccounts || []).forEach((b) => {
      const id = b.id || b._id;
      if (id) map.set(String(id), { name: b.name, type: 'Bank' });
    });
    (wallets || []).forEach((w) => {
      const id = w.id || w._id;
      if (id) map.set(String(id), { name: w.name, type: 'Wallet' });
    });
    return map;
  }, [bankAccounts, wallets]);

  const getEventAccountInfo = (ev) => {
    if (!ev) return null;
    const accId = ev.bankAccountId || ev.walletId || ev.accountId || ev.sourceBankAccountId || ev.sourceWalletId;
    const idStr = accId ? String(accId._id || accId.id || accId) : null;
    if (idStr && accountMap.has(idStr)) {
      return accountMap.get(idStr);
    }
    if (ev.sourceBankAccountId || ev.destinationBankAccountId) {
      const dId = ev.destinationBankAccountId ? String(ev.destinationBankAccountId._id || ev.destinationBankAccountId.id || ev.destinationBankAccountId) : null;
      if (dId && accountMap.has(dId)) return accountMap.get(dId);
    }
    if (ev.isSalary) {
      const primaryBank = (bankAccounts || []).find((b) => b.isPrimary) || (bankAccounts || [])[0];
      if (primaryBank) return { name: primaryBank.name, type: 'Bank' };
    }
    return null;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!dailyBalances || dailyBalances.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No balance history available for this month.
      </div>
    );
  }

  // Memoize all expensive SVG curve paths, scales, and tick coordinates to run at 60fps during hover
  const chartData = useMemo(() => {
    const balances = dailyBalances.map((d) => d.balance);
    const actualMin = Math.min(...balances, safetyFloor);
    const minVal = actualMin < 0 ? actualMin : 0;
    const maxVal = Math.max(...balances, safetyFloor, 1000);

    // Y-axis minimum starts from 0 (or lower if debt / negative balance), never above 0.
    // Tight yMax margin removes dead space above the highest curve peak.
    const range = maxVal - minVal || 1000;
    const yMin = minVal < 0 ? minVal - range * 0.03 : 0;
    const yMax = maxVal + range * 0.02;

    // Format y-axis tick values (top, middle, bottom)
    const yTicks = [
      { val: yMax, label: formatChartTick(yMax, currencySymbol) },
      { val: (yMax + yMin) / 2, label: formatChartTick((yMax + yMin) / 2, currencySymbol) },
      { val: yMin, label: formatChartTick(yMin, currencySymbol) }
    ];

    // Dynamically calculate left padding based on longest tick label length
    const maxTickLen = Math.max(...yTicks.map((t) => t.label.length), 4);
    const paddingLeft = Math.max(56, Math.round(maxTickLen * 7.5 + 16));

    // Responsive SVG coordinate space (600 x 240 viewBox)
    const width = 600;
    const height = 240;
    const paddingRight = 18;
    const paddingTop = 18;
    const paddingBottom = 28;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const minDay = dailyBalances[0].day;
    const maxDay = dailyBalances[dailyBalances.length - 1].day;
    const totalDaySpan = maxDay - minDay || 1;

    const getX = (day, frac = 0) => {
      return paddingLeft + (((day + frac) - minDay) / totalDaySpan) * chartWidth;
    };

    const getY = (val) => {
      const norm = (val - yMin) / (yMax - yMin || 1);
      return height - paddingBottom - norm * chartHeight;
    };

    // Build smooth monotonic curved spline path with zero overshoot,
    // including fractional intraday transaction steps
    const points = [];
    dailyBalances.forEach((point) => {
      const dayEvents = (point.intradayEvents && point.intradayEvents.length > 0)
        ? point.intradayEvents
        : (events || []).filter((e) => e.day === point.day || e.date === point.date);

      if (dayEvents.length > 1) {
        // Multiple transactions on same day: generate intermediate steps with fractional offsets
        const n = dayEvents.length;
        dayEvents.forEach((ev, idx) => {
          // Spread across +/- 0.35 of a day
          const frac = -0.35 + ((idx + 1) / (n + 1)) * 0.7;
          points.push({
            x: getX(point.day, frac),
            y: getY(ev.balanceAfter ?? point.balance),
            day: point.day,
            date: point.date,
            balance: ev.balanceAfter ?? point.balance,
            isIntermediate: true,
            event: ev,
            eventId: ev.transactionId || ev.itemId || `${point.day}-${idx}`
          });
        });
      } else {
        points.push({
          x: getX(point.day, 0),
          y: getY(point.balance),
          day: point.day,
          date: point.date,
          balance: point.balance,
          isIntermediate: false,
          event: dayEvents[0] || null,
          eventId: dayEvents[0]?.transactionId || dayEvents[0]?.itemId || `${point.day}-0`
        });
      }
    });

    const pathD = getMonotoneCubicSplinePath(points);
    let areaD = '';

    if (points.length > 0) {
      const baselineY = getY(yMin);
      areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
    }

    // Dual-phase paths: Realized (history up to Today) vs Projected (future days reflecting planned transactions)
    let realizedPathD = '';
    let projectedPathD = '';
    if (typeof currentDay === 'number' && currentDay >= minDay && currentDay <= maxDay) {
      const realizedPts = points.filter((p) => p.day <= currentDay);
      const projectedPts = points.filter((p) => p.day >= currentDay);
      if (realizedPts.length > 1) {
        realizedPathD = getMonotoneCubicSplinePath(realizedPts);
      } else if (realizedPts.length === 1) {
        realizedPathD = `M ${realizedPts[0].x.toFixed(1)} ${realizedPts[0].y.toFixed(1)}`;
      }
      if (projectedPts.length > 1) {
        projectedPathD = getMonotoneCubicSplinePath(projectedPts);
      }
    }

    const floorY = getY(safetyFloor);

  // Adaptive X Ticks with Collision Pruning
  // Prioritizes: pre-month day (if any), Day 1 (month start), and maxDay (month end)
  const candidateDays = [];
  if (minDay < 0) {
    candidateDays.push(minDay);
  }
  candidateDays.push(1);
  [5, 10, 15, 20, 25].forEach((d) => {
    if (d > minDay && d < maxDay) {
      candidateDays.push(d);
    }
  });
  if (!candidateDays.includes(maxDay)) {
    candidateDays.push(maxDay);
  }

  // Enforce minimum 42px clearance between adjacent labels to prevent overlapping
  const prunedXTicks = [];
  candidateDays.forEach((day) => {
    const x = getX(day);

    // If candidate is not the last day, avoid collision with maxDay
    if (day !== maxDay && Math.abs(getX(maxDay) - x) < 38) {
      return;
    }

    if (prunedXTicks.length === 0) {
      prunedXTicks.push(day);
    } else {
      const prevX = getX(prunedXTicks[prunedXTicks.length - 1]);
      if (x - prevX >= 40) {
        prunedXTicks.push(day);
      }
    }
  });

    // Guarantee maxDay is represented at the month-end boundary
    if (!prunedXTicks.includes(maxDay)) {
      if (prunedXTicks.length > 0 && Math.abs(getX(maxDay) - getX(prunedXTicks[prunedXTicks.length - 1])) < 38) {
        prunedXTicks[prunedXTicks.length - 1] = maxDay;
      } else {
        prunedXTicks.push(maxDay);
      }
    }

    return {
      minDay,
      maxDay,
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      getX,
      getY,
      points,
      pathD,
      realizedPathD,
      projectedPathD,
      areaD,
      floorY,
      yTicks,
      prunedXTicks
    };
  }, [dailyBalances, safetyFloor, currencySymbol, isMobile, currentDay]);

  const {
    minDay,
    maxDay,
    width,
    height,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    chartWidth,
    chartHeight,
    getX,
    getY,
    points,
    pathD,
    realizedPathD,
    projectedPathD,
    areaD,
    floorY,
    yTicks,
    prunedXTicks
  } = chartData;

  // Days with planned commitments (transactions/events)
  const plannedDaySet = useMemo(() => {
    const set = new Set();
    (events || []).forEach((e) => {
      if (e.isPlannedTransaction || (!e.isActual && e.amount < 0 && e.itemType !== 'income')) {
        set.add(e.day);
      }
    });
    return set;
  }, [events]);

  // Active point for tooltip inspection (can be specific intraday event point or day point)
  const activeDay = hoveredDay !== null ? hoveredDay : selectedDay;
  const activePoint = hoveredPointId !== null
    ? points.find((p) => p.eventId === hoveredPointId)
    : (activeDay !== null ? (points.find((p) => p.day === activeDay && !p.isIntermediate) || points.find((p) => p.day === activeDay)) : null);

  const activeDayObj = activePoint ? dailyBalances.find((d) => d.day === activePoint.day) : null;
  const activeIndex = activeDayObj ? dailyBalances.indexOf(activeDayObj) : -1;
  const prevPoint = activeIndex > 0 ? dailyBalances[activeIndex - 1] : null;
  const isBreached = activePoint ? activePoint.balance < safetyFloor : false;

  // Day calculations: opening balance, spending on that day, and closing balance
  const closingBalance = activePoint ? activePoint.balance : 0;
  const dayEvents = activePoint
    ? ((activeDayObj && activeDayObj.intradayEvents && activeDayObj.intradayEvents.length > 0)
        ? activeDayObj.intradayEvents
        : (events || []).filter((e) => e.day === activePoint.day || e.date === activePoint.date))
    : [];

  const eventSpend = dayEvents.reduce((sum, e) => {
    return e.amount < 0 ? sum + Math.abs(e.amount) : sum;
  }, 0);

  let openingBalance = closingBalance;
  if (prevPoint) {
    openingBalance = prevPoint.balance;
  } else if (dayEvents.length > 0) {
    const netChange = dayEvents.reduce((sum, e) => sum + (e.amount || 0), 0);
    openingBalance = closingBalance - netChange;
  }

  let daySpend = eventSpend;
  if (daySpend === 0 && prevPoint && prevPoint.balance > closingBalance) {
    daySpend = prevPoint.balance - closingBalance;
  }

  // Active event on intermediate points (or single event for the day)
  const activeEvent = activePoint?.event || (dayEvents.length === 1 ? dayEvents[0] : null);
  const activeAccount = getEventAccountInfo(activeEvent);

  // Tooltip geometry
  const tooltipWidth = 224;
  const tooltipHeight = activeEvent
    ? (activeAccount ? (isBreached ? 142 : 124) : (isBreached ? 122 : 106))
    : (isBreached ? 96 : 84);
  let tooltipX = activePoint ? activePoint.x - tooltipWidth / 2 : 0;
  if (tooltipX < paddingLeft) tooltipX = paddingLeft;
  if (tooltipX + tooltipWidth > width - paddingRight) tooltipX = width - paddingRight - tooltipWidth;

  let tooltipY = activePoint ? activePoint.y - tooltipHeight - 12 : 0;
  if (tooltipY < paddingTop) {
    tooltipY = activePoint ? activePoint.y + 12 : paddingTop;
  }
  if (tooltipY + tooltipHeight > height - 4) {
    tooltipY = height - tooltipHeight - 4;
  }

  const todayPoint = typeof currentDay === 'number' ? dailyBalances.find((p) => p.day === currentDay) : null;

  const handleTouch = (e) => {
    if (!e.touches || e.touches.length === 0 || !containerRef.current) return;
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const touchX = touch.clientX - rect.left;
    const relX = (touchX / rect.width) * width;

    let closestDay = dailyBalances[0]?.day ?? 1;
    let minDistance = Infinity;

    dailyBalances.forEach((pt) => {
      const px = getX(pt.day);
      const dist = Math.abs(px - relX);
      if (dist < minDistance) {
        minDistance = dist;
        closestDay = pt.day;
      }
    });

    setHoveredDay(closestDay);
    onSelectDay?.(closestDay);
  };

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '6px', marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-title">Daily balance timeline</span>
          {selectedDay !== null && (
            <span
              className="selected-day-tag tabular-nums"
              style={{
                fontSize: '11.5px',
                padding: '2px 8px',
                background: 'var(--text)',
                color: 'var(--bg)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                fontWeight: 600
              }}
              onClick={() => onSelectDay?.(null)}
              title="Click to clear day filter"
            >
              Day {selectedDay} &times;
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '2px', background: 'var(--text)', display: 'inline-block' }} />
            Balance
          </span>
          <span style={{ fontWeight: 500 }}>
            Floor: {formatCurrency(safetyFloor, currencySymbol)}
          </span>
          {onOpenReview && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenReview}
              style={{
                padding: '3px 9px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '4px'
              }}
              title="Review Month Performance"
            >
              Review Month
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="chart-container"
        style={{ position: 'relative', touchAction: 'pan-y', width: '100%', overflow: 'hidden' }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHoveredDay(null)}
        onTouchCancel={() => setHoveredDay(null)}
      >
        <svg
          viewBox="0 0 600 240"
          width="100%"
          height="auto"
          className="chart-svg"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'visible', userSelect: 'none', display: 'block', maxWidth: '100%' }}
        >
          {/* Defs for soft ambient curve glow & modern area gradient */}
          <defs>
            <linearGradient id="monochromeCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text)" stopOpacity="0.16" />
              <stop offset="60%" stopColor="var(--text)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--text)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="chartCurveGlow" x="-10%" y="-20%" width="120%" height="150%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="var(--text)" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Subtle Horizontal Grid lines */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={getY(t.val)}
                x2={width - paddingRight}
                y2={getY(t.val)}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.45"
              />
              <text
                x={paddingLeft - 8}
                y={getY(t.val) + 4}
                textAnchor="end"
                className="chart-axis-text"
                style={{ fontSize: '11px', fontWeight: 500, fill: 'var(--text-muted)' }}
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Dashed Safety Floor Line */}
          <line
            x1={paddingLeft}
            y1={floorY}
            x2={width - paddingRight}
            y2={floorY}
            stroke={floorBreached ? 'var(--rose, #f43f5e)' : 'var(--text-muted)'}
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity={floorBreached ? 0.85 : 0.45}
          />
          <text
            x={width - paddingRight - 4}
            y={floorY - 6}
            textAnchor="end"
            style={{
              fontSize: '10.5px',
              fill: floorBreached ? 'var(--rose, #f43f5e)' : 'var(--text-secondary)',
              fontWeight: 600
            }}
          >
            {`Safety floor: ${formatCurrency(safetyFloor, currencySymbol)}`}
          </text>

          {/* Smooth area fill under the curve */}
          {areaD && (
            <path d={areaD} fill="url(#monochromeCurveGrad)" />
          )}

          {/* Crisp Today Indicator Line & Glow Badge */}
          {todayPoint && (
            <g className="chart-today-group">
              <line
                x1={getX(todayPoint.day)}
                y1={paddingTop}
                x2={getX(todayPoint.day)}
                y2={height - paddingBottom}
                stroke="var(--text-secondary)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              <rect
                x={getX(todayPoint.day) - 22}
                y={paddingTop - 13}
                width="44"
                height="15"
                rx="3.5"
                fill="var(--text)"
                filter="drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))"
              />
              <text
                x={getX(todayPoint.day)}
                y={paddingTop - 2}
                textAnchor="middle"
                fill="var(--bg)"
                style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.04em' }}
              >
                TODAY
              </text>
            </g>
          )}

          {/* Active / Hovered Point Guideline */}
          {activePoint && (
            <line
              x1={getX(activePoint.day)}
              y1={paddingTop}
              x2={getX(activePoint.day)}
              y2={height - paddingBottom}
              stroke="var(--text-secondary)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
          )}

          {/* Dual-Phase Curved Line Paths: Solid Realized vs Dashed Projected */}
          {realizedPathD && projectedPathD ? (
            <>
              {/* Realized History Line up to Today with Ambient Glow */}
              <path
                d={realizedPathD}
                fill="none"
                stroke="var(--text)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#chartCurveGlow)"
              />
              {/* Future Projection Line reflecting Planned Commitments */}
              <path
                d={projectedPathD}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="2.2"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            </>
          ) : (
            <path
              d={pathD}
              fill="none"
              stroke="var(--text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#chartCurveGlow)"
            />
          )}

          {/* Data Points (supports multiple same-day transaction pins) */}
          {points.map((pt) => {
            const isLowest = pt.date === lowestDate;
            const isSelected = selectedDay === pt.day;
            const isHovered = hoveredPointId === pt.eventId || (hoveredDay === pt.day && !hoveredPointId);
            const isPlannedDay = plannedDaySet.has(pt.day);
            const x = pt.x;
            const y = pt.y;

            return (
              <g key={pt.eventId}>
                {/* Visual circle dot */}
                {isLowest ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? '6' : '5'}
                    fill="var(--surface)"
                    stroke="var(--text)"
                    strokeWidth="2.5"
                  />
                ) : (isPlannedDay || pt.event?.isPlannedTransaction) ? (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? '6.5' : (pt.isIntermediate ? '4.5' : '5')}
                      fill="var(--surface)"
                      stroke="#3b82f6"
                      strokeWidth={isSelected || isHovered ? '2.5' : '1.8'}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? '3' : '2'}
                      fill="#3b82f6"
                    />
                  </>
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? '5' : (pt.isIntermediate ? '3' : '2.5')}
                    fill={isSelected || isHovered ? 'var(--text)' : 'var(--text-secondary)'}
                    opacity={isSelected || isHovered ? '1' : '0.55'}
                    stroke={isSelected || isHovered ? 'var(--surface)' : 'none'}
                    strokeWidth={isSelected || isHovered ? '1.5' : '0'}
                  />
                )}

                {/* Invisible hit-box circle for click/hover/tap */}
                <circle
                  cx={x}
                  cy={y}
                  r={pt.isIntermediate ? '12' : '16'}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    setHoveredPointId(pt.eventId);
                    setHoveredDay(pt.day);
                  }}
                  onMouseLeave={() => {
                    setHoveredPointId(null);
                    setHoveredDay(null);
                  }}
                  onClick={() => onSelectDay?.(selectedDay === pt.day ? null : pt.day)}
                />
              </g>
            );
          })}

          {/* X Axis ticks: pruned for clarity and zero collisions */}
          {prunedXTicks.map((day) => {
            const point = dailyBalances.find((p) => p.day === day);
            const isSelected = selectedDay === day;
            const isNegative = day < 0;

            let labelText = `${day}`;
            if (isNegative && point) {
              labelText = formatDisplayDate(point.date, false);
            } else if (day === 1 && point) {
              labelText = formatDisplayDate(point.date, false);
            }

            // Smart textAnchor to prevent boundary clipping on edges
            const isLeftEdge = day === minDay;
            const isRightEdge = day === maxDay;
            const textAnchor = isLeftEdge ? (isNegative ? 'start' : 'middle') : isRightEdge ? 'end' : 'middle';

            return (
              <text
                key={day}
                x={getX(day)}
                y={height - 8}
                textAnchor={textAnchor}
                className="chart-axis-text"
                style={{
                  fill: isSelected ? 'var(--text)' : isNegative ? 'var(--text)' : undefined,
                  fontWeight: isSelected || isNegative ? 600 : 500,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
                onClick={() => onSelectDay?.(selectedDay === day ? null : day)}
              >
                {labelText}
              </text>
            );
          })}

          {/* Interactive Floating Tooltip */}
          {activePoint && (
            <g transform={`translate(${tooltipX}, ${tooltipY})`} style={{ pointerEvents: 'none' }}>
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                fill="var(--surface)"
                stroke="var(--border)"
                strokeWidth="1"
                filter="drop-shadow(0 4px 14px rgba(0, 0, 0, 0.12))"
              />
              {/* Header: Date */}
              <text
                x="12"
                y="17"
                fill="var(--text-secondary)"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {activePoint.day < 0
                  ? `${formatDisplayDate(activePoint.date, true)} (Day ${activePoint.day})`
                  : formatDisplayDate(activePoint.date, true)}
              </text>

              {/* Active Transaction specific details (if an intraday transaction pin is hovered) */}
              {activeEvent ? (
                <>
                  <text
                    x="12"
                    y="35"
                    fill="var(--text)"
                    style={{ fontSize: '11.5px', fontWeight: 600 }}
                  >
                    {(activeEvent.name || activeEvent.description || activeEvent.label || 'Transaction').slice(0, 16)}
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="35"
                    textAnchor="end"
                    className="tabular-nums"
                    fill={activeEvent.amount < 0 ? 'var(--text)' : 'var(--emerald, #10b981)'}
                    style={{ fontSize: '12px', fontWeight: 700 }}
                  >
                    {activeEvent.amount < 0 ? `-${formatCurrency(Math.abs(activeEvent.amount), currencySymbol)}` : `+${formatCurrency(activeEvent.amount, currencySymbol)}`}
                  </text>

                  {/* Account Name & Type (Bank / Wallet) */}
                  {activeAccount && (
                    <>
                      <text
                        x="12"
                        y="52"
                        fill="var(--text-secondary)"
                        style={{ fontSize: '11px', fontWeight: 500 }}
                      >
                        Account:
                      </text>
                      <text
                        x={tooltipWidth - 12}
                        y="52"
                        textAnchor="end"
                        fill="var(--text-secondary)"
                        style={{ fontSize: '11.5px', fontWeight: 600 }}
                      >
                        {activeAccount.name.slice(0, 16)} ({activeAccount.type})
                      </text>
                    </>
                  )}

                  {/* Balance After this transaction */}
                  <text
                    x="12"
                    y={activeAccount ? 70 : 52}
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                  >
                    Balance:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y={activeAccount ? 70 : 52}
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {formatCurrency(activePoint.balance, currencySymbol)}
                  </text>

                  {/* Day Closing Balance */}
                  <text
                    x="12"
                    y={activeAccount ? 88 : 69}
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                  >
                    Day End:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y={activeAccount ? 88 : 69}
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 600 }}
                  >
                    {formatCurrency(closingBalance, currencySymbol)}
                  </text>
                </>
              ) : (
                <>
                  {/* Opening Balance */}
                  <text
                    x="12"
                    y="35"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Opening:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="35"
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {formatCurrency(openingBalance, currencySymbol)}
                  </text>

                  {/* Day Spending */}
                  <text
                    x="12"
                    y="52"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Spending:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="52"
                    textAnchor="end"
                    className="tabular-nums"
                    fill={daySpend > 0 ? 'var(--text)' : 'var(--text-secondary)'}
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {daySpend > 0 ? `-${formatCurrency(daySpend, currencySymbol)}` : formatCurrency(0, currencySymbol)}
                  </text>

                  {/* Closing Balance */}
                  <text
                    x="12"
                    y="69"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Closing:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="69"
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 700 }}
                  >
                    {formatCurrency(closingBalance, currencySymbol)}
                  </text>
                </>
              )}

              {/* Floor Breached Warning */}
              {isBreached && (
                <text
                  x="12"
                  y={activeEvent ? (activeAccount ? 106 : 88) : 87}
                  fill="var(--danger)"
                  style={{ fontSize: '10.5px', fontWeight: 600 }}
                >
                  ▲ Floor breached
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
