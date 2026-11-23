# Plan page roadmap: trusted balances, lean API, calm UI, net worth

Source: [research/2026-11-23-plan-ui-panel.md](research/2026-11-23-plan-ui-panel.md) (simulated 100-person panel plus
measured API payloads). The phases here are separate from the numbering in `MOBILE_APP_UPGRADE_PLAN.md`; to
avoid confusion, call them "Roadmap phase N".

Each phase ships as its own PR into `master` and leaves the app working. A phase starts only when the one before it
has merged, except where **Runs alongside** says otherwise.

| Phase | Goal | Size | Depends on |
|---|---|---|---|
| 0 | Ship the balance fixes and clean up bad data | S | none |
| 1 | GET requests stop writing to the database | S | 0 |
| 2 | Server sends only allowed fields (DTO allowlists) | M | 1 |
| 3 | `/summary` and `/timeline` endpoints | M | 2 |
| 4 | Validate the redesign with 5 real people | S | runs alongside 1–3 |
| 5 | Plan page redesign (web) | L | 3, 4 |
| 6 | Net worth, phase 1 | M | 3 (UI needs 5) |
| 7 | Mobile app moves to the new endpoints | L | 3, 5, 6 |
| 8 | Remove deprecated fields and duplicates | S | 7 plus minimum app version |
| 9 | Net worth, phase 2 (investments and loans) | M | 6 |

---

## Phase 0: ship the balance fixes and clean up bad data

**Why:** wrong balances were the trust problem the panel ranked highest (A2: 9 of the 10 people aged 55+ would
leave over it). The code fix is already done and tested locally.

**Scope**
- Commit the three fixes already made:
  - pills and the Accounts page use the ledger balance (`apps/web/src/utils/liveBalance.js`)
  - no more ₹0 month openings (`apps/server/src/services/accountMigration.js`)
  - the irregular view uses ledger balances (`packages/engine/src/incomeEngine.js` and its test)
- One-off repair script `apps/server/src/scripts/repair_zero_month_openings.js`. It resets each ₹0 opening row
  the backfill wrote to the ledger balance at the month's start. Rows are updated, not deleted, because with no
  row the forecast falls back to the creation-time opening. Genuine zeros are left alone. It runs as a dry run by
  default; `--apply` writes a JSON backup first, and `--user-id=` limits it to one user.
- Rename the hero's "Where today's balance goes" to "After today's bills" so it no longer looks like it contradicts
  the pills.

**Done when**
- Pills, the Accounts page and the irregular view show the same number as `accounts.current_balance`.
- After the cleanup, no month has a zero opening that hides a non-zero account opening balance.
- Web (261), engine (154) and server tests pass. The server tests run on the throwaway Postgres (port 54329), not
  the dev database.

**Risk:** the repair changes stored balances. Run the dry run against production, check the list, then use
`--apply`, which writes the backup before it changes anything.

---

## Phase 1: GET requests stop writing to the database

**Status:** done, see the PR for `fix/no-writes-on-read-phase1`.

**Why:** this is how the ₹0 bug got in. Reads were writing in four places:

- month detail ran `backfillUnassignedTransactions` and saved a default `months.salaryAccountId`
- the month transactions list and the all-transactions list each ran the same backfill
- `attachAccountOpeningsToMonth` (every month read) re-saved months it decided were wrongly closed

The backfill also counted a transaction on an *archived* account as unassigned. So every month view moved an
archived account's history onto the primary bank, without recomputing that bank's stored balance.

**What changed**
- All four writes are removed from reads. The salary-account default and the "not really closed" correction are
  applied only to the response. The stored flag is still fixed at startup by `healPrematurelyClosedMonths`.
- The backfill now leaves archived accounts' rows alone and recomputes the ledger balance of the account it fills.
  It still runs when a bank account is created (`accountService.js`). New rows never need it, because every create
  path defaults to the primary account.
- One-time script `apps/server/src/scripts/backfill_unassigned_accounts.js` (dry run by default, `--apply`) for
  legacy rows. It found none in the dev data.
- A month with no stored opening for an account now starts that account at its ledger balance on the month's first
  day (`LedgerService.balancesAtMonthStart`). Before, it started from the account's creation-time opening. With a
  ₹10 October bill, "After today's bills" now reads ₹325 (₹355 ledger − ₹30 due today) instead of ₹335.
- `migration-status` needed no change: it was already read-only and is checked once per app load.

**Done when** (met)
- `test/reads_do_not_write.test.js`: month detail and both transaction lists leave every stored row and its
  `updated_at` unchanged, a month with no stored opening uses the ledger, and the backfill keeps archived history.
  All three tests fail on the Phase 0 code and pass now.

---

## Phase 2: server sends only allowed fields (done)

**Why:** the generic `serialize()` in `apps/server/src/utils/serializer.js` sends every database column plus
aliases. Anything added to the database leaks to clients automatically.

**What changed**
- One edge filter instead of per-resource DTO functions: `serialize()` has 115 call sites, so
  `apps/server/src/utils/publicFields.js` strips fields once in the response envelope, at any depth.
- Never sent: `userId`, `passwordHash`, `createdAt`, `updatedAt`, `heldByDay`, `itemNetMap`, `originalDate`,
  `username`. No web or mobile code reads them (mobile's only `createdAt` is its local outbox).
- Simulation duplicates removed: `accountDailyBalances` (same curves as `accountSimulations[id].dailyBalances`),
  `accountSummaries` (same as `simulation.accounts`, which the mobile app reads, so the map is the one kept) and
  `intradayEvents` (the chart takes a day's events from `simulation.events`). The Plan page reads the kept copies.
- Month detail for the dev month: 106 KB → 39 KB.
- Mobile fixtures keep their recorded data with only the removed keys deleted (plus `simulation.allEvents` and
  `simulation.accountSimulations`, which #16 stopped sending). The old fixtures were checked against the live API
  with only the removed keys ignored, and every other field was still served. All 206 Flutter tests pass on them.

**Done when** (met)
- `test/public_contract.test.js`: no removed field appears at any depth in auth, accounts, month detail or either
  transaction list, and the account, transaction, user and month key sets are pinned, so a new column fails CI
  until it is added on purpose.
- `mobile_contract_fixtures.test.js` and `api_v1_parity.test.js` pass.

**Left for later**
- Aliases the web still reads (`_id`, `bankAccountId`, `tag`, `dayOfMonth`, `originalDay`, `todaysBalance`) stay
  until the web moves to canonical names (Phase 8).
- Full events copied into `days[].events` stay: the installed APK reads them (Phase 7).
- Null fields are still sent, because some web code checks `=== null`.

---

## Phase 3: `/summary` and `/timeline` endpoints

**Why:** the new Plan page needs a handful of numbers first and the chart only on demand.

**Scope**
- `GET /api/v1/periods/:y/:m/summary` returns:
  - safe to spend today and days left
  - verdict (on track / tight / over)
  - per-account ledger balance and minimum
  - the next 3 due items
  - the net worth fields from Phase 6 (empty until then)
- `GET /api/v1/periods/:y/:m/timeline?accountId=` returns one daily curve, the events, and the lowest point for
  one account or all of them.
- Leave the old month detail endpoint in place with a `Deprecation` header (follow the existing
  `deprecation_notice.test.js` pattern).
- Document both in `docs/api-v1-migration.md`.

**Done when**
- `/summary` is under 2 KB for the seeded month, and its numbers match the old endpoint for the same month.
- `/timeline` for one account carries only that account's data.

---

## Phase 4: validate the redesign with 5 real people

**Runs alongside phases 1–3.** The panel was simulated, so this is the reality check before building the UI.

**Scope**
- A clickable mock (static HTML) of the redesigned Plan page from the panel report.
- 5 people from different segments (rushed salaried, 55+, student, freelancer, power user). Give each 3 tasks:
  - "Can you spend ₹500 today?"
  - "What's due this week?"
  - "What's in HDFC right now?"
- Record time to answer and any wrong answers.

**Done when:** each task is answered correctly in under 10 seconds by at least 4 of the 5 people. If not, change
the mock before Phase 5.

---

## Phase 5: Plan page redesign (web)

**Why:** 352 words above the fold today. The panel's top removal requests were R1 (74 votes), R2 (61) and R3 (58).

**Scope**
- Top of the page:
  - **Safe to spend today**: one large number, one caption line, a sparkline. Tapping it opens the full chart,
    which loads from `/timeline`.
  - **Due soon**: 3 rows with tap-to-mark-paid.
  - Space for a net worth row (filled in by Phase 6).
- Move one tap deeper (no longer inline):
  - the 4 stat tiles
  - the day inspector
  - the chart legend and the keyboard hint
  - the timeline filter chips (move to Transactions)
  - category breakdown (move to Transactions → Spending)
  - allowance pace
- Remove:
  - the explanation paragraph in the hero
  - the duplicate "On track" badge in the header
  - the duplicate desktop "New Entry" button (the floating + stays)
- Style:
  - 3 text sizes per screen
  - whole currency on summary screens
  - colour only for status (green, amber, red)
  - plain labels: "Keep at least" instead of "safety floor", "Left after bills" instead of "headroom"

**Done when**
- Under 60 visible words above the fold on a 375px phone and at 1280px desktop.
- No number appears twice on the screen.
- The Phase 4 tasks still pass with the built page.
- Web tests are updated, and an accessibility check passes (contrast, focus order, screen-reader labels on amounts).

---

## Phase 6: net worth, phase 1

**Why:** the most-requested addition (A1, 71 votes).

**Formula (computed on the server, returned by `/summary`)**

```
netWorth = Σ bank and wallet ledger balances
         + money others owe you (Lent)
         − credit card outstanding
         − money you hold for others (Held)
```

**Scope**
- Engine function `getNetWorth({ accounts, cards, personFunds })` with unit tests.
- Snapshot the month-end net worth when a month closes, so the "↑ ₹X this month" trend needs no recomputation.
- UI:
  - one row on Plan: "Net worth ₹X ↑ ₹Y this month ›"
  - a full section on Accounts: the breakdown, and a 12-month trend once snapshots exist

**Done when**
- Engine tests cover each input on its own and a mix of all of them, including negative net worth and a card with
  no bill yet.
- The number equals the hand-calculated value for the seeded test account.

---

## Phase 7: mobile app moves to the new endpoints

**Scope**
- The Flutter app reads `/summary` and `/timeline` and canonical field names, and gets the Phase 5 layout and the
  Phase 6 net worth row.
- Test on a USB phone or emulator, as for every mobile change from mobile Phase 3 onwards.
- Raise the minimum supported app version once this release is out.

**Done when:** the new APK works against a server with the old fields removed (test this on a branch).

---

## Phase 8: remove deprecated fields and duplicates

**Starts only when** the minimum supported mobile version is the Phase 7 release.

**Scope**
- Delete the `LEGACY_ALIASES` block:
  - `_id`, `bankAccountId` / `walletId`, `todaysBalance`, `dayOfMonth`, `tag` / `label` / `description`
  - `days` / `dailyBalances` (keep one), `accountDailyBalances`
- Remove the old month detail endpoint, or slim it down to `/summary` plus `/timeline`.
- Update the contract fixtures.

**Done when:** a typical month's payload, measured on the seeded month, is about 80% smaller than today's
(target ≤ 21 KB, against 106 KB now).

---

## Phase 9: net worth, phase 2 (investments and loans)

**Why:** 61 of the 71 people who asked for net worth said it "isn't really my net worth" without these.

**Scope**
- New account types `investment` and `loan`, each with a value you update by hand and the date you last updated it.
- Both are left out of Safe to spend and the cash balances, and only count toward net worth.
- If a value is more than 30 days old, ask the user to update it.

**Done when:** net worth includes them, and Safe to spend gives the same number with or without them.

---

## Not in this roadmap (from the panel, lower priority)

- Pull-to-refresh and "Updated 2 min ago" (A5, 23 votes): add during Phase 5 if it's cheap.
- A card bill reminder on the home screen (A6, 19 votes): consider it after Phase 6.
- The `/cards` and `/person-funds` double fetch: check it against a production build first; it is probably React
  StrictMode in dev only.
