# Strict Priority Goal Reservation

When evaluating multiple active purchase goals competing for cashflow surplus, `BudgetExecution` allocates funds in strict priority order (lowest numerical rank first, ties broken by creation date).

If a higher-priority goal cannot achieve feasibility in the current month, smaller lower-priority goals may not skip ahead to reserve funds. This guarantees that user-prioritized financial milestones are never cannibalized by secondary or trivial purchases.
