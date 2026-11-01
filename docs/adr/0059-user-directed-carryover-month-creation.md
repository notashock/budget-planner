# User-Directed Carryover Month Creation

When a user manually creates a new budget month, the system provides an explicit choice (`carryoverBalance: boolean`) to govern opening cash:

1. When `carryoverBalance: true`: The new month calculates and carries forward the predecessor month's ending cash balance, populating both the global `openingBalance` and per-account `monthAccountOpenings`.
2. When `carryoverBalance: false` (or omitted without explicit opening cash): The new month opens with $0$ starting balance.
3. In both cases, baseline parameters (`incomeAmount`, `safetyFloor`, `salaryAccountId`, `currencySymbol`) are automatically inherited from the nearest predecessor month.

This gives the user complete autonomy over whether each new month starts fresh or continues from previous cash liquidity.
