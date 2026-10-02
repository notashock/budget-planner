# ADR 0024: Bottom-to-Top Mobile Slider and Gesture Drawer

## Status
Accepted

## Context
1. **Mobile Dual-Scroll & Fixed Box Friction**:
   - On mobile viewports (<640px), the modal dialog previously placed a scrollable element (`overflow-y: auto`) inside a fixed overlay without body scroll locking.
   - When attempting to scroll on touch devices, the inner content scrolled while the outer container remained static, or background page scroll bled through, degrading native feel.
   - The dialog lacked intuitive mobile gestures (e.g. dragging down to dismiss) and did not feel like a native bottom sheet.
2. **Ergonomic Design Decisions**:
   - The user specified transforming the mobile modal into a true bottom-to-top slider component with single continuous scrolling (Option B) and content-adaptive height with dynamic viewport capping (`min(90vh, 100dvh - 32px)`).
   - Real-time 1:1 finger tracking with an 80px dismissal threshold and background dimming was chosen to achieve tactile native drawer physics.

## Decisions

### 1. Bottom-to-Top Mobile Slider Architecture
- Converted the mobile modal presentation into a native drawer sliding upwards from the bottom edge (`y: 100% -> 0%`, 280ms, `power3.out`).
- Enforced body scroll locking (`document.body.style.overflow = 'hidden'`) while open, preventing background scroll chaining.
- Set content-adaptive capping with dynamic viewport units: `max-height: min(90vh, calc(100dvh - 32px))` on mobile, preserving a 32px visible backdrop frame above the sheet.
- Maintained single continuous scrolling inside `.modal-content` (`overscroll-behavior: contain; -webkit-overflow-scrolling: touch;`).

### 2. Touch Gesture Drag-to-Dismiss
- Added interactive touch tracking on the top grab handle, header area, and when scrolled to the top (`scrollTop <= 0`):
  - **1:1 Finger Tracking**: Translates the sheet in real-time (`y: deltaY`) with upward elastic damping (`deltaY * 0.2`).
  - **Backdrop Interpolation**: Proportional opacity dimming as the user drags down.
  - **Threshold**: Dragging downward past 80px or releasing with quick downward velocity finishes dismissal (`triggerExit()`, 160ms, `power2.in`).
  - **Snap-Back**: Releasing before the threshold smoothly snaps the sheet back to `y: 0` (180ms, `power2.out`).
- Retained standard centered dialog presentation on desktop viewports ($\ge 640\text{px}$).

## Consequences
- Resolves all inner-vs-outer scrolling glitches on mobile devices.
- Mobile users gain native drawer ergonomics with tactile swipe-to-dismiss and natural momentum scrolling.
- Desktop presentation remains undisturbed.
