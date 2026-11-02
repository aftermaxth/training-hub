# training-hub

A personal training log for a collegiate distance runner. Plain HTML, CSS and JavaScript with no build step, Supabase for storage, served by GitHub Pages at aftermaxth.github.io/training-hub and installable as a PWA.

The app tracks and guides. It never prescribes over the coach or the team strength program.

## Files

| File | What it holds |
|---|---|
| `index.html` | App shell, styles, sign-in, Today, Week, Reset, Goals, Export |
| `lift-guide.js` / `.css` | Lift tab: blocks, sessions, small stuff, load guide, markers, block import |
| `daily-checkin.js` / `.css` | Daily check-in card on Today, morning-hip summary on Reset |
| `ui-kit.js` / `.css` | Shared pieces: chips, collapsible cards, fields, tier chips |
| `sync.js` | Database writes that are held on the phone and retried if they fail |
| `manifest.json`, `icon-*.png` | PWA install |
| `docs/import-guide.md` | Every paste box and every JSON key it accepts |
| `docs/design-spec.md` | Tokens, navigation, states and accessibility rules |
| `tools/week-freeze.mjs` | Proves the Week tab's code hasn't changed (`node tools/week-freeze.mjs`) |

Not committed, on purpose (see `.gitignore`): `context/`, `migrations-local/`, `audit.md`. They hold health detail, and the repo is public.

## Running it

Any static server works. For example:

```bash
python -m http.server 8321
```

Then open http://localhost:8321 and sign in. Sessions are per origin, so localhost needs its own sign-in.

## Data model

Supabase project `torqkpzawfjkegjkfmwk`. Every table has row level security on, a `user_id uuid default auth.uid()` column, and owner-only policies for the `authenticated` role. The anon key in `index.html` is public by design: with no session it reads and writes nothing.

| Table | One row per | Written by | Notes |
|---|---|---|---|
| `weeks` | week (`week_of`, a Monday) | Week, Reset, Import plan | `plan_days` and `actual_days` (7 each), `quick_scan`, `tier2_entries`, `stress`, `vibe`, `notes`. Week code is frozen |
| `meets` | meet | Supabase editor | Countdown and schedule on Today |
| `outcome_goals` | goal | Goals | Safe / solid / reach tiers |
| `process_goals` | weekly habit | Goals | `target_count` per week, or simple done |
| `process_goal_weeks` | goal per week | Week and Goals ticks | |
| `rehab_cycles` | 3-week cycle | (retired) | Read-only history, shown in Lift and in Export |
| `lift_blocks` | training block | Lift, Import blocks | Unique on `start_date`. Sessions, scheme, loads, fillers, signals as JSON |
| `lift_logs` | lift per session | Lift, tap to log | Top set: weight, reps, RIR, form, symptom, note |
| `lift_markers` | durability marker or target | Import (definition), Lift (progress) | Unique on `key`. Re-imports never overwrite logged progress |
| `daily_logs` | date | Check-in, Lift small-stuff tap | Unique on `log_date`. Hip, sleep, small stuff, optional extras. Miles and XT live in `weeks` only |

Schema changes are additive only. The SQL for the four new tables is kept locally in `migrations-local/` and run by hand in the Supabase SQL editor.

## Importing a lift block

1. Write the block as JSON. The shape is in `docs/import-guide.md`, section 2. The smallest valid file:

   ```json
   {
     "schema_version": 2,
     "blocks": [
       { "name": "Build", "phase": "build", "start_date": "2026-11-16", "end_date": "2026-11-22",
         "tier": "current_call",
         "sessions": [ { "slot": "team2", "label": "Team lift 2", "lifts": ["trap_bar"] } ],
         "scheme": { "reps": [3, 6], "sets": [3, 5], "rir": [2, 3], "rest_min": [2, 4] },
         "loads": [ { "lift": "trap_bar", "low": null, "high": null, "reps": 5, "unit": "lb", "basis": "estimate", "rule": "Add load while reps stay crisp." } ] }
     ]
   }
   ```

2. Open **Lift**, scroll to **Import blocks**, paste, and tap **Import**.
3. If anything is wrong, nothing is saved and every problem is listed with its location (for example `blocks[0] (Build) phase "peak" must be one of …`). Warnings, such as a block that's already over, import anyway and are listed underneath.
4. Re-importing a block with the same `start_date` replaces it. Logged sets keep their link to the block.

Leave numbers `null` rather than guessing; the app shows the rule text instead.

## Export

**More > Export** builds a JSON digest for a date range: copy it or save it as a backup. `digestVersion: 2` adds `lift` (blocks, sessions, best estimated maxes, markers) and `daily` (summary and every check-in). Every key from version 1 (`weeks`, `goals`, `rehab`) is unchanged, so older readers of the digest keep working. Rehab cycles labelled `FIXTURE` (UI test data) are left out.

## Ground rules for changes

- The Week tab (`tab-week`, the `weeks` table logic, springer meter, Import plan, process-goal reminders) is frozen. Visual changes go through CSS only, and `node tools/week-freeze.mjs` must print `same` for all six units.
- No em dashes in app copy or docs.
- 44 px minimum tap targets, 11 px minimum text, WCAG AA contrast. See `docs/design-spec.md`.
- Guidance is signals, never locks.
