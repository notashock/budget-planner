# Plan page prototype: 5-person test (roadmap phase 4)

The 100-person panel was simulated. This checks the proposed Plan page with real people before Phase 5 builds it.

- Prototype: `docs/research/plan-mock/index.html` (open it in a phone browser, or use the published copy).
- It runs on example data for Monday 23 November. Nothing is saved; **Reset the prototype** puts it back.
- What can be tapped: the account pills, the big number (opens the chart), the circles (mark paid, with Undo), the
  Net worth row and the + button. The month menu and the tabs do nothing.

## Who

One person from each group. Nobody who has used the current app.

| # | Group | Why they matter |
|---|---|---|
| P1 | Salaried, in a rush (checks between meetings) | The main user. Needs the answer in one glance. |
| P2 | 55 or older | 9 of the 10 panel members over 55 said a wrong balance would make them quit. |
| P3 | Student | Small balances, mostly wallets. |
| P4 | Freelancer, irregular income | Asked for net worth first. |
| P5 | Power user (tracks every rupee today) | Most likely to miss the details that moved one tap deeper. |

## How to run each session (about 10 minutes)

1. Say: "This is a money app showing someone's month. There are no wrong answers; we're testing the screen, not you.
   Please think out loud."
2. Hand over the phone on the Plan screen. Let them look for 5 seconds without a question.
3. Read one task. Start a stopwatch when you finish reading. Stop it when they say an answer out loud.
4. Don't help or hint. If they are stuck at 30 seconds, note "gave up" and move on.
5. Press **Reset the prototype** before the next task only if they changed the account pill or marked something paid.
6. After the 3 tasks, ask the two questions at the end.

## Tasks and correct answers

| Task | Read out | Correct answer | Counts as wrong |
|---|---|---|---|
| T1 | "Can you spend ₹500 today?" | No. ₹420 is safe to spend today. | "Yes", or reading a balance (₹35,500 or ₹34,000) as the answer |
| T2 | "What's due this week?" | SIP ₹3,000 today, Electricity ₹1,200 (overdue), Internet ₹1,000 on Saturday | Missing the overdue Electricity bill, or listing anything else |
| T3 | "What's in HDFC right now?" | ₹34,000 | ₹380 (safe to spend in HDFC) or ₹28,000 (lowest point) |

## After the tasks, ask

- "Was there anything on the screen you didn't understand?"
- "What would you look for first when you open this app?"

## Results

Fill one row per person and task. Time in seconds; "Correct" is Y or N.

| Person | T1 time | T1 correct | T2 time | T2 correct | T3 time | T3 correct | Notes (what they tapped, what confused them) |
|---|---|---|---|---|---|---|---|
| P1 |  |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |  |
| P3 |  |  |  |  |  |  |  |
| P4 |  |  |  |  |  |  |  |
| P5 |  |  |  |  |  |  |  |

**Pass:** for each task, at least 4 of the 5 people answer correctly in under 10 seconds.

If a task fails, change the prototype and test that task again with 2 new people before starting Phase 5. Likely
fixes to try first:
- T1 fails: say "₹420 left to spend today" under the number instead of only "safe to spend today".
- T2 fails: add a "This week" total above the Due soon list, or list all bills due this week instead of 3.
- T3 fails: show the HDFC balance as a line under the big number when the HDFC pill is selected.

## What the prototype already follows (checked against Phase 5)

- 37 words in the app area of the screen (Phase 5 limit: under 60).
- Text sizes: title, body and caption only. The ₹420 hero number is the one exception, kept on purpose.
- Whole rupees everywhere; colour only for status (green dot, red "Overdue", amber floor line).
- No number appears twice on the main screen. "Keep at least" and "Left after bills" appear only in the chart
  sheet, one tap deeper, with the old tiles' numbers.
