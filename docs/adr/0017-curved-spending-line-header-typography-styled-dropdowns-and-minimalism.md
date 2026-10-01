# ADR 0017: Curved Spending Line, Bold Header Brand Typography, Styled Dropdowns, and UI Minimalism Pruning

## Status
Accepted

## Context
Following user requirements and interactive `/grill-me` alignment:
1. **Curved Spending Overlay**: The secondary cumulative expense line on the daily balance chart was previously a rigid step line. Smoothing it into a cubic Bézier curve with reduced opacity (0.45) visually distinguishes it as an ambient backdrop outflow indicator rather than competing with the primary balance curve.
2. **Header Brand Typography**: The "Budget Planner" app title in the header was relatively small (13px, secondary text). Increasing it to 15px/16px bold primary text reinforces application identity without taking up additional vertical footprint.
3. **Application-Wide Styled Dropdowns**: Browser-default `<select>` inputs lacked visual cohesion with the monochrome dark/light system. Adding custom styling with an SVG chevron, padded focus states, and a dedicated `.app-dropdown-menu` floating card for custom selectors unifies the dropdown experience.
4. **UI Minimalism Pruning**: Several explanatory and verbose subtitles were identified as visual clutter:
   - The redundant `({amount} cushion to survive month)` text on the Safe Velocity Card.
   - The `X of Y events` secondary subtitle in the Interactive Timeline header.
   - The chart bottom helper tip (`Tip: Hover or tap any point to inspect day balances...`).

## Decisions
1. **Curved Expense Spline**:
   - Compute cubic Bézier control points for cumulative expenses across the month in `StepLineChart.jsx`.
   - Render the path with `fill="none"`, `stroke="var(--text-secondary)"`, `strokeDasharray="4 3"`, and reduced opacity (`0.45`).
   - Soften expense event circles to `opacity="0.6"`.
2. **Prominent Brand Heading**:
   - Update `.app-brand` in `index.css` to `font-size: 15px`, `font-weight: 700`, `letter-spacing: 0.06em`, and `color: var(--text)`.
3. **Application-Wide Dropdown System**:
   - Style all `<select>` inputs with `appearance: none`, custom SVG dropdown arrow, surface background, and clean border focus states.
   - Enhance the month picker in `Header.jsx` with `.app-dropdown-menu` and `.app-dropdown-item` featuring elevation and rounded item hover states.
4. **Minimalist Pruning**:
   - Remove verbose cushion text in `SummaryCards.jsx`.
   - Remove redundant `X of Y events` subtitle in `TimelineList.jsx`.
   - Remove the bottom helper tip in `StepLineChart.jsx`.

## Consequences
- The balance timeline feels lighter and less congested with the subtle curved spending line.
- Header title is legible and distinct.
- Dropdown elements blend natively into the dark/light design system.
- Dashboard information density is tightened, focusing strictly on actionable figures.
