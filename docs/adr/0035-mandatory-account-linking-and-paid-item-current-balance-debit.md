# 35. Mandatory Account Linking and Paid Item Current Balance Debit

Date: 2026-10-04

## Context
Previously, transactions and planned budget items allowed an "Unassigned" fallback, where entries could float in a general cash pool without being linked to a registered Bank Account or Wallet. Furthermore, planned items marked as paid (`isPaid: true`) with scheduled days in the future only debited future daily points rather than immediately reducing the bank account's current balance (`todayBalance`). When users edited planned items to reassign bank accounts, matching logged transactions risked becoming desynchronized from the planned account.

## Decision
1. **Mandatory Account Linking in Entry Modals and API**:
   - Both planned budget items and logged transactions strictly require selecting an active Bank Account or Cash Wallet.
   - The "Unassigned" option is removed from the Unified Entry Modal.
   - If a user has no active bank accounts or wallets registered, entry submission is blocked and the application prompts the user to add their primary bank account first.
2. **Immediate Paid Planned Item Debit**:
   - In the simulation engine (`packages/engine/src/simulator.js`), any planned budget item marked as paid (`isPaid: true`) is treated as having settled on or prior to the current day (`effectiveDay = Math.min(targetDay, currentDay || targetDay)` for current months).
   - This immediately reduces the designated bank account's current balance (`todayBalance`), while unpaid items remain projected into the future, deducting strictly from Projected End (`endingBalance`).
3. **Synchronized Matched Transaction Attribution**:
   - When a planned budget item's assigned bank account or wallet is modified, any actual transaction matched to it (`tx.plannedItemId === item._id`) is automatically updated to the new account, ensuring planned and actual ledgers remain perfectly unified.
4. **Respective Account & Unified Display Deduction Sync**:
   - Reassigning an unpaid planned item shifts the deduction between the previous and new accounts' Projected End balances.
   - Reassigning a paid planned item shifts the deduction across both Current Balances and Projected End balances.
   - The Unified Display (aggregate `todayBalance` and `endingBalance`) accurately mirrors the mathematical sum of all accounts.

## Consequences
- No orphan or unassigned entries can be introduced into the system.
- Users always see bank account current balances that match their real-world liquid position when items are marked paid.
- Switching an item's account cleanly transfers the balance impact to the target bank account and updates all matching transactions.
