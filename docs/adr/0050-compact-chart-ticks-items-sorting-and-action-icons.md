# ADR 0050: Compact Chart Y-Axis Ticks, Items Screen Sorting, and Action Icons

## Status
Accepted

## Context
1. **Chart Y-Axis Ticks**:
   - Previously, large balance amounts rendered with custom Indian system abbreviations (`L` and `Cr`) or long currency strings that occasionally crowded smaller viewports.
   - The user requested standard compact notation following the pattern: `10, 100, 1000, 10k, 100k, 1m` with the currency symbol preserved (`₹10k`, `₹100k`, `₹1m`).
2. **Items Screen Ordering**:
   - Item cards and logged transaction cards were previously displayed in arbitrary order based on MongoDB retrieval.
   - The user requested cards to be arranged chronologically descending according to the latest date (newest first: Day 31 down to Day 1, with recent transactions at the top).
3. **Card Action Buttons**:
   - On compact item and transaction cards, textual buttons (`"Edit"`, `"Delete"`) consumed excessive horizontal space and looked visually cluttered.
   - The user requested icon-based buttons replacing plain text.

## Decision
1. **Compact Chart Y-Axis Formatting**:
   - `formatChartTick` in `StepLineChart.jsx` calculates major currency units from minor units (`Math.abs(val) / 100`):
     - Values $< 10,000$: full rounded number with currency symbol (e.g. `₹0`, `₹10`, `₹100`, `₹1000`, `₹9500`).
     - Values $10,000$ to $999,999$: formatted with `k` suffix and stripped `.0` (e.g. `₹10k`, `₹50k`, `₹100k`, `₹125.5k`).
     - Values $\ge 1,000,000$: formatted with `m` suffix (e.g. `₹1m`, `₹2.5m`).
     - Negative amounts prepend minus before currency symbol (e.g. `-₹25k`).
2. **Descending Date Sorting**:
   - In `ItemsScreen.jsx`, `getItemDay(item)` resolves effective day (`item.day` for one-time, `item.dayOfMonth ?? item.day` for recurring).
   - Planned items are sorted descending: `(b.day ?? b.dayOfMonth ?? 1) - (a.day ?? a.dayOfMonth ?? 1)`.
   - Logged transactions are sorted descending by ISO timestamp: `new Date(b.date).getTime() - new Date(a.date).getTime()`.
   - In "All" tab:
     - Section 1 ("Active & Pending Budget Items") renders sorted pending items.
     - Section 2 ("Logged Transactions & Paid Items") renders sorted paid items followed by sorted transactions.
   - Other filter tabs (`recurring`, `one-time`, `pending`, `transactions`) render using the sorted arrays.
3. **Action Icon Buttons**:
   - Added `TrashIcon` SVG component to `Icons.jsx`.
   - In `renderItemCard`:
     - Replaced `"Edit"` button text with `<EditIcon size={14} />`.
     - Replaced `"Delete"` button text with `<TrashIcon size={14} />`.
     - Included `title` and `aria-label` attributes for accessibility.
   - In `renderTransactionCard`:
     - Replaced `"Delete"` button text with `<TrashIcon size={14} />`.

## Consequences
- Clean, compact chart labels that never overflow or clip regardless of balance magnitude.
- Intuitive card sequencing on the Items page, making recent and end-of-month budget events immediately accessible.
- Streamlined, high-polish visual cards with sleek icon controls.
