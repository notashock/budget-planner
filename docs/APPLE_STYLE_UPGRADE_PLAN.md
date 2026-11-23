# Apple-style upgrade: every screen and entry sheet

Date: 2026-11-23. Extends `docs/PLAN_PAGE_ROADMAP.md` (the Plan page, phases 0–5 merged in #28–#33) to the rest of
the app. **Layout references:** Apple Music on phones for the mobile app, and Apple Music on the web
(music.apple.com) for the web app.

What we take from Apple Music is layout and behaviour: large titles, a docked bar above the tabs, shelves, inset
grouped lists, sheets and a sidebar. We do not copy its brand: no red accent, artwork, icons or product names. Text uses
the system font, so iPhones and Macs get SF and everyone else gets Inter.

This plan sets the look and layout. How the entry forms behave (defaults, validation, the Move tab) stays as decided
in `docs/ENTRY_FORMS_UX_UPGRADE_PLAN.md`, which is mostly shipped.

---

## 1. What Apple Music does that we borrow

| Apple Music pattern | Where it shows up | Our use |
|---|---|---|
| Large title per tab, shrinking to a small centred title on scroll, with the profile picture on the right | Every tab on the phone | Every screen header (§3) |
| Mini player docked above the tab bar; tap it for the full Now Playing sheet | Phone | **Today bar**: safe to spend and a quick "Add" field; tap it for the entry sheet (§2.1) |
| Shelves: a section title with "See All ›" and a short horizontal row | Home, Browse | Goals, upcoming bills, account cards |
| Inset grouped lists with a value on the right and a chevron | Library, Settings | Accounts, entry sheet fields, transaction detail |
| Search field that appears when you pull the list down | Library | Transactions |
| Swipe and long-press actions on rows | Songs list | Mark paid, edit, delete |
| Sidebar with a search field, the main sections, then the user's own collections | Web | Web navigation, with the user's accounts as the "collections" (§2.2) |
| A lozenge in the centre of the top bar showing what's playing | Web | **Today lozenge**: safe to spend, days left, sync state |
| Column list with sortable headers | Web songs list | Transactions on wide screens |

## 2. App shell

### 2.1 Mobile (phones, < 768 px web and the Flutter app)

```
┌───────────────────────────────────────┐
│ Plan                    Nov ▾    (A)  │ ← large title; month menu; avatar
│ ...screen content...                  │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ ＋  Add spend…                      │ │ ← Today bar (blurred material), 56 px
│ └───────────────────────────────────┘ │
│  Plan  Transactions  Goals  Accounts  │ ← tab bar, 4 tabs, no centre button
└───────────────────────────────────────┘
```

- **Tab bar:** Plan, Transactions, Goals, Accounts. The floating **+** goes away; adding moves to the Today bar.
- **Today bar** sits above the tab bar on every tab, like the mini player. It holds only the Add field (decided
  2026-11-23); safe to spend stays on the Plan page.
  - tap anywhere opens the entry sheet on Spend, with the amount field focused; long-press opens a menu with
    Spend, Income, Plan and Move.
  - while there are unsynced entries, it reads "2 waiting to sync" beside the field (replacing the separate sync
    strip).
- **Avatar** at the right of every large title opens the **You** sheet: theme, app lock, server, the Assistant,
  sign out. Assistant leaves the main navigation.
- Android keeps its own behaviour: predictive back, edge to edge, 48 dp targets (mobile plan 3.2). This replaces only
  the *look* in mobile plan 3.1 (Material 3); the shared tokens in 3.1 stay.

### 2.2 Web (≥ 1024 px)

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│ Budget       │        ┌──────────────────────────────┐   [＋ New]  (A)   │ ← toolbar
│ [Search    ] │        │ ₹420 safe today · 8 days left │                  │   Today lozenge
│              │        └──────────────────────────────┘                  │
│ ◉ Plan       │  Plan                                     November ▾     │ ← large title
│ ≡ Transactions│ ...content, max 1200 px...                              │
│ ◎ Goals      │                                                          │
│ ▭ Accounts   │                                                          │
│              │                                                          │
│ ACCOUNTS     │                                                          │
│  HDFC  ₹340  │  ← click = that account, everywhere                      │
│  Paytm  ₹15  │                                                          │
│  Card  −₹2.5k│                                                          │
│              │                                                          │
│ ✦ Assistant  │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

- **Sidebar (240 px):** search (searches transactions, goals and accounts), the four sections, then **Accounts**
  with live ledger balances (the "collections"), and Assistant at the bottom. Choosing an account filters every
  screen to it, replacing the account pills on wide screens.
- **Toolbar:** the Today lozenge in the centre (tap = Plan's chart), one primary **New** button (keyboard `N`), avatar.
- **768–1023 px:** the sidebar shrinks to icons only. **< 768 px:** the mobile shell from §2.1.
- The month menu moves from the global header into each screen's large title, because some screens (Accounts, Goals)
  don't depend on the month and shouldn't show it.

## 3. The screen header (one component, every screen)

```
Large:   Transactions                       ⌕   ⋯   (A)      ← 34 pt title, trailing actions
Compact: ‹      Transactions                ⌕   ⋯           ← 17 pt, blurred, after 40 px of scroll
```

| Part | Rule |
|---|---|
| Title | Screen name only. No subtitle sentence ("Everything you have paid…" goes). |
| Trailing actions | At most 2 icon buttons plus the avatar on mobile; on web, the avatar is in the toolbar instead. |
| Month | A text menu ("November ▾") only on screens that depend on the month (Plan, Transactions). |
| Under the title | One optional control: account pills (mobile Plan), a segmented control (Transactions) or nothing. |
| Scroll | The large title scrolls away; the compact bar fades in with a blur. Reduced motion: no fade, it just swaps. |

Built once as `<ScreenHeader>` (web) and `ScreenHeader` (Flutter); every screen passes its title, actions and the
optional control. Each screen's header is listed in §4.

## 4. Screens

Each screen keeps the Plan page rules: under 60 words above the fold, no amount shown twice, whole rupees on summary
screens, colour only for status.

### 4.1 Plan (built in Phase 5; small changes)

| | |
|---|---|
| Header | "Plan" · trailing: month menu · avatar. Under it: account pills (mobile only; the sidebar does it on web). |
| Top | Safe to spend today with sparkline; Due soon (3 rows). |
| Changes | Hero tap opens the chart as a sheet (mobile) or expands in place (web), loading from `/timeline`. Net worth row (roadmap Phase 6) under Due soon. Category breakdown and filter chips leave Details for Transactions. |

### 4.2 Transactions

```
Transactions                 Nov ▾  ⋯  (A)
[  Paid  |  Planned  ]                     ← segmented control
⌕ Search (pull down)
Spending in November ›   ▇▇▇▅▃ ₹15,500     ← one-line shelf; opens the category breakdown
TODAY · MON 23                             ← sticky day header
  SIP              HDFC · Investments   ₹3,000  ○
YESTERDAY · SUN 22
  Swiggy           Paytm · Food          ₹240
```

| | |
|---|---|
| Header | "Transactions" · trailing: month menu, ⋯ (filter by account, category, status; sort) · avatar. Under it: Paid / Planned. |
| Top | The spending line, then the list grouped by day with sticky day headers. Overdue items pin to the top of Planned in red. |
| Rows | Name; caption "Account · Category"; amount right; planned rows get the mark-paid circle. Swipe right = mark paid, left = edit / delete, long-press = the same menu. |
| Web | Over 1024 px the list becomes columns (Name, Category, Account, Date, Amount) with sortable headers, like Apple Music's song list. Clicking a row opens the detail as a side panel, not a modal. |
| Removes | The subtitle, the separate filter-chip bar, the "New Entry" button (the Today bar / toolbar does it), per-row icon buttons (moved to swipe and menu). |

### 4.3 Accounts

```
Accounts                          ＋  (A)
Net worth                                  ← Phase 6
₹33,500   ↑ ₹1,200 this month
BANK ACCOUNTS
  HDFC Salary            ₹34,000  ›
WALLETS
  Paytm                   ₹1,500  ›
CARDS
  HDFC Card     −₹2,500 · due 5 Dec ›
PEOPLE
  Rahul owes you            ₹500  ›
```

| | |
|---|---|
| Header | "Accounts" · trailing: ＋ (menu: Bank account, Wallet, Card, Person) · avatar. No month: balances are today's. |
| Top | Net worth number and trend (roadmap Phase 6), then inset grouped sections. Totals of inflow, outflow and net movement move into each account's page. |
| Account page | Pushed screen, large title = account name. Balance, a 30-day sparkline, "Keep at least", then recent activity. Trailing actions: Transfer, ⋯ (edit, archive). |
| Removes | The always-open add-bank and add-wallet forms (now sheets from ＋), the transfer panel on the main screen (now the Move sheet), the subtitle. |

### 4.4 Goals

```
Goals                             ＋  (A)
READY TO BUY                     See all ›
 [◔ Headphones ₹8k] [◕ Desk ₹12k]          ← shelf of cards with a progress ring
SAVING
  Laptop        ₹40,000 · Mar 2027   35% ›
LATER
  Trip          ₹60,000 · no date        ›
```

| | |
|---|---|
| Header | "Goals" · trailing: ＋ (new goal sheet) · avatar. |
| Top | "Ready to buy" shelf (fits this month without dropping below the minimum), then Saving and Later as grouped lists. |
| Goal page | Pushed screen: target, saved so far, the month it fits, funding account, and the one action "Buy now" or "Schedule". |
| Removes | The inline Set Target Purchase form (now a sheet), "Goal Scorecard (Archive)" as a section (it moves under ⋯ → Past goals), the "Total Evaluated / Safety cushion" stats. |

### 4.5 Assistant

| | |
|---|---|
| Where | The You sheet on mobile; the bottom of the sidebar on web. |
| Header | "Assistant" · trailing: close. |
| Layout | Suggestions as a shelf ("Review this month", "Log from a message"), then the conversation, with the composer docked at the bottom. A drafted item shows as an entry-sheet preview with Add and Edit. |

### 4.6 Sign in, onboarding, app lock

| | |
|---|---|
| Sign in | Full screen, app name as a large title, email and password in one inset group, one primary button. "Server" sits behind an "Advanced" link (mobile plan 3.8). |
| Onboarding | A short pager (3 steps: income type, first account with opening balance, a minimum to keep). Each step has a large title, one question and Continue. Skip is allowed after step 2. |
| App lock | The app's icon, "Locked", and one Unlock button. The privacy shield blurs content in the app switcher. |

### 4.7 Month flows (month-end review, rollover, salary schedule)

Large sheets with a step header ("1 of 3") and one decision per step, like Apple's setup screens. The month-end
review lists planned items that weren't paid, with Paid / Skip / Move to next month per row (swipe or buttons), then a
summary step. Rollover becomes the last step of the review instead of a separate modal.

## 5. Entry sheets and every modal

### 5.1 One sheet anatomy

```
Mobile (bottom sheet)                 Web (centred, 480 px)
──────── (drag handle) ────────       ┌──────────────────────────────┐
Cancel      New spend        Add      │ Cancel    New spend      Add │
[Spend | Income | Plan | Move]        │ [Spend|Income|Plan|Move]     │
                                      │                              │
₹ 1,250                               │ ₹ 1,250                      │
500 · 1k · 2k · 5k                    │ 500 · 1k · 2k · 5k           │
┌──────────────────────────────┐      │ ┌──────────────────────────┐ │
│ What for     Groceries      │      │ │ What for    Groceries    │ │
│ Category     Food         › │      │ │ Category    Food       › │ │
│ Paid from    HDFC ₹42,300 › │      │ │ Paid from   HDFC       › │ │
│ When         Today        › │      │ │ When        Today      › │ │
└──────────────────────────────┘      │ └──────────────────────────┘ │
After this: ₹41,050                   │ After this: ₹41,050          │
Note, link to a bill ›                │ Note, link to a bill ›       │
[ Add & log another ] (keyboard bar)  │      ⌘↵ add & log another    │
                                      └──────────────────────────────┘
```

- **Top bar:** Cancel · title · **Add** (bold; becomes "Add anyway" in amber when it would drop below the minimum).
  This replaces the ✕ and the sticky footer. "Add & log another" sits on the keyboard accessory bar on mobile and is
  `⌘/Ctrl+Enter` on web.
- **Fields are an inset grouped list:** label on the left, value on the right, chevron where it opens a picker. This is
  the Apple form of the "summary chips" still open in entry plan §5.1.
- **Pickers push inside the sheet** (account list, category list, calendar) with a back arrow, instead of opening a
  second modal on top.
- **Mobile sheet heights:** medium (about half the screen) for Spend with the keyboard closed; large when the keyboard
  is open or a picker is pushed. Swipe down = Cancel, with the existing unsaved-changes guard.
- **Confirmations** are action sheets on mobile and small dialogs on web: one line of text, the destructive action in
  red, Cancel. No `confirm()`.

### 5.2 Every sheet and modal, mapped

| Today (web / mobile) | Becomes |
|---|---|
| `UnifiedEntryModal` / `unified_entry_modal.dart` | The §5.1 sheet, four segments. |
| `SettleForm`, Mark Paid (Transactions), `mark_paid_modal.dart` | "Mark paid" sheet: amount (prefilled), date, account rows, and the remainder choice as one grouped row. Opened by the row's circle or a swipe. |
| `transaction_detail_modal.dart`, web row expand | Detail sheet (side panel on web): big amount, name, then grouped rows (account, category, date, status, note) and an actions group (Edit, Mark paid, Move to Held & Lent, Delete in red). |
| `HeldLentForm`, `held_lent_modal.dart`, `ReclassifyHeldLentModal` | The Move segment with a person (already decided in the entry plan); reclassify is "Move to Held & Lent" in the detail sheet. |
| `GoalEditForm`, Set Target Purchase, goal edit on mobile | "New goal" / "Edit goal" sheet: name, amount, target month, funding account, priority as a 3-way segmented control. |
| Add/Edit Bank, Add/Edit Wallet, `edit_account_modal.dart`, `card_modals.dart` | One "Account" sheet with type as the first row (Bank, Wallet, Card); card fields appear only for Card. Archive and Remove live in the account page's ⋯. |
| Transfer Funds panel, `TransferCalculationsModal` | The Move segment; the calculation breakdown becomes the "After this" line and a "Details ›" row. |
| `SalarySafelineModal`, `salary_safeline_modal.dart` | "Salary" sheet in the month flow (§4.7) and under You → Income. |
| `MonthEndReviewModal`, `month_review_modal.dart`, `MonthRolloverModal`, `month_modals.dart` | The step sheets of §4.7. |
| `OnboardingModal` | The onboarding pager (§4.6). |
| `AuthScreen`, `auth_screen.dart`, `app_lock_screen.dart`, `server_settings_dialog.dart` | §4.6. |
| `confirm_dialog.dart`, inline confirms | Action sheet / small dialog (§5.1). |
| `app_date_picker.dart`, `DatePicker` | Inline calendar pushed inside the sheet, with Today, Tomorrow and "Next salary" shortcuts above it. |
| `app_lock_settings_sheet.dart`, theme cycling in the header | Rows in the You sheet. |

## 6. Visual system

One set of tokens in `apps/web/src/styles/tokens.css`, mirrored in `apps/mobile/lib/theme/app_theme.dart`.

| Token | Value |
|---|---|
| Type | 3 sizes per screen: **Large title** 34 (web 32), **Body** 17 (web 15), **Caption** 13 (web 12). The hero number is the one exception (56 mobile, 44 web). Every amount uses tabular figures. |
| Colour | Neutrals with a slight cool tint; **one brand accent, indigo** (`--brand` #4F46E5 light, #8B85FF dark) for buttons, links, the selected tab and focus rings; status colours (green, amber, red) only for status. Indigo keeps clear of all three status colours, so the existing emerald `--primary` is retired as an accent. Each colour has a light and a dark value that pass AA contrast. |
| Materials | Blurred, translucent backgrounds only on things that float over content: compact header, Today bar, tab bar, web toolbar. |
| Shape | Grouped lists 12 radius, sheets 20 (top corners on mobile), cards in shelves 16, pills fully round. |
| Spacing | 16 side margins on phones, 24 on web; 8-point grid; 32 between sections. |
| Motion | Sheets slide up with a short spring; large title collapses with scroll; mark-paid shows a check and a light haptic on phones. All motion is off with reduced motion. |
| Icons | One outline set (the existing `Icons.jsx` set, mirrored in Flutter); no emoji in the interface. |

## 7. Phases

Each phase ships web and mobile separately (web first, mobile right after), with tests updated and one PR per screen
where practical. Mobile PRs also run on a phone or emulator before merge.

| Phase | Scope | Done when |
|---|---|---|
| **A. Foundations** | Tokens (§6), `ScreenHeader`, web sidebar + toolbar + Today lozenge, mobile tab bar + Today bar + You sheet; FAB removed. | Every screen renders inside the new shell with its header; keyboard and screen-reader pass of the shell; web and Flutter tests pass. |
| **B. Transactions** | §4.2, plus moving category breakdown and filter chips off Plan. | The task "What did you spend on food this month?" is answered in under 10 s by 4 of 5 people; under 60 words above the fold. |
| **C. Accounts + net worth** | §4.3, with roadmap Phase 6 (net worth). | Net worth equals bank + wallets + lent − cards − held for the test fixtures; account page works for bank, wallet and card. |
| **D. Goals** | §4.4. | "Can you afford the headphones this month?" answered correctly by 4 of 5. |
| **E. Entry sheet and modals** | §5 for every row of the §5.2 table. | Quick spend logged in under 5 s (mobile plan 3 exit); no modal opens on top of another; every modal from §5.2 is replaced. |
| **F. Sign in, onboarding, month flows, Assistant** | §4.5–4.7. | A new user reaches a working Plan page in under 2 minutes; month-end review done in one sheet. |
| **G. Polish and audit** | Dark mode pass, 200 % text, contrast audit, motion review on both platforms. | No unlabeled elements in a TalkBack and VoiceOver walk-through; golden images for light and dark. |

Order: A first (everything sits on it); then B–D in any order, one at a time; E can run alongside B–D because it
touches different files; F and G last.

## 8. Decisions in this plan, and what they replace

- **No floating + button.** The Today bar (mobile) and the toolbar's New button (web) replace it.
- **Assistant leaves the main navigation** (You sheet on mobile, sidebar foot on web).
- **The mobile look follows Apple Music, not Material 3.** This replaces only the visual part of mobile plan 3.1.
  Android back, edge-to-edge and target sizes stay.
- **The account pills stay on phones only.** On web the sidebar's account list does the same job.
- **Sheet top bar (Cancel / Add)** replaces the sticky footer from entry plan §5.1.

## 9. Answered by the owner (2026-11-23)

1. **Assistant** moves out of the main navigation: the You sheet on phones, the foot of the sidebar on web.
2. **Today bar** shows only the Add field. Safe to spend is on the Plan page and in the web toolbar's Today lozenge.
3. **Accent:** a brand colour instead of near-black: **indigo** (§6), chosen over deep blue, teal, violet and orange. It is one token if another hue is
   wanted later.
