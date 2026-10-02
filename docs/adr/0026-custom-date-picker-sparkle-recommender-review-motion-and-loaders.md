# ADR 0026: Custom Date Picker, Sparkle Recommender, Month Review Motion, and Tiered Loaders

## Status
Accepted

## Context
1. **Disparate Native Date Selectors**:
   - `<input type="date">` inputs caused inconsistent OS-specific controls (Windows/Mac/iOS/Android), breaking the Swiss-Linear monochrome aesthetic and lacking support for negative pre-month day hints.
2. **Clunky Action Buttons**:
   - The "Recommend best date" action used a bulky bordered button crammed into form labels, creating visual noise.
3. **Month End Review Popover Parity**:
   - `MonthEndReviewModal` lacked the choreographed GSAP lifecycle, mobile drawer touch mechanics, and content staggering implemented in `UnifiedEntryModal`.
4. **App-wide Loading States**:
   - Loading was previously communicated via unstyled plain text (`Loading budget planner...`), creating a raw, unfinished impression.

## Decisions

### 1. Custom Monochrome DatePicker
- Built a floating popover calendar component (`DatePicker.jsx`) with:
  - Formatted text trigger with calendar icon.
  - Month/Year header with chevrons and weekday labels.
  - Inverted active pill indicator, today ring indicator, and pre-month negative day badges.
  - Quick-select "Today" shortcut pill.
  - Replaced `<input type="date">` throughout all entry modals and forms.

### 2. Sparkle Safe-Date Action Link
- Replaced the button in `UnifiedEntryModal` and `ItemModal` with an inline text link + small `SparkleIcon` (12px).
- Added an interactive calculating animation (spinning sparkle and pulse) with auto-population of the date field.

### 3. Month End Review Modal Animations
- Applied the Choreographed Modal Lifecycle (`useGSAP`, backdrop dissolve, desktop slide/scale, mobile bottom drawer gesture dismiss, and body scroll lock).
- Staggered review KPI cards, commitments breakdown, and recommendations on data load.

### 4. Tiered Application Loader System
- **Initial App Screen**: Designed an obsidian/zinc splash screen with `AnimatedLogo` and pulsing glow.
- **Top Activity Bar**: Added a 2px indeterminate progress line across the header for background refreshes and month changes.
- **Skeleton Pulse Cards**: Implemented animated zinc skeleton placeholders for `MonthEndReviewModal`.
- **Button Mini-Spinners**: Added inline micro-spinners for form submissions.

## Consequences
- The application interface feels fully cohesive, custom-crafted, and responsive.
- Operating system native date pickers are completely eliminated in favor of a unified monochrome calendar.
- Feedback during data fetching and API calls is instantaneous and elegant.
