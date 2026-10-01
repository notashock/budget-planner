# ADR 0019: Global Scrollbar Hiding and Purchase Goals Grid Cards

## Status
Accepted

## Context
1. **Application-wide Scrollbar Removal**: Browser scrollbars (vertical and horizontal) added visual clutter across viewports, containers, modals, and charts. Hiding scrollbars across all modern and legacy rendering engines while preserving smooth touch, wheel, and keyboard scrolling enhances the minimal native-app aesthetic.
2. **Purchase Goals Grid Cards**: Goals on `GoalsScreen.jsx` were previously rendered as full-width vertical stacked lists with heavy colored banners. The user requested converting purchase goals into a responsive grid of cards with a clean, minimal design matching the bento architecture of the items screen.

## Decisions

### 1. Global Scrollbar Hiding
- In `apps/web/src/index.css`:
  - Configured universal selector `*`, `html`, and `body` with:
    - `scrollbar-width: none;` for Firefox.
    - `-ms-overflow-style: none;` for IE and Edge.
    - `*::-webkit-scrollbar { display: none; width: 0; height: 0; }` for WebKit and Chromium browsers (Chrome, Safari, Edge, Opera).
- Preserves full scrolling functionality across modals, timeline lists, charts, and overflow containers without rendering scrollbar tracks or thumbs.

### 2. Purchase Goals Bento Grid
- In `apps/web/src/index.css`:
  - Created `.goals-grid` (`display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;`).
  - Styled `.goal-card` with monochrome surface, subtle border, rounded radius, and elevation transitions.
  - Added mobile media query tightening grid columns to `1fr` and reducing spacing and target price font size under 640px.
- In `apps/web/src/screens/GoalsScreen.jsx`:
  - Transformed goals display from a vertical stack into `.goals-grid`.
  - Structured each card with:
    - **Header**: Goal name with text-overflow ellipsis, accompanied by a clean monochrome status pill (`Scheduled`, `Deferred`, `Active`).
    - **Price**: Prominent target purchase figure in bold tabular numerals.
    - **Recommendation Insight**: A compact, minimal status box displaying the evaluated safe purchase date with safety buffer (or floor breach deficit risk).
    - **Footer**: Aligned action triggers (`Schedule`, `Defer`, `Reactivate`) on the left, and a subtle `Delete` trigger on the right.

## Consequences
- The application interface is devoid of native browser scrollbar chrome across all platforms.
- Purchase goals render in a responsive, modern grid matching the visual design of budget items.
