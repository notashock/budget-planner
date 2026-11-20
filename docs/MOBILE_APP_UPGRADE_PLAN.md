# Mobile App Upgrade Plan — Round Table & Roadmap

**Scope:** the Flutter app in `apps/mobile` (Android first, iOS second), and the server changes it needs.
**Goal:** upgrade features, UI experience, logic correctness and performance without breaking the money rules in `CONTEXT.md` and ADRs 0051–0070.
**Revision:** 1 · 2026-11-19 · based on `master` at `931eef1`.

---

## 0. What the audit found (evidence the panel worked from)

Every row below was checked by hand on `master` at `931eef1`. Commands: `flutter pub get`, `flutter analyze`, `flutter test`, `git log`/`git diff` against `release/mobile-evolution`.

### 0.1 Build health — the app on `master` does not build

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| B1 | `lib/main.dart` is saved as **UTF-16 LE with CRLF**, not UTF-8 | `file lib/main.dart` → "UTF-16, little-endian". Came in with `f2c0afc` "restore comprehensive Phase 1-4 main.dart integration" (git shows it as `Bin 4114 -> 16764 bytes`) | **Blocker** |
| B2 | `main.dart` imports **8 files that do not exist on `master`**: `providers/security_provider`, `services/cache_service`, `home_widget_service`, `quick_actions_service`, `sms_detection_service`, `widgets/privacy_blur_shield`, `biometric_lock_screen`, `sms_detected_banner` | A UTF-8 copy of `main.dart` gives **23 analyzer errors**. The files live only on `release/mobile-evolution` | **Blocker** |
| B3 | `flutter analyze` reports **"No issues found!"** anyway — it silently skips the UTF-16 file. The green result is false | Analyzer run on `master` | High |
| B4 | **No mobile job in CI.** `.github/workflows/ci.yml` runs engine, server and web only | `ci.yml` | High |
| B5 | `flutter test`: **81 tests pass** — but none of them import `main.dart`, so they cannot catch B1/B2 | `flutter test` → `+81: All tests passed!` | Info |

### 0.2 The unmerged branch

`release/mobile-evolution` holds 11 mobile commits that never reached `master` (Phases 1–4 plus two redesigns). It is **87 commits behind `master`** and touches 79 files (+16,827 / −1,409). It adds:

| Area | What it adds | Packages |
|------|--------------|----------|
| Security | Biometric lock, vault keypad, secure token storage, privacy blur when backgrounded | `flutter_secure_storage`, `local_auth` |
| Offline-first | Drift (SQLite) local DB, local repository, outbox sync, sync status UI; server idempotency middleware | `drift`, `sqlite3_flutter_libs`, `uuid`, `connectivity_plus` |
| Platform | Home-screen widget, app quick actions, SMS debit detection, receipt OCR | `home_widget`, `quick_actions`, `google_mlkit_text_recognition`, `image_picker`, `permission_handler` |
| UI | "Groww-style" fintech UI, then an Apple-HIG / Cupertino redesign of all 6 screens, swipeable transaction cards, dynamic header pill | — |
| Permissions | `READ_SMS`, `RECEIVE_SMS`, `CAMERA`, `USE_BIOMETRIC` | — |

It also predates the held/lent (ADR 0069), credit-card (ADR 0070), refunds and entry-form work now on `master`.

### 0.3 Logic correctness

| # | Finding | Where |
|---|---------|-------|
| L1 | `_fetchActiveMonthDetails` treats **any** failure (offline, 401, 500, bad JSON) as "month does not exist" and wipes transactions, goals and the simulation. A flaky network looks like an empty month | `providers/budget_provider.dart:133-185` |
| L2 | `_fetchAccountsAndTransfers` and `refresh()` swallow every error; `refresh()` never sets `error`. A failed save-then-reload shows stale data with no message | `budget_provider.dart:187-201` |
| L3 | If `SimulationResult.fromJson` throws, the old simulation is kept silently — balances from the previous state are shown as current | `budget_provider.dart:162-180` |
| L4 | If the current month is missing, `loadInitialData` picks `_months.first` — correct only if the server sorts newest-first. Order is not part of the API contract | `budget_provider.dart:97-104` |
| L5 | Money and status are untyped: 240 uses of `List<dynamic>` / `Map<String, dynamic>` in `lib/`. Income is detected two ways (`t['isIncome'] == true \|\| t['type'] == 'income'`), pass-through origins are a string list copied inline | `screens/transactions_screen.dart:176-187` and others |
| L6 | `totalAccountsBalance` falls back to `openingBalance` when `currentBalance` is missing — that silently shows an old number as today's | `budget_provider.dart:66-74` |
| L7 | No request timeout and no retry; a POST that times out on a weak signal can be re-tapped and **create a duplicate** (no idempotency key on `master`) | `services/api_service.dart:55-113` |
| L8 | Every mutation awaits the write, then 4 more sequential requests. There is no lock, so two quick taps can interleave two refreshes and the older one can land last | `budget_provider.dart` (all mutations) |

### 0.4 Performance

| # | Finding | Where |
|---|---------|-------|
| P1 | 16 `context.watch<BudgetProvider>()` and **0** `context.select`. `IndexedStack` keeps all 5 tabs alive, so **every `notifyListeners()` rebuilds all 5 screens and the header** | `main.dart`, all screens |
| P2 | `TransactionsScreen.build` copies every transaction to a new map, sorts two lists and runs 7 filter passes **on every rebuild** | `transactions_screen.dart:159-187, 315-359` |
| P3 | After each save: 1 write + `getMonthDetail` + `getBankAccounts` + `getWallets` + `getTransfers`, **in series**. Month detail already returns accounts and transfers, so 3 of the 4 reloads repeat data | `budget_provider.dart:203-207` |
| P4 | Token read from `SharedPreferences` on every request | `api_service.dart:42` |
| P5 | Fonts come from `google_fonts` at runtime — a network fetch on first launch and a font swap on slow networks | `theme/app_theme.dart:47,90` |
| P6 | `unified_entry_modal.dart` is 1,526 lines in one widget; any keystroke rebuilds the whole sheet | `modals/unified_entry_modal.dart` |

### 0.5 UI / UX and release readiness

| # | Finding | Where |
|---|---------|-------|
| U1 | **No `Semantics`** anywhere — TalkBack reads raw numbers and icons without labels | `lib/` |
| U2 | `₹` hard-coded in 29 places although the month carries `currencySymbol`; compact amounts use `k`/`m` instead of Lakh/Crore for an `en_IN` app; dates are formatted in `en_US` | `engine/currency.dart` |
| U3 | Only `PlanScreen` has pull-to-refresh; no loading skeletons; errors appear as raw exception text | screens |
| U4 | `android:usesCleartextTraffic="true"`, default server `http://127.0.0.1:4000`, release build signed with the **debug key**, version `1.0.0+1`, description "A new Flutter project." | `AndroidManifest.xml`, `build.gradle.kts:41`, `pubspec.yaml` |
| U5 | Auth token stored in plain `SharedPreferences` | `services/storage_service.dart` |
| U6 | Open item from the entry-forms plan: §5.1 compact one-row date + account chips | `docs/ENTRY_FORMS_UX_UPGRADE_PLAN.md` |

**What is good and must be kept:** server-side simulation as the single source of truth (ADR 0052); minor-unit money formatting; the unified entry sheet with salary-twice and refund guards; 81 passing tests around entry forms, refunds, card pay-from and the v1 API.

---

## 1. Round table

**Panel**
- **SA** — Senior System Architect
- **AD** — Android Developer
- **QA** — Quality Assurance Lead
- **EU** — End User (salaried, logs spends on the phone, plans on the web)
- **UX** — UI/UX Designer

### Round 1 — Opening positions

**SA:** Before features, the facts. `master` does not compile: `main.dart` is UTF-16 and imports eight files that only exist on `release/mobile-evolution`. Our analyzer says "No issues" because it skips the file. We have a release branch with 16,000 lines of work that is 87 commits behind and predates held/lent, credit cards and refunds. Whatever we plan, step one is a build that compiles and a CI job that would have caught this.

**AD:** Agreed, and it's worse on the Android side. Release is signed with the debug key, cleartext traffic is on, the token sits in SharedPreferences. We can't ship to Play like this. On the release branch I also see `READ_SMS` and `RECEIVE_SMS`. Play only allows those for apps whose *core* function is SMS — a budget app will be rejected or forced through a declaration we will lose.

**QA:** 81 tests pass, which is nice, but none touch `main.dart`, the provider's error paths, or the network. My top worry is silent wrong numbers: if month detail fails for any reason the provider wipes the month and shows zero. For a money app, a wrong balance shown confidently is worse than an error.

**EU:** What I care about: I open the app at the counter, log ₹180 in five seconds, and the "safe to spend" number is right. Right now when my signal is bad it sometimes looks like I have no transactions, and I've double-logged things after tapping Save twice. Biometric lock and the home widget on the other branch sounded great. Reading my SMS — honestly, I'd rather paste or share the SMS than give an app permission to read all my messages.

**UX:** The current screens work but are dense, have no accessibility labels, and hard-code ₹ and `en_US` dates. The release branch went Apple-HIG/Cupertino — on Android that will feel foreign, and we'd be maintaining two visual languages next to the web app. I want one Material 3 design system, shared tokens with web, and the entry sheet finished per the entry-forms plan.

### Round 2 — Trade-off negotiations

#### T1 · Merge `release/mobile-evolution` vs. rebuild on `master`

**SA:** Merging wholesale means resolving conflicts in every screen plus the provider, against 87 newer commits that changed the money rules. The redesigned screens will drop held/lent and card features.
**AD:** But Phase 1 (secure storage, biometrics) and the server idempotency middleware are self-contained and tested. Throwing them away is waste.
**QA:** I can't sign off on a 16k-line merge. I can sign off on small PRs, each with tests.
**Resolution:** **Harvest, don't merge.** Cherry-pick by capability into small PRs on top of `master`: (1) secure storage + biometric lock + privacy blur, (2) idempotency middleware (server) + client idempotency keys, (3) quick actions, (4) home widget. Do **not** take the Cupertino redesign or the rewritten screens. Archive the branch once harvested.

#### T2 · Offline-first local vault vs. server as the single source of truth

**SA:** ADR 0052 moved simulation to the server so web and mobile always agree. A "100% offline-first local vault" that recomputes balances on the phone reopens the drift problem ADR 0052 closed.
**EU:** I still need to log at the counter with one bar of signal.
**AD:** Drift plus codegen adds ~5,000 generated lines and a migration story we'd own forever.
**QA:** Offline sync is where duplicates and ordering bugs breed. If we do it, the server must dedupe.
**Resolution:** **Offline capture, online truth.** Phase 2 adds a small **outbox** for writes (spends, income, mark-paid) with a client UUID idempotency key, plus a **read cache** of the last good month detail for instant start and offline viewing — clearly labelled "as of 10:42". Balances and safe-to-spend are never computed on the phone; while offline the app shows the cached server figure plus a "N entries waiting to sync" chip. Use `sqflite` or a JSON file store first; adopt Drift only if the outbox outgrows it. Record as ADR 0071.

#### T3 · SMS auto-detection

**AD:** Play policy blocks `READ_SMS` for us; iOS has no equivalent at all.
**EU:** I like the idea, not the permission.
**UX:** The value is "amount and merchant pre-filled", not "the app reads my inbox".
**Resolution:** **Drop SMS reading.** Ship **Share-to-app** instead: the user long-presses a bank SMS → Share → Budget Planner, and the entry sheet opens with amount, merchant and date parsed (reuse the parser from the release branch). Same for pasted text from the clipboard, only on an explicit Paste chip. Receipt OCR goes to the backlog behind a feature flag — ML Kit adds ~20 MB and camera permission for a low-frequency flow.

#### T4 · Visual language: Cupertino/HIG vs. Material 3

**UX:** Android is the primary platform. One system, Material 3, with our own tokens for color, radius, spacing and type that match the web app.
**AD:** Material 3 also gives us dynamic color, predictive back and edge-to-edge for free on Android 14/15.
**EU:** I don't mind the look; I mind things moving around and tiny tap targets.
**Resolution:** **Material 3 + shared design tokens.** Keep platform-adaptive bits only where users expect them (date picker, switches, back gesture on iOS). Minimum 48 dp targets, bundled Inter font, full Semantics.

#### T5 · Typed models refactor vs. shipping features

**SA:** 240 untyped maps is why income is detected two ways and why parse errors are swallowed. Typed models are the foundation for the outbox, the cache and selective rebuilds.
**AD:** A big-bang rewrite stalls features for weeks.
**QA:** I need typed models to write meaningful tests — today I'm asserting on string keys.
**Resolution:** **Strangler refactor.** Introduce `Transaction`, `Account`, `Card`, `Goal`, `PersonFund`, `MonthDetail` with `fromJson` that **fails loudly** in debug and reports in release. Migrate one screen per PR, starting with Transactions (the hottest path). Money stays `int` minor units everywhere; no `double` in model fields. No codegen (freezed/json_serializable) until the models settle.

#### T6 · Refresh strategy and performance

**SA:** Month detail already returns accounts and transfers. Four serial calls after each save are three too many.
**AD:** And the whole app rebuilds on each notify because of `IndexedStack` + `watch`.
**EU:** After I tap Save the sheet should close at once and the number should update without a spinner.
**QA:** Optimistic updates mean a rollback path I must test.
**Resolution:** After a mutation, **one** `getMonthDetail` call (parallel `Future.wait` only for data it truly lacks). Writes are **serialized** through a single queue so refreshes can't land out of order. Optimistic insert only for spot spends and income (the sheet closes, row shows "saving…", rolls back with a snackbar on failure); everything else waits for the server. Replace screen-wide `watch` with `select`/`Selector`; move sorting and filtering out of `build` into memoized derived lists in the provider.

#### T7 · Error handling: silence vs. noise

**QA:** Silent failures are my number-one risk.
**UX:** But a red error banner on every blip will train users to ignore it.
**Resolution:** Three tiers. **(a)** Network blip on read → keep the cached data, show a quiet "Offline · last updated 10:42" pill. **(b)** Write failure → snackbar with Retry; the entry stays in the outbox. **(c)** 401 → sign-out flow; 5xx or parse error on month detail → full-screen "Couldn't load this month" with Retry, **never** an empty month. Add crash and error reporting (Sentry or Firebase Crashlytics, PII-scrubbed).

#### T8 · How much to test, and where

**QA:** Gate: a CI job running `dart format --set-exit-if-changed`, `flutter analyze --fatal-infos`, `flutter test`, and `flutter build apk --release` (which is what would have failed on B1/B2). Plus a `.gitattributes` / pre-commit check that rejects non-UTF-8 `.dart` files.
**AD:** Add one integration test on an emulator in CI for the golden path: sign in → log spend → see safe-to-spend change.
**SA:** And contract tests: the mobile parses fixtures recorded from the real server, so an API change breaks a test, not a user.
**Resolution:** Accepted as the definition of done for every phase (see §3).

### Round 3 — Closing statements

**SA:** Fix the build, then correctness, then speed, then features. Server stays the source of truth; the phone captures offline and caches reads.
**AD:** Ship-ready Android: real signing, no cleartext, secure token, Android 15 edge-to-edge, no restricted permissions.
**QA:** No more false greens. Every phase ships behind CI, with tests for error paths and money math.
**EU:** Fast logging, right numbers, a lock on the app, a home widget showing what I can spend today.
**UX:** One Material 3 system, accessible, localized money formats, and the entry sheet finished.

---

## 2. Decisions

| ID | Decision | Rejected alternative | Why |
|----|----------|----------------------|-----|
| D1 | Harvest `release/mobile-evolution` capability by capability; archive it afterwards | Merge it as a whole | Too large to review, predates ADR 0069/0070 |
| D2 | Offline capture (outbox) + read cache; server computes all balances (new ADR 0071) | Full offline-first local vault | Keeps ADR 0052; avoids web/mobile drift |
| D3 | Share-to-app / paste parsing instead of SMS reading | `READ_SMS` receiver | Play policy, privacy, no iOS support |
| D4 | Material 3 with shared tokens | Cupertino/HIG redesign | Android-first users; one design system with web |
| D5 | Typed models, migrated screen by screen, money as `int` minor units | Big-bang rewrite / keep maps | Correctness and testability without a freeze |
| D6 | One reload per mutation, serialized writes, `select`-based rebuilds | Keep 4-call serial refresh | Fewer requests, no out-of-order state |
| D7 | Mobile CI job with release build + UTF-8 guard | Analyzer-only | The analyzer missed a non-compiling `main.dart` |
| D8 | Receipt OCR backlog behind a flag | Ship now | 20 MB + camera permission for a rare flow |

---

## 3. Upgrade plan

Each phase is a set of small PRs. A phase is done only when its **exit criteria** pass in CI.

### Phase 0 — Stabilize (week 1) · *Blocker*

| # | Task | Files |
|---|------|-------|
| 0.1 | Re-save `main.dart` as UTF-8 and remove the 8 dead imports, the SMS banner and the lock-screen branch, so `main.dart` matches what exists on `master`. Keep quick actions out until 4.3 | `lib/main.dart` |
| 0.2 | Add a `mobile` job to CI: `flutter pub get`, `dart format --set-exit-if-changed`, `flutter analyze --fatal-infos`, `flutter test`, `flutter build apk --release` | `.github/workflows/ci.yml` |
| 0.3 | Add `.gitattributes` (`*.dart text eol=lf working-tree-encoding=UTF-8`) and a CI step that fails on any non-UTF-8 `.dart` file | `.gitattributes`, `ci.yml` |
| 0.4 | Release signing from a keystore in CI secrets; real `applicationId`, version, description | `android/app/build.gradle.kts`, `pubspec.yaml` |
| 0.5 | `usesCleartextTraffic` only in the debug manifest (network security config allowing `10.0.2.2`/`localhost`); release is HTTPS-only. Default base URL from `--dart-define` per flavor | `AndroidManifest.xml`, `storage_service.dart` |
| 0.6 | Smoke test that pumps `BudgetMobileApp` so `main.dart` is covered | `test/app_boot_test.dart` |

**Exit:** release APK builds in CI; analyzer has zero issues **including** `main.dart`; boot test passes.

**Status (2026-11-19):** 0.1–0.3, 0.5 and 0.6 done; 0.4 done for signing (keystore from `android/key.properties` or `ANDROID_KEYSTORE_*` env vars, debug-key fallback with a warning) and the description. Two deliberate deviations:
- `applicationId` kept as `com.budgetplanner.budget_mobile` — changing it makes Android treat the app as new, so installed copies would not update. Decide before the first Play upload.
- `dart format --set-exit-if-changed` is **not** in CI yet: 48 of 55 files would change. Land one format-only PR first, then add the gate.

### Phase 1 — Logic correctness & security (weeks 2–4)

| # | Task | Fixes |
|---|------|-------|
| 1.1 | Typed models `Transaction`, `Account`, `CreditCard`, `Goal`, `PersonFund`, `MonthDetail` with enums for `status`, `origin`, `derivedStatus`; `isIncome`, `isPassThrough` as single getters | L5 |
| 1.2 | Split "month not found" (404) from every other failure; never wipe state on non-404; surface `error` from `refresh()` and from parse failures | L1, L2, L3 |
| 1.3 | Choose the fallback month explicitly (latest by year/month), not `_months.first` | L4 |
| 1.4 | Show "balance unavailable" instead of falling back to `openingBalance` | L6 |
| 1.5 | `ApiService`: 15 s timeout, one retry for idempotent GETs, typed `ApiException` kinds (offline, auth, validation, server) | L7 |
| 1.6 | Harvest server idempotency middleware + tests from the release branch; client sends `Idempotency-Key` (UUID) on every POST/PATCH | L7 |
| 1.7 | Serialize mutations through one write queue in the provider; disable Save while a write is in flight | L8 |
| 1.8 | Harvest secure token storage (`flutter_secure_storage`), migrate the old token once, then delete it from SharedPreferences | U5 |
| 1.9 | Harvest biometric app lock + privacy blur (opt-in in settings) | EU ask |
| 1.10 | Contract tests: fixtures recorded from the server for month detail, cards, person funds; models must parse them | QA |

**Exit:** tests for each error tier (404 vs offline vs 500 vs bad JSON); double-tap Save creates one transaction (server test + widget test); token never in SharedPreferences after first launch.

**Status (2026-11-19):** first Phase 1 PR covers 1.2–1.8.
- 1.6 was **rewritten, not copied**: the release-branch middleware shared keys across users, let two in-flight duplicates both run, and cached error responses. The new one scopes keys per user, reserves the key before the handler runs (a duplicate gets 409), stores only 2xx responses, and returns 422 when a key is reused with a different body.
- 1.5 retries: a GET once on offline, timeout or 5xx; a keyed write once on the same failures plus 409 in-progress; an unkeyed write only after a dropped connection.
- Still open, each as its own PR: **1.1** typed models (start with Transactions), **1.9** biometric lock and privacy blur, **1.10** contract fixtures recorded from a running server (they belong with 1.1, where the models parse them).

**Status, second PR (1.1 + 1.10):**
- Models in `lib/models/`: `Transaction` (one `TxKind` per transaction), `TransactionLists`, `Account`/`CreditCardSummary`, `Goal`, `PersonFund(s)`, `MonthInfo`/`MonthDetail`. Strict readers: a missing, fractional or wrong-typed amount, an unknown status or a bad date throws and is shown as an unreadable response. An unknown origin is kept as `other`.
- **Transactions screen migrated** and now rebuilds only when its lists change. Bugs fixed:
  - transfers and held/lent money were listed under Expenses;
  - the Expenses chip count didn't match its list;
  - transfers and held entries were badged "Planned";
  - refunds showed as `--₹…`.
- **Goals tab fixed:** month detail never carried goals, so the tab was always empty. They now load from `GET /periods/:y/:m/goals`.
- **1.10:** `apps/server/test/mobile_contract_fixtures.test.js` records 8 responses into `apps/mobile/test/fixtures/api/` (`RECORD_MOBILE_FIXTURES=1`), and on every CI run fails if the server drops or retypes a field they contain.
- Next screens to migrate: Accounts, Goals, Plan (the remaining `Map<String, dynamic>` users).

**Status, third PR (1.9 App lock):** opt-in from the lock icon in the header. Not copied from the release branch, which had several problems:
- it could re-lock right after a successful unlock;
- the notification shade alone could lock the app;
- its custom PIN was stored in plain text, compared with `==` and had no attempt limit;
- there was no way out if the sensor failed;
- turning it on wasn't verified.

The new version:
- uses the phone's own prompt (fingerprint or face, with the device PIN/pattern as fallback), so the app keeps no PIN of its own;
- needs one successful authentication to turn on;
- counts only paused/hidden toward the lock delay (immediately, 30 s, 1 min or 5 min) and ignores lifecycle events during a prompt;
- always offers "Sign out instead" on the lock screen;
- switches itself off if the phone's screen lock is removed;
- draws above the navigator, so it also covers open sheets and dialogs, while the app keeps its state offstage;
- shows an opaque cover while the app isn't in front, plus Android `FLAG_SECURE` (no screenshots, blank recents thumbnail).

Platform: `MainActivity` is now a `FlutterFragmentActivity`, themes use AppCompat (needed for Android 8 and below), and `NSFaceIDUsageDescription` is set. iOS is not built or tested here.

**Status, fourth PR (1.1 continued: screens):** all four tab screens (Plan, Transactions, Goals, Accounts) now read typed models, with no raw map reads left. The provider parses `MonthInfo`, accounts, goals and the new `Transfer` model once per load, all-or-nothing. Bugs fixed on the way:
- **Accounts:**
  - transfers always showed "Source → Destination" (the server sends ids only; names now come from the loaded accounts and cards);
  - the last 4 digits typed when adding a bank were dropped (sent as `accountNumberMask`; the server reads `accountNumberMasked`) and were never shown;
  - one tap on the bin archived an account or deleted a transfer with no confirmation;
  - account balances fell back to the opening balance;
  - the Add dialog accepted an empty name and dropped errors.
- **Goals:**
  - every new goal showed "Floor breach risk this month. Deferral recommended." because the engine never evaluates `logged` goals (now: "No safe purchase date checked yet");
  - `deferred`/`active` statuses were unknown to the model;
  - delete had no confirmation (and the message now says a scheduled goal's planned transaction stays);
  - action errors were dropped.
- **Plan:** an account without its own simulation showed all-accounts numbers under that account's name; account pills fell back to the opening balance.
- **Still open:**
  - **engine:** `evaluateGoalsWithReservation` (`packages/engine/src/recommender.js`) skips `logged` goals, so new goals get no recommendation until reactivated, and its explanation shows raw minor units;
  - **3.3:** Plan's `summary_cards.dart`, `step_line_chart.dart` and `timeline_list.dart` overflow at phone width with wide text;
  - **next migration:** the sheets and widgets in `modals/` and `widgets/`.
- Found while recording, for later:
  - the serializer sets `accountType`/`destinationType` to `'bank'` for wallet and card rows (`utils/serializer.js`);
  - month detail is ~236 KB because the simulation appears several times over (`events`/`allEvents`, `days`/`dailyBalances`, `accountSimulations` twice), which is Phase 2 payload work.

### Phase 2 — Performance & offline capture (weeks 4–6)

| # | Task | Fixes / target |
|---|------|----------------|
| 2.1 | One `getMonthDetail` reload per mutation; drop duplicate account/wallet/transfer reloads | P3 · ≤ 2 requests per save |
| 2.2 | Derived, memoized lists in the provider (sorted, filtered, counts); screens read them via `context.select` / `Selector` | P1, P2 |
| 2.3 | Split `UnifiedEntryModal` into per-tab widgets with local state; amount field rebuilds only itself | P6 |
| 2.4 | Cache token in memory after first read | P4 |
| 2.5 | Bundle Inter as an asset; turn off runtime font fetching | P5 |
| 2.6 | Read cache: store last good month detail on disk; cold start shows it at once with "as of" time, then refreshes | EU · first meaningful paint < 1 s on mid-range device |
| 2.7 | Outbox for spot spend, income and mark-paid when offline; sync on reconnect with idempotency keys; "N waiting to sync" chip (ADR 0071) | T2 |
| 2.8 | Optimistic insert for spot spend and income, with rollback + snackbar | T6 |
| 2.9 | Lists as `ListView.builder`/slivers; `const` widgets; `RepaintBoundary` around the step chart | Scroll at 60 fps with 500 rows |

**Exit:** profile-mode traces on a mid-range Android device: cold start to cached Plan < 1 s, save-to-updated-number < 300 ms optimistic / < 1.5 s confirmed on 4G, no jank frames > 16 ms when scrolling 500 transactions. Airplane-mode test: log 3 spends, reconnect, exactly 3 on the server.

**Status, first Phase 2 PR (2.1, 2.4, 2.5, 2.6):**
- **2.1:** a load or a reload after a save is now **2 requests in parallel** (month detail + goals), down from 5 in series. Month detail already carries the active banks, wallets and the month's transfers (the same rows `/accounts` and `/transfers?monthId` return, checked against the recorded fixtures). A detail without those lists is reported as unreadable, never shown as "no accounts". Only a missing month (404) fetches the accounts on their own; it now shows no transfers, where it used to list every transfer ever made.
- **2.4:** already done in Phase 1 (token kept in memory after the first read).
- **2.5:** Inter and JetBrains Mono (weights 400–800, ~2.1 MB, OFL licences registered) ship in `google_fonts/`; runtime fetching is off in the app and in tests. The files are the ones `google_fonts` 6.3.3 downloaded before, checked against the SHA-256 it pins.
- **2.6:** the start month is saved on the device after each good load. A cold start shows it at once with "Showing saved data from 10:42 · updating", then the server's answer replaces it. Offline, it stays with the usual "Offline · showing data from …" strip. It holds only server figures (ADR 0052). It is deleted whenever the token changes (sign-in, sign-out, expiry), never written after a sign-out mid-load, and browsing other months doesn't replace it. Stored in SharedPreferences (app-private, not encrypted); move it to an encrypted store if that is not acceptable.
- **Not measured yet:** the exit timings need a profile build on a real device.
- **Next PRs:** 2.7 outbox + 2.8 optimistic insert (with ADR 0071); then 2.2/2.3/2.9 rebuild and list work, and the ~236 KB month payload.

**Status, second Phase 2 PR (2.7 + 2.8, ADR 0071):**
- **2.7 outbox:**
  - **What's captured:** spends, refunds, income and mark-paid are stored on the phone before they're sent, each with an Idempotency-Key made once (`lib/services/outbox.dart`). Every retry, replay and restart uses that key.
  - **When kept entries are sent:** after the next good load and every 30 s.
  - **If the server refuses one:** the entry is kept with the reason until the user sends or discards it.
  - **Server:** keeps idempotency keys for 7 days instead of 24 h. The phone asks before sending an entry older than 6 days.
  - **Ownership:** entries belong to their user and survive sign-out.
  - **Airplane-mode exit test:** passes as a unit test against a fake server that keeps keys and drops replies: 3 spends, reconnect, exactly 3 rows.
- **Also fixed:** a cold start without signal showed the sign-in screen, because `/auth/me` failed. The app now starts as the last known user; a 401 still signs out.
- **2.8 optimistic:** a new spend or income closes the entry sheet at once. A strip under the header shows `Saving "Tea" ₹20…` / `N waiting to sync` / `N not saved` and opens a list with Sync now, Send and Discard. A refusal comes back as a snackbar.
  - **Deviation from T6:** the waiting entry shows in that strip, not as a row in the Transactions list, and totals don't move until the server has it (ADR 0052).
- **Not captured (wait for the server, as before):** planned bills, goals, transfers, cards, accounts, held/lent.
- **Next:** 2.2/2.3/2.9 rebuild and list work, and the ~236 KB month payload.

**Status, third Phase 2 PR (2.2, 2.9, payload):**
- **2.2:**
  - **Tab screens:** Plan, Accounts and Assistant (all alive in the `IndexedStack`) and the header now rebuild only when `BudgetProvider.viewState` changes: data version, month, loading, month missing, load error. A save in flight, `isSaving` and the sync strip no longer rebuild all five tabs.
  - **Transactions and Goals:** these already selected their own memoized lists (Phase 1).
  - **Sheets:** still `watch`; they're short-lived and on top.
- **2.9:**
  - **Chart:** the step chart has its own `RepaintBoundary`, so scrolling Plan doesn't repaint it.
  - **Transactions lists:** these were already lazy (`ListView.separated`).
  - **Plan timeline:** still a column inside the page's scroll view, since one month has well under a few hundred events. Move it to slivers if profiling shows jank.
- **Payload:**
  - **What was dropped:** month detail no longer sends `simulation.allEvents` (identical to `events`) or `simulation.accountSimulations` (sent once at the top level). The recorded month went from 65.6 KB to 48.1 KB (−27%). Real months save more, since events dominate.
  - **Readers:** mobile already fell back to `events`, and the web reads the top-level `accountSimulations`.
  - **Still duplicated:** `days` and `dailyBalances` are different shapes, both read by web or mobile, so both are kept for now.
- **2.3 (split `UnifiedEntryModal`)** is not in this PR. It's a 1,500-line sheet with many tests around it, so it gets its own PR.
- **Not measured:** the Phase 2 exit timings (profile build on a device) are still open.

**Status, fourth Phase 2 PR (2.3, entry sheet rebuilds):**
- **P6 was already fixed:** keystrokes don't rebuild the sheet. The amount and description fields own their controllers, and the assists and the floor notice listen to those controllers directly (entry-forms work).
- **What still rebuilt it:** `context.watch<BudgetProvider>()`. Since 2.8, every "Saving…" or sync change redrew the whole open sheet.
- **The fix:** `context.budgetView()` (`lib/providers/budget_view.dart`) reads the provider and rebuilds only on `viewState`. It's now used by the entry sheet, mark-paid, card, held/lent and salary sheets, the cards section, the floor notice and the tabs. The detail sheet also selects `isSaving`, which disables its buttons; the sync strip still watches everything.
- **Test:** `test/entry_sheet_rebuilds_test.dart` counts the sheet's rebuilds. It expects 0 for typing and for an entry kept offline, and at least 1 for new month data. With the old `watch` it fails (1 rebuild from save progress).
- **Per-tab split deferred to 3.6:** splitting the sheet into per-tab widgets is a maintainability refactor, not a performance one. 3.6 (one-row date + account chips, entry-forms plan §5.1) rebuilds this sheet's layout, so the split happens there instead of moving the code twice.
- **Phase 2 is done in code.** The exit timings still need a profile build on a mid-range device.

### Phase 3 — UI / UX (weeks 6–9)

| # | Task |
|---|------|
| 3.1 | Material 3 theme with design tokens shared with web (color, radius, spacing, type scale); dynamic color opt-in; dark mode parity |
| 3.2 | Edge-to-edge and predictive back (Android 14/15); 48 dp minimum targets |
| 3.3 | Accessibility: `Semantics` labels on amounts, chips, chart and icons; text scales to 200 % without clipping; contrast AA |
| 3.4 | Money & dates from the month's currency and locale: Lakh/Crore compact format for `en_IN`, locale-aware dates; remove the 29 hard-coded `₹` |
| 3.5 | Pull-to-refresh on every tab; skeleton loaders; the three error tiers from T7 as designed components |
| 3.6 | Finish entry-forms plan §5.1 (one-row date + account chips) and the remaining mobile items there |
| 3.7 | Swipe actions on transaction rows (mark paid / edit) — harvest the swipeable card, restyled to Material 3, with undo |
| 3.8 | Onboarding: server URL hidden behind an "Advanced" link; first-run path to create the first month |

**Exit:** TalkBack walkthrough of the golden path with no unlabeled elements; golden-image tests for light/dark and 1.0×/2.0× text; usability check with 5 users: quick spend logged in ≤ 5 s.

**Status, first Phase 3 PR (device findings; parts of 3.2 and 3.8):**
- **Device:** Xiaomi 22101320I (Android 14, 1080×2400 at 440 dpi, about 393 dp wide), over USB.
- **Test server:** a local server on the throwaway Postgres, reached through `adb reverse`, with a throwaway account.
- **Header (3.2):** it overflowed by 10 px on the phone, which cut off sign-out.
  - **Now:** the month and the floor pill shrink and ellipsize. Theme, app lock, server settings and sign-out moved into one 48 dp "More" menu (four 30 dp icons before).
  - **Tests:** `test/phone_width_test.dart` checks 320, 360 and 393 dp, and 393 dp at 1.3× text. With the old header all four fail (150–223 px overflow in the test font).
- **First run (3.8):** a new user's Plan said "Create or select a budget month" with no way to do it. It now has a "Create November 2026" button that opens the create-month sheet with that month filled in. The sheet's title ellipsizes instead of overflowing.
- **Checked on the phone:**
  - sign-in;
  - the header in dark mode;
  - the More menu (four items);
  - the create-month sheet;
  - creating a month and the Plan that follows (safe-to-spend, chart, cards, timeline).
- **Not checked on the phone yet:** light mode, large text, TalkBack, App lock's fingerprint prompt, offline capture, timings.
- **Seen on the phone, for later items:**
  - **3.4:** amounts show paise (`₹10,909.09 / day`, `₹0.00/day`);
  - **3.2/3.3:** the "New Entry" button covers the timeline's filter chips;
  - **to check:** "Today's balance" includes a salary the timeline still lists as planned.

**Status, Phase 3 stack PR 2 (3.4 money and dates):**
- **Rules:** these mirror the web engine (`formatCurrency` / `formatCurrencyWhole`, the chart's `formatChartTick`):
  - lists and the ledger keep paise (₹1,250.00);
  - headline figures and totals are whole rupees: summary cards, safe-to-spend, the chart's day balance, card and held/lent figures, the Accounts total;
  - `MoneyDigits.auto` drops paise only when there are none.
- **Compact figures:** chart axes and the floor pill use the Indian system: the full figure under ₹10,000, then k, L and Cr (was k and m).
- **Symbol:** no hard-coded `₹` is left in widgets. Amounts and input labels follow the loaded month's `currencySymbol` (`moneySymbol`, set on each load), and defaults use `kDefaultCurrencySymbol`.
- **Dates:** the Indian day-month order ("Fri, 18 Sep"). The web app still uses "Fri, Sep 18" (follow-up for web).

### Phase 4 — Features (weeks 9–12)

| # | Feature | Notes |
|---|---------|-------|
| 4.1 | Share-to-app and paste-to-fill for bank SMS / UPI text | Reuse the parser from the release branch; no SMS permissions |
| 4.2 | Home-screen widget: safe-to-spend today, next due bill, "Log spend" button | Harvest `home_widget`; reads cached server figures only |
| 4.3 | App quick actions: Log spend, Log income, Pay a bill | Harvest `quick_actions` |
| 4.4 | Local reminders for due/overdue planned transactions and card due dates | `flutter_local_notifications`; scheduled from server data |
| 4.5 | Edit for transactions, goals and cards on mobile (parity with web per entry-forms plan) | Closes M5/M8 gaps |
| 4.6 | Search and filter in Transactions (text, category, account, date range) | Uses derived lists from 2.2 |
| 4.7 | Receipt OCR (flagged, off by default) | Backlog; ship only if 4.1 usage shows demand |

**Exit:** each feature has widget tests and appears in the integration test where it touches the golden path.

### Phase 5 — Release & observability (weeks 12–13)

| # | Task |
|---|------|
| 5.1 | Crash and error reporting with PII scrubbing; release-health dashboard |
| 5.2 | Flavors `dev` / `staging` / `prod` with separate app IDs and base URLs |
| 5.3 | Play internal testing → closed testing → staged rollout (10 % → 50 % → 100 %), rollback = halt rollout |
| 5.4 | Play Data Safety form and privacy policy (no SMS, camera only if 4.7 ships) |
| 5.5 | Archive `release/mobile-evolution` after the harvest PRs land |

---

## 4. Quality gates (every PR)

1. CI `mobile` job green: format, analyze (`--fatal-infos`), test, release build.
2. Any change to money math or status logic has a unit test with real fixtures.
3. Any new screen state (loading, empty, offline, error) has a widget test.
4. No new `Map<String, dynamic>` in screens or widgets once 1.1 lands for that area.
5. No `double` for money; no hard-coded currency symbol.
6. Golden path integration test (sign in → log spend → safe-to-spend changes) on an emulator, nightly.
7. **From Phase 3 on: checked on a real device.** Run the change on an Android phone over USB debugging (or an emulator) against a local server on a throwaway database. The PR says what was exercised there and what wasn't. Widget tests run at 800 dp with a test font, so they miss what only a phone shows; Phase 3's first device run found a header overflow and a dead end for new users that 205 tests had passed.

## 5. Success metrics

| Metric | Today | Target |
|--------|-------|--------|
| `master` builds a release APK | No | Yes, every commit |
| Requests per save | 5 | ≤ 2 |
| Screens rebuilt per state change | 5 + header | Only affected widgets |
| Cold start to useful screen | Network-bound | < 1 s from cache |
| Duplicate transactions from retries | Possible | 0 (idempotency) |
| Unlabeled elements on golden path | All | 0 |
| Crash-free sessions | Unmeasured | ≥ 99.5 % |

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Harvested code depends on removed release-branch pieces | One capability per PR, each must build and test alone on `master` |
| Outbox sync creates duplicates or wrong order | Server idempotency first (1.6), outbox later (2.7); airplane-mode test in CI |
| Model refactor breaks screens | Strangler: one screen per PR, contract fixtures |
| Optimistic UI shows a number the server rejects | Only for spot spend/income; visible "saving…" state; rollback test |
| Play review on permissions | No SMS permissions; camera only behind the OCR flag |

## 7. Out of scope

- Computing balances or the simulation on the device (stays on the server, ADR 0052).
- iOS home widget and App Store release (follow-up after Android Phase 5).
- Bank account aggregation or reading bank SMS automatically.
