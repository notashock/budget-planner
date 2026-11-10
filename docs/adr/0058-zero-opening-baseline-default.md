# Zero-Opening Baseline Default for Unconfigured Accounts

When an active bank account or wallet lacks an explicit opening balance entry in `monthAccountOpenings` for a specific budget month, `MonthLifecycle` initializes its simulation opening balance strictly to zero ($0$).

This guarantees that adding accounts mid-month or retroactively viewing older months never destabilizes the established aggregate month opening balance or shifts other account balances.
