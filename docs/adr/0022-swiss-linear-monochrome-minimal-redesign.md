# ADR 0022: Swiss-Linear Monochrome Minimal Redesign and Adaptive Navigation

## Status
Accepted

## Context
1. **Visual Stagnation & Monochrome Ambiguity**:
   - The application interface previously lacked typographic distinction and polish, relying on system fallback fonts without optical tracking or tabular figures (`tnum`).
   - In attempting to enforce a monochrome palette, critical status alerts (e.g. Safety Floor Breaches and deficit warnings) were set to subtle grays or muted dark tones, rendering them nearly indistinguishable from safe states and degrading financial situational awareness.
2. **Navigation Ergonomics Across Screen Sizes**:
   - The primary navigation bar was anchored to the bottom of the screen regardless of viewport width. On wide desktop monitors, a mobile-oriented bottom dock created awkward layout balance and wasted vertical canvas space.
3. **Impeccable Craft Alignment**:
   - The user requested an impeccable, minimal overhaul strictly preserved in a pure black-and-white palette.

## Decisions

### 1. Swiss / Linear Minimal Monochrome Design System
- Integrated Google Fonts (`Inter` with weights 400, 500, 600, 700 and `JetBrains Mono`).
- Set `font-variant-numeric: tabular-nums` globally across all currency balances, daily numbers, data points, and date spine columns to prevent shifting and ensure financial precision.
- Calibrated the dark theme palette to deep obsidian (`#09090b`), elevated surface (`#101013`), interactive subtle (`#18181b`), and razor-sharp 1px hairline zinc borders (`#27272a` / `#3f3f46`).
- Calibrated the light theme palette to pure white (`#ffffff`), subtle surface (`#fafafa`), interactive subtle (`#f4f4f5`), and crisp borders (`#e4e4e7` / `#d4d4d8`).

### 2. High-Contrast Monochrome Breach Inversion
- Solved monochrome urgency by introducing high-contrast solid inversion for critical status indicators:
  - Breached state: Solid white pill on dark mode (`#ffffff` fill, `#09090b` text, bold weight, with geometric hazard glyph `▲`). On light mode, solid black fill with pure white text.
  - Safe state: Subtle hairline border with `✓` glyph and muted secondary text.
  - Applied consistently across the top header floor pill, detailed KPI cards, and interactive timeline event rows.

### 3. Adaptive Navigation Architecture
- Embedded a segmented pill navigation bar (`.desktop-header-nav`) directly into the header bar on viewports $\ge 640\text{px}$, highlighting the active route with a solid inverted pill.
- Hid the fixed bottom navigation bar on viewports $\ge 640\text{px}$, reclaiming bottom padding (`padding-bottom: 36px` instead of `84px`).
- Preserved the compact bottom tab bar on mobile viewports ($< 640\text{px}$) for natural thumb ergonomics.

## Consequences
- The application presents an ultra-clean, Swiss/Linear-grade minimal aesthetic with zero chromatic distraction.
- Numbers and currency figures align with tabular precision across all cards, charts, and lists.
- Safety floor breaches remain instantly discernible through solid contrast inversion without needing color alerts.
- Desktop users enjoy an uncompromised top-nav web application experience while mobile users retain thumb-accessible bottom controls.
