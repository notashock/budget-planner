# ADR 0042: Goal Deferral Zero-Baseline Month Provisioning, Month Deletion Cascade, Predecessor Baseline Inheritance, and System Theme Matching

## Status
Accepted

## Context
1. **Goal Deferral Month Pipeline & Salary Zero-Baseline**:
   - When a purchase goal is deferred into the following month (manually or automatically via dynamic safety checks), the system automatically provisions that month if it does not already exist.
   - Previously, the system cloned the previous month's salary amount, credit date, and deposit settings into the new month.
   - However, the user requires an explicit pipeline rule: auto-created months from deferred goals must not invent or assume pre-credited salary or opening balances. They must be initialized with zero salary (`incomeAmount: 0`), zero opening balance, uncredited status (`isSalaryCredited: false`), and no salary date, while inheriting the previous month's safety floor so emergency buffer checks remain active until the user logs their real salary.

2. **Month Deletion Cascade**:
   - The user requires the ability to delete months via a delete icon in the month selector dropdown.
   - Deleting a month requires an explicit confirmation prompt to safeguard against accidental data loss.
   - Deletion must cleanly cascade and purge all linked records (planned items, actual transactions, transfers, and goals belonging to that month).
   - If the user deletes the month they are currently viewing, the system must automatically transition them to the nearest remaining month.

3. **Predecessor Baseline Inheritance for Manual Month Creation**:
   - During manual month creation, the default income and safety floor should automatically roll forward from the latest chronologically preceding month in the user's history (falling back to current month).
   - If no predecessor month exists (e.g. fresh user onboarding), both income and safety floor must default strictly to zero ($0$).

4. **Account Type Synchronization**:
   - The account type choices in `CreateMonthModal` (fresh user setup) and `TransferCalculationsModal` diverged from `BankAccount` model's canonical enum (`['checking', 'savings', 'salary', 'other']`).
   - They must be synchronized to use the canonical options and styled via `CustomSelect`.

5. **Zero-Baseline Salary Window Exemption**:
   - Months initialized with zero income or zero safety floor must not be locked by the expected salary window in `getSalaryWindowStatus`. Users must always be able to log or link their salary via the profile dropdown.
   - The redundant "Link Salary" button on the desktop navbar is removed, keeping a single canonical link in the profile dropdown.

6. **Missing `loadAccounts` in Fresh Account Creation**:
   - Creating a month for a fresh account threw `ReferenceError: loadAccounts is not defined` because the helper was invoked in `App.jsx` without being declared.

7. **System Theme Matching**:
   - The user requires a theme option that matches the operating system theme (`prefers-color-scheme`), cycling through `System (Auto) ➔ Light ➔ Dark ➔ System` from the header button.

## Decisions

### 1. Goal Deferral Zero-Baseline Provisioning
- In `apps/server/src/routes/goals.js` and `apps/server/src/routes/transactions.js`:
  - When auto-creating `nextMonth` upon goal deferral:
    - Set `openingBalance: 0`.
    - Set `incomeAmount: 0`.
    - Set `incomeCreditDay: null`.
    - Set `incomeCreditDate: null`.
    - Set `salaryBankAccountId: null`.
    - Set `isSalaryCredited: false`.
    - Set `salaryCreditedDate: null`.
    - Inherit `safetyFloor: currentMonth.safetyFloor` to maintain baseline floor integrity.

### 2. Month Deletion Cascade & Navigation
- In `apps/server/src/routes/months.js`:
  - Implement `DELETE /api/months/:year/:month`:
    - Find the target month: `Month.findOne({ userId, year, month })`.
    - Cascade delete: `Item.deleteMany({ monthId })`, `Transaction.deleteMany({ monthId })`, `Transfer.deleteMany({ monthId })`, and `Goal.deleteMany({ monthId })`.
    - Remove the month: `Month.findByIdAndDelete(month._id)`.
- In `apps/web/src/components/Header.jsx`:
  - Render a trash icon button beside each month entry in the month dropdown.
  - Clicking delete prompts an explicit confirmation dialog: `"Are you sure you want to delete [Month Year] and all its associated items, transactions, and transfers?"`.
  - When confirmed, call `onDeleteMonth(year, month)`.
- In `apps/web/src/App.jsx`:
  - When the deleted month is the currently active month, automatically switch `currentMonth` to the nearest remaining month.

### 3. Predecessor Baseline Inheritance
- In `apps/web/src/components/MonthModals.jsx` (`CreateMonthModal`):
  - When selecting year/month, resolve the latest existing month that chronologically precedes the chosen date.
  - Default `incomeAmount` and `safetyFloor` from that predecessor month, falling back to zero if no predecessor exists.
- In `apps/server/src/routes/months.js` (`POST /api/months`):
  - If `incomeAmount` or `safetyFloor` is undefined in the request payload, query the latest prior month (`{ year: { $lte: year }, month: { $lt: month } }`) and inherit values, defaulting to 0 if none exist.

### 4. Account Type Synchronization
- In `apps/web/src/components/MonthModals.jsx` and `apps/web/src/components/TransferCalculationsModal.jsx`:
  - Synchronize account type options to `[checking, savings, salary, other]`.
  - Replace native `<select>` with `CustomSelect` for consistent elevated styling.

### 5. Zero-Baseline Salary Window Exemption & Navbar Cleanup
- In `packages/engine/src/calendar.js` (`getSalaryWindowStatus`):
  - Mark a month as unconfigured (`isUnconfigured: true`, `isLocked: false`) whenever `!month.incomeAmount || Number(month.incomeAmount) <= 0`.
- In `apps/web/src/components/Header.jsx`:
  - Remove the extra `.header-link-salary-btn` from the desktop navbar.
  - In the profile dropdown, allow "Link Salary & Safeline" to be clicked whenever income is 0 or window is unlocked.

### 6. Declare `loadAccounts` in `App.jsx`
- In `apps/web/src/App.jsx`:
  - Declare `const loadAccounts = async () => { ... }` fetching bank accounts and wallets via `api.getBankAccounts()` and `api.getWallets()`.

### 7. System Theme Matching Cycle
- In `apps/web/src/App.jsx`:
  - Track `themeMode`: `'system' | 'light' | 'dark'`.
  - Listen for system preference changes via `window.matchMedia('(prefers-color-scheme: dark)')` when in `'system'` mode.
  - Cycle handler toggles: `system ➔ light ➔ dark ➔ system`.
- In `apps/web/src/components/Header.jsx`:
  - Render corresponding icon: Monitor icon for system, Sun for light, Moon for dark.
