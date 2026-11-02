# Handoff Spec: Training Hub IA and visual pass (revamp Part 3)

## Overview

A single-user training PWA for a collegiate runner. It's used one-handed on a phone, usually mid-morning or between sessions, often in a hurry. The goal of this pass is to evolve the existing look (ink and cardinal, Archivo + Azeret Mono, glass panels, paper grain), not replace it:

- Fix the navigation, which has no room left at 390 px.
- Bring every tap target to 44 px.
- Pass WCAG AA contrast.
- Give every screen real loading and empty states.

**Hard constraint:** the Week tab is functionally frozen. Only CSS may change what it looks like. `tools/week-freeze.mjs` must still pass.

## Layout

- **Target width:** 390 px (iPhone 12 to 16). Must also hold at 360 px with no horizontal scroll.
- **Content column:** max 560 px, centered, 16 px side gutter (`--gutter`).
- **Top:** header (eyebrow + title + save state), then the week nav on Week and Reset only.
- **Bottom:** a fixed tab bar, 56 px tall plus `env(safe-area-inset-bottom)`. Body bottom padding = bar height + 24 px, so the last card never sits under the bar.
- **Spacing:** a 4/8 grid. Cards have 16 px padding and an 8 px gap between them; spacing inside a card group is 8 or 12 px.

## Navigation

**Before:** 6 top tabs, each 60 x 29 px with 9.5 px labels and zero slack at 390 px. They already clip at 375 px, and adding Lift would have made 7.

**After:** a bottom bar with 5 slots, because the thumb lives at the bottom and five is the comfortable maximum for a bottom bar.

| Slot | Opens | Why here |
|---|---|---|
| Today | Home: check-in, next meet, schedule, week snapshot | The daily front door. Consistency is the problem being solved |
| Week | Week tab (frozen) | Most frequent logging |
| Lift | Lift Guide | 3 times a week |
| Reset | Sunday Reset | Weekly. Keeps its "not started" dot |
| More | Menu: Goals, Export, Sign out | Rare. Sign out leaves the bottom of every page |

- The active slot gets `aria-current="page"`, bone text, and a 2 px cardinal bar along the top edge (the existing ink underline, moved).
- More is active while Goals or Export is open.
- The More menu is a glass popover above the bar with 3 rows of 48 px. It closes on selection, Escape, or a tap outside.
- The header eyebrow shows today's date (for example "Sun, Nov 1") instead of repeating the title.

## Design tokens

| Token | Value | Usage | Change |
|---|---|---|---|
| `--ink` | #140C0D | Page background | same |
| `--surface` / `--surface2` | #1E1416 / #26191B | Card gradient | same |
| `--sunk` | #0D0708 | Inputs, inset rows | same |
| `--bone` | #F0E9E2 | Primary text | same |
| `--dim` | #B09A96 | Secondary text (6.4:1 or better) | same |
| `--dim2` | **#A08A86** | Labels, eyebrows, placeholders | was #7E6864 (3.47:1, failed). Now 4.65:1 or better on every surface |
| `--cardinal` | #D81E36 | Fills: primary buttons, active marks, race flags | same |
| `--cardinal-text` | **#F05A6C** | Red *text*: errors, "over cap", goal dates | new. Cardinal text was 3.82:1 on ink |
| `--sev0` | **#A08A86** | Severity 0 | was #7E6864, same reason as `--dim2` |
| `--sev4` | **#E45A49** | Severity 4 | was #DC4A38 (4.35:1 on surface) |
| `--go`, `--amber`, `--coach` | unchanged | Status | all 6:1 or better |
| `--tap` | 44px | Minimum touch target | new (Part 1) |
| `--gutter` | 16px | Page side padding | was 14px |
| `--bar-h` | 56px | Bottom bar height (excluding safe area) | new |

**Type scale** (two families, as before):

| Role | Font | Size |
|---|---|---|
| Display numbers | Azeret Mono 500 | 62 / 26 px |
| Title | Archivo 800, wdth 118, uppercase | 22 px |
| Card title (h2) | Azeret Mono 700, uppercase, .14em | 11 px |
| Body | Archivo 400 | 15.5 px |
| Secondary | Archivo 400 | 13 to 13.5 px |
| Data / labels | Azeret Mono 500 to 700 | 11 to 13 px |

Floor: **no text below 11 px.** The old 8.5, 9, 9.5, 10 and 10.5 px sizes all move to 11 px.

**Radii:** cards 3 px, controls 2 px, glass 8 px, all unchanged.

## Components

| Component | States | Spec |
|---|---|---|
| Button (primary) | default, active (scale .975), disabled (.4 opacity), focus (2 px cardinal ring) | min-height `--tap` |
| Button (ghost) | same | 1 px `--line` border, `--dim` text |
| Small action (Edit, Delete, Remove) | same | min-height `--tap`, 12 px side padding |
| Chip / box button (Reset boxes, vibes, tier marks, ranges) | off, on (pressed fill) | min-height `--tap`. Pressed state uses `aria-pressed` where the code supports it |
| Tick (process goals) | off, on, pop | 44 x 44 (was 38) |
| Input / select | default, focus, placeholder | min-height `--tap`, 16 px font (stops iOS zoom) |
| Range slider (Quick Scan) | per-severity colour | Hit area 44 px tall. Track stays 3 px |
| Card | default, collapsible (`ui-section`) | 16 px padding, 8 px gap |
| Bottom bar slot | default, active, focus | 56 px tall, label 11 px mono uppercase |
| Banner | error, ok | Button min-height `--tap`. Error text in `--cardinal-text` |

## States

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Today, check-in | Card appears when the data arrives | Streak strip "Start a streak today" | Red status line in the card |
| Today, next up / schedule | "Loading…" in each card | "Nothing left on the calendar." | "Schedule unavailable. Check your connection." |
| Week | "Loading the week…" via CSS `#days:empty::before` (no markup change) | Existing per-day "No plan yet" | Existing banner with Reload |
| Lift | "Loading the lift guide…" card | "No blocks yet" with a pointer to Import | Error card + Try again |
| Reset | Morning hip card appears when its data arrives | "No morning hip readings this week." | Card hidden |
| Goals | "Loading…" in each list | Existing empty copy | Banner |
| Export | "Building…" | n/a | Status line |

## Edge cases

- **360 px:** bar slots are 72 px wide and the longest label ("TODAY") is about 50 px at 11 px. It fits. The one exception to 44 px is Reset's seven day boxes, which are 40 x 44 at 360 px (44 x 44 at 390). They still clear the WCAG AA target-size minimum of 24 px. Wrapping seven days onto two rows would read worse.
- **Measured (Part 3):** at 390 px every tab has 0 controls under 44 px, 0 elements wider than the screen, and 0 text under 11 px. `<small>` gets an 11 px floor because browsers shrink it to 83%.
- **Long block, lift or marker names** wrap and never truncate. No `nowrap` on user text.
- **Offline:** the Week draft banner and Sync's held-entries banner both sit under the header and above content.
- **PWA standalone on iPhone:** the bar pads for the home indicator with `env(safe-area-inset-bottom)`.

## Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Active-tab bar | Tab change | Slides to the new slot | 320 ms | cubic-bezier(.4,0,.2,1) |
| More menu | Open | Fade + 8 px rise | 200 ms | ease-out |
| Cards | First paint | Existing `rise` | 420 ms | existing |
| Ticks | Toggle | Existing `pop` | 300 ms | existing |

`prefers-reduced-motion: reduce` turns all of these off. The existing global rule already covers it, and the JS checks `REDUCED` before number rolls and smooth scrolls.

## Accessibility

- **Focus order:** header, then the week nav (Week and Reset only), then content, then the bottom bar (which is after content in the DOM).
- **Bottom bar:** `<nav aria-label="Sections">`. Slots are buttons; the active one has `aria-current="page"`. More has `aria-haspopup="menu"` and `aria-expanded`. Menu items are buttons.
- **Keyboard:** Escape closes the More menu and returns focus to More.
- **Contrast:** every text token passes 4.5:1 on every surface it sits on.
- **Tap targets:** 44 px minimum everywhere. The bar slots are 56 px.
- **Live regions:** status lines keep `role="status"` where added; the Lift body is `aria-live="polite"`.

## Deliberately left alone

- **Week tab logic and markup**, including 7 em dashes in its copy (the empty-day "No plan yet" line, the race line, the empty-value placeholder and the plan-import messages), since that text is inside frozen code. It changes only if Max lifts the freeze.
- **Goals' `prompt()` / `confirm()` editing.** It works; replacing it with inline forms is a separate task.
