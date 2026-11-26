# API v1 migration

The web client (`apps/web/src/api.js`) and the mobile app
(`apps/mobile/lib/services/api_service.dart`) call `/api/v1` for every resource
that has a v1 route. The legacy routes stay mounted for installed mobile builds
that predate the switch. Each hit on a legacy route logs one line,
`[deprecated] METHOD /path (use /api/v1)`, and the response gets a
`Deprecation: true` header (`apps/server/src/middleware/deprecation.js`).

`apps/mobile/test/api_service_v1_test.dart` pins every mobile call to its method
and v1 path. Moving the mobile app also fixed three calls that failed against
the legacy routes: pay and cancel used POST where legacy only accepts PATCH, and
"convert goal" called `/api/goals/:id/convert-to-transaction`, which never
existed (it now calls `POST /api/v1/goals/:id/schedule`).

## How parity is kept

Legacy and v1 routes run the same code:

- Accounts: `domain/accountService.js` (create, update, archive, list)
- Transfers: `domain/transferService.js`
- Months, transactions, goals, reports: the handler objects exported from
  `routes/months.js`, `routes/transactions.js` and `routes/goals.js`, mounted
  by both the legacy routers and `routes/v1/*`.

`apps/server/test/api_v1_parity.test.js` runs one scenario through both
surfaces with two fresh users and checks that every step returns the same
status and payload (ids and timestamps normalized).

All responses, legacy included, use the `{ status, data, metadata, timestamp }`
envelope. `request()` in `api.js` unwraps it.

## Route map

| Legacy | v1 |
| --- | --- |
| `GET /api/bank-accounts` | `GET /api/v1/accounts?type=bank` |
| `GET /api/bank-accounts/all` | `GET /api/v1/accounts` |
| `GET /api/wallets` | `GET /api/v1/accounts?type=wallet` |
| `POST /api/bank-accounts`, `POST /api/wallets` | `POST /api/v1/accounts` (`type`: bank, wallet, cash) |
| `PUT /api/bank-accounts/:id`, `PUT /api/wallets/:id` | `PATCH /api/v1/accounts/:id` |
| `DELETE /api/bank-accounts/:id`, `DELETE /api/wallets/:id` | `DELETE /api/v1/accounts/:id` (returns the account, not `{ message, account }`) |
| `GET /api/bank-accounts/migration-status`, `POST .../migrate` | `GET /api/v1/accounts/migration-status`, `POST .../migrate` |
| `/api/months` (list, create) | `/api/v1/periods` |
| `GET/PUT/DELETE /api/months/:y/:m` | `GET/PATCH/DELETE /api/v1/periods/:y/:m` |
| `POST /api/months/:y/:m/{credit-salary,rollover,recommend-purchase-date}` | `POST /api/v1/periods/:y/:m/{...}` |
| `/api/months/:y/:m/{transactions,month-end-review,goals}` | `/api/v1/periods/:y/:m/{...}` |
| `GET/POST /api/transactions` | `GET/POST /api/v1/transactions` |
| `PUT /api/transactions/:id` | `PATCH /api/v1/transactions/:id` |
| `PATCH /api/transactions/:id/{pay,cancel}` | `POST /api/v1/transactions/:id/{pay,cancel}` |
| `GET /api/reports/irregular` | `GET /api/v1/reports/irregular` |
| `PUT /api/goals/:id` | `PATCH /api/v1/goals/:id` |
| `POST /api/goals/:id/{schedule,defer,reactivate}`, `DELETE /api/goals/:id` | same under `/api/v1/goals/:id` |
| `/api/transfers` | `/api/v1/transfers` (`PUT` becomes `PATCH`; `DELETE` returns the transfer) |
| (new, v1 only) | `/api/v1/cards` (list, get) and `POST /api/v1/cards/statements/:id/{confirm,pay}`; cards are created through `/api/v1/accounts` with `type: 'credit_card'`, see ADR 0070 |
| (new, v1 only) | `/api/v1/person-funds` (list, create, get, `PATCH`, `DELETE`, `POST /:id/entries`) and `POST /api/v1/transactions/:id/reclassify`, see ADR 0069 |
| (new, v1 only) | `GET /api/v1/periods/:y/:m/summary` and `GET /api/v1/periods/:y/:m/timeline?accountId=`, see below |

## Plan page views: `summary` and `timeline`

Both are cut from the month detail (`apps/server/src/domain/monthViews.js`), so their numbers always match it. They
use canonical names only: no `_id`, `bankAccountId`, `dayOfMonth` or other aliases.

`GET /api/v1/periods/:y/:m/summary` (about 1.5 KB):

| Field | Meaning |
| --- | --- |
| `safeToSpendToday`, `daysLeft` | `simulation.safeToSpendPerDay`, `simulation.daysLeft` |
| `verdict` | `{ key: good \| tight \| critical, label }`, from the engine's `getUnifiedVerdict` |
| `afterTodaysBills` | `simulation.todayBalance`: all cash accounts after today's unpaid bills |
| `lowest` | `{ balance, date }` of the upcoming low point |
| `safetyFloor` | the month's floor |
| `accounts[]` | `{ id, name, type, balance, minimumBalance }` for active banks and wallets. `balance` is the ledger balance in the current month and the simulated balance in other months |
| `nextDue[]` | up to 3 planned transactions from today on: `{ id, name, amount, date, accountId, isIncome }` |
| `netWorth` | `null` until roadmap phase 6 |

`GET /api/v1/periods/:y/:m/timeline` returns `{ accountId, dailyBalances[{ day, date, balance }], events[], lowest,
safetyFloor }` for all accounts. With `?accountId=` it returns that account's curve, only the events that touch it
(each `balanceAfter` is that account's balance), its lowest point and its minimum balance. An account not in the
month is a 404.

The month detail stays as it is: the web and the installed mobile app still load it. It gets a `Deprecation` header
only once both clients have moved off it.

## Client calls not on v1 yet

| Endpoint | Why |
| --- | --- |
| `/api/auth/*` | No v1 auth router. Auth was just reworked (stateless cookie/Bearer token); moving it is a separate change. |
| `/api/settings` | No v1 counterpart. |
| `/api/salary-templates` | No v1 counterpart. |
| `/api/ai/*` | No v1 counterpart; the feature is gated by a settings toggle. |

These routes are not "legacy" in the sense above (there is nothing to move to),
so they are not logged as deprecated.

## Behaviour changes on the shared path

Because legacy and v1 now share one implementation, a few legacy behaviours changed:

- A new account's `currentBalance` starts at its opening balance (legacy left it
  at 0, so the first posted transaction made the ledger balance wrong). Changing
  an account's opening balance recomputes `currentBalance` from the ledger.
- Making an account primary demotes the previous primary of the same type (the
  legacy bank route always demoted bank accounts, even when editing a cash account).
- Only a bank account is auto-promoted to primary and adopts unassigned
  transactions on creation (the legacy route could do this for a wallet).
- Transfers move `currentBalance` on create and reverse it on delete (legacy only
  adjusted it on update). The v1 `POST /api/v1/accounts/transfers` route now checks
  that both accounts belong to the caller (it did not before).
- A transfer belongs to the period whose date range covers it (periods follow the
  salary cycle); a transfer outside every period is period-free instead of a 404,
  and closed review periods reject transfers.
- `GET /api/v1/periods/:y/:m` returns the legacy month detail, including the
  backfill of unassigned transactions to the primary account.
- Validation errors from account and transfer routes use code `VALIDATION_ERROR`
  (was `BAD_REQUEST`); messages are unchanged.
- Removed `POST /api/v1/periods/:y/:m/close`: it called a `MonthLifecycle.closeMonth`
  that does not exist, so it always returned 500.

## Next step

Both clients are on `/api/v1`. Once the updated mobile build has rolled out and
the deprecation log shows no more legacy hits, remove the legacy routers.
