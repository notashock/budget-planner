import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * Pure SVG Step Line Balance Chart.
 * Displays daily running balance across the month with a dashed safety floor line.
 */
export function StepLineChart({
  dailyBalances = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  floorBreached = false,
  lowestDate = ''
}) {
  if (!dailyBalances || dailyBalances.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No balance history available for this month.
      </div>
    );
  }

  const daysInMonth = dailyBalances.length;
  const balances = dailyBalances.map((d) => d.balance);
  const minVal = Math.min(...balances, safetyFloor);
  const maxVal = Math.max(...balances, safetyFloor);

  // SVG dimensions
  const width = 600;
  const height = 220;
  const paddingLeft = 65;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Range with 10% breathing room
  const range = maxVal - minVal || 1000;
  const yMin = minVal - range * 0.05;
  const yMax = maxVal + range * 0.05;

  const getX = (day) => {
    if (daysInMonth <= 1) return paddingLeft;
    return paddingLeft + ((day - 1) / (daysInMonth - 1)) * chartWidth;
  };

  const getY = (val) => {
    const norm = (val - yMin) / (yMax - yMin || 1);
    return height - paddingBottom - norm * chartHeight;
  };

  // Build step-line path: M x0, y0 -> L x1, y0 -> L x1, y1 -> ...
  let pathD = '';
  dailyBalances.forEach((point, i) => {
    const x = getX(point.day);
    const y = getY(point.balance);

    if (i === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      const prevX = getX(dailyBalances[i - 1].day);
      const prevY = getY(dailyBalances[i - 1].balance);
      // Step: horizontal from prevX to x at prevY, then vertical to y
      pathD += ` H ${x} V ${y}`;
    }
  });

  const floorY = getY(safetyFloor);

  // Format y-axis tick values (top, middle, bottom)
  const yTicks = [
    { val: yMax, label: formatCurrency(yMax, currencySymbol) },
    { val: (yMax + yMin) / 2, label: formatCurrency((yMax + yMin) / 2, currencySymbol) },
    { val: yMin, label: formatCurrency(yMin, currencySymbol) }
  ];

  // X ticks: 1, 5, 10, 15, 20, 25, daysInMonth
  const xTicks = [1, 5, 10, 15, 20, 25, daysInMonth].filter(
    (d, idx, arr) => d <= daysInMonth && arr.indexOf(d) === idx
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Daily balance timeline</span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Floor: {formatCurrency(safetyFloor, currencySymbol)}
        </span>
      </div>

      <div className="chart-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
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
            className="chart-floor-line"
          />
          <text
            x={width - paddingRight - 4}
            y={floorY - 6}
            textAnchor="end"
            style={{ fontSize: '10px', fill: 'var(--danger)', fontWeight: 600 }}
          >
            Safety floor
          </text>

          {/* Step Line Path */}
          <path
            d={pathD}
            className={`chart-step-line ${floorBreached ? 'breached' : ''}`}
          />

          {/* Daily Data Points */}
          {dailyBalances.map((pt) => {
            const isLowest = pt.date === lowestDate;
            const x = getX(pt.day);
            const y = getY(pt.balance);
            if (isLowest) {
              return (
                <g key={pt.day}>
                  <circle cx={x} cy={y} r="5" fill="var(--danger)" stroke="var(--surface)" strokeWidth="2" />
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    style={{ fontSize: '10px', fill: 'var(--danger)', fontWeight: 600 }}
                  >
                    Lowest
                  </text>
                </g>
              );
            }
            return (
              <circle
                key={pt.day}
                cx={x}
                cy={y}
                r="2"
                fill="var(--text-secondary)"
                opacity="0.4"
              />
            );
          })}

          {/* X Axis ticks */}
          {xTicks.map((day) => {
            const point = dailyBalances.find((p) => p.day === day);
            return (
              <text
                key={day}
                x={getX(day)}
                y={height - 10}
                textAnchor="middle"
                className="chart-axis-text"
              >
                {point ? formatDisplayDate(point.date, false) : `Day ${day}`}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
