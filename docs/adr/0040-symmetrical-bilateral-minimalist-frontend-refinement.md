# ADR 0040: Symmetrical Bilateral Minimalist Frontend Refinement

## Status
Accepted

## Context
1. **Visual Clutter & Asymmetry**:
   - The top header accumulated multiple competing elements in the left title group (brand logo, BETA tag, month picker, salary window button, safety floor breach indicator), resulting in erratic wrapping and asymmetric alignment with the center navigation and right utility buttons.
   - The Plan Screen desktop layout featured an uneven top split: the left column stacked three separate card containers (Safe Velocity, a 2-button action bar, and a 4-cell KPI grid) with variable height that failed to align with the StepLineChart canvas on the right.
   - Account filter pills relied on extensive inline styling with unstandardized colors (`#ef4444`) conflicting with the monochrome design system.
   - The Goals Screen exhibited excessive nesting with four consecutive boxed sections (info tip, combinations box, add goal form, active goals list), burying active goals beneath redundant containers.
   - Accounts and Items cards lacked standardized structural rhythm, with irregular paddings and inconsistent heights.

## Decisions

### 1. Three-Zone Bilateral Header
- Re-architected `Header.jsx` into three distinct optical zones:
  - **Zone 1 (Left)**: Brand identity (`AnimatedLogo` + "Budget Planner") paired with a refined month selector dropdown.
  - **Zone 2 (Center)**: True-centered segmented navigation pills (`.desktop-header-nav`).
  - **Zone 3 (Right)**: Consolidated live status indicator (Floor Safety / Salary Window status) positioned symmetrically beside theme toggling and sign-out utilities.

### 2. Height-Matched Bento Top Split (PlanScreen)
- Integrated the primary action button (`+ New Entry`) into the top account toolbar alongside standardized account filter pills.
- Synchronized the height of the left insights column (Safe Velocity Card + 2x2 Detailed KPI Grid) with the StepLineChart on the right via CSS Grid alignment.
- Relocated secondary actions ("Month Review") into a clean utility trigger.

### 3. Two-Column Symmetrical Goals Screen
- Split the desktop view into two balanced columns:
  - **Left Column**: Clean "Target Purchase" input card with an integrated "Affordable Combinations" summary drawer.
  - **Right Column**: Prominent bento grid of active goal cards with progress indicators, recommendation badges, and conversion actions.

### 4. Standardized 3-Tier Bento Cards (Accounts & Items)
- Structured all entity cards across Accounts, Wallets, and Budget Items into a disciplined 3-part layout:
  - **Tier 1 (Header)**: Category icon, type badge, and title with discrete status pill.
  - **Tier 2 (Hero Value)**: Tabular currency balance / amount with high visual weight.
  - **Tier 3 (Specs & Actions)**: 2x2 mini-spec grid for secondary metrics (Safety Floor, Scheduled Date, Projected End) and integrated action icons.

### 5. Zero-Inline-Style Token Discipline
- Migrated all ad-hoc inline styles in filter pills, stat cards, and form groups into dedicated CSS classes in `index.css`.
- Preserved strict Swiss/Linear monochrome styling, tabular numerals (`font-variant-numeric: tabular-nums`), and high-contrast solid inversion for critical breach alerts.

## Consequences
- The entire interface achieves optical symmetry and balanced bilateral breathing room across all viewports.
- Visual clutter is eliminated by removing redundant nested boxes, arbitrary inline styling, and unbalanced toolbars.
- Key financial indicators (Safe Velocity, Trajectory Curve, Running Balances) remain the primary visual focus without distraction.
