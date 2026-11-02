/* Lift Guide
 * Replaces the old Rehab tab. It guides and tracks lifting around the team program and the coach;
 * it never prescribes over them. Guidance is signals, not locks.
 *
 * Tables:  lift_blocks (filled by the paste import), lift_logs, lift_markers,
 *          daily_logs (small_stuff, and hip_am for the next-morning signal), rehab_cycles (read only).
 * Uses UI (ui-kit.js), Sync (sync.js) and these globals from index.html: sb, $, esc, fmt, isoMonday,
 *          addDays, pretty, daysOut, num, DAYS, REDUCED, banner, say.
 * The JSON keys below are documented in docs/import-guide.md. Change them there too.
 */
const LiftGuide = (() => {

  /* ---------- vocabulary: these keys are stored in the database and the import JSON ---------- */

  const LIFTS = {
    trap_bar: 'Trap bar', box_squat: 'Box squat', rdl: 'Barbell RDL',
    split_squat_iso: 'Split squat iso hold', pullup: 'Weighted pull-up', explosive: 'Explosive work',
  };
  const SLOTS = { team1: 'Team lift 1', team2: 'Team lift 2', own: 'Own lift' };
  const PHASES = ['reentry', 'build', 'lighter', 'heaviest', 'test', 'hold', 'maintain', 'max_window'];
  const TIERS = { set_in_stone: 'Set in stone', current_call: 'Current call', open: 'Open' };
  const AREAS = {
    latHip: 'Lateral hip', soleus: 'Soleus', gluteMed: 'Glute med',
    hamTendon: 'Hamstring tendon', adductor: 'Adductors', hipFlexor: 'Hip flexors',
  };
  const WHERE = {
    rest_periods: 'Between heavy sets', pre_run: 'Pre-run, 5 to 8 min',
    in_lifts: 'Inside the lift', house: 'House cues',
  };
  const SYMPTOMS = { none: 'None', hip: 'Hip', ham_tendon: 'Ham tendon' };
  const MARKER_KINDS = { durability: 'Durability markers', max: 'December targets', power: 'Power', body: 'Body' };
  const LOAD_BASIS = ['estimate', 'baseline'];

  const HISTORY_DAYS = 56;   // how far back "last top set" and hip readings look

  /* ---------- state ---------- */

  let data = null;        // { blocks, logs, markers, daily, rehab }
  let blockIdx = 0;       // block shown in the banner
  let openForm = null;    // { slot, lift } for the open log form
  let openAdd = null;     // session slot whose "another lift" chips are showing
  let openMarker = null;  // marker key being edited

  /* ---------- small helpers ---------- */

  const today = () => fmt(new Date());
  const thisMonday = () => isoMonday(new Date());
  const span = (a, b) => `${pretty(a)} to ${pretty(b)}`;
  const liftName = (key, label) => label || LIFTS[key] || key;
  const e1rm = (weight, reps) => (weight && reps ? Math.round(weight * (1 + reps / 30)) : null);
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00'));
  const block = () => (data && data.blocks[blockIdx]) || null;
  const blockOn = date => (data.blocks.find(b => b.start_date <= date && date <= b.end_date) || null);

  function amount(lo, hi, unit) {
    const a = num(lo), b = num(hi), u = unit ? ' ' + unit : '';
    if (a === null && b === null) return '';
    if (a === null || b === null || a === b) return (a ?? b) + u;
    return `${a} to ${b}${u}`;
  }
  const pair = arr => (Array.isArray(arr) ? amount(arr[0], arr[1]) : '');

  function tierChip(tier) {
    return tier ? `<span class="ui-tier ui-tier-${esc(tier)}">${esc(TIERS[tier] || tier)}</span>` : '';
  }

  const section = UI.section;

  /* ---------- data ---------- */

  async function load() {
    paint(stateCard('Loading the lift guide…'));
    await Sync.flush();

    const [blocks, logs, markers, daily, rehab] = await Promise.all([
      sb.from('lift_blocks').select('*').order('start_date'),
      sb.from('lift_logs').select('*').gte('log_date', addDays(thisMonday(), -HISTORY_DAYS))
        .order('log_date').order('created_at'),
      sb.from('lift_markers').select('*').order('sort_order'),
      sb.from('daily_logs').select('log_date,small_stuff,hip_am').gte('log_date', addDays(thisMonday(), -HISTORY_DAYS)),
      sb.from('rehab_cycles').select('cycle_start,cycle_label,weeks,completions').order('cycle_start', { ascending: false }),
    ]);
    const failed = [blocks, logs, markers, daily].find(r => r.error);
    if (failed) {
      paint(stateCard("Couldn't load the lift guide: " + failed.error.message +
        '. If the tables are new, run migrations-local/001_lift_guide.sql first.', true));
      return;
    }
    data = {
      blocks: blocks.data || [], logs: logs.data || [], markers: markers.data || [],
      daily: daily.data || [], rehab: rehab.error ? [] : (rehab.data || []),
    };
    blockIdx = currentBlockIndex(data.blocks);
    render();
  }

  // The block covering today; otherwise the next one; otherwise the latest.
  function currentBlockIndex(blocks) {
    const t = today();
    const now = blocks.findIndex(b => b.start_date <= t && t <= b.end_date);
    if (now >= 0) return now;
    const next = blocks.findIndex(b => b.start_date > t);
    return next >= 0 ? next : Math.max(0, blocks.length - 1);
  }

  /* ---------- render ---------- */

  function paint(html) { $('liftBody').innerHTML = html; }

  function stateCard(message, isError) {
    return `<div class="card"><div class="${isError ? 'status err' : 'empty'}">${esc(message)}</div>
      ${isError ? '<button class="ghost wide" data-act="reload">Try again</button>' : ''}</div>`;
  }

  function render() {
    const b = block();
    if (!b) {
      paint(`<div class="card"><h2>Lift Guide</h2>
        <div class="empty">No blocks yet. Paste a block file in Import blocks at the bottom of this tab to get started.</div></div>`
        + markersHTML() + rehabHistoryHTML());
      return;
    }
    paint([
      bannerHTML(b), sessionsHTML(b), smallStuffHTML(b), doseHTML(b), loadsHTML(b),
      markersHTML(), signalsHTML(b), rehabHistoryHTML(),
    ].join(''));
  }

  function bannerHTML(b) {
    const n = data.blocks.length;
    const cd = b.countdown && isDate(b.countdown.start_date) ? countdownHTML(b.countdown) : '';
    return `<section class="glass lg-banner" aria-label="Current block">
      <div class="lg-banner-nav">
        <button class="lg-icon" data-act="block" data-step="-1" ${blockIdx <= 0 ? 'disabled' : ''} aria-label="Earlier block">‹</button>
        <div class="lg-banner-title">
          <div class="eyebrow">${esc(span(b.start_date, b.end_date))}${b.start_date <= today() && today() <= b.end_date ? ' · now' : ''}</div>
          <div class="lg-block-name">${esc(b.name)}</div>
        </div>
        <button class="lg-icon" data-act="block" data-step="1" ${blockIdx >= n - 1 ? 'disabled' : ''} aria-label="Later block">›</button>
      </div>
      ${b.intent ? `<p class="lg-intent">${esc(b.intent)}</p>` : ''}
      <div class="lg-row">${tierChip(b.tier)}${cd}</div>
      ${b.notes ? `<p class="ui-note">${esc(b.notes)}</p>` : ''}
    </section>`;
  }

  function countdownHTML(c) {
    const end = isDate(c.end_date) ? c.end_date : c.start_date;
    const label = esc(c.label || 'Countdown');
    if (today() > end) return '';
    if (today() >= c.start_date) return `<span class="lg-countdown"><b>${label}</b> is now</span>`;
    const d = daysOut(c.start_date);
    return `<span class="lg-countdown"><b>${d}</b> ${d === 1 ? 'day' : 'days'} to ${label.toLowerCase()}
      <small>${esc(span(c.start_date, end))}</small></span>`;
  }

  /* ----- sessions: tap a lift to log its top set ----- */

  function sessionsHTML(b) {
    const monday = thisMonday();
    const weekLogs = data.logs.filter(l => l.log_date >= monday);
    const cards = (b.sessions || []).map(s => {
      const logs = weekLogs.filter(l => l.slot === s.slot);
      const lifts = [...new Set([...(s.lifts || []), ...logs.map(l => l.lift)])];
      const days = [...new Set(logs.map(l => DAYS[(new Date(l.log_date + 'T00:00:00').getDay() + 6) % 7]))];
      const others = Object.keys(LIFTS).filter(k => !lifts.includes(k));
      return `<article class="lg-session ${logs.length ? 'done' : ''}">
        <header class="lg-session-head">
          <div><div class="lg-session-name">${esc(s.label || SLOTS[s.slot] || s.slot)}</div>
            ${s.note ? `<div class="ui-note">${esc(s.note)}</div>` : ''}</div>
          <span class="lg-badge ${logs.length ? 'on' : ''}">${logs.length ? 'Logged ' + esc(days.join(', ')) : 'Not yet'}</span>
        </header>
        ${lifts.map(l => liftRowHTML(b, s.slot, l, logs.filter(x => x.lift === l))).join('')}
        ${addLiftHTML(s.slot, others, !lifts.length)}
      </article>`;
    }).join('');
    return section('This week', 'tap a lift to log the top set', cards || '<div class="empty">This block lists no sessions.</div>');
  }

  // Lifts not listed on the card. Shown straight away when the card lists none, otherwise behind one button.
  function addLiftHTML(slot, others, showAll) {
    if (!others.length) return '';
    const open = showAll || openAdd === slot;
    return `<div class="lg-add">
      ${showAll ? '<span class="ui-label">Log a lift</span>'
        : `<button class="lg-add-toggle" data-act="toggle-add" data-slot="${slot}" aria-expanded="${open}">${open ? 'Hide other lifts' : '+ Another lift'}</button>`}
      ${open ? `<div class="lg-add-grid">${others.map(k =>
        `<button class="ui-chip" data-act="open-form" data-slot="${slot}" data-lift="${k}">${esc(LIFTS[k])}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  function liftRowHTML(b, slot, lift, logs) {
    const guide = (b.loads || []).find(x => x.lift === lift);
    const open = openForm && openForm.slot === slot && openForm.lift === lift;
    return `<div class="lg-lift">
      <button class="lg-lift-btn" data-act="open-form" data-slot="${slot}" data-lift="${esc(lift)}" aria-expanded="${open}">
        <span class="lg-lift-name">${esc(liftName(lift, guide && guide.label))}</span>
        <span class="lg-lift-meta">${esc(liftRowMeta(lift, guide, logs.length > 0))}</span>
        <span class="lg-plus" aria-hidden="true">${open ? '−' : '+'}</span>
      </button>
      ${hipHintHTML(lift)}
      ${logs.map(logLineHTML).join('')}
      ${open ? logFormHTML(slot, lift) : ''}
    </div>`;
  }

  /* ----- next-morning signal (a hint, never a lock) ----- */

  const hipOn = date => data.daily.find(d => d.log_date === date)?.hip_am ?? null;
  function median(values) {
    const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Lifting file, set in stone: next-morning hip worse than baseline after a lift means repeat that load.
  // Baseline = median of the morning hip readings over the 7 days up to and including the lift day.
  function hipSignal(lift) {
    const last = [...data.logs].reverse().find(l => l.lift === lift);
    if (!last) return null;
    const next = hipOn(addDays(last.log_date, 1));
    const usual = Array.from({ length: 7 }, (_, i) => hipOn(addDays(last.log_date, -i))).filter(v => v !== null);
    if (next === null || !usual.length) return null;
    const base = median(usual);
    return next > base ? { next, base, date: last.log_date } : null;
  }

  function hipHintHTML(lift) {
    const s = hipSignal(lift);
    return s ? `<p class="lg-hip-hint">Hip was ${s.next} the morning after ${esc(pretty(s.date))}, above your usual ${s.base}.
      Hint: repeat last load.</p>` : '';
  }

  // Logged this week: the entry lines already show the numbers, so the row shows the guide range instead.
  function liftRowMeta(lift, guide, loggedThisWeek) {
    const range = guide ? amount(guide.low, guide.high, guide.unit) : '';
    return loggedThisWeek ? range : (lastSetText(lift) || range);
  }

  function lastSet(lift) {
    for (let i = data.logs.length - 1; i >= 0; i--) {
      const l = data.logs[i];
      if (l.lift === lift && num(l.weight) !== null) return l;
    }
    return null;
  }
  function lastSetText(lift) {
    const l = lastSet(lift);
    return l ? `Last ${num(l.weight)}${l.reps ? ' x ' + l.reps : ''} (${pretty(l.log_date)})` : '';
  }

  function logLineHTML(l) {
    const bits = [
      num(l.weight) !== null ? `${num(l.weight)}${l.reps ? ' x ' + l.reps : ''}` : 'Done',
      l.rir !== null && l.rir !== undefined ? 'RIR ' + num(l.rir) : '',
      l.form ? 'form ' + l.form : '',
      l.symptom && l.symptom !== 'none' ? SYMPTOMS[l.symptom] || l.symptom : '',
    ].filter(Boolean);
    const est = e1rm(num(l.weight), l.reps);
    return `<div class="lg-log ${l.symptom && l.symptom !== 'none' ? 'flag' : ''}">
      <span>${esc(pretty(l.log_date))}</span><b>${esc(bits.join(' · '))}</b>
      ${est && l.reps > 1 ? `<i>e1RM ${est}</i>` : ''}
      <button class="lg-x" data-act="delete-log" data-id="${l.id}" aria-label="Remove this entry">×</button>
    </div>${l.note ? `<div class="lg-log-note">${esc(l.note)}</div>` : ''}`;
  }

  function logFormHTML(slot, lift) {
    const last = lastSet(lift);
    return `<form class="lg-form" data-slot="${slot}" data-lift="${esc(lift)}" autocomplete="off">
      <div class="ui-form-row">
        <label class="ui-field">Weight<input name="weight" inputmode="decimal" placeholder="${last ? num(last.weight) : 'lb'}"></label>
        <label class="ui-field">Reps<input name="reps" inputmode="numeric" placeholder="${last && last.reps ? last.reps : '5'}"></label>
        <label class="ui-field">Date<input name="log_date" type="date" value="${today()}"></label>
      </div>
      ${UI.chips('rir', [0, 1, 2, 3, 4, 5].map(n => [n, n === 5 ? '5+' : String(n)]), 'Reps in reserve')}
      ${UI.chips('form', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, String(n)]), 'Form, 1 to 10', { grid: 5 })}
      ${UI.chips('symptom', Object.entries(SYMPTOMS), 'Symptom during')}
      <label class="ui-field">Note<input name="note" placeholder="Optional"></label>
      <div class="ui-form-actions">
        <button type="submit">Save</button>
        <button type="button" class="ghost" data-act="close-form">Cancel</button>
      </div>
      <p class="ui-hint">A painful rep ends the set. Leave weight blank to just mark it done.</p>
    </form>`;
  }

  /* ----- small stuff: one tap a day ----- */

  function smallStuffHTML(b) {
    const monday = thisMonday();
    const doneOn = new Set(data.daily.filter(d => d.small_stuff && d.log_date >= monday).map(d => d.log_date));
    const todayDone = doneOn.has(today());
    const week = DAYS.map((d, i) => {
      const date = addDays(monday, i);
      return `<i class="${doneOn.has(date) ? 'hit' : ''} ${date === today() ? 'now' : ''}" title="${d}"></i>`;
    }).join('');
    const groups = Object.entries(WHERE).map(([key, title]) => {
      const items = (b.fillers || []).filter(f => f.where === key);
      if (!items.length) return '';
      return `<div class="lg-where"><div class="ui-label">${title}</div><div class="lg-fillers">
        ${items.map(f => `<span class="lg-filler" style="--ac:var(--area-${esc(f.area)},var(--dim))">
          <b>${esc(f.name)}</b><i><em>${esc(AREAS[f.area] || '')}</em>${f.area && f.dose ? ' · ' : ''}${esc(f.dose || '')}</i></span>`).join('')}
      </div></div>`;
    }).join('');
    return section('Small stuff', `${doneOn.size}/7 this week`, `
      <button class="lg-today ${todayDone ? 'on' : ''}" data-act="small-stuff" aria-pressed="${todayDone}">
        ${todayDone ? '✓ Small stuff done today' : 'Mark small stuff done today'}</button>
      <div class="streak lg-streak" aria-label="${doneOn.size} of 7 days this week">${week}</div>
      ${groups || '<div class="empty">No fillers listed for this block.</div>'}`);
  }

  /* ----- dose and loads ----- */

  function doseHTML(b) {
    const s = b.scheme || {};
    const rows = [
      ['Sessions', `${(b.sessions || []).length} a week: ${(b.sessions || []).map(x => esc(x.label || SLOTS[x.slot])).join(', ')}`],
      ['Reps', pair(s.reps)], ['Sets', pair(s.sets)], ['Reps in reserve', pair(s.rir)],
      ['Rest', s.rest_min ? pair(s.rest_min) + ' min' : ''],
      ['Main-lift sets', weeklySetsText(b.weekly_main_sets)],
    ].filter(([, v]) => v);
    return section('Dose', 'this block', `
      ${rows.map(([k, v]) => `<div class="tally"><span>${k}</span><b>${v}</b></div>`).join('')}
      ${s.volume_note ? `<p class="ui-note">${esc(s.volume_note)}</p>` : ''}
      ${(b.placement || []).length ? `<ul class="lg-list">${b.placement.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`,
    { open: false });
  }

  function weeklySetsText(w) {
    if (!w) return '';
    const n = amount(w.low, w.high);
    return n ? `about ${n} a week${w.basis === 'derived' ? ' (derived, check with coach)' : ''}` : '';
  }

  function loadsHTML(b) {
    const rows = (b.loads || []).map(g => {
      const target = amount(g.low, g.high, g.unit) + (g.reps ? ` x ${g.reps}` : '');
      return `<div class="lg-load">
        <div class="lg-load-head"><b>${esc(liftName(g.lift, g.label))}</b>
          <span class="lg-basis ${g.basis === 'baseline' ? 'base' : ''}">${g.basis === 'baseline' ? 'baseline' : 'estimate'}</span></div>
        ${target.trim() ? `<div class="lg-load-num">${esc(target)}</div>` : ''}
        ${g.rule ? `<div class="ui-note">${esc(g.rule)}</div>` : ''}
        ${lastSetText(g.lift) ? `<div class="lg-load-last">${esc(lastSetText(g.lift))}</div>` : ''}
        ${hipHintHTML(g.lift)}
      </div>`;
    }).join('');
    return section('Load guide', 'estimates until clean baselines, weeks 3 to 4',
      rows || '<div class="empty">This block has no load guide.</div>', { open: false });
  }

  /* ----- durability markers and December targets ----- */

  function markersHTML() {
    if (!data.markers.length) {
      return section('Markers', '', '<div class="empty">No markers yet. Add them with the import below.</div>', { open: false });
    }
    const groups = Object.entries(MARKER_KINDS).map(([kind, title]) => {
      const list = data.markers.filter(m => m.kind === kind);
      return list.length ? `<div class="ui-label lg-group">${title}</div>${list.map(markerHTML).join('')}` : '';
    }).join('');
    return section('Markers', 'now vs target', groups, { open: false, id: 'lg-markers' });
  }

  function markerHTML(m) {
    const now = m.current || m.baseline || 'untested';
    const editing = openMarker === m.key;
    return `<div class="lg-marker">
      <button class="lg-marker-btn" data-act="edit-marker" data-key="${esc(m.key)}" aria-expanded="${editing}">
        <span class="lg-marker-name">${esc(m.label)}</span>
        <span class="lg-marker-vals"><b>${esc(now)}</b><i>→ ${esc(m.target || 'no target')}</i></span>
      </button>
      ${markerFootHTML(m)}
      ${editing ? `<form class="lg-form lg-marker-form" data-key="${esc(m.key)}" autocomplete="off">
        <div class="ui-form-row">
          <label class="ui-field">Now<input name="current" value="${esc(m.current || '')}" placeholder="e.g. 20 s"></label>
          <label class="ui-field">Tested<input name="current_on" type="date" value="${m.current_on || today()}"></label>
        </div>
        <label class="ui-field">Target<input name="target" value="${esc(m.target || '')}"></label>
        <div class="ui-form-actions">
          <button type="submit">Save</button>
          <button type="button" class="ghost" data-act="baseline">${m.baseline ? 'Reset baseline to now' : 'Save as baseline'}</button>
        </div>
      </form>` : ''}
    </div>`;
  }

  // Small line under a marker: the baseline (only when a newer reading replaced it), its date, and the stretch goal.
  function markerFootHTML(m) {
    const when = d => (d ? ', ' + pretty(d) : '');
    const bits = [];
    if (m.current) {
      if (m.current_on) bits.push('Tested ' + pretty(m.current_on));
      if (m.baseline) bits.push('baseline ' + m.baseline + when(m.baseline_on));
    } else if (m.baseline) {
      bits.push('Baseline' + when(m.baseline_on));
    }
    if (m.stretch) bits.push('stretch ' + m.stretch);
    return bits.length ? `<div class="lg-marker-base">${esc(bits.join(' · '))}</div>` : '';
  }

  /* ----- hold or back off ----- */

  function signalsHTML(b) {
    const list = b.signals || [];
    if (!list.length) return '';
    return section('Hold or back off', 'signals, not locks', list.map(s => `
      <div class="lg-signal"><div class="lg-signal-when">${esc(s.when)}</div>
        <div class="lg-signal-then">${esc(s.then)} ${tierChip(s.tier)}</div></div>`).join(''), { open: false });
  }

  /* ----- old rehab cycles, read only ----- */

  function rehabHistoryHTML() {
    const cycles = (data.rehab || []).filter(c => !/^FIXTURE/i.test(c.cycle_label || ''));
    if (!cycles.length) return '';
    const rows = cycles.map(c => {
      const a = rehabAdherence(c);
      return `<div class="tally"><span>${esc(c.cycle_label || 'Rehab cycle')}<br>
        <small class="ui-note">${esc(span(c.cycle_start, addDays(c.cycle_start, 20)))}</small></span>
        <b>${a.done}/${a.total}<br><small class="ui-note">${a.byWeek.join(' · ')}</small></b></div>`;
    }).join('');
    return section('Rehab history', 'read only', rows, { open: false });
  }

  function rehabAdherence(c) {
    let total = 0, done = 0;
    const byWeek = (c.weeks || []).map((w, i) => {
      const n = w.week_number || i + 1;
      let wt = 0, wd = 0;
      Object.entries(w.days || {}).forEach(([day, o]) => {
        const date = addDays(c.cycle_start, (n - 1) * 7 + DAYS.indexOf(day));
        (o.exercises || []).forEach((_, k) => { wt++; if ((c.completions || {})[date + '|' + k]) wd++; });
      });
      total += wt; done += wd;
      return `wk ${n} ${wd}/${wt}`;
    });
    return { total, done, byWeek };
  }

  /* ---------- actions ---------- */

  const actions = {
    reload: () => load(),
    block(el) {
      blockIdx = Math.max(0, Math.min(data.blocks.length - 1, blockIdx + Number(el.dataset.step)));
      openForm = null;
      render();
    },
    'open-form'(el) {
      const same = openForm && openForm.slot === el.dataset.slot && openForm.lift === el.dataset.lift;
      openForm = same ? null : { slot: el.dataset.slot, lift: el.dataset.lift };
      openAdd = null;
      render();
      if (openForm) document.querySelector('.lg-form input[name="weight"]')?.focus({ preventScroll: true });
    },
    'close-form'() { openForm = null; render(); },
    'toggle-add'(el) { openAdd = openAdd === el.dataset.slot ? null : el.dataset.slot; render(); },
    chip: el => UI.pick(el),
    async 'delete-log'(el) {
      if (!confirm('Remove this entry?')) return;
      data.logs = data.logs.filter(l => l.id !== el.dataset.id);
      render();
      await Sync.write({ table: 'lift_logs', kind: 'delete', match: { id: el.dataset.id } }, 'Removing that entry');
    },
    async 'small-stuff'() {
      const t = today();
      const row = data.daily.find(d => d.log_date === t);
      const next = !(row && row.small_stuff);
      if (row) row.small_stuff = next; else data.daily.push({ log_date: t, small_stuff: next });
      render();
      await Sync.write({ table: 'daily_logs', kind: 'upsert', row: { log_date: t, small_stuff: next }, onConflict: 'user_id,log_date' }, 'Small stuff');
    },
    'edit-marker'(el) { openMarker = openMarker === el.dataset.key ? null : el.dataset.key; render(); },
    async baseline(el) {
      const form = el.closest('form');
      const value = form.current.value.trim();
      if (!value) return form.current.focus();
      await saveMarker(form.dataset.key, {
        current: value, current_on: form.current_on.value || today(),
        baseline: value, baseline_on: form.current_on.value || today(),
      });
    },
  };

  async function saveLog(form) {
    const chosen = group => UI.picked(form, group);
    const logDate = isDate(form.log_date.value) ? form.log_date.value : today();
    const row = {
      log_date: logDate,
      block_id: blockOn(logDate)?.id ?? null,
      slot: form.dataset.slot, lift: form.dataset.lift,
      weight: num(form.weight.value), reps: num(form.reps.value),
      rir: num(chosen('rir')), form: num(chosen('form')), symptom: chosen('symptom'),
      note: form.note.value.trim() || null, done: true,
    };
    const { ok, data: saved } = await Sync.write({ table: 'lift_logs', kind: 'insert', row }, 'That set');
    if (!ok) return;
    data.logs.push(saved);
    data.logs.sort((a, b) => (a.log_date < b.log_date ? -1 : a.log_date > b.log_date ? 1 : 0));
    openForm = null;
    render();
  }

  async function saveMarker(key, fields) {
    const m = data.markers.find(x => x.key === key);
    Object.assign(m, fields);
    openMarker = null;
    render();
    await Sync.write({ table: 'lift_markers', kind: 'update', row: fields, match: { id: m.id } }, 'That marker');
  }

  function onSubmit(e) {
    const form = e.target;
    if (!form.classList.contains('lg-form')) return;
    e.preventDefault();
    if (form.classList.contains('lg-marker-form')) {
      saveMarker(form.dataset.key, {
        current: form.current.value.trim() || null,
        current_on: form.current.value.trim() ? (form.current_on.value || today()) : null,
        target: form.target.value.trim() || null,
      });
    } else {
      saveLog(form);
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    actions[el.dataset.act](el);
  }

  /* ---------- import ---------- */

  // Returns { errors, warnings }. Errors block the import; warnings are worth a look.
  function validate(p) {
    const errors = [], warnings = [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { errors: ['The file must be one JSON object.'], warnings };
    if (p.schema_version !== 2) errors.push(`schema_version must be 2 (got ${JSON.stringify(p.schema_version)})`);
    const blocks = p.blocks ?? [], markers = p.markers ?? [];
    if (!Array.isArray(blocks)) errors.push('blocks must be an array');
    if (!Array.isArray(markers)) errors.push('markers must be an array');
    if (!errors.length && !blocks.length && !markers.length) errors.push('blocks and markers are both empty; nothing to import');
    if (errors.length) return { errors, warnings };

    blocks.forEach((b, i) => validateBlock(b, `blocks[${i}]${b && b.name ? ' (' + b.name + ')' : ''}`, errors, warnings));
    const starts = blocks.map(b => b && b.start_date);
    starts.forEach((s, i) => { if (s && starts.indexOf(s) !== i) errors.push(`blocks[${i}] start_date ${s} is used twice in this file`); });
    blocks.forEach((b, i) => blocks.slice(i + 1).forEach(o => {
      if (b && o && b.start_date <= o.end_date && o.start_date <= b.end_date) warnings.push(`${b.name} and ${o.name} overlap`);
    }));

    const keys = new Set();
    markers.forEach((m, i) => {
      const at = `markers[${i}]${m && m.label ? ' (' + m.label + ')' : ''}`;
      if (!m || typeof m !== 'object') return errors.push(at + ' is not an object');
      if (!/^[a-z0-9_]+$/.test(m.key || '')) errors.push(at + ' key must be lowercase letters, digits and _');
      else if (keys.has(m.key)) errors.push(at + ` key "${m.key}" is used twice`);
      keys.add(m.key);
      if (!m.label) errors.push(at + ' has no label');
      if (m.kind && !MARKER_KINDS[m.kind]) errors.push(at + ` kind "${m.kind}" must be one of ${Object.keys(MARKER_KINDS).join(', ')}`);
      ['baseline_on', 'current_on'].forEach(f => { if (m[f] != null && !isDate(m[f])) errors.push(`${at} ${f} is not YYYY-MM-DD`); });
    });
    return { errors, warnings };
  }

  function validateBlock(b, at, errors, warnings) {
    if (!b || typeof b !== 'object') return errors.push(at + ' is not an object');
    if (!b.name) errors.push(at + ' has no name');
    if (!PHASES.includes(b.phase)) errors.push(`${at} phase "${b.phase}" must be one of ${PHASES.join(', ')}`);
    if (!isDate(b.start_date)) errors.push(at + ' start_date is missing or not YYYY-MM-DD');
    if (!isDate(b.end_date)) errors.push(at + ' end_date is missing or not YYYY-MM-DD');
    if (isDate(b.start_date) && isDate(b.end_date) && b.end_date < b.start_date) errors.push(at + ' ends before it starts');
    if (isDate(b.end_date) && b.end_date < today()) warnings.push(at + ' is already over');
    if (b.tier != null && !TIERS[b.tier]) errors.push(`${at} tier "${b.tier}" must be one of ${Object.keys(TIERS).join(', ')}`);
    if (b.countdown != null) {
      if (!b.countdown.label) warnings.push(at + ' countdown has no label');
      if (!isDate(b.countdown.start_date)) errors.push(at + ' countdown.start_date is not YYYY-MM-DD');
      if (b.countdown.end_date != null && !isDate(b.countdown.end_date)) errors.push(at + ' countdown.end_date is not YYYY-MM-DD');
    }

    const list = (field, check) => {
      if (b[field] == null) return;
      if (!Array.isArray(b[field])) return errors.push(`${at} ${field} must be an array`);
      b[field].forEach((x, k) => check(x || {}, `${at} ${field}[${k}]`));
    };
    list('sessions', (s, w) => {
      if (!SLOTS[s.slot]) errors.push(`${w} slot "${s.slot}" must be one of ${Object.keys(SLOTS).join(', ')}`);
      if (s.lifts != null && !Array.isArray(s.lifts)) errors.push(w + ' lifts must be an array of lift keys');
      (Array.isArray(s.lifts) ? s.lifts : []).forEach(l => { if (!LIFTS[l]) warnings.push(`${w} lift "${l}" is not a known lift key`); });
    });
    list('loads', (g, w) => {
      if (!g.lift) errors.push(w + ' has no lift');
      else if (!LIFTS[g.lift] && !g.label) warnings.push(`${w} lift "${g.lift}" is not a known key; add a label`);
      ['low', 'high', 'reps'].forEach(f => { if (g[f] != null && typeof g[f] !== 'number') errors.push(`${w} ${f} must be a number or null`); });
      if (typeof g.low === 'number' && typeof g.high === 'number' && g.high < g.low) errors.push(w + ' high is below low');
      if (g.basis != null && !LOAD_BASIS.includes(g.basis)) errors.push(`${w} basis must be estimate or baseline`);
    });
    list('fillers', (f, w) => {
      if (!f.name) errors.push(w + ' has no name');
      if (!WHERE[f.where]) errors.push(`${w} where "${f.where}" must be one of ${Object.keys(WHERE).join(', ')}`);
      if (f.area != null && !AREAS[f.area]) errors.push(`${w} area "${f.area}" must be one of ${Object.keys(AREAS).join(', ')}`);
    });
    list('signals', (s, w) => {
      if (!s.when || !s.then) errors.push(w + ' needs both when and then');
      if (s.tier != null && !TIERS[s.tier]) errors.push(`${w} tier "${s.tier}" is not a known tier`);
    });
    list('placement', (p, w) => { if (typeof p !== 'string') errors.push(w + ' must be text'); });

    const s = b.scheme;
    if (s != null) {
      if (typeof s !== 'object') errors.push(at + ' scheme must be an object');
      else ['reps', 'sets', 'rir', 'rest_min'].forEach(f => {
        const v = s[f];
        if (v == null) return;
        if (!Array.isArray(v) || v.length !== 2 || v.some(n => typeof n !== 'number')) errors.push(`${at} scheme.${f} must be [low, high] numbers or null`);
        else if (v[1] < v[0]) errors.push(`${at} scheme.${f} high is below low`);
      });
    }
    const w = b.weekly_main_sets;
    if (w != null && (typeof w.low !== 'number' || typeof w.high !== 'number')) errors.push(at + ' weekly_main_sets needs numeric low and high');
  }

  // Only these columns are written, so stray keys in a pasted file are ignored.
  const BLOCK_COLUMNS = ['name', 'phase', 'start_date', 'end_date', 'tier', 'intent', 'countdown', 'sessions',
    'scheme', 'weekly_main_sets', 'loads', 'fillers', 'placement', 'signals', 'notes'];
  const MARKER_DEFINITION = ['key', 'label', 'kind', 'target', 'stretch', 'sort_order'];
  const MARKER_PROGRESS = ['baseline', 'baseline_on', 'current', 'current_on'];
  const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));

  async function runImport() {
    const status = $('liftStatus');
    const raw = $('liftIn').value.trim();
    if (!raw) return say(status, 'Paste a block file first.', 'err');
    let p;
    try { p = JSON.parse(raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim()); }
    catch (e) { return say(status, "That isn't valid JSON: " + e.message, 'err'); }

    const { errors, warnings } = validate(p);
    if (errors.length) return say(status, 'Nothing imported:\n· ' + errors.join('\n· '), 'err');
    say(status, 'Importing…');

    const blocks = (p.blocks || []).map(b => ({ schema_version: 2, tier: 'current_call', ...pick(b, BLOCK_COLUMNS) }));
    if (blocks.length) {
      const { error } = await sb.from('lift_blocks').upsert(blocks, { onConflict: 'user_id,start_date', defaultToNull: false });
      if (error) return say(status, "Didn't save the blocks: " + error.message, 'err');
    }

    // Markers: an import updates names and targets, but never overwrites progress you logged in the app.
    let kept = 0;
    if ((p.markers || []).length) {
      const { data: existing, error: readErr } = await sb.from('lift_markers').select('key');
      if (readErr) return say(status, "Didn't save the markers: " + readErr.message, 'err');
      const have = new Set((existing || []).map(m => m.key));
      const rows = p.markers.map(m => {
        if (have.has(m.key)) { kept++; return pick(m, MARKER_DEFINITION); }
        return pick(m, [...MARKER_DEFINITION, ...MARKER_PROGRESS]);
      });
      // Two batches, because a bulk upsert writes the union of columns: known markers must not carry progress columns.
      const fresh = rows.filter(r => !have.has(r.key)), known = rows.filter(r => have.has(r.key));
      for (const batch of [fresh, known]) {
        if (!batch.length) continue;
        const { error } = await sb.from('lift_markers').upsert(batch, { onConflict: 'user_id,key', defaultToNull: false });
        if (error) return say(status, "Didn't save the markers: " + error.message, 'err');
      }
    }

    $('liftIn').value = '';
    await load();
    const parts = [];
    if (blocks.length) parts.push(`${blocks.length} block${blocks.length === 1 ? '' : 's'}`);
    if ((p.markers || []).length) parts.push(`${p.markers.length} marker${p.markers.length === 1 ? '' : 's'}`);
    say(status, 'Imported ' + parts.join(' and ') + '.' +
      (kept ? ` ${kept} of those markers already existed, so their logged values were kept.` : '') +
      (warnings.length ? '\n\nWorth checking:\n· ' + warnings.join('\n· ') : ''), 'ok');
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  /* ---------- wiring ---------- */

  function init() {
    const root = document.getElementById('tab-lift');   // runs before index.html defines $()
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    document.getElementById('liftImport').addEventListener('click', runImport);
  }
  init();

  return { load, validate };
})();
