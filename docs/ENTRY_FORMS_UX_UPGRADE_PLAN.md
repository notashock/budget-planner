# Entry & Edit Forms — UX Upgrade Plan

**Scope:** every surface where a user creates or changes a money record — web (`apps/web`) and mobile (`apps/mobile`) — including the Held & Lent and Credit Card forms added on `feat/held-lent-funds` (ADR 0069, ADR 0070).
**Goal:** make each logging and editing moment fast, hard to get wrong, consistent in look and spacing, and the same on both platforms.
**Revision:** 2 · 2026-11-18. Added held/lent and credit-card forms (§1, §2, §3.3, §5.11–5.13) and a visual system for fields, layouts and paddings (§3.4, §6).

> File references marked **(HL)** exist only on `feat/held-lent-funds`, which is not merged into `master` yet. Line numbers for everything else are from `master` at `9896b74`.

---

## 1. What exists today

### 1.1 Transactions, transfers, goals, accounts (on `master`)

| # | Surface | Platform | File | Creates / edits |
|---|---------|----------|------|-----------------|
| W1 | Unified Entry modal (Spending · Income · Plan · Transfer tabs) | Web | `apps/web/src/components/UnifiedEntryModal.jsx` | Create **and** edit spot, income, planned, recurring and transfer transactions |
| W2 | Confirm payment (Mark as paid) | Web | `apps/web/src/screens/TransactionsScreen.jsx:807` | Settles a planned transaction |
| W3 | Quick "mark paid" (no dialog) | Web | `TransactionsScreen.jsx:129` | Settles at the planned amount, today, primary account |
| W4 | Cancel goal transaction prompt | Web | `TransactionsScreen.jsx:944` | Cancel + goal fate |
| W5 | Add / edit bank account | Web | `apps/web/src/screens/AccountsScreen.jsx:844` | Bank account |
| W6 | Add / edit wallet | Web | `AccountsScreen.jsx:971` | Wallet |
| W7 | "Paired Account Transfer" modal | Web | `AccountsScreen.jsx:1067` | Transfer (**duplicates W1 Transfer tab**) |
| W8 | Inline "add goal" form | Web | `apps/web/src/screens/GoalsScreen.jsx:227` | Goal (create only — no edit) |
| W9 | Salary & Safeline modal | Web | `apps/web/src/components/SalarySafelineModal.jsx` | Salary amount, credit date, floor |
| W10 | Onboarding / Transfer calculations / Rollover / Month review | Web | `components/*Modal.jsx` | Setup and month-end flows (in scope where they collect amounts) |
| M1 | Unified Entry sheet (Actual Spend · Log Income · Planned Expense · Purchase Goal · Transfer) | Mobile | `apps/mobile/lib/modals/unified_entry_modal.dart` | Create only — **no edit mode** |
| M2 | Add Transaction sheet | Mobile | `modals/add_transaction_modal.dart` | Create (**duplicates M1**) |
| M3 | Mark Paid sheet | Mobile | `modals/mark_paid_modal.dart` | Settle planned |
| M4 | Transfer sheet | Mobile | `modals/transfer_modal.dart` | Transfer (**duplicates M1 Transfer tab**) |
| M5 | Transaction detail sheet | Mobile | `modals/transaction_detail_modal.dart` | Mark paid / cancel / delete — **cannot edit** |
| M6 | Edit account sheet | Mobile | `modals/edit_account_modal.dart` | Bank / wallet metadata |

### 1.2 Held & Lent money and credit cards (HL)

| # | Surface | Platform | File (HL) | Creates / edits |
|---|---------|----------|-----------|-----------------|
| W11 | "Held/Lent" 5th tab in the Unified Entry modal | Web | `UnifiedEntryModal.jsx` → renders `HeldLentForm` instead of the entry form | Receive to hold · Return · Lend · Got back |
| W12 | People panel → Held/Lent modal (opened per person with a preset action) | Web | `components/PeoplePanel.jsx`, `components/HeldLentForm.jsx` | Same four actions, person preselected |
| W13 | Move to Held & Lent (reclassify) | Web | `components/ReclassifyHeldLentModal.jsx`, row action in `TransactionsScreen.jsx` | Turns an existing income/expense into a pass-through entry |
| W14 | Add / edit credit card | Web | `components/CardsPanel.jsx` (`CardForm`) | Card name, limit, owed, bill day, due day, pay-from |
| W15 | Confirm bill | Web | `CardsPanel.jsx` (`ConfirmBillForm`) | Statement amount, minimum, due date, log difference |
| W16 | Pay bill | Web | `CardsPanel.jsx` (`PayBillForm`) | Full / minimum / other, from account, date |
| W17 | Card as a payment account | Web | `components/AccountSelect.jsx` ("Credit Cards" section, Spend and Plan only) | Card swipe = spend on the card |
| M7 | Held & Lent sheet (the M1 "Held / Lent" tab closes M1 and opens this) | Mobile | `modals/held_lent_modal.dart` | Four actions |
| M8–M10 | Add card · Confirm bill · Pay bill sheets | Mobile | `modals/card_modals.dart` | As W14–W16 (no edit card) |
| M11 | Card as a payment account | Mobile | `widgets/account_selector.dart` ("Card" tab) | Card swipe |

**Summary:** 3 transfer forms plus a 4th way to move money (Pay bill), 2 settlement flows that behave differently, 2 "add transaction" forms on mobile, a held/lent flow that lives outside the entry form on mobile and as a form-inside-a-form on web, and no way to edit a transaction, goal or card on mobile, a goal on web, or a held/lent entry anywhere.

---

## 2. Who logs what, and when

| ID | Scenario | Where it happens | Time budget | What the user knows | Worst mistake |
|----|----------|------------------|-------------|---------------------|---------------|
| S1 | **Quick spend** — coffee, fuel, groceries | Phone, at the counter | ≤ 5 s, one hand | Amount, roughly what it was | Wrong account; forgetting to log |
| S2 | **Paying a planned bill** — rent, EMI, electricity | Phone or web, after the bank app confirms | ≤ 10 s | Which bill, actual amount | Double-counting |
| S3 | **Planning ahead** — bills, subscriptions, a big purchase | Web, start of month | 20–40 s per item, several in a row | Name, amount, date or "monthly on the 5th" | Wrong date → false floor breach / missed alert |
| S4 | **Money in** — salary, bonus, refund, freelance | Phone, after a credit SMS | ≤ 10 s | Amount, source | Salary logged twice |
| S5 | **Moving money** — ATM, top-up, savings move | Phone | ≤ 10 s | From, to, amount | Swapped direction |
| S6 | **Fixing a mistake** | Either | ≤ 15 s | What's wrong | Edit silently changes other fields; unclear recurring scope |
| S7 | **Catch-up** — several spends at once | Evening | 5–10 items in < 1 min | A list of amounts | Losing momentum |
| S8 | **Setting up / correcting an account** | Web, rare | Not time-critical | Bank name, balance | Opening-balance edit rewrites history silently |
| S9 | **Wishlist goal** | Either | 15 s | Item, price | Not knowing when it's affordable |
| S10 | **Holding someone's money** — a friend hands over cash, a parent parks savings with you; later you give it back | Phone, at the moment | ≤ 10 s | Who, how much | Logging it as income, then as spending; Safe-to-Spend inflated |
| S11 | **Lending and getting repaid** | Phone | ≤ 10 s | Who, how much, maybe when they'll repay | Logging it as spending; forgetting who owes what |
| S12 | **Card swipe** | Phone, at the counter | ≤ 5 s (same as S1) | Amount, that it went on the card | Logging it on the bank (cash curve moves on the wrong day) |
| S13 | **Card bill** — confirm the statement, then pay it | Web or phone, once a month | ≤ 30 s each | Statement amount, minimum, due date | Paying it as an expense (double count); paying from an account that then breaches the floor |
| S14 | **"That wasn't really income/spending"** — fixing an old entry that was actually held or lent money | Web, while reviewing | ≤ 15 s | Which entry, who | Deleting and re-entering, losing the date and account |

---

## 3. Findings

### 3.1 Bugs that break trust (fix first)

| ID | Finding | Evidence | Effect on the user |
|----|---------|----------|--------------------|
| B1 | Under-spend choices are ignored: the modal sends `{ action }`, App reads `underSpendAction.type`. | `UnifiedEntryModal.jsx:1844-1868` vs `App.jsx:443,449` | "Release remainder" / "Keep remainder scheduled" do nothing. |
| B2 | Editing a planned item resets its category (plan-mode init never calls `setTag`). | `UnifiedEntryModal.jsx:211-233`, payload `:794` | Rent becomes "Food" after editing the amount. |
| B3 | Income opens with no category selected (default `Salary`, pills lack Salary). Salary is left out of the pills on purpose — the salary schedule is its only source — so the fix is a default that is on screen (`Other`), not a Salary pill. | `UnifiedEntryModal.jsx:239, 1368`; `SalarySafelineAndIncome.test.jsx` | The form looks unfilled. |
| B4 | A failed plan save shows two alerts, the second "Failed to archive wallet". | `App.jsx:617-618` | Wrong error message. |
| B5 | Mobile delete has no confirmation and no undo. | `transaction_detail_modal.dart:344-358` | One mis-tap deletes a transaction. |
| B6 | Spending date has no upper bound. | `UnifiedEntryModal.jsx:1201-1209` | Future-dated actuals distort today's balance. |
| B7 | Mobile names default to `"Entry"`. | `unified_entry_modal.dart:740` | Unnamed "Entry" rows. |
| B8 | Safety-floor check runs only in W1 Spend/Transfer; not in W7, M1, M4, Mark as paid, Lend, Return or Pay bill. | `AccountsScreen.jsx:273`, `transfer_modal.dart`, `HeldLentForm.jsx`, `PayBillForm` (HL) | The same cash outflow warns on one screen and not another. |
| B9 (HL) | Editing a card whose bill is paid from a **wallet** opens with the account type set to `bank`, so the picker shows the wrong list. `payType` is hard-coded to `'bank'`. | `CardsPanel.jsx` `CardForm`: `useState('bank')` | Saving the card without noticing can switch the pay-from account. |
| B10 (HL) | On web, switching to the Held/Lent tab replaces the form, so the amount typed in Spend is lost. On mobile, the "Held / Lent" tab **closes** the sheet and opens a different one. | `UnifiedEntryModal.jsx` `mode === 'held'` branch; `unified_entry_modal.dart` `_buildHeldLentTab` | Breaks the "switching tabs keeps your input" promise of the entry form. |
| B11 (HL) | `.input-field` — used by every HL form, AccountsScreen and the card forms — has no base rule. Those inputs fall back to raw `input {}` styles at 13 px. | `grep input-field styles/` → only `.hl-form input.input-field { width:100% }` | Fields look different from the entry modal, and iOS zooms in on focus (see V1). |

### 3.2 Friction by scenario (unchanged from revision 1, summarised)

- **S1** — six blocks before Save; additive `+100` chips; category not remembered; no Save & add another; mobile tab strip scrolls horizontally (now 6 tabs with Held/Lent).
- **S2** — two settlement flows with different rules; exact-amount-only bill match; quick mark-paid is silent with no undo.
- **S3** — "Payment done" toggle on create; Variable/Fixed hidden in a small checkbox with different defaults per platform; priority defaults to High; Auto date far from the date; modal closes after each save; can't plan an unpaid bill dated earlier this month.
- **S4** — always-visible salary paragraph but no duplicate detection; decorative "Direct Inflow" pill.
- **S5** — destination sits in the category slot, far from the source; `$` in the zero-sum note.
- **S6** — type lock with no convert route; no Delete in the modal; no change summary; recurring scope shown only at the bottom of edit; no edit on mobile; no goal edit on web.
- **S7** — no Save & add another or remembered date/account.
- **S8** — opening-balance edits rewrite history silently; native date/select controls in W7.

### 3.3 Held & Lent and credit cards (HL)

**S10 / S11 — Held and lent money**
- **Five or six tabs.** The entry sheet now has Spending · Income · Plan · Transfer · Held/Lent on web and six chips on mobile. Held/Lent is conceptually a *movement of cash between you and a person* — the same shape as a transfer (ADR 0069 says so) — but it's presented as a separate product.
- **Four actions to choose first** ("Receive to hold · Return · Lend · Got back"), before the user has said who. When the user picks a person who already has money outstanding, the right action is usually obvious (Rahul has ₹2,000 of yours → "Got back" is likely), but the form doesn't use that.
- **Person picker** is a native `<select>` with "+ New person" as the last option and a second Name field that appears below. No search, no recent people first, and the name field isn't next to where the user chose "New".
- **No expected date.** The API accepts `expectedSettleDate` and planned repayments, but the form can't set them, so "Priya will pay me back on the 30th" can't be recorded or shown on the timeline.
- **Can't edit, only delete.** Pass-through rows hide the Edit button (ADR 0069: edits would bypass direction checks). That's a reasonable integrity rule, but a wrong amount means delete + re-log, and there's no Delete in a form either.
- **No floor check** on Lend and Return, though both take cash out.
- **No entry-time hint.** If a user logs "Rahul's cash" as Income, nothing suggests Held. The fix exists only later, as a row action (W13).
- **Form-in-a-form layout.** `HeldLentForm` brings its own footer (`ui/Button`, no Cancel when inside the entry modal), its own gaps (`--space-1` label gap vs `6px`), and its own padding (`.hl-modal-body` 16 px *inside* `.modal-content`'s 16–18 px — doubled side padding).

**S14 — Reclassify**
- Good copy ("will stop counting as spending. Your balance stays the same.").
- The two direction buttons are long sentences in a 2-column grid; on a phone they wrap to 3–4 lines.
- Same native person `<select>` as above; New person is preselected even when the user has people already.

**S12 — Card swipe**
- The card appears as a separate "Credit Cards" section at the bottom of the account dropdown (web) or a 3rd "Card" tab (mobile). It isn't remembered as the default, so card-heavy users pick it every time.
- The account chip shows "owes ₹X", but nothing shows how the swipe affects the card's next bill or the payability score.
- Transfer mode hides cards from the picker, so **a bill can only be paid from the Accounts screen** (W16), not from the entry sheet where users already go to "move money".

**S13 — Confirm and pay bill**
- Bill day and due day are bare number inputs with placeholders. The user can't see what they produce ("Next bill 5 Dec · due 23 Dec") until after saving, and the explanatory paragraph about due-before-bill is long.
- "Owed when added" on edit changes the card's opening balance — the same silent history rewrite as S8.
- No delete card; card modals have no ✕ (Cancel only).
- Pay bill has no consequence line ("HDFC after paying: ₹18,200 · ₹3,200 above floor") and no floor check (B8).
- Mobile: "Minimum" chip shows no amount; card amount fields use `TextInputType.number` (no decimal key on iOS).

### 3.4 Visual audit — fields, layouts and paddings

Measured from `styles/base.css`, `components/modals.css`, `components/controls.css`, `components/datepicker-misc.css`, `moved/unified-entry-modal.css`, `held-lent.css` (HL) and component inline styles.

**V1 — Text input size is 13 px everywhere except a few places.** `input, textarea, select` are `font-size: var(--fs-sm)` (13 px). `--fs-input: 16px` exists precisely to stop iOS Safari zooming on focus, but it's applied only to a handful of selectors. Every `.form-group` input on a phone triggers zoom-on-focus, which shifts the bottom sheet.

**V2 — Control heights vary from 22 px to 48 px in one form.**

| Control | Padding / size | Rendered height (approx.) | Touch target ≥ 44 px? |
|---------|----------------|---------------------------|-----------------------|
| Amount dock (`.modal-amount-input`) | 10 px + 22 px font | 48 px | ✔ |
| Day stepper dock | `min-height: 48px` | 48 px | ✔ |
| Text input (`input`) | 8 px 12 px, 13 px font | 34 px | ✘ |
| Native select | 8 px | 34 px | ✘ |
| `.app-select-trigger` / AccountSelect | 8 px / 9 px (inline) | 34–36 px | ✘ |
| `.datepicker-trigger` | 9 px | 36 px | ✘ |
| Mode tabs (`.modal-tab-btn`) | 6 px 8 px, 11 px font | 28 px | ✘ |
| Category pills | 5 px 12 px, 12 px font | 28 px | ✘ |
| Quick amount chips | 3 px 9 px, 11 px font | 22 px | ✘ |
| Refund / One-time / Recurring toggles | 3 px 8–10 px, 11 px font | 22 px | ✘ |
| Held/Lent action buttons (HL) | `min-height: 36px` / 44 px for 2-up | 36–44 px | partial |
| Mobile entry tabs | `EdgeInsets.symmetric(horizontal: 10, vertical: 6)`, 12 px | ~30 px | ✘ |

**V3 — Three focus styles.** `input` changes border colour only (no ring); `select`, `.app-select-trigger` and `.datepicker-trigger` add a 1 px `--text` ring; the amount dock uses `:focus-within`. Keyboard users can't reliably see where they are.

**V4 — Two field backgrounds.** Inputs and the date trigger use `--surface`; selects and `.app-select-trigger` use `--surface-subtle`. In one row (amount + date, or account + note) the fields look like different kinds of thing.

**V5 — Spacing doesn't follow the token scale.** `tokens.css` defines `--space-1…8` (4/8/12/16/20/24/32). Forms use raw values: label→field gap `6px` (`.form-group`) vs `4px` (`.hl-form .form-group`); between groups `14px` (`.modal-form-scroll-body`) vs `12px` (`.hl-form`) vs `10px` (`.form-row`); modal padding `16px 18px` (phone) / `18px 20px` (tablet) vs `16px` for HL bodies (nested, so 32–34 px total side padding in W11).

**V6 — Six corner radii in one modal.** 0 (One-time/Recurring segment, inline `borderRadius: 0`), 4 (tabs), 6 (pills), 8 (inputs), 10 (`--radius-md`, HL actions), 16/20 (sheet). Plus pill-shaped chips.

**V7 — Labels are styled five ways.** `.form-label` (12 px/500, secondary); `.entry-label` variants; settle modal inline labels at 11 px/600; AccountSelect section headers 11 px/700 uppercase with letter-spacing; mobile uses floating `labelText` inside `OutlineInputBorder`. Required fields are marked with `*` in some labels and not others.

**V8 — Inline styles bypass the system.** `UnifiedEntryModal.jsx` and the settle modal in `TransactionsScreen.jsx` set padding, font-size, colour and borders inline (e.g. refund toggle, scope buttons, salary-template card, all settle-modal labels and fields). `AccountSelect.jsx` sets trigger and option padding inline. These can't be themed or tested consistently.

**V9 — Layout grids break on small phones.** Two-column rows (`.modal-amount-date-grid`, `.hl-row`, `.form-row`, `.accounts-grid-2`) stay two columns at 320–360 px, so labels like "Owed right now (₹)" and "Bill generation day" wrap to two lines and push their inputs out of line with the neighbour.

**V10 — Helper and error text have no fixed place.** Errors appear as a banner above the form (transfer), above the footer (HL), as `alert()`, or as SnackBars (mobile). Hints sit above fields (HL), below fields (Spend), or inside popovers (Variable ℹ). Field-level errors (red border + message under the field) don't exist.

**V11 — Footers differ.** Entry modal: sticky `.modal-footer-row` with the Paid toggle on the left. HL/cards: `.hl-footer`, not sticky, `ui/Button` ghost + primary. Settle modal: inline flex, `btn-subtle` + `btn-primary` with inline padding. Mobile: full-width button with 14 px vertical padding, no Cancel.

**V12 — Mobile (Flutter) has no shared input theme.** Every sheet builds `InputDecoration(labelText…, border: OutlineInputBorder())` by hand, uses `EdgeInsets.all(20)` sheet padding, and sizes chips/tabs per file. Web and mobile fields share neither height, radius nor label position.

**V13 — Modals opened from a screen sat under the header and bottom nav.** Screens render inside `<main class="app-box-3">` (`position: relative; z-index: 1`), which is its own stacking context, so a modal's `z-index: 110000` only competed inside `main`; the sticky header (99990) and the fixed bottom nav (100) drew on top, and on phones the nav covered the sheet's Save button. `AnimatedModal` also wrapped every modal in `z-index: 1000`, which kept even app-level modals (salary, rollover, migration) under the header. **Fixed:** modals render in a portal on `<body>`, and app-wide layers use one scale in `tokens.css` (`--z-nav` < `--z-header` < `--z-modal` < `--z-modal-popover` < `--z-modal-nested` < `--z-progress`). Values that only compete inside one screen or form stay local.

---

## 4. Design principles

1. **Amount first, everything else defaulted.** A valid entry is amount + Save.
2. **One flow per job.** One transfer/move form, one settlement flow, one entry sheet per platform. Held/lent and card payments are *moves*, not new products.
3. **Remember, don't ask.** Last account (including the card), last category per description, last person, last date during a catch-up.
4. **Show consequences before commit.** A live line for balance, floor, card headroom and held reserve.
5. **Edits are explicit.** Show what's changing; keep integrity rules but give a safe way out.
6. **Same behaviour and look on web and mobile.** Same defaults, validations, words, control sizes and spacing.
7. **Plain language.** "Paid from", "Who", "They'll pay back by".
8. **One visual system.** Every field, label, hint, error and footer comes from the tokens in §6 — no inline styles in forms.

---

## 5. The upgrade, scenario by scenario

### 5.1 Entry sheet structure (all create modes)

Replace the "6-slot" layout with **essential row + smart details**, and **four tabs** on both platforms:

```
┌──────────────────────────────────────────────┐
│  [Spend] [Income] [Plan] [Move]          ✕   │  ← 4 equal segments, 44 px tall
│                                              │
│  ₹ 1,250                                     │  ← hero amount, autofocus, numeric keypad
│  500 · 1k · 2k · 5k     (replace, not add)   │  ← 36 px chips
│                                              │
│  What for?  [Groceries          ]  🛒 Food ▾ │  ← description + suggested category chip
│                                              │
│  Today ▾   ·   HDFC Salary ▾ (₹42,300)       │  ← summary chips, tap to change
│                                              │
│  After this: ₹41,050 · ₹11,050 above floor   │  ← live consequence line
│                                              │
│  ▸ More (note, link to planned bill)         │
│ ──────────────────────────────────────────── │
│  [Save & add another]           [Save spend] │  ← sticky footer
└──────────────────────────────────────────────┘
```

- **Summary chips** for date and account show the current default; tap to open the picker.
- **Amount chips** set the value instead of adding to it.
- **Category**: a single chip, suggested from the description; custom categories on both platforms.
- **Live consequence line** replaces the blocking floor dialog; amber/red when it would breach; the button becomes **Save anyway**.
- **Save & add another** keeps date, account, mode and person; toast with Undo. `Enter` saves, `⌘/Ctrl+Enter` saves and adds another.
- **Unsaved-changes guard** on backdrop / swipe-down / Esc once amount or description is filled.
- **Tab switching keeps input in every mode**, including Move → person (fixes B10). No tab closes the sheet.
- Purchase Goal leaves the mobile sheet and lives on the Goals screen, as on web.

### 5.2 S1 Quick spend

- Defaults: date Today, account = last used for spending (card included), category suggested. Max date = today (B6).
- Refund via a `−`/`+` sign toggle in the amount field.
- Mobile: keyboard up on open, Save above the keyboard.
- Name fallback = category on both platforms (B7).

### 5.3 S2 Paying a planned bill — one Settle sheet

Merge "Log spend → Link & Settle" and "Mark as paid":

```
Pay  Rent                               ✕
Planned ₹15,000 · due 5 Nov · HDFC Salary

₹ 14,950                       [Paid in full]
Paid on  Today ▾      From  HDFC Salary ▾

₹50 less than planned. What about the rest?
 (•) Done — release ₹50 back to spending
 ( ) Still owed — keep ₹50 as a pending bill

After this: ₹27,350 · ₹2,350 above floor
                        [Cancel]  [Mark paid]
```

- Under/over-spend choice inline, only when amounts differ (one payload shape, fixes B1).
- Floor check (B8). Fuzzy match in Spend (±10% or name match, due within 7 days or overdue).
- Quick mark-paid shows a toast with Undo and surfaces errors.

### 5.4 S3 Planning ahead

- **Repeat** control: `Once on [date]` ↔ `Every month on day [5]`.
- Remove "Payment done" from create; link "Already paid? Log it as spend".
- **Carry into next month** toggle; default on for monthly, off for one-off, on both platforms.
- Priority under More, default Medium, renamed "If money is tight, pay this… First / Normal / Last".
- "✨ Suggest safe date" next to the date chip, reason inline, no `alert()`.
- Past dates in the current month allowed (shown overdue). Save & add another.

### 5.5 S4 Money in

- Pills stay `Bonus · Freelance · Investment · Other`, default `Other` (B3). Salary is not offered here: the salary schedule is its only source, and the salary card plus the duplicate-salary guard below point people there.
- Duplicate-salary guard inline. Account default = salary account / last income account. Remove "Direct Inflow".
- **Person hint (HL):** if the description matches someone in People, or reads like "from Rahul", show "Is this Rahul's money to keep? [Track as held]", which switches to Move → Rahul with the amount kept.

### 5.6 S5, S10, S11, S13 — the **Move** tab: accounts, cards and people

One tab for every movement of cash that isn't income or spending. The counterparty picker lists **My accounts**, **Cards** and **People** in sections:

```
Move                                         ✕
₹ 2,000

From  HDFC Salary        ₹42,300
          ⇅
To    👤 Rahul            ← People section
      ┌───────────────────────────────────┐
      │ (•) Lend to Rahul                 │  ← shown when the person side is "To"
      │ ( ) Return Rahul's money (₹3,000) │     and Rahul has held money outstanding
      └───────────────────────────────────┘
      They'll pay back by  [30 Nov ▾] (optional)

After this: HDFC ₹40,300 · ₹10,300 above floor
Won't count as income or spending.
                         [Cancel]  [Lend ₹2,000]
```

- **Account → account**: today's transfer. To-list hides the From account. Swap button between the rows.
- **Account → card**: paying a card bill (fixes "bills can only be paid from Accounts"). When the card has an open bill, show the Full / Minimum / Other chips from W16 under the amount, with the minimum's amount on the chip (also on mobile).
- **Account ↔ person**: held/lent. The four actions become one **direction** (From me / To me, set by which side the person is on) plus one **meaning** choice, shown only when both are possible:
  - Person on **To**: *Lend* (new or more) or *Return their money* (only if they have held money outstanding).
  - Person on **From**: *Hold their money* or *They paid me back* (only if they owe you).
  - Default meaning = the one that reduces an outstanding balance, if any; otherwise Lend / Hold.
- **All** shortcut fills the outstanding amount when returning or being repaid; amounts above outstanding show a field error (not a banner).
- **Expected date** for Lend and Hold ("They'll pay back by" / "Give back by"), writing `expectedSettleDate` and showing on the timeline.
- **Person picker**: searchable combobox, recent people first, outstanding amount on each row, "Add 'Pri…' as new person" as the top row while typing — no second Name field.
- **Floor check** on every outflow, including Lend, Return and card payment (B8).
- If usability tests show people don't look for lending under Move, fall back to a 5th **People** tab using the same form; do not bring back a separate sheet.

### 5.7 S6 Fixing a mistake — edit mode

- Header "Edit spend · Groceries"; type shown as a label.
- **Change type** link (convert server-side, keeps planned-item link) once the API supports it.
- **What's changing** line; Save disabled until something changes.
- **Delete** in the footer (left, destructive), confirm on web, confirm + 5 s Undo on mobile (B5).
- Load every stored field (B2). Recurring scope asked at Save, default "Only this month". Salary template folded into the same scope choice.
- Mobile edit mode; goal edit on both platforms.
- **Held/lent entries (HL):** open in the Move form read-only for amount/direction, with **Note** and **Date** editable if the API allows, plus **Delete** and **"Delete and log again"** (opens a pre-filled Move form). This keeps ADR 0069's rule while removing the hunt for the trash icon.
- **Cards (HL):** Edit card gains Delete (blocked with a reason if the card has entries) and a ✕.

### 5.8 S7 Catch-up

- Save & add another, remembered date/account/person, session counter "3 added · ₹2,140", `N` to open on web.

### 5.9 S8 Accounts and S13 card setup

- Opening-balance edits — and the card's "Owed when added" — show "Changing this shifts every balance since [date] by ₹X." with confirm.
- Shared `DatePicker`, `AccountChip` and `MoneyInput` everywhere (W5–W7, W9, W14–W16, onboarding).
- **Card form (HL):**
  - Bill day and due day use a `DayOfMonthPicker` (1–31 grid, 31 shown as "Last day") side by side, with a live preview under them: "Next bill **5 Dec** · due **23 Dec** (next month)". The long due-before-bill paragraph goes away; the preview explains it.
  - Fix pay-from type on edit (B9).
  - Limit and owed fields with decimal keypad on mobile.
- Mobile: Opening balance in account edit, with the same warning; Edit card sheet.

### 5.10 S9 Goals

- Own form on the Goals screen on both platforms; inline affordability on web as on mobile; Schedule shows and lets the user change the date.

### 5.11 S12 Card swipe (HL)

- Cards appear in the **same account list** as banks and wallets (sections: Banks · Wallets · Cards), not as a trailing extra; mobile replaces the Bank/Wallet/Card tab row with the same sectioned list.
- Last-used account is remembered per mode, so a card-first user gets the card by default.
- Consequence line for a card: "HDFC Millennia: owes ₹18,450 of ₹1,00,000 · next bill ~₹21,000 · Payability: On track". Turns amber when the swipe crosses 50% / 80% utilisation or drops the band.

### 5.12 S13 Confirm bill (HL)

- Keep the computed amount visible next to the input as a reference ("App worked out ₹21,340"), and show the difference as soon as the user types ("+₹412 — fees or interest?").
- The "log the difference" checkbox becomes a two-option choice shown only when there's a difference: "Log ₹412 as card charges" / "Just update the bill". Default = log charges.
- Due date: DateChip with the computed due date preselected.
- After confirming, offer **Pay now** in the toast.

### 5.13 S14 Move to Held & Lent (HL)

- Title "This was someone else's money?" with the entry summary card (name, amount, date, account) at the top.
- Direction options as two short labels with a sub-line, stacked full width (no 2-column wrap):
  - **Held for someone** — they gave it to you to keep / you gave it back
  - **Lent / repaid** — you lent it / they paid you back
- Same searchable person picker as §5.6, with the person most likely to match (name found in the entry's description) suggested first.
- Offer this choice also from the Edit sheet of an income/expense (a "Was this someone else's money?" link), not only from the row icon.

---

## 6. Visual system for entry and edit forms

All values reference `tokens.css`. New tokens are marked **new**. The same numbers go into a Flutter `InputDecorationTheme` / `ChipTheme` / `SegmentedButtonTheme` in `apps/mobile/lib/theme/app_theme.dart`, so both apps match.

### 6.1 Sheet and modal container

| Property | Phone (< 768 px) | Tablet / desktop |
|----------|------------------|------------------|
| Max width | 100% | 480 px (one width for every entry/edit modal) |
| Side padding | `--space-4` (16) | `--space-6` (24) |
| Top padding (below drag handle) | `--space-2` (8) | `--space-5` (20) |
| Header → first field | `--space-4` | `--space-5` |
| Footer | sticky; `--space-3` top padding, `--space-4` + safe-area bottom; 1 px top border | sticky; `--space-4` vertical |
| Corner radius | `--radius-xl` (18) top only | `--radius-lg` (14) |

Nested forms (HeldLentForm, card forms) render **without** their own container padding (`.hl-modal-body` padding removed); the sheet owns padding.

### 6.2 Field anatomy

```
Label            (fs-xs 12 / 500 / text-secondary)         Optional ← right-aligned, fs-2xs, text-tertiary
┌───────────────────────────────────────────────────┐
│ ₹  Value                                      ▾   │   height --control-h
└───────────────────────────────────────────────────┘
Hint or error    (fs-2xs 11, text-tertiary / danger)
```

| Token / rule | Value |
|--------------|-------|
| `--control-h` **new** | 44 px phone, 40 px desktop (inputs, selects, AccountChip, DateChip, combobox) |
| `--control-h-sm` **new** | 36 px (chips, quick amounts, segmented options inside a field row) — 44 px hit area via padding/`::after` on phones |
| `--control-h-hero` **new** | 56 px (amount input) |
| Field font size | `--fs-input` (16) on phones, `--fs-base` (14) desktop; hero amount `--fs-2xl` (26) |
| Field horizontal padding | `--space-3` (12); 40 px left when a prefix/icon is present |
| Background | `--surface-subtle` for **all** fields (inputs, selects, triggers, date) |
| Border | 1 px `--border`; hover `--border-strong` |
| Focus | 2 px ring `--border-focus` via `box-shadow`, border `--text` — identical for every control (V3) |
| Error | border `--danger`, message below in `--danger`, `aria-invalid` + `aria-describedby` |
| Disabled / read-only | 50% opacity disabled; read-only = no border, `--surface` background, lock icon |
| Radius | `--radius` (8) for fields and chips; `--radius-sm` (6) for options inside a segmented track; `--radius-pill` only for status tags |
| Label → field gap | `--space-2` (8) on phones, `--space-1` (4) on desktop (replaces today's mix of 6 px and 4 px) |
| Field → hint gap | `--space-1` (4) |
| Required marking | No `*`. Mark the few **optional** fields with "Optional" instead (most fields have defaults) |
| Numbers | `tabular-nums`, right-aligned in compact numeric fields (day, limit), left in the hero amount |

### 6.3 Vertical rhythm

| Between | Spacing |
|---------|---------|
| Field groups | `--space-4` (16) |
| Related fields in one group (amount + chips; From + swap + To) | `--space-2` (8) |
| Section divider ("More" disclosure, consequence line) | `--space-5` (20) with a 1 px `--border` line |
| Inline banners (match suggestion, duplicate salary) | `--space-3` padding, `--radius`, `--space-3` gap from neighbours |

### 6.4 Layout rules

- **Single column by default.** Two columns only for short, related, same-type fields (amount + date, bill day + due day, limit + owed) **and only at ≥ 400 px container width**; below that they stack (V9). Implement with a container query (`@container (min-width: 400px)`) on the form, not viewport media queries, because the same form is used in a 480 px modal and a full-width sheet.
- Labels always **above** the field on both platforms (mobile drops floating labels).
- Long helper copy (> 1 line) goes behind an ⓘ tooltip or the "More" disclosure, never above the first field.
- The footer's primary button is right-aligned on desktop, full-width (with secondary as a text button above it) on phones.

### 6.5 Choice controls

| Use | Control | Size |
|-----|---------|------|
| Mode tabs (Spend · Income · Plan · Move) | Segmented track, equal widths | 44 px tall phone / 36 px desktop, `--fs-sm` 600 |
| 2–4 mutually exclusive options (Repeat, meaning, scope, Full/Min/Other) | Segmented or stacked radio cards | 44 px min; radio cards when options need a sub-line |
| Categories | Chip that opens a sheet/popover list | `--control-h-sm` |
| Quick amounts | Chips | `--control-h-sm`, `--fs-sm` |
| On/off (Carry into next month) | Switch with label on the left | 44 px row |

Replace all 22–28 px toggles (Refund, One-time/Recurring, Variable checkbox) with these.

### 6.6 Feedback

| Kind | Where | Look |
|------|-------|------|
| Field error | Under the field | `--fs-2xs`, `--danger`, icon |
| Form error (server) | Directly above the footer | Banner, `--danger-subtle` background, `--space-3` padding, `role="alert"` |
| Consequence line | Above the footer, under the last field | `--fs-xs`; neutral / amber / red; never a modal |
| Success | Toast, bottom on phone / bottom-right on desktop, 5 s, **Undo** | — |
| Confirmations (delete, history rewrite) | Inline confirm in the footer ("Delete this spend? [Keep] [Delete]"), not `window.confirm` | — |

No `alert()` or `window.confirm()` in any entry or edit flow.

### 6.7 Implementation notes

- Add `.field`, `.field-label`, `.field-hint`, `.field-error`, `.field-control` (and modifiers `--hero`, `--sm`) to `components/controls.css`; make `input, select, textarea` defaults inherit `--control-h` and `--fs-input` on phones. Define `.input-field` as an alias during migration (fixes B11), then remove.
- Move every inline style in `UnifiedEntryModal.jsx`, the settle modal and `AccountSelect.jsx` into classes (V8). Add a lint rule or test that fails on `style={{` inside `components/*Modal*.jsx` and form components.
- Flutter: one `AppInputDecoration` and `AppSheet` widget with the numbers above; replace per-file `InputDecoration(... OutlineInputBorder())` and `EdgeInsets.all(20)`.
- Visual regression: Storybook-style fixture page (or Playwright screenshots) for each form at 360 px, 480 px and 1280 px, light and dark.

---

## 7. Shared building blocks

| Component | Replaces | Notes |
|-----------|----------|-------|
| `MoneyInput` | All amount inputs (entry, settle, HL, card limit/owed, bill amount, pay amount) | Prefix, numeric/decimal keypad, sign toggle, preset chips that set the value, "All ₹X" fill, minor-unit conversion |
| `DateChip` | DatePicker + native date inputs | Today / Yesterday / Pick, min/max per mode |
| `DayOfMonthPicker` **(HL)** | Recurring day input, card bill/due day inputs | 1–31 grid, "Last day", optional next-date preview |
| `AccountChip` | AccountSelect, native selects, mobile AccountSelector | Sections Banks · Wallets · Cards; balance or "owes ₹X"; remembers last per mode |
| `CounterpartyPicker` **(HL)** | AccountSelect for "To", person `<select>` + Name field | Sections My accounts · Cards · People; search; create-person inline |
| `CategoryChip` | Pill grids | Suggestion, custom, recent first |
| `ChoiceGroup` | Ad-hoc toggles, HL action grid, Full/Min/Other, scope buttons | Segmented or radio-card variant |
| `ConsequenceLine` | Floor-breach dialog, variance banner | Balance, floor margin, held reserve, card headroom/payability |
| `ChangeSummary` | — | Diff of edited fields |
| `FormFeedback` | `alert()`, banners, SnackBars | Field errors, form error, toast + Undo |
| `DiscardGuard` | — | Unsaved-changes confirm |
| `FormSheet` | `.modal-content` + `.hl-modal-body` + mobile `_Sheet` / per-file containers | Padding, header, sticky footer per §6.1 |

Validation rules (amount > 0, accounts differ, date bounds, name fallback, return ≤ outstanding, bill/due day 1–31) live in `packages/engine` with a shared test table that the Dart port also runs.

---

## 8. Copy changes

| Today | Proposed |
|-------|----------|
| Payment Account * / Dedicated Account * | Paid from |
| Deposited To (Account) * | Received in |
| Source Account (Outflow) / Destination Account (Inflow) | From / To |
| Expense Debit / Credit / Refund | (sign toggle) Spend / Refund |
| Category & Classification / Category tag | Category |
| Description note (optional) | What for? |
| Same-day priority | If money is tight, pay this… |
| Variable (ℹ Expense Rollover Mode) | Carry into next month |
| Recurrence Update Scope · This & all future · Update baseline | Apply to: Only this month · This and future months |
| Zero-Sum / Direct Inflow pills | (remove) |
| Log expense debit / Save planned item / Record Transfer | Save spend / Save bill / Save transfer |
| Update expense debit / Update Planned Item | Save changes |
| Quick Log & Schedule / Actual Spend / Planned Expense / Transfer / Held / Lent | Spend / Income / Plan / Move |
| Receive to hold · Return · Lend · Got back (HL) | Hold their money · Return their money · Lend · They paid me back |
| Whose money / Who (HL) | Who |
| Paired Account Transfer | Move money |
| Bill generation day (HL) | Bill date (day of month) |
| Owed right now / Owed when added (HL) | Owed today / Owed when you added the card |
| Log the ₹X difference as card charges… so the card matches (HL) | Log ₹X as card charges · Just update the bill |
| Move to Held & Lent (HL) | This was someone else's money |

---

## 9. Roadmap

### Progress (branch `feat/entry-forms-upgrade`)

| Phase | State | Notes |
|-------|-------|-------|
| 0 | Done | B1–B8 (B3 keeps Salary out of the income pills by design; B5 has a confirm, no 5-second Undo yet) |
| 1 | Done | Tokens, field/trigger sizes, 16px phone inputs, container-query layouts, Flutter `AppForm` theme, modal portal + z-index scale (V13) |
| 2 | Done | Settle form (web: entry sheet + Transactions; mobile keeps Mark Paid without the remainder choice), Move tab with My accounts / Pay a card / A person on both platforms, W7 + M2 + M4 removed, card "Pay bill" opens Move in the app, no `alert()` in entry, settle, bank or wallet forms |
| 3 | Done | Quick amounts set the value, category suggestion (history, then keywords; same lists on both platforms), remembered account per entry type and transfer pair, Save & add another with a session counter (Ctrl/⌘+Enter on web), live "After this" line, discard guard, toast with Undo after saves (web), `N` opens the sheet (web). Kept by design: a floor breach still needs an explicit "Confirm Anyway" (now inline, not a dialog), per the existing safety-floor rule and tests. Not done: summary-chip layout for date/account (§5.1), copy changes (§8) |
| 4 | Done | Web: "what's changing" summary in edit (Save stays enabled; two existing tests save unchanged edits), Delete inside the edit form with inline confirm, recurring scope asked only once something changed, "Payment done" only when editing (new bills get "Already paid? Log it as spend"), goal edit (sends only changed fields), card edit warns when "Owed when added" changes plus Remove card and a close button, opening-balance warning on bank/wallet edit, held/lent rows get "Delete and log again". Mobile: edit mode in the entry sheet (spend, income, planned bill, goal) from the detail sheet and goal cards, card edit/remove, opening balance with warning (sent only when changed). Not done: convert type (needs an API) |
| 5 | Not started | |


| Phase | Contents | Size | Done when |
|-------|----------|------|-----------|
| **0 — Fix trust bugs** | B1–B11 (B9–B11 on the HL branch before it merges) | S (2–3 days) | Each bug has a regression test (Vitest / Dart widget test) |
| **1 — Visual foundation** | §6 tokens, `.field` classes, `FormSheet`, Flutter input theme; remove inline styles from entry/edit forms; 16 px inputs on phones | M (1 week) | No iOS zoom on focus; every field 44/40 px; one focus ring; screenshot fixtures at 360/480/1280 px pass |
| **2 — Shared blocks, one of each flow** | §7 components; remove W7, M2, M4, M7's separate sheet; one Settle sheet; Move tab covering accounts, cards and people | M–L (1.5–2 weeks) | One move form and one settlement flow per platform; bills payable from the entry sheet; no `alert()` in entry flows |
| **3 — Fast logging** | Essential row + chips, remembered defaults (incl. card and person), category suggestion, Save & add another, consequence line (cash, held, card), discard guard, shortcuts | M (1 week) | Spend with defaults = 2 interactions; 5 entries without reopening |
| **4 — Better editing** | Change summary, Delete in forms, scope-at-save, mobile edit mode, goal and card edit, held/lent "Delete and log again", history-rewrite warnings | M (1 week) | Every record type is editable (or has a guided re-log) on both platforms; edits never change untouched fields |
| **5 — Smart assists** | Fuzzy bill match, duplicate-salary guard, person hint on income/spend, expected repayment dates, card bill difference hints, convert type (needs API) | M–L | Suggestions appear for ±10% / name matches; no duplicate salary in test months |

**Order with the HL branch:** fix B9–B11 on `feat/held-lent-funds` and merge it before Phase 1, so the visual foundation and the Move tab are built once over the final set of forms rather than retrofitted.

### How to measure it

- **Time to log** (open → saved) for spends and moves, median and p90, by platform. Target: median ≤ 5 s on mobile for spends, ≤ 8 s for lend/hold.
- **Fields touched per save.** Spends ≤ 2.
- **Edits within 10 minutes of creation.** −40%.
- **Unlinked spends that match a pending bill.** −60%.
- **Reclassifications to Held & Lent after the fact** (should fall as the entry-time hint lands).
- **Abandoned sheets** with an amount entered.
- **Zoom-on-focus events / layout shifts** in the sheet on iOS Safari: 0.

---

## 10. Open questions

1. Should spend chips stay additive for anyone? Check usage before removing.
2. Convert-type endpoint: one call, or two calls in a server transaction?
3. Categories: fixed set + custom, or fully user-defined? Affects category-breakdown charts.
4. Goals stay out of the mobile entry sheet (recommended, matches web)?
5. **(HL)** Held/lent inside **Move** (recommended) or a 5th **People** tab? Decide with a quick hallway test of "You lent Rahul ₹2,000 — log it".
6. **(HL)** Can the API allow date and note edits on pass-through rows without breaking ADR 0069's direction checks? If not, "Delete and log again" is the only edit path.
7. **(HL)** Should a card be selectable as a transfer *source* (cash advance) in Move, or only as a destination (bill payment)?
