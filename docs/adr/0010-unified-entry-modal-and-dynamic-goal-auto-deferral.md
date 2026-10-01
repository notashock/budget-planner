# 10. Unified Entry Modal, Dynamic Goal Auto-Deferral, and SVG Iconography

Date: 2026-10-01

## Status

Accepted

## Context

1. **Credit / Inflow Representation**: In the quick logging interface, refunds and credits were styled too similarly to expense debits, creating confusion about whether a positive adjustment was being made.
2. **Goal Dynamism under Actual Spend**: Previously, when an unplanned expense transaction occurred during the month, purchase goals remained in the `active` state and required the user to manually discover that the recommendation had become infeasible and manually click "Defer to next month". If an actual purchase breaks the safety floor reserve, the system should automatically transition the goal to `deferred` with an explicit reason, safeguarding the user's safety floor.
3. **Emoji Clutter**: Emojis (⚡, 📍, ⚠️, ✓, ●, ≡, ◬, ✦) were used across the navigation bar, buttons, and timeline, causing platform-dependent visual inconsistency.
4. **Modal Fragmentation**: Users had to navigate between two disparate modal flows and buttons: one for "Log spending" and one for "Plan item". This created unnecessary UI friction.

## Decisions

1. **Credit Styling**:
   - Style the credit/refund toggle pill, active state, amount indicator, and descriptive text in `var(--success)` (vivid emerald green) to clearly contrast against expense debits.

2. **Dynamic Goal Auto-Deferral**:
   - When a transaction is logged, the backend and frontend automatically re-evaluate all active purchase goals using `recommendPurchaseDate`.
   - If the new actual expense compromises the safety buffer such that `feasible === false`, the goal automatically transitions to `status: 'deferred'` with `deferredReason: 'Auto-deferred: recent purchase compromised safety buffer'`.
   - The user is notified on the Goals screen with a dedicated banner explaining the auto-deferral, while allowing 1-click reactivation if desired.

3. **Crisp SVG Icon System**:
   - Introduce a zero-dependency, stroke-based SVG component library (`Icons.jsx`) replacing all emojis across bottom navigation, action buttons, timeline status badges, and alert banners.

4. **Unified Entry Modal**:
   - Replace separate `QuickLogModal` and `ItemModal` with a consolidated `UnifiedEntryModal` component accessible via a single "+ New Entry" button across Plan and Items views.
   - A top segmented switch allows seamless toggling between "Log Transaction" and "Plan Budget Item".

## Consequences

- Consistent, frictionless data entry with a single entry point.
- Real-world cash flow changes immediately protect goal feasibility without requiring manual checks.
- Clean, consistent iconography across all OS platforms and light/dark themes.
