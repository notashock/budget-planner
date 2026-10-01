# 15. Dynamic Safe Velocity Unplanned Allowance and Settings View/Edit Mode

Date: 2026-10-02

## Status
Accepted

## Context
Previously, `unplannedAllowance` was entered as a static manual quota in the Month Settings (e.g. ₹1,000). In Sprint 3, we introduced the Pace-Adaptive Safe Velocity algorithm, which dynamically computes the exact `freeSurplus` (cash cushion to survive the month after reserving the safety floor, upcoming committed expenses, and active goals).

Having both a manual static unplanned allowance input and a dynamic Safe Velocity cushion created redundancy, confusion, and stale calculations. Furthermore, Month Settings was always rendered in edit mode with input fields open, and included extraneous fields like "Currency symbol".

The user requested:
> "replace the remaining amount after calculating safe velocity thing with the unplanned alloance it should be atomatically treated as unplanned allowance also remove goal currency symbol and monthly unplanned allowance, also makesure it should have an edit button in month settings /grill-me"

## Decisions

### 1. Automatic Dynamic Unplanned Allowance
In `@budget/engine/src/simulator.js`:
- The remaining cash surplus calculated by Safe Velocity (`freeSurplus = Math.max(0, todayBalance - committedUpcomingItems - safetyFloor - activeGoalsCost)`) is automatically and exclusively bound to `unplannedAllowance` and `allowanceLeft`.
- `safeToSpendPerDay` is aligned directly with `safeVelocityPerDay`.
- Eliminates the need for users to manually guess or configure a static allowance quota.

### 2. Streamline Month Settings Fields
In `GoalsScreen.jsx`:
- Remove the `Monthly unplanned allowance` input.
- Remove the `Currency symbol` input (currency is determined at account/month level).
- Month Settings now cleanly focuses on the three essential month parameters:
  1. Monthly Income
  2. Salary Credit Date
  3. Safety Floor Threshold

### 3. Toggle View/Edit Mode for Month Settings
In `GoalsScreen.jsx`:
- **Default View Mode**: A clean read-only summary card displaying Monthly Income, Salary Credit Date, Safety Floor, and the dynamically derived Survival Cushion, with an "Edit" button in the card header.
- **Edit Mode**: Clicking "Edit" displays the 3 inputs alongside "Save month settings" and "Cancel" buttons, returning to view mode upon saving or cancelling.

## Consequences
- Unplanned allowance dynamically adapts to day-to-day financial actuals and goals without manual spreadsheet-like adjustments.
- Month settings UI is decluttered and protected against accidental edits while retaining quick access via the "Edit" button.
