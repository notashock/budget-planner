# 13. Compact Mobile-First Density and Typography

Date: 2026-10-01

## Status
Accepted

## Context
Following the implementation of the 3-component dashboard layout and mobile touch interactions (ADR 0011, ADR 0012), mobile viewports (< 640px) felt unnecessarily spacious and required excessive vertical scrolling due to desktop-inherited card paddings (16px), large KPI numerals (20px), generous container margins (14px–24px), and taller control button heights (38px+).

The user explicitly requested:
> "make the text, card and ui padding compact by reducing the sizes such that it feels like mobile first website. note: without disturbing desktop layout /grill-with-docs"

A multi-branch design grilling interview reached unanimous consensus on:
1. **Breakpoint Scope**: Ultra-compact density strictly activates below `640px` (smartphones), ensuring `640px–959px` retains balanced tablet sizing and `≥ 960px` desktop layout remains completely untouched.
2. **Card & Container Density**: High-density native app feel:
   - Outer container horizontal padding reduced from 14px to 10px.
   - Standard card padding reduced from 16px to 10px.
   - Summary cards reduced from 12px to 8px–10px with 6px–8px grid gaps.
   - Timeline list items reduced to 7px 10px padding with 6px row gap.
   - Corner radius subtly tightened from 8px to 6px on small screens.
   - Bottom-sheet modal padding reduced from 20px to 14px.
3. **Typography & Control Scaling**: Proportional 1-tier downscale:
   - KPI values scaled from 20px to 16px–17px.
   - Secondary labels and event items scaled from 14px to 12.5px–13px.
   - Micro-metadata and hints scaled to 10px–10.5px.
   - Button heights compact to 32px–34px with 6px 12px padding.
   - Form inputs reduced to 6px 10px padding.
   - Bottom navigation reduced from 60px to 52px + safe-area insets.

## Decision
We implement a dedicated, scoped `@media (max-width: 639px)` Mobile Density Tier in `index.css` and relevant components.

Key technical specifications:
- `--radius: 6px` inside `@media (max-width: 639px)`.
- `.app-header-inner`: `8px 12px` padding on mobile.
- `.app-container`: `10px 10px calc(70px + env(safe-area-inset-bottom, 0px)) 10px`.
- `.dashboard-layout`: `gap: 10px`.
- `.summary-grid`: `gap: 8px`.
- `.summary-card`: `padding: 8px 10px; gap: 3px`.
- `.summary-value`: `font-size: 16px`. Safe velocity hero value: `font-size: 17px`.
- `.summary-label`: `font-size: 11px`.
- `.timeline-list`: `gap: 6px`.
- `.timeline-event-row`: `padding: 7px 10px; gap: 8px`.
- `.timeline-event-label`: `font-size: 13px`.
- `.timeline-event-amount`: `font-size: 13px`.
- `.timeline-event-date`, `.timeline-event-type`, `.timeline-event-balance`: `font-size: 10.5px–11px`.
- `.bottom-nav`: `height: calc(52px + env(safe-area-inset-bottom, 0px))`.
- All desktop rules (`min-width: 640px` and `min-width: 960px`) remain 100% intact and untouched.

## Consequences

### Positive
- High information density on mobile phones: users see the critical safe velocity, action buttons, chart, and multiple events above the fold without endless scrolling.
- Native mobile app feel with appropriate thumb-friendly hit targets.
- Desktop and tablet viewports are completely unaffected.

### Negative / Trade-offs
- Multiple media query overrides require disciplined maintenance in `index.css`.
