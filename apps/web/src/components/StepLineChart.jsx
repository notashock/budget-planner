import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

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
  onOpenReview = null
}) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const containerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth < 640;
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

  // Memoize all expensive SVG curve paths, scales, and tick coordinates to run at 60fps during hover
  const chartData = useMemo(() => {
    const balances = dailyBalances.map((d) => d.balance);
    const actualMin = Math.min(...balances, safetyFloor);
    const minVal = actualMin < 0 ? actualMin : 0;
    const maxVal = Math.max(...balances, safetyFloor, 1000);

    // Dynamic SVG dimensions: larger and taller on mobile for enhanced visual presence and touch usability
    const width = isMobile ? 500 : 600;
    const height = isMobile ? 220 : 175;
    const paddingLeft = isMobile ? 54 : 62;
    const paddingRight = 16;
    const paddingTop = 16;
    const paddingBottom = 26;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Y-axis minimum starts from 0 (or lower if debt / negative balance), never above 0
    const range = maxVal - minVal || 1000;
    const yMin = minVal < 0 ? minVal - range * 0.05 : 0;
    const yMax = maxVal + range * 0.08;

    const minDay = dailyBalances[0].day;
    const maxDay = dailyBalances[dailyBalances.length - 1].day;
    const totalDaySpan = maxDay - minDay || 1;

    const getX = (day) => {
      return paddingLeft + ((day - minDay) / totalDaySpan) * chartWidth;
    };

    const getY = (val) => {
      const norm = (val - yMin) / (yMax - yMin || 1);
      return height - paddingBottom - norm * chartHeight;
    };

    // Build smooth monotonic curved spline path with zero overshoot
    const points = dailyBalances.map((point) => ({
      x: getX(point.day),
      y: getY(point.balance)
    }));

    const pathD = getMonotoneCubicSplinePath(points);
    let areaD = '';

    if (points.length > 0) {
      const baselineY = getY(yMin);
      areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
    }

    const floorY = getY(safetyFloor);

  // Format y-axis tick values (top, middle, bottom)
  const yTicks = [
    { val: yMax, label: formatCurrency(yMax, currencySymbol) },
    { val: (yMax + yMin) / 2, label: formatCurrency((yMax + yMin) / 2, currencySymbol) },
    { val: yMin, label: formatCurrency(yMin, currencySymbol) }
  ];

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
      areaD,
      floorY,
      yTicks,
      prunedXTicks
    };
  }, [dailyBalances, safetyFloor, currencySymbol, isMobile]);

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
    areaD,
    floorY,
    yTicks,
    prunedXTicks
  } = chartData;

  // Active point for tooltip inspection
  const activeDay = hoveredDay !== null ? hoveredDay : selectedDay;
  const activePoint = activeDay !== null ? dailyBalances.find((p) => p.day === activeDay) : null;
  const activeIndex = activePoint ? dailyBalances.indexOf(activePoint) : -1;
  const prevPoint = activeIndex > 0 ? dailyBalances[activeIndex - 1] : null;
  const isBreached = activePoint ? activePoint.balance < safetyFloor : false;

  // Day calculations: opening balance, spending on that day, and closing balance
  const closingBalance = activePoint ? activePoint.balance : 0;
  const dayEvents = activePoint
    ? (events || []).filter((e) => e.day === activePoint.day || e.date === activePoint.date)
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

  // Tooltip geometry
  const tooltipWidth = 186;
  const tooltipHeight = isBreached ? 90 : 76;
  let tooltipX = activePoint ? getX(activePoint.day) - tooltipWidth / 2 : 0;
  if (tooltipX < paddingLeft) tooltipX = paddingLeft;
  if (tooltipX + tooltipWidth > width - paddingRight) tooltipX = width - paddingRight - tooltipWidth;

  let tooltipY = activePoint ? getY(activePoint.balance) - tooltipHeight - 12 : 0;
  if (tooltipY < paddingTop) {
    tooltipY = activePoint ? getY(activePoint.balance) + 12 : paddingTop;
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
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-title">Daily balance timeline</span>
          {selectedDay !== null && (
            <span
              className="selected-day-tag tabular-nums"
              style={{
                fontSize: '11px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '2px', background: 'var(--text)', display: 'inline-block' }} />
            Balance
          </span>
          <span>
            Floor: {formatCurrency(safetyFloor, currencySymbol)}
          </span>
          {onOpenReview && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenReview}
              style={{
                padding: '3px 9px',
                fontSize: '11px',
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
        style={{ position: 'relative', touchAction: 'pan-y' }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHoveredDay(null)}
        onTouchCancel={() => setHoveredDay(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="chart-svg"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'visible', userSelect: 'none' }}
        >
          {/* Horizontal Grid lines */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={getY(t.val)}
                x2={width - paddingRight}
                y2={getY(t.val)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={getY(t.val) + 3}
                textAnchor="end"
                className="chart-axis-text"
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
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text
            x={width - paddingRight - 4}
            y={floorY - 6}
            textAnchor="end"
            style={{ fontSize: '10px', fill: 'var(--text-secondary)', fontWeight: 600 }}
          >
            {`Safety floor: ${formatCurrency(safetyFloor, currencySymbol)}`}
          </text>

          {/* Defs for monochrome smooth curve area gradient */}
          <defs>
            <linearGradient id="monochromeCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--text)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Smooth area fill under the curve */}
          {areaD && (
            <path d={areaD} fill="url(#monochromeCurveGrad)" />
          )}

          {/* Today Indicator Line */}
          {todayPoint && (
            <g>
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
                x={getX(todayPoint.day) - 18}
                y={paddingTop - 14}
                width="36"
                height="14"
                rx="3"
                fill="var(--text)"
              />
              <text
                x={getX(todayPoint.day)}
                y={paddingTop - 4}
                textAnchor="middle"
                fill="var(--bg)"
                style={{ fontSize: '9px', fontWeight: 700 }}
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

          {/* Smooth Curved Line Path */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--text)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Daily Data Points */}
          {dailyBalances.map((pt) => {
            const isLowest = pt.date === lowestDate;
            const isSelected = selectedDay === pt.day;
            const isHovered = hoveredDay === pt.day;
            const x = getX(pt.day);
            const y = getY(pt.balance);

            return (
              <g key={pt.day}>
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
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? '5' : '2.5'}
                    fill={isSelected || isHovered ? 'var(--text)' : 'var(--text-secondary)'}
                    opacity={isSelected || isHovered ? '1' : '0.45'}
                    stroke={isSelected || isHovered ? 'var(--surface)' : 'none'}
                    strokeWidth={isSelected || isHovered ? '1.5' : '0'}
                  />
                )}

                {/* Invisible hit-box circle for click/hover/tap */}
                <circle
                  cx={x}
                  cy={y}
                  r="16"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredDay(pt.day)}
                  onMouseLeave={() => setHoveredDay(null)}
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
                y={height - 10}
                textAnchor={textAnchor}
                className="chart-axis-text"
                style={{
                  fill: isSelected ? 'var(--text)' : isNegative ? 'var(--text)' : undefined,
                  fontWeight: isSelected || isNegative ? 600 : 400,
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
                rx="6"
                fill="var(--surface)"
                stroke="var(--border-strong)"
                strokeWidth="1"
                filter="drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35))"
              />
              {/* Header: Date */}
              <text
                x="10"
                y="15"
                fill="var(--text-secondary)"
                style={{ fontSize: '10px', fontWeight: 600 }}
              >
                {activePoint.day < 0
                  ? `${formatDisplayDate(activePoint.date, true)} (Day ${activePoint.day})`
                  : formatDisplayDate(activePoint.date, true)}
              </text>

              {/* Opening Balance */}
              <text
                x="10"
                y="31"
                fill="var(--text-secondary)"
                style={{ fontSize: '10px', fontWeight: 500 }}
              >
                Opening:
              </text>
              <text
                x={tooltipWidth - 10}
                y="31"
                textAnchor="end"
                className="tabular-nums"
                fill="var(--text)"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {formatCurrency(openingBalance, currencySymbol)}
              </text>

              {/* Day Spending */}
              <text
                x="10"
                y="46"
                fill="var(--text-secondary)"
                style={{ fontSize: '10px', fontWeight: 500 }}
              >
                Spending:
              </text>
              <text
                x={tooltipWidth - 10}
                y="46"
                textAnchor="end"
                className="tabular-nums"
                fill={daySpend > 0 ? 'var(--text)' : 'var(--text-secondary)'}
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {daySpend > 0 ? `-${formatCurrency(daySpend, currencySymbol)}` : formatCurrency(0, currencySymbol)}
              </text>

              {/* Closing Balance */}
              <text
                x="10"
                y="61"
                fill="var(--text-secondary)"
                style={{ fontSize: '10px', fontWeight: 500 }}
              >
                Closing:
              </text>
              <text
                x={tooltipWidth - 10}
                y="61"
                textAnchor="end"
                className="tabular-nums"
                fill="var(--text)"
                style={{ fontSize: '11px', fontWeight: 700 }}
              >
                {formatCurrency(closingBalance, currencySymbol)}
              </text>

              {/* Floor Breached Warning */}
              {isBreached && (
                <text
                  x="10"
                  y="77"
                  fill="var(--danger)"
                  style={{ fontSize: '9px', fontWeight: 600 }}
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
