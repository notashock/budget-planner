# 9. Pre-Month Relative Negative Day Offsets and Interactive Timeline

Date: 2026-10-01

## Status

Accepted

## Context

When users logged payments, expenses, or salary credit dates that took place prior to the 1st of the current budget month (for example, logging an item or transaction on September 30th when viewing the October budget), the system previously parsed the day string (`parts[2]`) as an integer and clamped it to the current month. For example, September 30th was treated as Day 30 of October. This caused pre-month transactions to be scheduled at the very end of the month instead of taking effect before Day 1.

Furthermore:
1. Quick log and item modal date inputs defaulted to either the 1st of the month or an arbitrary clamped day, rather than defaulting to the user's actual real-world today.
2. The "What-If" exploration component added unnecessary visual and cognitive weight to the Plan screen and was slated for removal.
3. The timeline lacked bidirectional interactivity: the SVG balance chart was static, tooltips were missing, and the event list lacked filtering and synchronization with the chart.

## Decisions

1. **Default Date Selector to Real-World Today**:
   - Both the Quick-Log spending modal and the Item creation modal strictly initialize their date input to the user's actual current local date (`YYYY-MM-DD`), regardless of which budget month is currently open.

2. **Pre-Month Events as Relative Negative Day Offsets**:
   - When a transaction, item date, fuel log stop, or salary credit date falls prior to Day 1 of the planned month:
     - Compute the day offset relative to the 1st:
       $$\text{offset} = \text{round}\left(\frac{\text{eventDate} - \text{firstOfMonth}}{86,400,000}\right)$$
     - September 30 for an October budget evaluates to `day: -1`; September 29 evaluates to `day: -2`.
   - Update MongoDB `Item` validation schema and item routes to permit negative day values down to `-31`.
   - In `packages/engine`:
     - Sort negative day events chronologically before Day 1.
     - Advance running balance through negative day events before Day 1 begins.
     - Include negative days in `dailyBalances` and plot them on the daily balance chart with negative horizontal tick labels (`-1`, `-2`, etc.) preceding Day 1.

3. **Retirement of What-If Exploration Component**:
   - Remove `<WhatIfBar />` from the Plan screen and eliminate `whatIfOverrides` state and propagation from the web application.

4. **Bidirectional Timeline Interactivity**:
   - **Step Line Chart**: Interactive SVG data points with hover tooltips displaying date, running balance, and delta; clicking a point highlights and scrolls to that day's events in the timeline list; renders a distinct "Today" marker line if today falls in range.
   - **Timeline List**: Filter pills (`All`, `Incomes`, `Planned`, `Actuals`, `Floor Breaches`), a sticky visual "Today" marker, and prominent badge indicators for pre-month events (`Pre-month (Day -1)`).

## Consequences

- Pre-month expenses and salary receipts no longer land on the end of the planned month, reflecting proper initial liquidity.
- Daily balance chart accurately plots the progression from pre-month events into Day 1.
- Clearer, faster logging workflow defaulting to today's date.
- Sleeker Plan screen without What-If clutter, featuring a rich, synchronized, and filterable timeline.
