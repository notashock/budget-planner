# Budget Planner

A deterministic monthly budget planner that calculates day-by-day running balances against income, dated expenses, and a safety floor.

## Language

**Plan**:
A dated projection of running balances for a specific month calculated deterministically from income and items.
_Avoid_: Budget sheet, spreadsheet, forecast.

**Safety Floor**:
A minimum cash threshold specified by the user, below which any projected daily balance is flagged as a breach.
_Avoid_: Minimum balance, buffer, overdraft limit.

**Timeline**:
A chronological sequence of dated events and running balances resulting from the simulation of a month.
_Avoid_: Ledger, transaction history, statement.

**Event**:
A single dated occurrence (income receipt, recurring item debit, one-time item debit, or fuel log stop) that updates the running balance.
_Avoid_: Transaction, entry, record.

**Salary Credit Date**:
The exact calendar date on which salary is deposited. When credited on or before the 1st of the budget month (such as the 30th of the preceding month), the funds become available cash from Day 1 of the planned month.
_Avoid_: Payday number, salary cycle day.

**One-Time Item**:
An expense occurring on a single calendar date.
_Avoid_: Ad-hoc expense, sporadic cost.

**Recurring Item**:
An expense scheduled on a specific day of the month that repeats monthly, clamped to the last day of shorter months.
_Avoid_: Subscription, standing order, bill.

**Fixed Recurring Item**:
A recurring item marked with a fixed flag that is automatically carried over to the next month on the identical calendar day and amount during month rollover.
_Avoid_: Permanent bill, locked expense, hard subscription.

**Fuel Log**:
A vehicle fuel expense entry recording odometer readings, fuel volume, and total cost across refueling stops, automatically calculating bike fuel efficiency (distance per volume unit) between consecutive stops.
_Avoid_: Formula item, mileage expense, dynamic bill.

**Month Rollover**:
The process of creating the next calendar month, copying fixed recurring items and optionally carrying forward the ending balance as the new opening balance.
_Avoid_: Month close, archive, reset.

**Pre-Month Event**:
A dated transaction, item, or salary credit occurring prior to Day 1 of the planned month, indexed as a negative relative day offset from the 1st (e.g., Day -1 for 1 day prior, Day -2 for 2 days prior), processed chronologically before Day 1 and plotted on the balance chart and timeline preceding Day 1.
_Avoid_: Previous month carryover, early expense, Day 30 alias.

**Goal Date Estimation Pipeline**:
An algorithm that determines whether a target purchase goal is feasible within the remainder of the month by evaluating upcoming heavy fixed bills, projecting remaining spend from the user's actual daily burn rate, and picking the safest upcoming date that maximizes savings buffer. If no safe date exists, it returns no date (`null`) with an explicit floor deficit and wait-for-next-month guidance.
_Avoid_: Spend date picker, price estimator.

**Transaction**:
A recorded financial actual (expense or negative refund) on an exact date, either linked to a planned item or logged as an unexpected expense.
_Avoid_: Purchase entry, ledger entry, receipt.

**Unplanned Allowance**:
The remaining liquid cash cushion after accounting for the safety floor, upcoming committed expenses, and active goals, dynamically derived directly from the Pace-Adaptive Safe Velocity calculation rather than a static manual quota.
_Avoid_: Buffer, slush fund, petty cash, static allowance quota.

**Safe to Spend per Day**:
The remaining unplanned allowance (Safe Velocity daily rate) calculated as dynamic free surplus divided by the remaining calendar days in the month.
_Avoid_: Daily budget, rigid daily burn quota.

**Purchase Goal**:
A target one-time purchase evaluated against the monthly cash flow to recommend a feasible purchase date or advise waiting for the following month.
_Avoid_: Wishlist, savings target, impulse budget.

**Net Item Amount**:
The effective monetary cost of a budget item computed by subtracting all mapped refund transactions from its original amount.
_Avoid_: Adjusted cost, discounted price, revised expense.

**Goal Lifecycle Status**:
The state of a purchase goal within a budget month: `active` (evaluating recommendation dynamically against cash flows), `scheduled` (promoted to a planned one-time budget item), or `deferred` (pushed to the following budget month).
_Avoid_: Evaluating, pending, queued, purchased.

**Priority Tier**:
A 3-tier visual ordering system for same-day items: High (3 bars / 0), Medium (2 bars / 1), and Low (1 bar / 2), controlling the deterministic order in which simultaneous expenses draw on the daily balance.
_Avoid_: Priority number, rank, star rating.

**Goal Safety Buffer**:
The minimum cash surplus from candidate purchase date to month-end calculated strictly from the Plan screen's baseline running-balance timeline: $\min_{t \ge d} (\text{running balance}_t) - \text{price} - \text{safetyFloor}$. If negative, the purchase is deemed infeasible and deferral to next month is recommended.
_Avoid_: Static buffer, opening balance margin.

**Dynamic Goal Auto-Deferral**:
An automated lifecycle transition that shifts an active purchase goal to deferred status when new actual expenses reduce the projected safety buffer below zero, safeguarding the safety floor.
_Avoid_: Goal cancellation, manual deferral requirement.

**Unified Entry Modal**:
A single consolidated dialog with a top segmented switch to record actual spending transactions or schedule planned budget items from a single entry point.
_Avoid_: Separate logging modals, disjointed item forms.

**Safe Velocity (Pace-Adaptive Allowance)**:
A dynamically calculated discretionary spending capacity derived from remaining liquid cash, upcoming committed bills, active purchase goals, and real spending pace. It recalculates the sustainable daily spend to guarantee reaching month-end with a preserved safety floor cushion.
_Avoid_: Static allowance, rigid spending limit, arbitrary daily quota.

**Mobile Glance-and-Act Hierarchy**:
A mobile-optimized screen layout ordering that surfaces critical status and instant execution before detailed analytics: Floor Status & Safe Velocity Card -> '+ New Entry' Action Bar -> Curved Timeline Chart -> Detailed KPI Cards -> Interactive Timeline List.
_Avoid_: Desktop-mirror layout, buried action buttons, chart-first overflow.

**Mobile Density Tier**:
A calibrated visual compacting scale triggered strictly on viewports under 640px that tightens screen margins, card insets, grid gaps, typography scale, and button/input dimensions to provide an ergonomic native-app feel while leaving the desktop layout and tablet spacing completely untouched.
_Avoid_: Global CSS font reduction, fixed-zoom breakpoint, responsive layout breakage.

**Header Salary Floor Indicator**:
A persistent, compact status pill residing in the top application header beside the month selector that communicates instantaneous safety floor integrity (safe cushion or active breach deficit), replacing the vertical floor banner on the dashboard page body.
_Avoid_: Dashboard floor card, full-width alert banner.

**Timeline Middle-Date Spine**:
A 3-column interactive event row architecture placing the time anchor (`Day X`, `Today`, formatted date) in the central column as a vertical axis separating qualitative item metadata (left) from financial delta and balance figures (right).
_Avoid_: Far-left date column, disconnected date badges.

**Cumulative Expenses Trajectory**:
A secondary dotted outflow curve rendered synchronously alongside the running balance spline on the timeline chart, illustrating month-to-date expenditure accumulation against remaining liquidity.
_Avoid_: Collision with main balance line, unscaled dual axes.

**Items Bento Grid**:
A responsive multi-column grid layout for budget items that organizes item metadata, priority tiers, prominent amounts, and management actions into structured bento tiles.
_Avoid_: Single-column list on wide screens, cramped action buttons.

**Ambient Outflow Spline**:
A subtle, low-opacity (0.45) curved spline representing cumulative expense trajectory overlaid onto the daily balance chart, providing a non-intrusive macro view of spending acceleration without competing with the primary balance curve.
_Avoid_: Harsh rigid steps, high-contrast colliding lines.

**Monochrome Form Dropdowns**:
A unified select and floating popover menu system styled with custom SVG glyphs, contextual border focus states, and elevated blur surfaces matching the monochrome design system.
_Avoid_: Default browser-rendered selects with OS-native chrome.

**Searchable Match Popover**:
A floating interactive item picker in the transaction logger featuring quick filter search, a clean continuous list with compact inline tags (`recurring`, `fixed`) without cumbersome group headers, and direct unexpected spending drawdown selection.
_Avoid_: Dense unsearchable native select tags or cluttered category section headers.

**Holistic Month Review**:
An end-of-month audit popup integrating the **Dynamic Survival Cushion** (free surplus remaining and safe velocity burn pace), fixed and recurring commitments (rent, EMIs, recurring subscriptions), categorized spending breakdown, and projected next-month survival cushion recommendations.
_Avoid_: Static allowance-only review that ignores recurring overhead or dynamic liquidity.

**Purchase Goals Bento Grid**:
A responsive multi-column card layout on the goals screen organizing purchase goals into structured cards with prominent target prices, monochrome status badges, compact recommendation insight boxes, and streamlined action triggers.
_Avoid_: Full-width vertical stacked lists with heavy colored banners.

**Pending Planned Item**:
A scheduled expense whose scheduled date has arrived or passed but whose payment has not yet been disbursed (`isPaid: false`). The funds remain credited in the current bank balance while the projected debit is pushed forward to today/future, preventing premature cash depression while still safeguarding month-end reserves.
_Avoid_: Floating debt, unpaid invoice, phantom debit.

**Affordable Goal Bundle**:
A mathematically evaluated combination of active purchase goals whose collective purchase price fits safely within the current dynamic survival cushion without risking a safety floor breach before month-end.
_Avoid_: Wishlist cart, multi-buy package, goal group.

**Pace-Calibrated Payment Date Recommender**:
An algorithm that determines the earliest viable calendar date to schedule an expense by factoring in available liquid cash, the user's empirical spending velocity (daily burn rate), upcoming committed fixed bills, and the safety floor cushion, rather than deferring arbitrarily to month-end.
_Avoid_: End-of-month deferred date picker, static day scheduler.

**Month-Scoped Payment Status**:
The tracking of payment disbursement (`isPaid: true/false`) isolated strictly to a specific budget month, ensuring recurring monthly expenses automatically reset to pending upon the start of each month until explicitly confirmed.
_Avoid_: Global recurring paid flag, permanent payment toggle.

**Unified Payment Toggle Switch**:
A standardized, animated sliding pill switch component (`.recurring-toggle-switch`) used consistently across all card types (recurring, one-time, debt) and modal entry forms (unified entry modal, item modal) to toggle payment disbursement status (`isPaid: true/false`), replacing disparate checkboxes, ad-hoc buttons, and redundant "in account" labels with a unified tactile interface.
_Avoid_: Native checkbox, ad-hoc button toggle, "in account" label, disparate per-card controls.

**Swiss-Linear Monochrome Aesthetic**:
The visual design architecture of the application, defined by deep obsidian `#09090b` and pure white `#ffffff`, hairline 1px zinc borders (`#27272a` / `#e4e4e7`), Geist/Inter typography with tabular figures (`tnum`), and strictly zero chromatic saturation.
_Avoid_: Rainbow UI, pastel tags, saturation accents, muddy gray-on-gray borders.

**Adaptive Navigation Architecture**:
A responsive navigation layout featuring an integrated segmented pill navigation bar in the top header for desktop and tablet viewports, transitioning to a compact, thumb-accessible bottom tab bar on mobile viewports (<640px) while reclaiming desktop viewport height.
_Avoid_: Pinned bottom bar on wide desktop, desktop hamburger menu, fixed mobile-first layout.

**High-Contrast Monochrome Breach Inversion**:
A visual status paradigm for critical financial safety alerts (floor breaches and deficit warnings) utilizing solid inverted pills (pure white background on dark mode, pure black on light mode) with crisp geometric glyphs (▲ / ✓) and hairline contrasting borders, ensuring instantaneous visual hierarchy without relying on color cues.
_Avoid_: Red text on dark gray, subtle warning borders, color-only indicators, indistinguishable gray alert pills.

**Choreographed Modal Lifecycle**:
A coordinated entry and exit orchestration using GSAP and React state that defers unmounting until dismissal tweens complete, guaranteeing fluid backdrop dissolves and surface transitions without sudden DOM popping.
_Avoid_: Abrupt conditional unmounting, cut-off exit transitions, unmanaged modal unmounts.

**Swiss-Precision Motion Profile**:
A non-elastic, high-velocity easing standard (`power3.out` entry at ~280ms, `power2.in` exit at ~180ms) tailored for the Swiss-Linear monochrome aesthetic, prohibiting bounce, overshoot, and chromatic flourishes while delivering instantaneous tactile response.
_Avoid_: Bouncy elastic springs, slow floaty easings, linear transitions.

**Sliding Segmented Mode Track**:
A GSAP-driven sliding pill indicator that smoothly interpolates position and width across segmented view switchers (such as Log Spending vs Plan Budget Item) while triggering staggered, micro-delayed form field entries.
_Avoid_: Abrupt view cutovers, jumpy tab highlights, uncoordinated multi-mode swaps.

**Bottom-to-Top Mobile Slider (Unified Drawer)**:
A mobile bottom sheet architecture replacing static modal dialogs on viewports under 640px, featuring slide-up entrance, 1:1 real-time drag-to-dismiss gesture tracking, body scroll lock, and content-adaptive dynamic viewport capping (`100dvh`).
_Avoid_: Dual scrolling container, inner scrolling with fixed outer box, disconnected desktop-on-mobile dialog.

**Gesture Drag-to-Dismiss Threshold**:
A calibrated touch interaction model where downward drag past 80px or rapid velocity dismisses the mobile slider with proportional backdrop dimming, while drags below threshold snap cleanly back to `y: 0` via a spring interpolation.
_Avoid_: Hard dismissal without threshold, rigid non-draggable sheets, flick-only gesture detection.

**Two-Stage Scroll-Expanded Drawer**:
A mobile drawer state architecture where scroll engagement (`scrollTop > 0`) or input focusing elevates the bottom sheet from its resting content-adaptive height (~70vh) to a near-full-screen expanded viewport (`calc(100dvh - 12px)`), providing a 2-stage downward gesture collapse (Expanded ➔ Resting ➔ Dismiss).
_Avoid_: Fixed static height sheet, input squishing, sudden non-interpolated height snap.

**Monochrome Calendar Popover**:
A custom date picker architecture featuring a floating obsidian/zinc month calendar grid, keyboard navigation, and pre-month negative day support, replacing disparate browser-native date inputs.
_Avoid_: Browser-native OS date picker, disparate calendar chrome, text-only date strings.

**Sparkle Safe-Date Link**:
An understated inline action trigger with a geometric sparkle glyph for initiating pace-calibrated purchase date estimations without visual clutter.
_Avoid_: Clunky boxed action buttons in field labels, hidden date calculators.

**Tiered Activity & Skeleton Loaders**:
A unified application-wide loading paradigm comprising an initial brand splash loader, a header activity progress line, and pulsing zinc skeleton cards.
_Avoid_: Unstyled plain text loading strings, jarring full-screen modal spinners on minor API requests.
