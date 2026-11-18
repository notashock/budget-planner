# 0069: Held & Lent Money as Pass-Through Transactions

## Context
Users regularly keep someone else's money for a while (a friend's cash, a family member's savings) and give it back later. Others lend their own money and wait to be repaid. The only way to record either was as income on the way in and as an expense on the way out. Both inflated the month's totals: expenses, category shares, the month-end review and the irregular-income metrics, even though the net effect was zero. Held money also showed up in Safe-to-Spend as if it were the user's to spend.

## Decision
1. **Person Fund entity** (`person_funds`): one running record per person with `direction`:
   - `held`: their money is with you; you owe it back.
   - `lent`: your money is with them; they owe it to you.
   The outstanding amount is derived from linked transactions, never stored. `status` flips to `settled` when it nets to zero and nothing is planned, and back to `open` if it changes again.

2. **Four pass-through origins** on the unified `transactions` table, linked by `person_fund_id`:

   | origin | cash | meaning |
   | --- | --- | --- |
   | `held_in` | + account | received money to hold |
   | `held_return` | − account | gave held money back |
   | `lent_out` | − account | lent money |
   | `lent_repaid` | + account | lent money came back |

   Amounts are always positive; the origin carries the direction (the same pattern as transfers). `is_income` is always false. The rows move account balances (ledger, materialised `current_balance`, rollover closing balances) but are excluded from income, expenses, unplanned spend, burn rate, category breakdowns, the month-end review totals and irregular-income metrics.

3. **Held Reserve (ring-fence)**: money held for others today is subtracted in `dailyLimit` like a goal reserve, for the aggregate and per account. Floor-breach and low-point checks run on *own money* (`balance − held that day`), so held cash can never hide a breach. The raw balance curve is unchanged so the chart still matches the bank. A planned `held_return` is shown on the timeline but not counted again as a committed bill.

4. **Lent money is conservative**: lending lowers cash (and therefore Safe-to-Spend). An expected repayment can be planned and shows on the timeline, but never raises today's Safe-to-Spend.

5. **Cross-month continuity**: the server passes `heldOpeningBalance`, `heldOpeningByAccount` and `lentOpeningBalance` (pass-through rows dated before the period started) into the simulation.

6. **Reclassification**: `POST /api/v1/transactions/:id/reclassify` turns an income or expense logged the old way into a pass-through row on a person, keeping the cash direction and the account balance.

7. **Generic creation is guarded**: creating a pass-through row through the generic transaction endpoints requires `personFundId` and is routed through `PersonFundService.addEntry`, which validates direction and refuses a return or repayment above what is outstanding (unless `allowExceed`).

## API
- `GET /api/v1/person-funds?status=&direction=` → `{ funds, totals: { held, lent } }`
- `POST /api/v1/person-funds` `{ personName, direction, note?, expectedSettleDate?, amount?, date?, accountId? }` (optional first entry)
- `GET|PATCH|DELETE /api/v1/person-funds/:id` (delete only when nothing was logged)
- `POST /api/v1/person-funds/:id/entries` `{ flow: 'in'|'out', amount, date?, accountId?, note?, status?, allowExceed? }`
- `POST /api/v1/transactions/:id/reclassify` `{ personFundId }` or `{ personName, direction }`

Simulation output gains `heldReserve`, `heldForOthers`, `lentOutstanding`, `heldByDay`, `passThrough`, `safeVelocity.heldReserve`, per-account `heldForOthers`, and per-day `heldForOthers`. The month-end review gains `passThrough: { heldIn, heldReturned, lentOut, lentRepaid }`.

## Consequences
- Totals and Safe-to-Spend now reflect only the user's own money.
- `lowestBalance` / `floorBreached` describe own money; they equal the old values whenever nothing is held.
- Existing databases get the new table and column on boot: `runMigrations` calls `syncPersonFundsSchema`, and `ensureDatabaseInitialized` adds it when the column is missing (serverless deploys never run `runMigrations`).
- Pass-through rows are not editable through the generic edit form (amount/date changes would bypass direction checks); delete and re-log instead.
