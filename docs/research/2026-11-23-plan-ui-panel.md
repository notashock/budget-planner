# Plan UI: 100-person simulated panel

Date: 2026-11-23 · Build: `master` (9e6ee5a) + the balance fix in this change · Reference: Apple Human Interface Guidelines

> **This is a simulated panel, not real user research.** I wrote 100 personas, walked each through the
> screens captured from the running app (desktop 1280px and phone 375px, a seeded month with 2 accounts and
> 5 entries), and tallied their reactions. Treat the numbers as a way to rank ideas. Check the top
> items with 5 real people before building them.

## Who was on the panel

| Segment | n | What they open the app for |
|---|---|---|
| Salaried, short on time (commute check, 10 s) | 30 | "Can I spend today?" |
| Families / shared expenses | 15 | Bills due, who paid what |
| Students and first jobbers | 15 | Not running out before payday |
| Freelancers / irregular income | 12 | How long the money lasts |
| 55+, low confidence with apps | 10 | Is my balance right? |
| Finance power users (spreadsheet people) | 10 | Net worth, trends, exports |
| Credit card heavy users | 8 | What do I owe, when |

## What they saw (measured, not simulated)

- **352 visible words** on the Plan page before you scroll past the timeline. Apple's Wallet and Stocks home screens show under 40.
- **The same number appears 3 times.** The lowest balance shows in the hero sentence, the "Lowest balance" tile and the chart label. "On track" shows in the header and again in the hero.
- **16 labelled numbers above the fold**, in 3 formats (`₹25`, `₹30.00`, `-₹215`).
- **Jargon in the first screen:** *safety floor, headroom, projected net, unplanned allowance, pace, settled, below minimum*.
- **The balance numbers disagreed with each other** (see "Bug fixed" below).

## Top findings (share of panel that raised it)

### Remove or hide (82% said "too much")

| # | Finding | Votes |
|---|---|---|
| R1 | The hero paragraph ("After ₹30.00 of upcoming bills, your ₹100.00 safety floor, spread over 8 days…"). People want one number and a single short line. | 74 |
| R2 | The 4 stat tiles (Monthly income, Total expenses, Projected net, Lowest balance) repeat the hero and chart. | 61 |
| R3 | Day inspector (5 boxes under the chart: closing, change, money in/out, room above floor). Power users like it. Everyone else skips it. | 58 |
| R4 | The timeline legend (6 symbols) and the "Hover, tap or use the arrow keys" hint. | 52 |
| R5 | Timeline filter chips (All, Income, Planned, Pending, Paid, Below minimum) on the home screen. Move them to Transactions. | 47 |
| R6 | Two-decimal amounts (`₹30.00`) everywhere. Show whole rupees and keep paise for the transaction detail view. | 44 |
| R7 | The "On track" badge in the header duplicates the hero. | 31 |

### Add (missing)

| # | Finding | Votes |
|---|---|---|
| A1 | **Net worth**: one number for what you own minus what you owe, with a monthly trend. Power users and freelancers asked first, families second. | 71 |
| A2 | **A balance you can trust at a glance.** Pills must match the bank app. 38 of 100 noticed a pill that didn't match Accounts or the hero, and 9 of the 10 people aged 55+ said they would stop using the app over it. | 66 |
| A3 | A **"Due soon"** list as the second thing on screen: 3 rows, swipe or tap to mark paid. "Next 7 days" exists but sits too far down. | 57 |
| A4 | Plain-language labels: "Safe to spend today", "Keep at least", "Left after bills". | 49 |
| A5 | Pull-to-refresh / "Updated 2 min ago" so people know the number is fresh. | 23 |
| A6 | Credit card "You owe ₹X, due on the 5th" on the home screen when a bill is within 7 days. | 19 |

### Keep (people defended it)

- The **Safe to spend / day** number (88 liked it). It is the app's best idea, so give it the whole top of the screen.
- The **daily balance chart** shape (64). Simplify it, don't delete it.
- **Account pills** as a filter (59). They work once the numbers are right.

## Where the panel disagreed

- **Chart vs no chart.** Rushed users wanted it collapsed behind a tap. Power users and freelancers wanted it visible. *Proposal:* show a small 60px sparkline in the hero that expands into the full chart when tapped (the Stocks pattern).
- **Net worth on the Plan page or the Accounts page?** 41 wanted it on Plan and 30 on Accounts. The rest didn't mind. *Proposal:* one quiet line on Plan ("Net worth ₹X ↑") that links to a full Net worth section on Accounts.
- **Category breakdown.** Families wanted it. Students ignored it. Move it to a "Spending" section on Transactions.

## Apple-style redesign of the Plan page (proposal)

HIG principles it applies: **clarity** (one job per screen), **deference** (content over chrome), **depth** (detail one tap away, never inline).

```
┌───────────────────────────────────────────┐
│ Plan                          November ▾  │  ← Large title, month as menu
│ [All ₹365] [HDFC ₹350] [Paytm ₹15]        │  ← pills = ledger balance
│                                           │
│   ₹25                                     │  ← Safe to spend today (one number,
│   safe to spend today · 8 days left       │     ~56pt, one caption line)
│   ▁▂▃▃▂▂▁  ← sparkline, tap = full chart  │
│                                           │
│ Due soon                                  │  ← inset grouped list
│   SIP            Today        ₹30   ○     │     tap circle = mark paid
│   Electricity    Overdue      ₹20   ○     │
│   Internet       Sat 28       ₹10   ○     │
│                                           │
│ Net worth  ₹365  ↑ ₹0 this month        › │  ← one row, opens Accounts
└───────────────────────────────────────────┘
```

Everything else (income/expense tiles, day inspector, category split, allowance pace, timeline) goes **one tap
deeper**: into the expanded chart, the Transactions tab, or a "Details" sheet.

Type and colour rules:
- 3 text sizes per screen: Large Title, Body, Caption.
- Colour only for meaning: green = fine, amber = close to the limit, red = over it. No coloured tile icons.
- Whole currency on summary screens. Tabular figures for every amount.
- One primary action per screen (the floating **+**). Remove the duplicate "New Entry" button on desktop.

## Net worth: definition the panel agreed on

```
Net worth = bank + wallet balances (ledger)
          + money others owe you (Lent)
          − credit card outstanding
          − money you hold for others (Held)
          [+ investments and − loans, once those account types exist]
```

Every input except investments and loans is already stored. Phase 1 needs no schema change. Phase 2 adds
`investment` and `loan` account types with a value you update by hand. Without them, 61 of the 71 who asked
said the number "isn't really my net worth".

## Bug fixed in this change: account balances showed false numbers

Three separate causes, all fixed:

1. **Pills used the simulator's projection, not the ledger.** The simulator's "today" point subtracts *unpaid* bills
   planned for today, so HDFC showed ₹320 while the bank held ₹350. Pills and the Accounts page now use the
   ledger balance (`currentBalance`) for the current month (`apps/web/src/utils/liveBalance.js`).
2. **Opening balances got overwritten with ₹0.** Opening any month ran a backfill that wrote a ₹0 per-month opening
   when none existed. That zero replaced the account's real opening, so the whole Plan page (hero, chart,
   lowest point) started the month from nothing and went negative
   (`apps/server/src/services/accountMigration.js`).
3. **The irregular-income view added up opening balances.** It replayed only the loaded transactions (or none), so
   "All accounts" showed the opening total (₹520 instead of ₹365). For "now" it uses ledger balances
   (`packages/engine/src/incomeEngine.js`, with a test).

Still open: the hero's "Where today's balance goes ₹335" is still the projection, so today's unpaid SIP is
already subtracted. That keeps the safe-to-spend maths consistent, but it no longer matches the pills (₹365).
Recommendation: label it "After today's bills". Months that already have a wrong ₹0 opening stored need a
one-off cleanup.

---

# Data contract: send only what the screen needs

Measured on the running app with the same seeded month (2 accounts, 5 transactions). Every number below
comes from the real responses, not an estimate.

## What one Plan page load costs

| Call | Bytes | Note |
|---|---|---|
| `GET /api/v1/periods/2026/11` | **105,907** | 78% of it is `simulation` (82 KB) |
| `GET /api/v1/periods/2026/11/transactions` | 7,684 | for 5 rows |
| `GET /api/v1/accounts` | 1,336 | also embedded in the period response |
| `GET /api/auth/me` | 670 | also embeds the whole settings object |
| `GET /api/v1/periods`, `/goals`, `/migration-status` | ~950 | `migration-status` runs on every load |

**~116 KB for five transactions.** Event data is copied into several places, so the size grows with
transactions × accounts. A real month with 100 entries and 4 accounts will be in the megabytes on a phone
connection.

## Duplicates sent in the same response (verified byte-for-byte)

| Duplicate | Bytes wasted | Who reads it |
|---|---|---|
| ~~`simulation.allEvents` is identical to `simulation.events`~~ (removed on `master` in #16) | 7,172 | mobile reads `allEvents`, falls back to `events` |
| ~~`simulation.accountSimulations` is identical to top-level `accountSimulations`~~ (removed on `master` in #16) | 17,224 | nobody reads the nested copy |
| `simulation.accounts` (map) is the same as `simulation.accountSummaries` (array) | 2,005 | web reads `accountSummaries` |
| `simulation.accountDailyBalances[id]` is identical to `accountSimulations[id].dailyBalances` (not for `unassigned`) | 19,643 | web, as a fallback only |
| Full event objects copied into every day point (`intradayEvents`, `days[].events`) across 4 curves | 21,443 | web chart tooltip, mobile day list |
| `simulation.days` and `simulation.dailyBalances`: the same days, two shapes | 4,376 | mobile `days`, web `dailyBalances` |
| `bankAccounts`, `wallets`, `creditCards` in the period response, already loaded from `/accounts` and `/cards` | 705 | both |
| `settings` inside `/auth/me` and again from `/api/settings` | ~400 | both |

## Fields that should never leave the server

These come from the generic `serialize()` in `apps/server/src/utils/serializer.js`. It sends **every database
column** plus compatibility aliases. There is no per-endpoint allowlist.

- **Alias fields on every row:** `_id` (copy of `id`), `bankAccountId` / `walletId` (copies of `accountId`),
  `todaysBalance` (copy of `todayBalance`), `dayOfMonth` (copy of `day`), and `tag` / `label` / `description`
  (copies of `category` / `name`). Each simulation event also has 3 id fields for each of source and
  destination. They cost 8.2 KB here.
- **Internal or legacy columns:** `userId` on every row (the caller already knows who they are), `legacyItemId`,
  `originalDay` / `originalDate`, `derivedStatus` (duplicates `status`), `createdAt` / `updatedAt` on accounts
  and settings, and `heldByDay` / `itemNetMap` (no client reads them).
- **Null and default fields:** 172 of the 296 fields on events are `null`, `false`, `0` or `{}` (4.4 KB).

## Behaviour found along the way

- **Reads that write.** `GET /periods/:y/:m` and the per-load `migration-status` check both run
  `backfillUnassignedTransactions`, which writes to the database. That's how the ₹0 opening-balance bug got in.
  A GET should never write. Move the backfill to a one-time migration.
- `/cards` and `/person-funds` load twice when you open Accounts. This is most likely React StrictMode in dev,
  so check it against a production build before fixing anything.

## Result if all of the above is applied

**105,812 → 20,653 bytes (−80%)** for the period response, measured by applying each step to the real payload.
These numbers were measured before #16 landed on `master`; that PR has already removed the `allEvents` and nested
`accountSimulations` copies (24.4 KB of the total).

| Step | Saves |
|---|---|
| Day points reference events by index instead of copying them | 21.4 KB |
| Drop `accountDailyBalances` (keep it inside `accountSimulations`, plus `unassigned`) | 19.6 KB |
| Drop the nested `simulation.accountSimulations` | 17.2 KB |
| Drop alias fields | 8.2 KB |
| Drop `allEvents` | 7.2 KB |
| Omit null/empty fields | 4.4 KB |
| One day list instead of `days` + `dailyBalances` | 4.4 KB |
| Drop the `accounts` map, embedded accounts and cards | 2.7 KB |

## Encapsulation design

1. **One DTO function per resource on the server** (`toAccountDTO`, `toTransactionDTO`, `toPlanSummaryDTO`).
   Each is an **allowlist** of fields, so a new database column stays private until someone adds it on purpose.
   They replace the generic `serialize()` spread.
2. **Split the period response by what the screen shows.** This matches the redesign above, where the chart moves
   one tap deeper:
   - `GET /periods/:y/:m/summary`: hero, pills, due soon and net worth. A few hundred bytes, loads first.
   - `GET /periods/:y/:m/timeline?accountId=`: daily curve and events, fetched only when the chart opens,
     for one account at a time.
3. **Canonical names only:** `id`, `accountId`, `todayBalance`, `day`, `category`, `name`. No aliases.
4. **Integers in minor units, ISO dates, no nulls.** A missing key means "not set".

## Rollout without breaking installed phones

The released Android APK reads `allEvents`, `days`, `todaysBalance` and top-level `accountSimulations`. The
web app reads `accountSummaries`, `accountDailyBalances` and `intradayEvents`.

1. Switch both clients to the canonical keys. They already have fallbacks for most of them.
2. Ship the new `/summary` and `/timeline` endpoints alongside the old ones and move the web app to them.
3. Keep the old period response with a `Deprecation` header (the server already has
   `deprecation_notice.test.js`) until the minimum supported mobile version uses the new endpoints. Update
   `mobile_contract_fixtures.test.js` and `api_v1_parity.test.js` with each step.
4. Then remove the aliases and the duplicated blocks.

## Updated build order

1. **Balance correctness** (done in this change).
2. **Data contract steps 1–2.** Move the backfill out of GETs, add the DTO allowlists, and add the
   `/summary` endpoint. The redesign needs this first.
3. **Plan redesign** on top of `/summary`, with the chart lazy-loaded from `/timeline`.
4. **Net worth, phase 1.** One more field in `/summary`, computed on the server from ledger balances, card
   outstanding and Held & Lent.
5. **Remove deprecated fields** once the mobile minimum version allows it. Then net worth phase 2
   (investment and loan accounts).
