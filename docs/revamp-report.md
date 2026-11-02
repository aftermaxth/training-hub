# Training Hub v1 revamp: final report

Branch `revamp`, Nov 1 2026. Not merged to `main` and not live until Max approves.

## What changed

| Part | Change |
|---|---|
| 1 | **Lift Guide replaces Rehab.** Block banner with countdown and tier chip, this week's sessions with tap-to-log top sets, one-tap daily small stuff with fillers grouped by where they happen, dose, load guide (labelled estimates until clean baselines), durability markers and December targets, hold-or-back-off signals, read-only rehab history, and a paste import for blocks and markers with per-field errors. Old rehab UI, importer and popover removed |
| 2 | **Daily check-in** at the top of Today: hip, sleep vs need, small stuff (3 taps), optional extras collapsed, 14-day strip and streak. Reset shows the week's morning hip, read only. Lift hints "repeat last load" when the next-morning hip is above usual |
| 3 | **Bottom tab bar** (Today, Week, Lift, Reset, More), AA contrast tokens, 44 px targets, 11 px text floor, loading states, em dashes removed outside frozen code |
| 4 | **Export** adds lift and check-in data (`digestVersion: 2`, version 1 keys unchanged) and drops FIXTURE. README, this report |
| Code | New features live in their own files (`lift-guide`, `daily-checkin`), sharing `ui-kit` (chips, sections, fields) and `sync` (writes held on the phone and retried). `index.html` lost 508 lines and gained 180 |

## Database

Four new tables (`lift_blocks`, `lift_logs`, `lift_markers`, `daily_logs`) from two additive migrations. Nothing existing was altered or dropped. RLS was checked with the public key and no session:

| Tables | Read | Write |
|---|---|---|
| `weeks`, `meets`, `outcome_goals`, `process_goals`, `process_goal_weeks`, `rehab_cycles` | 0 rows | HTTP 401 |
| `lift_blocks`, `lift_logs`, `lift_markers`, `daily_logs` | permission denied | HTTP 401 |

## Regression (throwaway week Jun 7 2027, deleted afterwards)

| Check | Result |
|---|---|
| Import plan | Pass: 7 cards, label and coach target shown, row saved |
| Log miles | Pass: totals 7.5 mi, database matches |
| Springer meter | Pass: 40% under the cap; 73% red with "over the 60% cap". The cap flash correctly stays off when the browser asks for reduced motion |
| Process-goal ticks | **Failed, then fixed.** A tick from Week before opening Goals crashed in the Goals painter and never saved. This bug is also on the live site. Fixed in `paintGoals` (not frozen); ticks now save 1, 2, 3 (done), back to 0 |
| Reset save | Pass: slider, vibe and saved-at time stored; "not started" dot cleared |
| Offline draft restore | Pass: failed save held on the phone with a banner, restored and saved on the next load |
| Lift and check-in | Pass (tested in Parts 1 and 2), and both appear in Export with correct summaries |

**Week code proof:** the six frozen sections (361 lines) of `main` and `revamp` are identical character for character, and `tools/week-freeze.mjs` passes.

## Deliberately left alone

- **Week tab logic and markup.** This includes 7 em dashes in its copy and the Reset subtitle saying "no plan yet" when a plan has no label.
- **Old Quick Scan areas.** New areas live only in the new tables, because the frozen save code drops unknown keys.
- **Goals edits** through browser prompts.
- **Rehab data.** Kept, read only.

## Open items

1. Approve a merge of `revamp` into `main` (this publishes to GitHub Pages).
2. Weekly main-lift sets show a derived "about 9 to 15". Keep it, or leave it blank?
3. Team lift 1 lists no lifts ("as written"). Name any?
4. The `meets` table is stale (no MAC Indoor; first indoor meet date; Dec 5 goal marker). Update?
5. Seed blocks after Lighter (Heaviest, Lighter, Test, January, February, March) when ready, using the same import.
6. Reset's seven day boxes are 40 px wide at 360 px (44 px at 390).
