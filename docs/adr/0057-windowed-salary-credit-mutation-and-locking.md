# Windowed Salary Credit Mutation and Locking

When salary is credited for a budget month, repeat submissions or edits to the credited salary amount and date are permitted only while the current date is within the active 10-day salary credit window calculated by `@budget/engine`'s `getSalaryWindowStatus`.

Within the open window, repeat calls atomically update the existing salary transaction rather than creating duplicate transactions. Once the window closes, the month's salary credit and transaction become permanently locked to protect historical budget baselines against accidental mutations.
