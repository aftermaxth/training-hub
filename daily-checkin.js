/* Daily check-in
 * A 15-second card at the top of Home. Required: morning hip, sleep, small stuff (3 taps, 6 with a
 * second site). Everything else is optional and collapsed. Each tap saves on its own.
 * Also paints the read-only morning-hip summary on the Reset tab.
 *
 * Table: daily_logs, one row per date. Run miles and XT minutes are read from weeks, never stored here.
 * Uses UI (ui-kit.js), Sync (sync.js) and globals from index.html: sb, $, esc, fmt, isoMonday,
 * addDays, pretty, num, DAYS.
 */
const DailyCheckin = (() => {

  /* ---------- vocabulary: values stored in daily_logs ---------- */

  const SECOND_SITES = {
    soleus: 'Soleus', gluteMed: 'Glute med', hamTendon: 'Ham tendon',
    adductor: 'Adductors', hipFlexor: 'Hip flexors', other: 'Other',
  };
  const ZERO_TO_TEN = Array.from({ length: 11 }, (_, n) => [n, String(n)]);
  const SLEEP_HOURS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
    .map(h => [h, h === 5 ? '≤5' : h === 10 ? '10+' : String(h)]);
  const SLEEP_NEEDS = [7, 7.5, 8, 8.5, 9, 9.5].map(h => [h, String(h)]);
  const YES_NO = [['yes', 'Yes'], ['no', 'No']];
  const FELT = [1, 2, 3, 4, 5].map(n => [n, String(n)]);

  // How each chip group turns into a column value.
  const FIELDS = {
    hip_am: Number, hip2: Number, hip2_site: String, sleep_h: Number, sleep_need_h: Number,
    small_stuff: v => v === 'yes', felt: Number, heat: v => v === 'yes', creatine: v => v === 'yes',
  };

  const LOOKBACK_DAYS = 28;  // rows kept for the streak strip and the sleep-need carry-forward
  const STRIP_DAYS = 14;
  const FLAG_ABOVE = 3;      // Reset counts mornings above this

  /* ---------- state ---------- */

  let rows = {};             // log_date -> daily_logs row
  let date = null;           // day being checked in; set on first load (fmt() isn't defined yet at file load)
  let ui = { second: false, needEdit: false, more: false };
  let fromWeek = null;       // { miles, xmin } for the date, read from weeks
  const typingTimers = {};   // one pending save per text field, so typing in one never cancels another

  const today = () => fmt(new Date());
  const row = () => rows[date] || {};
  const sev = v => `var(--sev${Math.ceil(v / 2)})`;  // 0..10 onto the six-step severity ramp
  const yesNo = v => (v === true ? 'yes' : v === false ? 'no' : null);

  // Latest sleep need on or before the date, so it is set once and carried forward.
  function sleepNeed() {
    const known = Object.values(rows).filter(r => r.log_date <= date && num(r.sleep_need_h) !== null)
      .sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
    return known.length ? num(known[0].sleep_need_h) : null;
  }

  /* ---------- data ---------- */

  async function load() {
    date = date || today();
    await Sync.flush();
    const { data, error } = await sb.from('daily_logs').select('*')
      .gte('log_date', addDays(today(), -LOOKBACK_DAYS)).order('log_date');
    if (error) {
      $('checkinCard').innerHTML = `<div class="card"><h2>Check-in</h2>
        <div class="status err">Couldn't load check-ins: ${esc(error.message)}</div></div>`;
      return;
    }
    rows = Object.fromEntries((data || []).map(r => [r.log_date, r]));
    await loadFromWeek();
    render();
  }

  async function loadFromWeek() {
    fromWeek = null;
    const { data } = await sb.from('weeks').select('actual_days').eq('week_of', isoMonday(date)).maybeSingle();
    const day = (data && Array.isArray(data.actual_days) ? data.actual_days : [])
      .find(d => d && d.day === DAYS[(new Date(date + 'T00:00:00').getDay() + 6) % 7]);
    if (day) fromWeek = { miles: num(day.miles) || 0, xmin: num(day.xmin) || 0 };
  }

  async function save(fields) {
    rows[date] = { ...row(), log_date: date, ...fields };
    await Sync.write({ table: 'daily_logs', kind: 'upsert', row: { log_date: date, ...fields }, onConflict: 'user_id,log_date' },
      'That check-in');
  }

  /* ---------- render ---------- */

  function render() {
    const r = row();
    const done = r.hip_am != null && r.sleep_h != null && r.small_stuff != null;
    $('checkinCard').innerHTML = `<section class="card dc" aria-label="Daily check-in">
      <header class="dc-head">
        <h2>Check-in ${done ? '<small class="dc-done">done</small>' : ''}</h2>
        ${dateNavHTML()}
      </header>
      ${UI.chips('hip_am', ZERO_TO_TEN, 'Morning hip, left lateral <span class="dc-scale">0 to 10</span>',
        { selected: r.hip_am, grid: 6, styleFor: v => `--on:${sev(v)}` })}
      ${secondSiteHTML(r)}
      ${sleepHTML(r)}
      ${UI.chips('small_stuff', YES_NO, 'Small stuff done', { selected: yesNo(r.small_stuff) })}
      ${moreHTML(r)}
      ${fromWeekHTML()}
      ${stripHTML()}
    </section>`;
  }

  function dateNavHTML() {
    const label = date === today() ? 'Today' : date === addDays(today(), -1) ? 'Yesterday' : pretty(date);
    return `<div class="dc-date">
      <button class="dc-step" data-act="day" data-step="-1" aria-label="Previous day">‹</button>
      <span>${esc(label)}</span>
      <button class="dc-step" data-act="day" data-step="1" ${date >= today() ? 'disabled' : ''} aria-label="Next day">›</button>
    </div>`;
  }

  function secondSiteHTML(r) {
    const open = ui.second || r.hip2_site != null;
    if (!open) return `<button class="dc-link" data-act="second">+ Second site</button>`;
    return `<div class="dc-second">
      ${UI.chips('hip2_site', Object.entries(SECOND_SITES), 'Second site', { selected: r.hip2_site, grid: 3 })}
      ${UI.chips('hip2', ZERO_TO_TEN, '', { selected: r.hip2, grid: 6, styleFor: v => `--on:${sev(v)}` })}
    </div>`;
  }

  function sleepHTML(r) {
    const need = sleepNeed();
    const slept = num(r.sleep_h);
    let vsNeed = '';
    if (need !== null && slept !== null) {
      const gap = Math.round((need - slept) * 10) / 10;
      vsNeed = gap > 0 ? `<b class="dc-short">${gap} h short</b>` : '<b class="dc-ok">met need</b>';
    }
    const needLine = need === null || ui.needEdit
      ? UI.chips('sleep_need_h', SLEEP_NEEDS, 'Your sleep need in hours, set once', { selected: need })
      : `<p class="dc-need">Need ${need} h ${vsNeed} <button class="dc-link dc-inline" data-act="need">change</button></p>`;
    return `${UI.chips('sleep_h', SLEEP_HOURS, 'Sleep last night, hours', { selected: slept, grid: 6 })}${needLine}`;
  }

  function moreHTML(r) {
    return `<details class="dc-more" ${ui.more ? 'open' : ''} data-more>
      <summary>More <small>optional</small></summary>
      ${UI.chips('felt', FELT, 'How training felt <span class="dc-scale">1 rough, 5 great</span>', { selected: r.felt })}
      ${UI.chips('heat', YES_NO, 'Heat session <span class="dc-emerging">emerging</span>', { selected: yesNo(r.heat) })}
      ${UI.chips('creatine', YES_NO, 'Creatine', { selected: yesNo(r.creatine) })}
      <label class="ui-field">Pool minutes<input data-field="pool_min" inputmode="numeric" value="${r.pool_min ?? ''}" placeholder="0"></label>
      <label class="ui-field">Note<textarea data-field="note" rows="2" placeholder="Anything worth remembering">${esc(r.note || '')}</textarea></label>
    </details>`;
  }

  function fromWeekHTML() {
    const text = fromWeek && (fromWeek.miles || fromWeek.xmin)
      ? `${fromWeek.miles} mi run · ${fromWeek.xmin} min XT logged`
      : 'No miles or XT logged for this day yet';
    return `<div class="dc-week"><span>${text}</span><button class="dc-link" data-act="open-week">Week tab ›</button></div>`;
  }

  // Last 14 days: each cell is that morning's hip on the severity ramp; empty = no check-in.
  function stripHTML() {
    const cells = Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = addDays(today(), i - STRIP_DAYS + 1);
      const v = rows[d]?.hip_am;
      return `<i class="${v != null ? 'hit' : ''} ${d === date ? 'now' : ''}" style="${v != null ? `background:${sev(v)}` : ''}"
        title="${esc(pretty(d))}${v != null ? ': hip ' + v : ''}"></i>`;
    }).join('');
    const n = streak();
    return `<div class="streak dc-strip" aria-label="Last ${STRIP_DAYS} mornings">${cells}</div>
      <p class="dc-streak">${n ? `${n}-day streak` : 'Start a streak today'}</p>`;
  }

  // Consecutive mornings with a hip reading, ending today (or yesterday if today isn't in yet).
  function streak() {
    let d = rows[today()]?.hip_am != null ? today() : addDays(today(), -1), n = 0;
    while (rows[d]?.hip_am != null) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------- actions ---------- */

  const actions = {
    async chip(el) {
      const field = el.dataset.group, raw = UI.pick(el);
      const value = raw === null ? null : FIELDS[field](raw);
      const fields = { [field]: value };
      if (field === 'sleep_h' && value !== null && row().sleep_need_h == null && sleepNeed() !== null) {
        fields.sleep_need_h = sleepNeed();
      }
      if (field === 'sleep_need_h') ui.needEdit = false;
      render();
      await save(fields);
      render();
    },
    async day(el) {
      const next = addDays(date, Number(el.dataset.step));
      if (next > today()) return;
      date = next;
      ui = { second: false, needEdit: false, more: ui.more };
      await loadFromWeek();
      render();
    },
    second() { ui.second = true; render(); },
    need() { ui.needEdit = true; render(); },
    'open-week'() { document.querySelector('.tabs button[data-tab="week"]').click(); },
  };

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
  }

  // Pool minutes and the note save after a short pause in typing.
  function onInput(e) {
    const field = e.target.dataset.field;
    if (!field) return;
    const value = field === 'pool_min' ? num(e.target.value) : (e.target.value.trim() || null);
    rows[date] = { ...row(), log_date: date, [field]: value };
    clearTimeout(typingTimers[field]);
    typingTimers[field] = setTimeout(() => save({ [field]: value }), 700);
  }

  function onToggle(e) {
    if (e.target.matches && e.target.matches('[data-more]')) ui.more = e.target.open;
  }

  /* ---------- Reset: the week's morning hip, read only ---------- */

  let resetToken = 0;
  async function paintResetSummary(weekOf) {
    const box = $('resetHip');
    if (!box || !weekOf) return;
    const token = ++resetToken;
    const { data, error } = await sb.from('daily_logs').select('log_date,hip_am')
      .gte('log_date', weekOf).lte('log_date', addDays(weekOf, 6));
    if (token !== resetToken) return;   // a newer week was asked for meanwhile
    if (error) { box.innerHTML = ''; return; }
    const byDate = Object.fromEntries((data || []).map(r => [r.log_date, r.hip_am]));
    const values = Object.values(byDate).filter(v => v != null);
    const cells = DAYS.map((d, i) => {
      const v = byDate[addDays(weekOf, i)];
      return `<div class="dc-day"><span>${d.slice(0, 2)}</span>
        <b style="${v != null ? `color:${sev(v)}` : ''}">${v != null ? v : '·'}</b></div>`;
    }).join('');
    const stats = values.length ? `
      <div class="tally"><span>Peak</span><b style="color:${sev(Math.max(...values))}">${Math.max(...values)}</b></div>
      <div class="tally"><span>Mean</span><b>${Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10}</b></div>
      <div class="tally"><span>Mornings above ${FLAG_ABOVE}</span><b>${values.filter(v => v > FLAG_ABOVE).length}</b></div>
      <div class="tally"><span>Check-ins</span><b>${values.length}/7</b></div>`
      : '<div class="empty">No morning hip readings this week.</div>';
    box.innerHTML = `<div class="card"><h2>Morning hip <small>check-ins, read only</small></h2>
      <div class="dc-week-row">${cells}</div>${stats}</div>`;
  }

  /* ---------- wiring ---------- */

  function init() {
    const card = document.getElementById('checkinCard');   // runs before index.html defines $()
    card.addEventListener('click', onClick);
    card.addEventListener('input', onInput);
    card.addEventListener('toggle', onToggle, true);
  }
  init();

  return { load, paintResetSummary };
})();
