# 38. Consolidated Single Migration Flow and Header Salary & Safeline Linking

Date: 2026-10-04

## Status

Accepted

## Context

Previously, data migration and month configuration were fragmented across multiple surfaces:
1. Migration controls appeared in standalone migration modals, an optional checkbox inside the Add Bank Account modal on `AccountsScreen`, and on the Plan screen banner.
2. Month settings (monthly income, salary credit date, salary depository, and safety floor) lived in a standalone card on `AccountsScreen`.
3. When zero bank accounts were linked, a user could create an isolated month without a salary depository, leaving calculated state disconnected from banking ledgers.

The user required:
- Consolidating all migration flows into a single, unified migration flow ("Transfer Existing Calculations to Bank Account").
- Removing the "Current month settings" card from `AccountsScreen`.
- Ensuring that creating a month requires linking the salary bank account (or creating a primary bank account inline if zero accounts exist).
- Providing a dedicated button beside the month in the header for already-created months to link/edit the salary credited account, salary amount, and overall safeline (which applies globally to the entire month across all accounts).

## Decision

1. **Single Unified Migration Flow**:
   - Remove legacy migration checkboxes and secondary popups from `AddBankAccountModal` and `AccountsScreen`.
   - The Plan screen "Transfer Existing Calculations" card is the sole entry point for data migration.
   - If 0 accounts exist, the modal collects bank name and institution, displays the transfer preview (opening balance, salary, planned items, and transactions), and creates the primary bank account and executes migration in a single atomic submission.
   - If accounts exist, it provides an account dropdown with 1-click migration.

2. **Removal of Month Settings from AccountsScreen**:
   - Delete the "Current month settings" card from `AccountsScreen`.
   - Clean up `AccountsScreen` to focus purely on bank accounts and wallets management.

3. **Mandatory Salary Linking on Month Creation (`CreateMonthModal`)**:
   - When accounts exist, selecting the salary credited account is required when creating a month.
   - When 0 accounts exist, the modal requires defining the primary bank account inline, guaranteeing no month is created without an account.

4. **Header "Link Salary & Safeline" Button & Modal**:
   - A button beside the month selector in the header allows editing the salary credited account, salary amount, and overall safeline.
   - The safeline is strictly treated as the overall safeline for the entire month, protecting aggregate liquidity.
   - Updates immediately re-simulate the active month in memory without requiring a page reload.

## Consequences

- Zero confusion from overlapping migration dialogs or hidden settings.
- All monetary flows (salary deposits, safety floor, planned items, and expenses) are bound to banking institutions.
- The UI maintains the Swiss-linear monochrome aesthetic with clear optical hierarchy.
