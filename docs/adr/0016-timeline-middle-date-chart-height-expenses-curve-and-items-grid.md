# ADR 0016: Interactive Timeline Middle Date, Chart Height Alignment, Cumulative Expenses Curve, and Items Bento Grid

## Status
Accepted

## Context
Following user requirements and `/grill-me` alignment:
1. **Interactive Timeline Row Layout**: The interactive timeline cards had date on the far left, item details in the middle, and amounts on the right. Shifting the date to the middle creates a clear visual timeline spine separating contextual details (left) from financial quantities (right).
2. **Dashboard Top Grid Height Alignment**: On desktop layouts (>= 960px), the Daily Balance Timeline chart was taller than the left insights panel (`SafeVelocityCard` + `ActionBar` + `DetailedKpiGrid`), creating vertical visual asymmetry.
3. **Item Cards Bento Grid**: The Items screen displayed budget items in a single vertical list. Transforming this into a responsive CSS grid of Bento-style cards improves readability and spatial utilization on both desktop and mobile devices.
4. **Cumulative Expenses Overlay Curve**: The daily balance timeline previously only displayed the running balance curve. The user requested plotting the expenses graph on the same timeline. Through the interview, we aligned on a secondary dotted outflow curve tracking cumulative expenses across the month.

## Decisions

### 1. Interactive Timeline Row Layout (Middle Date Column)
- Rearrange `.timeline-event-row` elements into:
  1. `.timeline-event-info` (Left): Item title/label, category, transaction status, and fixed rollover indicators.
  2. `.timeline-event-date` (Middle): Formatted date centered with subtle pill styling for `Today` and `Day X` pre-month badges.
  3. `.timeline-event-numbers` (Right): Net transaction/planned delta amount and resulting running balance.
- Update CSS grid/flex alignments to ensure seamless presentation across desktop and mobile screens.

### 2. Daily Balance Timeline Height Alignment
- Reduce SVG height in `StepLineChart.jsx` from 230 to 180, adjusting vertical padding (`paddingTop = 16`, `paddingBottom = 26`) to align the chart card's total height with the left insights column (~290px).
- Add flex layout styling to `.dashboard-chart-panel .card` so it stretches gracefully to match adjacent column heights on desktop.

### 3. Bento-Style Grid Layout for Budget Items
- In `ItemsScreen.jsx`, replace the single-column list with a responsive CSS grid: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;`.
- Structure each Bento card:
  - **Header**: Item name, type badge (`recurring` or `one-time`), priority tier bars, and fixed rollover tag.
  - **Body**: Prominent bold amount, recurrence/scheduled day badge, and refund breakdown if applicable.
  - **Footer**: Bottom-aligned quick action buttons (`Edit`, `Delete`) with clean borders and subtle hover states.

### 4. Cumulative Expenses Secondary Dotted Curve on StepLineChart
- Compute daily and cumulative expenses across the month in `StepLineChart.jsx` based on negative balance delta transitions or timeline events.
- Plot a secondary dotted curve (`stroke-dasharray="3 3"`, `stroke="var(--text-secondary)"`) tracking cumulative expenses from Day 1 / pre-month to the end of the month.
- Include a chart legend indicating "Balance (solid)" and "Cumulative expenses (dotted)".
- Enhance tooltip scrub inspection to show both the Running Balance and Cumulative Expenses for the active day.

## Consequences
- Timeline events now have an intuitive timeline axis down the center.
- Dashboard top grid is visually balanced on desktop viewports.
- Item management feels tactile and structured as Bento tiles.
- Users can observe the inverse relationship between accumulating spending and remaining safety balance in one glance.
