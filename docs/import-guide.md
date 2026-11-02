# Import guide

Every box in Training Hub that takes pasted JSON, and exactly what each one accepts. Keep this file in step with the code: if a key changes, the change log at the bottom says so.

Both importers strip a surrounding <code>```json</code> fence, so a copied code block pastes fine.

| Box | Tab | Status |
|---|---|---|
| Import plan | Week | Unchanged. Frozen |
| Import blocks | Lift | New in the revamp (`schema_version: 2`) |
| Import cycle | Rehab | **Retired.** Old cycles stay readable in Lift, Rehab history, and in Export |

---

## 1. Import plan (Week tab, unchanged)

One week per paste. Re-importing the same `week_of` replaces the plan and keeps the miles you logged.

```json
{
  "week_of": "2026-11-02",
  "week_label": "Week 1, rebuild",
  "raceWeek": false,
  "weeklyTarget": { "low": 12, "high": 15 },
  "days": [
    { "day": "Mon", "date": "2026-11-02", "workoutType": "Pool", "workoutDetail": "30 min easy",
      "coachText": "", "coachLow": 0, "coachHigh": 0, "plannedLow": 0, "plannedHigh": 0,
      "intent": "maintain", "modality": "XT", "zone": "Z1-2", "lift": true, "note": "" }
  ]
}
```

| Key | Type | Rules |
|---|---|---|
| `week_of` | date | Required. Must be a Monday, `YYYY-MM-DD` |
| `week_label` | text | Optional |
| `raceWeek` | true/false | Optional |
| `weeklyTarget.low`, `.high` | number | Optional. Coach's weekly target |
| `days` | array | Required. Exactly 7, in order Mon to Sun, each with a matching `day` |
| `days[].workoutType`, `workoutDetail`, `coachText`, `note` | text | Optional |
| `days[].coachLow/High`, `plannedLow/High` | number | Optional. A day with no planned or coach high and no race shows as off |
| `days[].intent` | text | `quality`, `build`, `maintain`, `shakeout`, `dip` get a mark; anything else shows a dot |
| `days[].modality` | text | `Run`, `XT` or `Run+XT` |
| `days[].zone` | text | Optional |
| `days[].lift` | true/false | Shows a lift flag |
| `days[].double` | object | `{ "amRun": 3, "pmSpringer": 20 }` |
| `days[].race` | object | `{ "name", "location", "time" }` |

---

## 2. Import blocks (Lift tab, new)

One paste can carry any number of blocks, any number of markers, or both.

```json
{
  "schema_version": 2,
  "blocks": [ { ...block... } ],
  "markers": [ { ...marker... } ]
}
```

- **Blocks** are matched on `start_date`. Re-importing a block with the same start date replaces it.
- **Markers** are matched on `key`. A re-import updates the label, kind, target, stretch and order, but **never overwrites progress you logged in the app** (`baseline`, `current` and their dates). Those are only taken from the file the first time a marker is created.
- Keys the importer doesn't know are ignored, not saved.
- Errors stop the whole import and list every problem. Warnings import anyway and list what's worth a second look.

### Block

| Key | Type | Required | Rules |
|---|---|---|---|
| `name` | text | yes | Shown in the banner |
| `phase` | key | yes | `reentry`, `build`, `lighter`, `heaviest`, `test`, `hold`, `maintain`, `max_window` |
| `start_date`, `end_date` | date | yes | `YYYY-MM-DD`, end on or after start. Start dates must be unique |
| `tier` | key | no | `set_in_stone`, `current_call` (default), `open` |
| `intent` | text | no | One or two sentences |
| `countdown` | object | no | `{ "label": "Test window", "start_date": "2026-12-28", "end_date": "2027-01-01" }`. Banner shows days until `start_date` |
| `sessions` | array | no | See below |
| `scheme` | object | no | `{ "reps": [3, 6], "sets": [3, 5], "rir": [2, 3], "rest_min": [2, 4], "volume_note": "text" }`. Each range is `[low, high]` numbers, or `null` to hide it |
| `weekly_main_sets` | object | no | `{ "low": 9, "high": 15, "basis": "file" }`. `basis: "derived"` adds "(derived, check with coach)" |
| `loads` | array | no | See below |
| `fillers` | array | no | See below |
| `placement` | array of text | no | Bullets under Dose |
| `signals` | array | no | `{ "when": "text", "then": "text", "tier": "set_in_stone" }`. `when` and `then` required |
| `notes` | text | no | Small print under the banner |

**`sessions[]`**: `{ "slot": "team2", "label": "Team lift 2", "lifts": ["trap_bar"], "note": "text" }`
- `slot`: `team1`, `team2` or `own`. Required.
- `lifts`: lift keys listed on the session card. Other lifts can still be logged from the card's "Also did" chips.

**`loads[]`**: `{ "lift": "trap_bar", "low": 245, "high": 265, "reps": 5, "unit": "lb", "basis": "estimate", "rule": "text" }`
- `lift`: required. Known keys: `trap_bar`, `box_squat`, `rdl`, `split_squat_iso`, `pullup`, `explosive`. Any other key needs a `label`.
- `low`, `high`, `reps`: numbers or `null`. Leave them `null` rather than guessing.
- `basis`: `estimate` (default) or `baseline`. Switch to `baseline` once clean baselines exist.

**`fillers[]`**: `{ "area": "soleus", "name": "Soleus isometric hold", "dose": "3 x 30 to 45 s", "where": "rest_periods" }`
- `where` (required): `rest_periods`, `pre_run`, `in_lifts`, `house`.
- `area`: `latHip`, `soleus`, `gluteMed`, `hamTendon`, `adductor`, `hipFlexor`.

### Marker

`{ "key": "copenhagen", "label": "Copenhagen", "kind": "durability", "baseline": "15 s", "baseline_on": "2026-11-01", "current": null, "current_on": null, "target": "30 s each side", "stretch": null, "sort_order": 3 }`

| Key | Rules |
|---|---|
| `key` | Required. Lowercase letters, digits and `_`. Unique |
| `label` | Required |
| `kind` | `durability` (default), `max`, `power`, `body`. Sets the group heading |
| `baseline`, `current`, `target`, `stretch` | Free text, so "12 x 70" and "30 s" both work |
| `baseline_on`, `current_on` | `YYYY-MM-DD` |
| `sort_order` | Number. Lower shows first |

---

## 3. Where the data lands

| Import key | Table.column |
|---|---|
| block keys | `lift_blocks.<same name>` (1:1, snake_case) |
| marker keys | `lift_markers.<same name>` (1:1) |
| Week plan `raceWeek`, `weeklyTarget.low/high`, `days` | `weeks.race_week`, `weekly_low/high`, `plan_days` |

Data entered in the app, not imported: `lift_logs` (`log_date, slot, lift, weight, reps, rir, form, symptom, done, note, block_id`) and `daily_logs.small_stuff`.

---

## Change log

- **2026-11-01, revamp Part 1.** Added Import blocks (`schema_version: 2`). Retired Import cycle (rehab). No existing key was renamed: the Week plan format is byte-for-byte the same, and `rehab_cycles` is untouched and read only.
