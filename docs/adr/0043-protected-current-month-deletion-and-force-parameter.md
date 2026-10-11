# ADR 0043: Protected Current Calendar Month Deletion and Force Override

## Status
Accepted

## Context
During the security audit, two duplicate route declarations for `DELETE /api/months/:year/:month` were identified in `apps/server/src/routes/months.js`:
- Handler 1 (line 137) performed an unconstrained cascade deletion of the month and its associated records.
- Handler 2 (line 868) was dead code containing a strict block preventing deletion of the current calendar month (`year === now.getFullYear() && monthNum === now.getMonth() + 1`).

ADR 0042 had allowed deletion of any month with automatic navigation to the nearest remaining month. However, completely unconstrained deletion of the active calendar month risks catastrophic data loss mid-budget cycle. At the same time, permanently disallowing current month deletion prevents users who made mistake entries from resetting their current operating cycle.

## Decision
1. **Deduplicate Handler**: Remove the shadowed duplicate handler in `apps/server/src/routes/months.js`. Maintain a single, canonical handler for `DELETE /api/months/:year/:month`.
2. **Current Month Protection with Explicit Force**:
   - For past or future months (`year !== now.getFullYear() || monthNum !== (now.getMonth() + 1)`), allow cascade deletion normally.
   - For the active current calendar month, require an explicit query parameter `?force=true`.
   - If a request targets the active current month without `?force=true`, reject with `HTTP 400 Bad Request` and message: `"Deleting the current active month requires explicit confirmation (?force=true)"`.
3. **Cascade Deletion**: When confirmed/forced, cascade delete all items, transactions, transfers, and goals belonging to that month, and purge the `Month` document.
4. **Client-Side UX**: In `Header.jsx`, if the user selects to delete the current calendar month, prompt with an escalated warning dialog explaining that active daily tracking will be deleted, and pass `?force=true` in the API call.

## Consequences
- Prevents accidental one-click deletion of the active operational month while preserving user autonomy to reset it when explicitly confirmed.
- Eliminates the shadowed route vulnerability in the Express router table.
