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
The process of creating the next calendar month, copying fixed recurring items, optionally rolling forward unpaid one-time items to their optimal dates, and carrying forward the ending balance as the new opening balance.
_Avoid_: Month close, archive, reset.

**Forward-Rolling Pending Item**:
A planned budget item whose scheduled date has passed without payment settlement (`isPaid: false`). The system dynamically moves its scheduled date forward to the next recommended safe date within the current month, leveling daily outflows until the item is settled.
_Avoid_: Expired item, overdue debt, frozen bill.

**Actual Payment Date Attribution**:
The practice of updating a planned budget item's active execution date (`item.day` / `item.date`) to the current calendar date when marked as paid (`isPaid: true`), while preserving its initial planned schedule in `originalDay` / `originalDate`. This ensures the running balance timeline records the cash debit on the actual day settlement occurred.
_Avoid_: Static past date debit, retro-debit, unrecorded payment timing.

**Unpaid Item Rollover**:
A capability during month rollover that detects unpaid one-time items remaining at the conclusion of a month and prompts the user to carry them forward into the new month, automatically assigning them to the new month's best recommended date.
_Avoid_: Forced item deletion, forgotten expense.

**Pre-Month Event**:
A dated transaction, item, or salary credit occurring prior to Day 1 of the planned month, indexed as a negative relative day offset from the 1st (e.g., Day -1 for 1 day prior, Day -2 for 2 days prior), processed chronologically before Day 1 and plotted on the balance chart and timeline preceding Day 1.
_Avoid_: Previous month carryover, early expense, Day 30 alias.

**Goal Date Estimation Pipeline**:
An algorithm that determines whether a target purchase goal is feasible within the remainder of the month by evaluating upcoming heavy fixed bills, projecting remaining spend from the user's actual daily burn rate, and picking the safest upcoming date that maximizes savings buffer. If no safe date exists, it returns no date (`null`) with an explicit floor deficit and wait-for-next-month guidance.
_Avoid_: Spend date picker, price estimator.

**Date Diversification (Daily Outflow Smoothing)**:
A date recommendation strategy that evaluates candidate dates for safety floor preservation and selects the day with the minimum existing expenditure load (total scheduled payments on that day), breaking ties by the earliest feasible calendar date. This avoids clustering multiple payments or compounding heavy bills on a single day, ensuring smooth, non-shock cash flow.
_Avoid_: Random date spread, fixed date clustering, naive maximum-buffer dating.

**Transaction**:
A recorded financial actual (expense or negative refund) on an exact date, either linked to a planned item or logged as an unexpected expense.
_Avoid_: Purchase entry, ledger entry, receipt.

**Unplanned Allowance**:
The remaining liquid cash cushion after accounting for the safety floor and active goals, dynamically derived directly from the Pace-Adaptive Safe Velocity calculation rather than a static manual quota. Unpaid planned items do not deduct from this cushion until settled.
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
A dynamically calculated discretionary spending capacity derived from current liquid cash, active purchase goals, and real spending pace, with all unpaid planned budget items excluded from deductions until marked paid. It recalculates the sustainable daily spend to guarantee reaching month-end with a preserved safety floor cushion.
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

**Dynamic Adaptive Popovers**:
Popovers and dropdown pickers (including the monochrome DatePicker calendar and planned item mapper) dynamically evaluate available vertical space above and below the trigger relative to the viewport and scroll parent. If the space above is clearly visible and unobstructed, the popover pops upward (`bottom: calc(100% + 6px); top: auto;`); if space below is clear and unobstructed, it pops downward (`top: calc(100% + 6px); bottom: auto;`) with an elevated solid opaque background (`var(--bg)` with 1px zinc hairline border and deep shadow), preventing overflow clipping in modals or viewports.
_Avoid_: Hardcoded single-direction popovers cutting off outside viewports, semi-transparent dropdown backgrounds.

**Dynamic Viewport Modal Containment**:
Strict capping of mobile review sheets to `calc(100dvh - 24px)` with bounded gesture translation clamped to `y >= 0` via `gsap.utils.clamp`, smooth internal touch scrolling, and safe area inset padding, preventing modals from expanding or sliding beyond the top or bottom of the mobile viewport.
_Avoid_: Unbounded touch translations, modals cutting off behind browser toolbars, uncapped vertical sheet heights.

**Hardware-Accelerated Animation Pipeline**:
An animation and computation pipeline optimized for 60fps interaction: memoizing expensive cubic Bézier SVG path calculations (`StepLineChart`), batching layout reads and writes before GSAP tweens, and cleaning up active tweens on unmount.
_Avoid_: Per-hover SVG path recomputations, unmanaged orphan tweens, layout thrashing in animation loops.

**Component Error Boundary**:
A fault-isolation layer wrapping critical dashboard views and SVG charts (`StepLineChart`, `PlanScreen`, and main screen tab router) that catches runtime exceptions, isolates failures from unmounting parent trees, and renders an elegant Swiss-Linear recovery interface ("Try again" / "Reload").
_Avoid_: Uncaught React runtime crashes, unhandled white screens, silent component unmounting.

**Web Component Verification Pipeline**:
An automated component test suite in `@budget/web` powered by Vitest, JSDOM, and `@testing-library/react` integrated directly into the root `npm run test:all` script and GitHub Actions CI workflow (`ci.yml`), validating interactive contracts (touch gestures, upward popovers, month-year navigation, and error isolation) across all core components before build and deployment.
_Avoid_: Untested client-side UI components, manual regression testing of chart gestures and popovers.

**Bank Account**:
An institutional financial depository (e.g. checking, savings, salary) with an institution name, account number/identifier, opening balance, and dedicated ledger tracking.
_Avoid_: Unified account, fund source, generic account.

**Wallet**:
A distinct liquid cash or digital balance store (e.g. physical cash envelope, mobile wallet) managed separately from institutional bank accounts with its own opening balance and transaction history.
_Avoid_: Petty cash, pocket money, sub-account.

**Account Attribution**:
The explicit assignment of a planned budget item, transaction, or income receipt to a designated Bank Account or Wallet, tracking balance deltas per source while preserving aggregate monthly projection.
_Avoid_: Account tagging, fund earmarking.

**Unified Aggregate Simulation**:
A deterministic projection calculating the overall liquid cash timeline and safety floor across all accounts, while simultaneously generating per-account running balance breakdowns.
_Avoid_: Global simulation, multi-account merge.

**Paired Account Transfer**:
A zero-sum movement of funds between a source Bank Account or Wallet and a destination Bank Account or Wallet, adjusting individual balances without altering the aggregate liquid cash timeline.
_Avoid_: Internal transfer, account swap, balance move.

**Per-Account Opening Balance**:
The recorded opening cash position of a specific Bank Account or Wallet at Day 1 of a budget month, carried over from the prior month's ending balance during rollover or initialized during month setup.
_Avoid_: Account baseline, account seed balance.

**Primary Account**:
A designated primary Bank Account or Wallet configured as the default payment source in entry forms to streamline logging, while allowing instant switching or unassigned fallbacks.
_Avoid_: Master account, main account.

**Unassigned Balance Pool**:
Funds, items, or transactions not tied to any specific Bank Account or Wallet, participating solely in aggregate monthly simulation calculations without affecting individual account ledgers.
_Avoid_: Floating pool, orphaned transactions.

**Accounts Screen**:
A primary application view featuring a segmented switch between Bank Accounts and Wallets, presenting status cards, live balance breakdowns, inter-account transfer triggers, and individual account activity ledgers.
_Avoid_: Banking tab, wallets page, financial accounts list.

**Salary Deposit Account**:
The designated Bank Account into which the monthly primary salary is deposited on the salary credit date, automatically updating that account's projected and actual balance.
_Avoid_: Payroll account, salary destination.

**Account Minimum Balance**:
An optional user-defined threshold on an individual Bank Account that triggers an inline low-balance alert if projected or actual balance dips below it, operating independently of the aggregate monthly safety floor.
_Avoid_: Minimum safety floor, account buffer.

**Base Currency Unification**:
The enforcement of a single unified currency across all Bank Accounts, Wallets, and cash flows within a budget month, preserving deterministic integer minor-unit math without foreign exchange complexity.
_Avoid_: Multi-currency conversion, FX rate calculation.

**Tri-Mode Unified Entry Modal**:
A three-segment modal architecture ([ Log Spending | Plan Item | Transfer ]) allowing rapid capture of actual expenditures, budget planning, or zero-sum inter-account fund movements within a single choreographed dialog.
_Avoid_: Separate transfer dialog, dual-tab-only modal.

**Account Timeline Filter**:
A horizontal pill selector on the Plan screen enabling instant toggling between aggregate monthly liquidity and account-specific running balance trajectories and event histories.
_Avoid_: Account chart switch, bank view selector.

**Goal Funding Source**:
An optional designated Bank Account or Wallet assigned to a Purchase Goal, requiring the Goal Date Estimation Pipeline to verify both overall liquidity safety and source-specific balance viability before recommending a purchase date.
_Avoid_: Target account, savings fund.

**Account Archival**:
A non-destructive deactivation of a Bank Account or Wallet that hides it from active entry selectors while preserving all historical transactions, past month opening balances, and simulation integrity.
_Avoid_: Hard deletion, purge, account drop.

**Composite Opening Balance Input**:
A dynamic form interface in Month creation and settings dialogues that accepts opening balances per active Bank Account and Wallet, automatically computing and updating the aggregate month opening balance.
_Avoid_: Manual sum entry, lump sum opening input.

**Auto-Provisioned Primary Bank Account Migration**:
An automatic, idempotent data initialization process that generates a default Primary Bank Account for existing users with unassigned legacy records, backfilling unassigned Months, Items, Transactions, and Goals so that dashboard balances and running curves transition seamlessly without discontinuity.
_Avoid_: Manual account seeding, destructive backfill, unmigrated data wipe.

**Legacy Migration Consent Modal**:
A first-load prompt presented to users with existing budget records but no configured bank accounts, requesting explicit consent and details (account name, institution, minimum balance) to transition unassigned opening balances, historical transactions, and incoming salary credits into their new primary account.
_Avoid_: Silent auto-migration, forced unconsented account creation.

**Salary Depository Routing**:
The explicit assignment of a designated Bank Account to receive the primary monthly salary inflow on the salary credit date, managed directly within the Month Baseline Configuration on the Accounts screen and inherited across month rollovers.
_Avoid_: Static payroll destination, hardcoded salary account.

**Unified Migration Gate**:
A consolidated interaction pattern where initiating account creation from any UI entry point (the migration modal, the Accounts screen banner, or the '+ Add Bank' button) routes unmigrated users into the canonical migration authorization flow, preventing fragmented unassigned states.
_Avoid_: Disconnected account forms, split creation pathways.

**In-Form Salary Depository Linking Consent**:
A contextual consent control integrated directly inside the Add/Edit Bank modal that enables designating a newly configured bank account as the active salary depository if and only if no salary deposit bank is currently linked, directly synchronizing the active month settings and user defaults upon creation.
_Avoid_: Requiring navigation to Month Settings to establish initial salary bank routing, allowing duplicate salary depositories.

**Transaction Account Attribution**:
The explicit assignment of an actual spending debit or refund credit to a specific Bank Account or Wallet within the Unified Entry Modal, ensuring transaction liquidity impacts and running balances are attributed to the designated account in timeline simulation and ledger records.
_Avoid_: Unattributed transaction, split-ledger logging, phantom expense.

**Mandatory Account Linking**:
The strict requirement that every planned budget item and logged transaction must be bound to an active registered Bank Account or Wallet upon creation or editing, eliminating unassigned or orphan cash entries.
_Avoid_: Optional account binding, unlinked budget items, floating expenses.

**Immediate Paid Item Debit**:
The simulation rule whereby any planned budget item flagged as paid (`isPaid: true`) is treated as having executed cash withdrawal on or prior to the current day, immediately reducing the designated bank account's current balance (`todayBalance`) and the aggregate today's balance regardless of its original scheduled calendar date.
_Avoid_: Delayed paid realization, future-dated paid deduction.

**Synchronized Matched Transaction Attribution**:
The automatic synchronization mechanism that updates the payment account of a logged actual transaction whenever its linked planned budget item is reassigned to a different Bank Account or Wallet, ensuring planned allocations and actual deductions remain in lockstep.
_Avoid_: Mismatched payment accounts, divergent planned-actual attribution.

**Account-Driven Balance Truth**:
The core architectural invariant stating that Bank Accounts and Wallets are the sole source of truth for all monetary balances in the system. An aggregate month opening balance is strictly the sum of its individual account opening balances, and unassigned balance pools are completely prohibited.
_Avoid_: Disconnected month opening balance, floating ledger, independent pool.

**Unified Account-Linked Month Provisioning**:
The onboarding and month initialization interaction whereby fresh users with zero registered accounts configure their primary bank account directly within the month creation dialog, atomically creating both their primary bank ledger and initial budget month.
_Avoid_: Accountless month setup, deferred banking onboarding.

**Mandatory Goal Funding Earmark**:
The strict requirement that every purchase goal must designate a funding Bank Account or Wallet, ensuring goal feasibility and 1-tap conversion are directly verified against real account reserves.
_Avoid_: Unfunded goal, abstract savings target.

**Full Calculated State Ingestion**:
An automated data transfer mechanism that absorbs 100% of an existing active budget month's calculated figures (opening and current liquid balance, salary credit, committed planned expenses, and actual transactions) into the user's primary bank account in a single atomic transaction, preserving all historical dashboard figures without calculation loss or manual re-entry.
_Avoid_: Fractional balance migration, manual ledger re-entry, data purge during account setup.

**Unified Balance Aggregation**:
The dashboard presentation mode in which every top-line financial indicator (Monthly Income, Total Expenses, Today's Balance, Month-End Balance, and Dynamic Safe Velocity) reflects the exact mathematical summation across all registered active bank accounts and wallets.
_Avoid_: Synthetic overall balance, approximate portfolio estimate.

**Account-Isolated Trajectory**:
The filtered dashboard mode activated by selecting a specific bank account or wallet, where the Dynamic Safe Velocity card, KPI summary grid, step-line balance curve, and interactive timeline reflect only the cash flows, reserves, minimum balance constraints, and committed bills of the selected account.
_Avoid_: Global metrics on isolated timeline, cross-account bleed in single-account view.

**Internal Transfer Neutrality**:
The presentation rule establishing that internal transfers between a user's own accounts have net-zero impact ($₹0$) on the unified running balance timeline, while reflecting discrete debit and credit events when viewing the source and destination account trajectories respectively.
_Avoid_: Inflated total expenses from transfers, double-counted income from internal moves.

**Prominent Data Transfer Banner**:
A high-visibility contextual call-to-action rendered on the Plan screen for users with existing calculated data but no bank accounts, providing immediate 1-tap migration into their primary bank account.
_Avoid_: Hidden migration links, buried settings actions.

**Single Unified Migration Flow**:
The consolidated, solitary migration experience triggered exclusively from the Plan screen's transfer banner. It presents an all-in-one setup modal that collects primary bank details (when 0 accounts exist) and transfers opening balance, salary depository, unlinked planned items, and transactions in a single atomic transaction.
_Avoid_: Fragmented migration checkboxes across multiple modals, secondary migration wizards.

**Header Salary & Safeline Linking**:
A compact button beside the month selector in the application header opening a focused 3-field modal (Salary Credited Bank Account, Monthly Salary Amount, and Overall Safeline Floor) to dynamically adjust monthly income flow and liquidity baseline without requiring a separate settings page.
_Avoid_: Standalone month settings card, disconnected salary routing.

**Global Month Safeline**:
The overarching safety floor for the entire budget month that applies universally across all bank accounts and wallets, guaranteeing that the aggregate liquidity curve never falls below the user's emergency cash buffer.
_Avoid_: Fragmented per-account safety floors, conflicting individual safelines.

**Multi-Stream Income Logging**:
The ability to record both scheduled monthly salary and ad-hoc income inflows (e.g. freelance earnings, bonuses, investment dividends) directly attributed to designated bank accounts or wallets in the Unified Entry Modal.
_Avoid_: Static single-salary limitation, untracked cash receipts.

**Account-Attributed Net Liquidity**:
The continuous tracking and aggregation of cash positions where an individual account's Today's Balance and Lowest Balance strictly evaluate its opening balance, all attributed income credits, tagged expense debits, and net inter-account transfers, rolling up into the exact mathematical sum on the unified dashboard.
_Avoid_: Disconnected account ledgers, untracked transfer imbalances.

**Legacy Transaction Auto-Attribution & Lowest Balance Precision**:
The automatic fallback routing of any existing or newly imported transactions and planned items without an explicit account or marked as unassigned to the user's primary bank account (while strictly safeguarding valid wallet assignments). Both the isolated primary bank account view and the unified aggregate view continuously reflect today's balance (credited income + opening balance - debited transactions to date) and dynamically pinpoint the lowest balance and date across the entire monthly trajectory.
_Avoid_: Lost unassigned transactions disappearing from bank balance curves, lowest balance defaulting to opening balance after initial salary credit, over-writing non-bank wallet transactions.

**Salary Credited Action Isolation**:
The strict restriction of the salary credit status badge (`✓ Credited` / `⚡ Mark Credited`) and the credit date modification trigger (and popover calendar) exclusively to the designated salary bank account view. When viewing All Accounts (Unified) or other bank accounts and wallets, all salary-specific modification controls are hidden to maintain domain clarity.
_Avoid_: Salary editing controls appearing on non-salary accounts or in the unified all-accounts overview.

**Past-Zero Resilient Lowest Balance**:
The liquidity evaluation rule specifying that if an account's balance touched zero or lower in the past (prior to `currentDay`, e.g. before initial monthly salary deposit or opening balance ingestion), the engine ignores those historical zero points and evaluates the account's lowest balance and lowest date strictly across current and future points (`day >= currentDay`).
_Avoid_: Artificial 0 lowest balance alerts locking an account's liquidity metric to a pre-funding past state.

**Universal & Isolated Burn Pace Architecture**:
Burn pace (spending rate per elapsed day) calculated symmetrically at both aggregate and per-account scopes based on all real expense transactions logged to date. Unified view evaluates all transactions across all accounts and wallets, while isolated bank/wallet views evaluate transactions specifically attributed to that financial vessel.
_Avoid_: Restricting burn pace solely to unplanned transactions or omitting burn pace from isolated account views.

**Single-Spline Liquidity Timeline**:
The streamlined SVG curve presentation focusing entirely on the daily running cash balance trajectory against the safety floor, omitting auxiliary cumulative expense curves to prevent visual clutter and maintain full dynamic vertical scaling.
_Avoid_: Cluttering the timeline with secondary cumulative expense curves or inflating chart bounds with total expense values.

**Isolated Account Trajectory & Lowest Point Evaluation**:
The strict evaluation of per-account daily trajectories where an individual bank account or wallet computes its lowest point exclusively from its own attributed events. If an account touched 0 in the past prior to today, the system ignores those past zero-dips and evaluates the lowest point across the future horizon (`day >= currentDay`); otherwise, it reflects the true lowest dip across the entire month.
_Avoid_: Inaccurately falling back to the global all-accounts trajectory for individual bank views or allowing pre-funding past 0-dips to distort current safety margins.

**Zero-Transaction Account Liquidity Preservation**:
An account with zero logged transactions maintains a flat daily balance curve equal to its opening balance across all days of the month, resulting in identical opening, today, ending, and lowest balances without inheriting aggregate activity from other accounts.
_Avoid_: Empty curves defaulting to unified aggregate curves and falsely displaying other accounts' spending or lowest points.

**Layered Elevation & Anti-Clipping Popover Stacking Context**:
An elevated stacking architecture where active date pickers and popovers dynamically elevate their container (`.datepicker-container.open`) and parent `.form-group` with `z-index: 1000; isolation: isolate;` and `has-open-datepicker`, guaranteeing the floating calendar or dropdown renders strictly above all subsequent form inputs, buttons, and siblings regardless of DOM order or vertical collision direction.
_Avoid_: Datepickers or popovers rendering underneath subsequent form fields, inputs clipping popovers due to standard document flow.

**Universal Account Minimum Balance Architecture**:
Both institutional Bank Accounts and Wallets support an optional `minimumBalance` threshold with robust currency parsing (sanitizing currency glyphs, commas, and formatted strings to integer minor units) and explicit ObjectId validation on API endpoints, preventing 500 server crashes and properly contributing to the aggregated monthly safety floor.
_Avoid_: Missing wallet minimum balance fields, unvalidated ObjectId casting in PUT/POST routes, unhandled NaN currency values.

**Isolated Consumption Burn Pace & Self-Transfer Exclusion**:
Burn pace (spending rate per elapsed day) strictly isolates expenses to their declared account type and account/wallet identifier, omitting formal transfers (which represent internal movements rather than net outflows) so liquidity consumption reflects true external expenditure.
_Avoid_: Counting internal transfers as consumption, mixing wallet expenses into bank burn rates, unassigned transactions leaking into non-primary accounts.

**Unified Metric Summation Contract**:
In the All Accounts view, the headline Burn Pace, Dynamic Safe Velocity, and Committed Bills metrics represent the exact mathematical sum of the respective metrics across all registered bank accounts and wallets, deriving the unified pace status badge (stable/contracting/expanding/critical) directly from the aggregate pace comparison.
_Avoid_: Calculating unified safe velocity on decoupled global surplus when individual accounts have differing surplus pools, disparate committed bills sums.

**Unified Lowest Balance Summation**:
In the All Accounts view, the headline `lowestBalance` represents the exact mathematical sum of the lowest balances computed across all individual bank accounts and wallets (`\sum account.lowestBalance`), while `lowestDate` reflects the calendar date on the aggregate liquidity timeline when total liquid cash reaches its lowest point.
_Avoid_: Showing an isolated aggregate single-pool lowest dip in All Accounts when individual account safety margins are computed per bank/wallet.

**GSAP React Micro-Interactions & Animated Modals**:
All secondary screens and modal dialogs (`AccountsScreen`, `SalarySafelineModal` "Log Salary", `TransferCalculationsModal` "Data Transfer", and inline account creation modals) standardize on `@gsap/react` via `AnimatedModal` and scoped refs. They feature hardware-accelerated entrance (`power3.out`), smooth exit timelines (`power2.in`), sliding segmented tab indicators, and staggered card list reveals matching the high-polish aesthetic of `UnifiedEntryModal`.
_Avoid_: Abrupt modal unmounting without exit transitions, un-scoped GSAP queries, jarring instant tab switches without sliding indicators.

**Expected Salary 10-Day Window & Logging Lock Architecture**:
Salary details and date logging (`Log Salary`) are strictly governed by an expected salary credit window calculated deterministically by `@budget/engine`'s `getSalaryWindowStatus(month, currentDate)`. The expected credit day defaults to `month.incomeCreditDay` (or Day 1 if unconfigured). The logging window opens exactly 5 days before the expected credit date and remains open for 10 consecutive days through 4 days after the expected date (e.g. for Day 1 salary, opens on Day -5 / preceding month-end and closes after Day 4). Outside this 10-day period:
1. The "Log Salary" header button beside the month dropdown is disabled, rendering a lock icon (`🔒 Log Salary`) with a descriptive tooltip indicating the exact unlock date (`Unlocks on [Date] — 5 days before expected salary credit`) or closure status (`Window closed on [Date]`).
2. Inside `SalarySafelineModal`, a prominent lock banner informs the user of the locked status, and form submission is disabled to prevent out-of-window mutations.
3. Unconfigured Month Exemption: If a month has no configured salary details yet (`!incomeAmount && !salaryBankAccountId`), the window lock is suspended (`isUnconfigured: true`, `isLocked: false`) allowing initial setup anytime; once configured, the 10-day window locking strictly takes effect.
_Avoid_: Arbitrary year-round salary modification, abrupt lockouts without countdown tooltips or lock icons, hardcoded month offsets vulnerable to timezone shifting.








