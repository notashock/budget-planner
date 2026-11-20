# 0071: Mobile Offline Capture, Online Truth

## Context
People log spends on the phone at the counter, often on a weak signal. Before this change a failed save meant retyping it later. A save that timed out after it had reached the server could also be stored twice. The release branch (`release/mobile-evolution`) answered this with a full offline-first local database that recomputed balances on the phone. That reopens the web/mobile drift that ADR 0052 closed by moving every simulation to the server.

## Decision
1. **The server stays the only place balances are computed** (ADR 0052). The phone never adjusts Safe-to-Spend, balances or the plan for an entry the server hasn't stored yet. It shows the entry as waiting and the last server figures, labelled with their time.

2. **Captured writes:** only these three are captured on the phone:
   - a spend (refunds included);
   - an income;
   - mark-paid.

   Everything else (planned bills, goals, transfers, cards, accounts, held/lent) still waits for the server and fails if it can't be reached. These three are the ones people make away from a desk, and they can't conflict with each other.

3. **Write-ahead outbox:** a captured write is stored on the device (`budget_outbox_v1` in SharedPreferences) before it is sent. Each entry holds:
   - its POST path and body;
   - an Idempotency-Key made once at capture;
   - the user id that owns it.

   Each send, retry and replay uses that same key. A write that reached the server but whose reply was lost is answered from the server's idempotency store (`apps/server/src/middleware/idempotency.js`) and not run again.

4. **Sending:**
   - **First attempt:** made at once.
   - **No answer:** offline, timeout, 5xx, 401, or 409 while the first attempt is still running all keep the entry.
   - **Later:** kept entries are sent, oldest first, after the next successful load and every 30 s while the app runs. A pass stops at the first entry that can't be sent yet.
   - **Refused:** any other 4xx on the first attempt removes the entry and reports the error to the screen. On a background send, the entry is kept with the server's message and a snackbar says so. It is not sent again until the user retries or discards it.

5. **Key lifetime:** the server keeps idempotency keys for **7 days** (was 24 hours). The phone stops sending an entry on its own after 6 days and asks the user first, since a replay after the server has forgotten the key could duplicate a write that did arrive.

6. **Ownership:** entries belong to the user who made them. Signing out doesn't delete them, and nobody else sees or sends them; they go out the next time that user signs in. The app also starts signed in as the last known user when `/auth/me` can't be reached (a 401 still signs out), so capture works on a cold start without signal.

7. **UI:**
   - **Entry sheet:** a new spend or income no longer waits for the server; the sheet closes at once.
   - **Strip under the header:** shows `Saving "Tea" ₹20…`, `N waiting to sync` or `N not saved`. It opens a list with Sync now, Send and Discard.
   - **Mark paid:** still waits for the first attempt, then says if the payment was kept on the phone.

## Consequences
- **No double entries:** at most one row per captured entry within 7 days, even with lost replies and app restarts (`apps/mobile/test/outbox_test.dart`, airplane-mode test).
- **No local balances:** totals lag behind until the entry syncs. The list says so ("Balances and Safe-to-Spend change once the server has these entries.").
- **Not in the list or totals yet:** waiting entries are not in the Transactions list or the month totals until they sync; the strip is where they appear.
- **Bigger idempotency store:** the table holds a week of keys per user instead of a day.
- **Storage:** the outbox and the read cache (upgrade plan 2.6) live in app-private SharedPreferences, not encrypted. Moving them to an encrypted store is a later option if needed.
- **Not adopted:** a local SQL database (Drift). The JSON outbox is enough for a handful of entries; revisit only if it isn't.
