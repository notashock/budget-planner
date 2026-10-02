# ADR 0023: GSAP React Modal Motion and Unified Entry Choreography

## Status
Accepted

## Context
1. **Abrupt Dialog Lifecycles**:
   - The application previously mounted and unmounted dialogs abruptly (`if (!isOpen) return null;`), preventing exit transitions and backdrop dissolves.
   - When users switched between "Log Spending" and "Plan Budget Item" in `UnifiedEntryModal`, forms replaced each other instantly without transition, creating a jarring visual jump.
2. **Motion Language Harmony**:
   - The application adheres to a Swiss-Linear Monochrome Aesthetic (ADR 0022). Generic bouncy physics, slow floaty animations, or flashy chromatic particle bursts would violate this design philosophy.
   - High-velocity, engineered precision curves with sub-100ms micro-interactions were needed to elevate tactile responsiveness without delaying data entry.

## Decisions

### 1. GSAP & @gsap/react Architecture
- Integrated `gsap` and `@gsap/react` as the official motion engine for React components.
- Registered `useGSAP` plugin globally and leveraged scoped refs (`scope: containerRef`) to guarantee leak-free DOM queries and automatic cleanup on unmount.
- Adopted `contextSafe` for asynchronous exit timelines, click triggers, and micro-interaction tweens.

### 2. Choreographed Modal Lifecycle
- Implemented an internal rendering coordinator (`shouldRender` and `isClosing`) inside the modal layer.
- Opening: mounts the modal DOM immediately, triggering smooth backdrop fade-in (`opacity: 0 -> 1`) and modal surface translation and micro-scale (`y: 18px -> 0`, `scale: 0.985 -> 1.0`, on mobile bottom-sheet `y: 100% -> 0`).
- Closing: intercepts close clicks, overlay dismissals, and Escape keypresses, runs an accelerated exit tween (`opacity: 0`, `y: 12px`, 180ms), and defers calling parent `onClose()` until the exit animation completes.

### 3. Swiss-Precision Motion Profile
- Standardized modal entrance easing to `power3.out` (280ms) and dismissal to `power2.in` (180ms) with zero overshoot.
- Established a sliding segmented mode track for the "Log Spending" vs "Plan Budget Item" switch with a GSAP-driven sliding pill indicator.
- Choreographed form field cross-fades with a rapid micro-stagger (`0.02s` per form group, `power2.out`, 220ms).
- Added sub-100ms micro-press compression (`scale: 0.96 -> 1.0`) on category pills, priority tiers, and payment status switches.

## Consequences
- Modals dissolve and dismiss fluidly without clipping or abrupt disappearance.
- Unified Entry Modal switching feels responsive, tactile, and engineered like modern desktop productivity tools.
- Parents (`App.jsx`, `PlanScreen.jsx`, etc.) retain clean declarative props (`isOpen`, `onClose`) with no added boilerplate.
