# 11. 3-Component Dashboard Layout, Curved Timeline Chart, Strict Monochrome Palette, and Pace-Adaptive Safe Velocity

Date: 2026-10-01

## Status

Accepted

## Context

In Sprint 3, the user identified four major evolutionary requirements for the budget planner:
1. **Dashboard Restructuring**: Move from a single narrow mobile column to a diversified 3-component dashboard: top-left Insights, top-right Timeline Chart, and bottom full-width Interactive Timeline list.
2. **Visual Language**: Transition from colored accents (blue, red, green, amber) to a strictly monochrome palette between black and white (neutral slate/obsidian grays, crisp borders, high-contrast inverted status badges).
3. **Timeline Curve**: Replace the rigid step-line SVG path with a smooth curved line (cubic Bézier / spline) to provide a fluid, elegant financial trajectory while preserving safety floor reference lines, day selection, and interactive tooltips.
4. **Header Optimization**: Remove mobile max-width constraints on the header, making it full width (edge-to-edge).
5. **Pace-Adaptive Allowance**: Replace static unplanned allowance inputs with a dynamic "Safe Velocity" calculation that evaluates remaining liquid funds, upcoming committed expenses, active purchase goals, and actual spending burn rate to compute how much spend is sustainable per day to survive the rest of the month with a comfortable cushion.

## Decisions

### 1. 3-Component Grid Layout
- Restructure `PlanScreen.jsx` into a 2-column top grid on desktop/tablets (`@media (min-width: 900px)`):
  - **Top-Left (Insights)**: Displays floor status, key balance indicators, dynamic Safe Velocity, and unified action buttons (`+ New Entry`, `Month review`).
  - **Top-Right (Curved Timeline Chart)**: Displays the smooth spline running balance chart with safety floor reference line, today marker, and interactive day inspection.
  - **Bottom (Interactive Timeline List)**: Spans 100% width across the bottom, featuring event filters, pre-month debits/credits, matched transaction links, and daily details.
- On mobile viewports (`< 900px`), the layout stacks vertically with fluid 100% width cards.

### 2. Full-Width Header and Expanded Canvas
- Update `.app-container` in `index.css`:
  - Header is full-width (`width: 100%`, max-width: none), pinning cleanly to the top viewport edge.
  - Main container expands to `max-width: 1440px` with balanced desktop padding (`16px 24px`), giving the 3-component dashboard room to breathe.

### 3. Strictly Monochrome Palette (Black-to-White Spectrum)
- Eliminate all colored saturation tokens (`--accent`, `--danger`, `--success`, `--warning`) in favor of calibrated neutral grays:
  - Background: Pure obsidian `#09090b` (dark) / `#ffffff` (light)
  - Surface: `#141416` / `#fafafa`
  - Subtle Surface: `#202024` / `#f4f4f5`
  - Border: `#27272a` / `#e4e4e7`
  - Strong Border: `#3f3f46` / `#d4d4d8`
  - Primary Text: `#f4f4f5` / `#09090b`
  - Secondary Text: `#a1a1aa` / `#71717a`
- Status indicators (floor breach, safe velocity, credit debits) use high-contrast inverted monochrome badges, crisp white borders, and distinct SVG icons.

### 4. Smooth Curved Timeline SVG Path
- In `StepLineChart.jsx`, compute cubic Bézier control points between successive daily balance points rather than orthogonal step lines (`L x2 y1 L x2 y2`).
- Retain all interactive features: hover dot tracking, today indicator, safety floor dashed horizontal rule, and click-to-filter day selection.

### 5. Pace-Adaptive Safe Velocity Formula
- In `@budget/engine/src/simulator.js`:
  - Calculate `committedUpcomingItems`: sum of remaining un-executed planned item debits from current day to month end.
  - Calculate `activeGoalsCost`: sum of remaining active purchase goals.
  - Calculate `availableCushion = Math.max(0, currentBalance - committedUpcomingItems - safetyFloor - activeGoalsCost)`.
  - Calculate `safeVelocityPerDay = Math.max(0, Math.floor(availableCushion / Math.max(1, daysLeft)))`.
  - Calculate `actualBurnRatePerDay = daysElapsed > 0 ? (totalSpentSoFar / daysElapsed) : 0`.
  - Provide descriptive guidance: "Safe spend: ₹X/day to preserve your safety floor with a handful of surplus".

## Consequences

- The app feels significantly more modern, premium, and calm with zero color clash.
- The 3-component dashboard leverages wider viewports effectively without degrading mobile readability.
- Users receive real-time, velocity-aware guidance on what is safe to spend each day rather than maintaining an arbitrary static allowance figure.
