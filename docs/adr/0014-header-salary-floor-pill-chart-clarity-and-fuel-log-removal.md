# 14. Header Salary Floor Pill, Chart Date Clarity, and Fuel Log Removal

Date: 2026-10-02

## Status
Accepted

## Context
Following user testing and mobile optimization, three specific ergonomic and clarity improvements were requested:
1. Move the "salary floor maintained/breached" status into a compact indicator pill in the application header beside the month picker, removing the large banner card from the main dashboard body.
2. Resolve horizontal overlapping of dates on the running-balance curve chart, specifically between negative pre-month offsets (e.g. Sept 30 / Day -1) and Day 1, as well as crowded intermediate days on small screens.
3. Completely strip out vehicle fuel log tracking from the web interface to simplify budget item workflows down to core One-Time and Recurring expenses.

## Decisions

### 1. Header Salary Floor Indicator Pill
- **Placement**: Located in the application header directly adjacent to the month picker button.
- **Styling**:
  - Maintained: A monochrome subtle pill with a green/success indicator dot displaying `Floor: ₹20,000 Safe` (or compact `Floor Safe` on small screens).
  - Breached: A high-contrast danger-accented pill displaying `Floor Breached (-₹5,000)` with deficit amount.
- **Dashboard Cleanup**: The large `FloorStatus` banner card is removed from `PlanScreen.jsx`, reclaiming vertical space and positioning the Dynamic Safe Velocity card at the very top of the dashboard content.

### 2. Chart Date Clarity & Anti-Collision Pruning
- In `StepLineChart.jsx`:
  - Format labels cleanly: Month + day on Day 1 (e.g. `Oct 1`) and pre-month (e.g. `Sep 30`), while intermediate intervals render clean day numbers (`5`, `10`, `15`, `20`, `25`, `31`).
  - Adaptive Collision Pruning: Calculate exact SVG X positions. If candidate tick labels are closer than 45px, prune intermediate crowded ticks (e.g. dropping Day 5 if Day 1/pre-month needs room, or dropping Day 30 when Day 31 is present), guaranteeing zero overlapping text.
  - Hover/Touch Tooltip: Retains full date formatting, day index, balance, and day-over-day delta.

### 3. Clean Web Removal of Fuel Log
- In `UnifiedEntryModal.jsx`: Remove `'fuel-log'` from item type segment selector (now only `One-Time` and `Recurring`), remove all odometer/volume/cost input rows and calculations.
- In `ItemsScreen.jsx`: Remove `'fuel-log'` filter tab from the category filter pills, remove fuel efficiency calculation subcomponents.
- Backend/Simulator: Retain legacy simulator calculation in `@budget/engine` to avoid breaking existing stored data or test fixtures.

## Consequences
- Clean, compact top header that displays financial safety at a glance.
- Main dashboard content opens immediately with Safe Velocity and action triggers.
- Timeline curve chart is crisp and legible on both mobile phones and desktop displays without text collisions.
- Cleaner, more focused item creation and management interface without domain-specific fuel logging complexity.
