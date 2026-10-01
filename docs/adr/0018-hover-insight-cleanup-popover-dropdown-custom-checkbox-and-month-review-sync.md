# ADR 0018: Graph Hover Insight Cleanup, Popover Dropdown, Custom Checkbox Styling, and Month Review Sync

## Status
Accepted

## Context
Following user requirements and `/grill-me` alignment:
1. **Graph Hover Insight Text**: The balance graph hover/scrub tooltip displayed "Reserve safe" when the balance remained above the safety floor. The user requested removing the "Reserve safe" text to eliminate visual redundancy, keeping the tooltip focused on numbers and only flagging active "Floor breached" conditions.
2. **Unified Entry Dropdown Optimization**: The planned item match dropdown in `UnifiedEntryModal.jsx` used a standard native select. The user requested an "Interactive Floating Popover: A custom searchable dropdown card matching the header month picker style with instant filter search".
3. **Budget Plan Checkbox Styling**: The "Fixed recurring" checkbox in the budget item creation form used raw browser-native styling without custom checkbox tokens, breaking monochrome visual cohesion.
4. **Month Review Popup Sync & Fixed/Recurring Breakdown**: The Month Review popup container had outdated inline header styling and lacked coverage for recurring and fixed commitments. Synchronizing its container layout with the modern application modal architecture (`modal-drag-handle`, responsive sheet padding, scrollable body) and adding a dedicated "Fixed & Recurring Commitments" section allows full review of both planned baselines and unplanned expenditures.

## Decisions

### 1. Graph Hover Insight Pruning
- In `StepLineChart.jsx`, conditionally render the status indicator line only when `activePoint.balance < safetyFloor` ("Floor breached"). Completely remove "Reserve safe".
- Adjust tooltip box height dynamically (48px for normal safe state, 58px for breach state) to keep the inspection pill compact.

### 2. Interactive Searchable Popover for Unified Entry
- Implement a custom floating popover component in `UnifiedEntryModal.jsx` for matching transactions to planned items.
- Features:
  - Trigger button displaying selected item name, net amount, or "Unexpected spending" default badge.
  - Search input for instantly filtering planned items by name.
  - Distinct categorization for "Unexpected", "One-Time Items", and "Recurring Items".
  - Floating card elevated with standard blur, shadows, and hover item states matching the header month picker.

### 3. Custom Monochrome Checkbox
- Define global CSS rules for `input[type="checkbox"]` in `index.css`:
  - 18x18px rounded square, `border: 1px solid var(--border-strong)`, `background: var(--surface)`.
  - When checked: `background: var(--text)`, `border-color: var(--text)`, displaying a crisp rotated white/dark checkmark glyph.
- Wrap the "Fixed recurring" toggle in a tactile card with clear status cues.

### 4. Month Review Popup Modernization & Fixed/Recurring Section
- Pass `items` and `activeSimulation` into `MonthEndReviewModal.jsx` from `App.jsx`.
- Update modal container with `.modal-drag-handle`, `.modal-header`, and clean close action.
- Add "Fixed & Recurring Commitments" card summarizing:
  - Total committed recurring sum.
  - List of fixed recurring items (rent, subscriptions, EMIs) with rollover status.
  - List of variable recurring items.
- Display alongside unplanned allowance drawdown, category breakdown, and suggested next-month allowance.

### 5. Unified Popover Dropdown Streamlining (Header Removal)
- In `SearchableItemPicker.jsx`, removed uppercase category group headers ("One-Time Items", "Recurring Items") to achieve maximum visual minimalism.
- Replaced separate sections with a single continuous, searchable list showing item name, formatted amount, and compact inline tags (`recurring`, `fixed`).

### 6. Dynamic Survival Cushion Integration in Month Review
- Replaced the static "Unplanned allowance" card in `MonthEndReviewModal.jsx` with the **Dynamic Survival Cushion**:
  - Displays the live free surplus remaining (`simulation.safeVelocity.freeSurplus`) alongside the daily safe velocity spending pace (`simulation.safeVelocity.safeVelocityPerDay`) and pace status (`stable`, `contracting`, `expanding`, `critical`).
  - Displays actual unplanned spending against the survival cushion.
- Replaced the static "Suggested next-month allowance" card with **Suggested next-month survival cushion**, dynamically projected with buffer to safeguard the safety floor and recurring commitments.

## Consequences
- Timeline tooltip is minimal and only sounds alarms when the floor is breached.
- Transaction-to-item matching is searchable, unified across modals, and free of unnecessary group headers.
- Checkboxes match the monochrome palette.
- Month-end review gives a holistic 360° summary of fixed baselines, variable spending, and the dynamic survival cushion.
