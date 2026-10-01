# 12. Mobile Responsive Optimization and Touch Ergonomics

Date: 2026-10-01

## Status

Accepted

## Context

Following the desktop 3-component dashboard restructuring, mobile viewports (< 960px, down to 360px-390px iPhone/Android devices) required a purposeful mobile-first optimization pass. The desktop side-by-side 2-column layout must adapt gracefully to mobile without creating horizontal scrollbars, clunky navigation wraps, or awkward chart interactions.

## Decisions

### 1. Mobile Glance-and-Act Component Hierarchy
On viewports `< 960px`, the dashboard order is explicitly restructured to prioritize immediate situational awareness and thumb action before detailed balance history:
1. **Floor Status Banner**: Immediate alert if the safety threshold is breached or maintained.
2. **Dynamic Safe Velocity Card**: Primary answer to "how much can I spend right now?" with daily velocity and cushion.
3. **Action Bar**: Primary `+ New Entry` and `Month review` buttons within immediate thumb reach.
4. **Curved Timeline Chart**: Visual running balance curve with touch scrubbing.
5. **Detailed Balance KPI Cards**: Secondary breakdown (Monthly income, Total expenses, Today's balance, Lowest balance).
6. **Interactive Timeline List**: Full-width chronological log with filter tabs and pre-month items.

On desktop (`>= 960px`), the layout preserves the 2-column top grid (Insights on the left, Timeline Chart on the right) with the Timeline List spanning full width below.

### 2. Touch-Scrubbing Chart Interaction
- In `StepLineChart.jsx`, implement `onTouchStart`, `onTouchMove`, and `onTouchEnd` handlers on the SVG chart container:
  - Calculates the nearest day point based on touch X coordinates relative to chart bounding rect.
  - Updates `hoveredDay` and displays the floating inspection tooltip with daily balance and delta.
  - Sets `touch-action: pan-y` or controlled touch event handling to allow smooth horizontal thumb scrubbing while preserving intuitive vertical page scrolling.
  - Expands invisible touch targets on chart points to 32px for effortless tap selection.

### 3. Comprehensive Mobile Navigation & Input Ergonomics
- **Header**:
  - Compact icon buttons on mobile: Theme toggle displays `SunIcon`/`MoonIcon` icon-only on small screens (< 600px) and Sign Out uses a compact exit icon button (`LogOutIcon`) to eliminate multi-line wrapping on 360px-390px screens.
  - Full-width container with edge-to-edge backdrop and responsive horizontal padding.
- **Bottom Navigation**:
  - Includes `padding-bottom: max(10px, env(safe-area-inset-bottom))` for iPhone notch and home gesture bar safety.
  - Interactive tab buttons adhere to 44px min touch targets with clear active indicators.
- **Form Inputs**:
  - All monetary inputs across `UnifiedEntryModal.jsx`, `GoalsScreen.jsx`, and month settings add `inputMode="decimal"` and `pattern="[0-9]*[.]?[0-9]*"` to reliably open numeric/decimal keypads on iOS and Android.
- **Modals**:
  - Styled as smooth bottom-sheets on mobile (`< 640px`) with a top grab-handle indicator pill and `max-height: 88vh` scrollable bodies.

## Consequences

- The application delivers a high-grade native mobile feel with fluid thumb interactions.
- Touch scrubbing across the running balance chart eliminates fat-finger selection frustration.
- Numeric keypads automatically activate on transaction and budget inputs, speeding up mobile entries.
- Zero horizontal overflow or header button wrapping across all phone sizes down to 360px.
