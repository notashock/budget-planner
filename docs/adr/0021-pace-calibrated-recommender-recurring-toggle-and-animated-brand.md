# ADR 0021: Pace-Calibrated Payment Date Recommender, Recurring Payment Toggle, and Animated Brand Logo

## Status
Accepted

## Context
1. **Purchase Date Recommender Fine-Tuning**:
   - The original purchase date recommendation algorithm always tended to recommend the very end of the month (e.g. Day 28, 30, or 31). This occurred because running balances evaluated from candidate date $d$ to month-end naturally showed fewer remaining debits as $d$ increased, and tie-breaking prioritized later dates (`b.day - a.day`).
   - In practice, users do not want to artificially defer purchases to month-end when their cash balance and empirical spending pace safely support an earlier purchase.
   - The recommender needed to be calibrated to evaluate spending velocity (burn pace), available cash balance on day $d$, and safety floor buffer, returning the **earliest safe date** once heavy bills have cleared and cash surplus comfortably absorbs the remaining month's burn pace.
2. **Payment Done Placement and Blank/Auto Date Behavior**:
   - In item creation and editing modals (`ItemModal` and `UnifiedEntryModal`), the "Payment Done" control was a large central block. Moving it to the left corner of the footer aligns with standard modal ergonomics (Cancel / Save on the right, status toggle on the left).
   - The default mode should be "not done" (`isPaid: false`). When payment is not done, the date field should either be left blank or allow the user to click "⚡ Recommend best date". If left blank upon save, the application automatically computes and assigns the safest date.
3. **Monthly Reset of Recurring Payment Status**:
   - Recurring bills repeat every calendar month. When a new month is created or rolled over, each recurring item must have its payment status reset to `isPaid: false` (pending), ensuring the user tracks payments fresh each cycle.
   - On the recurring payment card in the Items screen, users need a prominent 1-tap toggle switch to quickly confirm payment without opening an edit modal.
4. **Animated Brand Identity**:
   - The application header lacked a distinct visual emblem. An animated monochrome SVG logo blending a dynamic running balance spline curve with a live pulsing balance node and safety floor baseline provides a sleek, modern visual anchor.

## Decisions

### 1. Pace-Calibrated Purchase Date Recommendation Pipeline
- In `packages/engine/src/recommender.js`:
  - Computed remaining days $daysRemaining = daysInMonth - d$ and expected discretionary burn $burnRemaining = effectiveBurnRate \times daysRemaining$.
  - Evaluated $paceBuffer = buffer - burnRemaining$.
  - Checked that the running balance on day $d$ itself safely satisfies $balanceOnDay - cost \ge safetyFloor$.
  - For candidate days where $paceBuffer \ge 0$ (meaning liquid reserves safely cover both the purchase and the user's expected daily burn rate through month-end), sorted candidates by **ascending day** (`a.day - b.day`).
  - This immediately selects the earliest viable safe date (e.g. Day 15 immediately after rent clears, instead of Day 31).

### 2. Ergonomic Modal Footers and Flexible Date Scheduling
- In `apps/web/src/components/ItemModal.jsx` and `apps/web/src/components/UnifiedEntryModal.jsx`:
  - Default state initialized to `isPaid: false` and date blank (`''`).
  - Provided an interactive `⚡ Recommend best date` button beside the date input.
  - When saving with date left blank while unpaid, automatically invokes `api.recommendPurchaseDate` to assign the best calculated date.
  - Placed the Payment Done toggle on the bottom-left corner of the modal footer, mirroring Cancel and Save on the right.

### 3. Month-Scoped Recurring Reset and Card Toggle
- In `apps/server/src/routes/months.js`:
  - Fixed recurring items copied during rollover are explicitly saved with `isPaid: false`.
- In `apps/web/src/screens/ItemsScreen.jsx`:
  - Embedded a dedicated `.recurring-toggle-switch` directly on recurring item cards with smooth CSS sliding transitions.

### 4. Animated Balance Spline & Pulse Node Logo
- Created `apps/web/src/components/AnimatedLogo.jsx` and added keyframe animations in `apps/web/src/index.css`:
  - SVG mark featuring an outer rounded frame, dashed safety floor axis line, cubic bezier running balance curve (`logoSplineFlow`), concentric glowing aura (`logoPulseWave`), and core balance node.
  - Integrated into `apps/web/src/components/Header.jsx` beside the brand title.

## Consequences
- Recommendations reflect real spending pace and earliest safe feasibility rather than forcing end-of-month delays.
- Recurring expenses reset each month and can be marked paid with a single tap on the card.
- Modal scheduling is intuitive, forgiving, and intelligent.
- The application identity is elevated by a cohesive animated logo.
