# ADR 0025: Two-Stage Scroll-Expanded Mobile Drawer

## Status
Accepted

## Context
1. **Vertical Space and Viewport Collision**:
   - On mobile viewports (<640px), when forms contain multiple fields (amounts, category pills, notes, recurring toggles, date recommenders) or when the mobile virtual keyboard pops up, a single static sheet height either leaves excessive empty space on simple forms or requires cramped scrolling.
   - The user requested that scrolling the modal slides the entire component higher into the viewport to provide more vertical canvas.
2. **Ergonomic Drawer Hierarchy**:
   - A 2-stage mobile drawer model provides the ideal balance:
     - **Stage 1 (Resting)**: Compact, content-adaptive (~70vh), preserving visibility of the underlying dashboard.
     - **Stage 2 (Expanded)**: Near full-screen (`calc(100dvh - 12px)`), triggered automatically upon scrolling or input focus.
     - **Collapse Sequence**: Scrolling back to the top and pulling down collapses from Expanded back to Resting, with a second downward pull dismissing the modal.

## Decisions

### 1. Two-Stage Height Hierarchy
- Configured mobile `.modal-content` with resting and expanded states:
  - Resting: `max-height: min(70vh, max-content)`.
  - Expanded: `max-height: calc(100dvh - 12px)`.
- Maintained a smooth CSS / GSAP interpolated height transition (`transition: max-height 0.24s cubic-bezier(0.16, 1, 0.3, 1)` and GSAP timeline synchronization).
- Desktop screens ($\ge 640\text{px}$) remain unaffected standard centered dialogs.

### 2. Scroll and Focus Triggered Expansion
- When `contentRef.current.scrollTop > 0` or upon upward drag gesture, the sheet state transitions to `isExpanded: true`.
- Tapping/focusing any `<input>` element automatically expands the sheet to ensure full clearance for virtual keyboards.
- When the user scrolls back to `scrollTop === 0` and pulls down:
  - If `isExpanded` is true, the downward pull collapses the sheet back to resting (`isExpanded: false`).
  - If already resting, the downward pull engages the gesture drag-to-dismiss threshold (>80px).

## Consequences
- Maximizes screen real estate for form editing without sacrificing the tactile bottom-sheet drawer aesthetic.
- Virtual keyboard collisions are eliminated.
- Gestures feel intuitive, predictable, and native to mobile operating systems.
