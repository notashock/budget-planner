# ADR 0027: Upward Popovers, Mobile Review Viewport Containment, and GSAP Performance Tuning

## Status
Accepted

## Context
1. In modal entry forms and mobile drawers, the DatePicker popover and Item Mapper (`SearchableItemPicker`) dropdown previously opened downward (`top: calc(100% + 4px)`). Because form fields often sit in the lower half of the modal, opening downward caused popovers to collide with modal bottom boundaries or be clipped by the viewport. Furthermore, popover surfaces used `--surface`, causing them to blend into underlying modal backgrounds without distinct separation.
2. On mobile viewports (<640px), the Month-End Review popup (`MonthEndReviewModal`) could extend beyond the screen: upward gestures (`deltaY < 0`) translated the sheet above the top of the viewport, and excessive content height without dynamic viewport capping caused the sheet to bleed beneath mobile browser toolbars.
3. Interactive hover actions on the `StepLineChart` repeatedly re-executed cubic Bézier spline geometry and tick collision pruning on every mouse-move event. Animation loops lacked unmount tween cleanup and explicit drag coordinate clamping.

## Decision
1. **Upward-Anchored Popovers with Solid Backgrounds**:
   - Repositioned `.datepicker-popover` and `.app-dropdown-menu` in `SearchableItemPicker` to anchor above the input trigger using `bottom: calc(100% + 6px); top: auto;`.
   - Updated popover styling to use solid `var(--bg)` (`#09090b` obsidian in dark mode, `#ffffff` in light mode) with `border: 1px solid var(--border-strong)` and layered elevation shadow (`box-shadow: 0 -14px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--border)`).
   - Inverted keyframe entrance motion to slide smoothly upward from the trigger (`translateY(6px) -> translateY(0)`).

2. **Mobile Viewport Containment & Clamped Drag Gestures**:
   - Applied `.month-review-content` with strict dynamic viewport capping: `max-height: calc(100dvh - 24px)`, `overflow-y: auto`, `overscroll-behavior: contain`, and `padding-bottom: max(28px, env(safe-area-inset-bottom, 28px))`.
   - Refactored touch move handlers in `MonthEndReviewModal` and `UnifiedEntryModal` using `gsap.utils.clamp(0, window.innerHeight, deltaY)`, preventing the sheet from ever translating upward past the top viewport edge (`y >= 0`).

3. **Global GSAP & Render Performance Tuning**:
   - Memoized SVG geometry, cubic Bézier spline calculation, and collision-pruned x-ticks in `StepLineChart` using `useMemo`, ensuring zero recalculation during hover or touch scrubbing.
   - Added unmount tween cleanups (`gsap.killTweensOf`) across `MonthEndReviewModal` and `UnifiedEntryModal` to eliminate lingering orphan tweens.
   - Enforced batched layout reads before GSAP tween writes in sliding segmented indicators.

## Consequences
- Popovers open cleanly into the unobstructed upper modal space with opaque, elevated contrast.
- The Month-End Review sheet stays completely bounded within mobile viewports with smooth touch scrolling and bounded drag gestures.
- Chart interactions and modal animations maintain stable 60fps with zero layout thrashing and zero test regressions.
