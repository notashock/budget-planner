# Automatic Goal Deferral Migration

When recording an expense transaction in `BudgetExecution` that depletes safe cashflow below a purchase goal's feasibility threshold, the goal is automatically rescheduled to the following calendar month with status `'deferred'`.

If the next calendar month record has not yet been instantiated, `BudgetExecution` initializes the succeeding month inheriting baseline parameters (income, floor, currency, accounts) from the current month. This preserves purchase goals across cashflow shocks without manual user intervention.
