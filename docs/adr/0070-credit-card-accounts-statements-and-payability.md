# 0070: Credit Card Accounts, Statements and the Card Payability Score

## Context
There was no way to record a credit card. A swipe was either logged as a bank expense on the wrong date (cash had not left yet) or logged twice: once at the swipe and again when the bill was paid. Nothing told the user whether the bill they were running up could actually be paid when due.

## Decision
1. **Card account**: an account with `type = 'credit_card'`. Its balance is negative: what is owed. New columns `credit_limit`, `statement_day` (bill generation day), `due_day` and `pay_from_account_id`. The bill generation day and due day are always set by the user; creating a card without them is refused. A card is never the primary account, never the salary account, never part of a month's cash openings, and is excluded from the liquid cash curve and the safety floor.

2. **Swipe = spending on the swipe day**: an ordinary expense with `account_id = card`. It counts in expenses, categories, unplanned spend and burn rate on the day it happens, but moves no cash. The ledger debit pushes the card balance further negative. A refund on the card is a negative amount.

3. **Paying the bill = a transfer**: a transfer from a bank account or wallet into the card. On the aggregate cash curve a transfer between a cash account and a card moves real cash (−amount when paying, +amount for a cash advance); transfers between two cash accounts stay zero. It is never an expense, so nothing is counted twice.

4. **Card Liability reserve**: what is owed on cards today is subtracted from Safe-to-Spend (`dailyLimit` `cardReserve`). A swipe lowers Safe-to-Spend at once; paying the bill lowers cash and the liability by the same amount, so Safe-to-Spend does not change.

5. **Statements** (`card_statements`): on or after the bill generation day the server creates a **draft** for the closed cycle: `computed_amount` is what the card's ledger says is owed on that date, `new_spend` the net spend in the cycle. The due date is the next `due_day` after the bill date (the next month when the due day comes before the bill day; days past a short month's end clamp to its last day). Missed cycles are filed as `carried`; an unpaid earlier bill is `carried` into the newer one, a paid one is filed `paid`. The user confirms the draft, optionally editing the amount, minimum due and due date. With `logChargesDifference`, a higher bank amount is logged as a card charge and a lower one as a card credit, so the ledger matches the bank. Payments are derived from transfers into the card after the bill date, so a payment made from any screen counts.

6. **Projected bill**: an open or draft bill with money left to pay becomes a projected cash outflow (`itemType: 'card-bill'`) on its due date from the pay-from account, so the balance curve and floor check see it. An overdue bill is moved to today. It is not added to committed bills (the liability reserve already covers it) and is not an expense.

7. **Card Payability Score** (an in-app score, not a bureau credit score), `packages/engine/src/cardPayability.js`:
   - Next bill = spend so far this cycle + remaining days × blended daily rate (60% this cycle's pace, 40% the last three bills' pace; this cycle only without history) + planned charges on the card before the cycle closes. Empty cycles from before the card was in use are left out of the history.
   - Projected total = what is still due on the current bill + next bill.
   - Capacity on the due date = own money (balance minus held reserve) on that date, with card bills added back, minus the safety floor and goal reserves. A due date in a later month uses the month-end balance plus next month's expected income (active salary template, else this month's income), when it arrives before the due date. Per card, the other cards' projected totals come out of the same capacity.
   - Score from coverage (capacity ÷ projected total): ≥1.5 → 85–100 Comfortable, 1.1–1.5 → 65–84 On track, 0.9–1.1 → 40–64 Tight, below → 0–39 Over; −5 per late or partial bill in the last three, −5 above 50% utilisation, −10 above 80%.
   - Output: score, band, projected bill, capacity, shortfall, safe card spend per day for the rest of the cycle, trend against the last bill, and a plain-language statement. Only computed for the current month.

## API
- Cards are created and edited through `/api/v1/accounts` with `type: 'credit_card'` (`creditLimit`, `statementDay`, `dueDay`, `payFromAccountId`, `currentOutstanding`).
- `GET /api/v1/cards`, `GET /api/v1/cards/:id`: card with owed now, this cycle, next bill and due dates, open bill, history and statements.
- `POST /api/v1/cards/statements/:statementId/confirm` `{ statementAmount?, minimumDue?, dueDate?, logChargesDifference? }`
- `POST /api/v1/cards/statements/:statementId/pay` `{ amount?, fromAccountId?, date? }` (a transfer into the card)
- Period detail gains `creditCards`; the simulation gains `cards[]` (with `payability`), `cardPayability`, `cardReserve`/`cardLiability`, `safeVelocity.cardReserve`. The month-end review gains `cardSpend[]` and no longer counts transfers (including bill payments) as spending.

## Consequences
- Card spending appears in totals on the swipe day and Safe-to-Spend falls immediately, while the cash curve only moves when the bill is paid.
- Existing databases get the columns, table and the widened `chk_account_type` on boot (`syncCreditCardSchema`, also run from `ensureDatabaseInitialized`).
- Transactions and transfers created without a month id now fall back to the calendar month of their date when the period has no explicit start and end dates.
- Next month's planned bills before a due date are not yet subtracted from capacity; the score can be optimistic when large bills fall early in the next month.
