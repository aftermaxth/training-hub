// Proves the Week tab's code has not changed.
//   node tools/week-freeze.mjs          -> compare index.html against tools/week-freeze.json
//   node tools/week-freeze.mjs --write  -> record the current hashes (only on the untouched baseline)
//
// Each unit is the text between a start marker and an end marker in index.html.
// Line numbers move as other code changes, so markers are used instead of ranges.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url);
const MANIFEST = new URL('tools/week-freeze.json', ROOT);

// [name, start marker, end marker, include end marker?]
const UNITS = [
  ['week markup', '<!-- ================= WEEK', '<!-- ================= SUNDAY RESET', false],
  ['shared constants and row model', "const DAYS=['Mon'", '/* ---------------- auth', false],
  ['week load, save, totals, render', '/* ---------------- week load / save', '/* ---------------- sunday reset', false],
  ['process-goal reminders', 'async function loadReminders(){',
    "$('reminders').querySelectorAll('[data-rg]').forEach(b=>{b.onclick=()=>bumpProcess(b.dataset.rg,b);});\n}", true],
  ['process-goal tick', 'async function bumpProcess(',
    "if(error)banner(\"Couldn't save that goal tick: \"+error.message,'err');\n}", true],
  ['week nav and plan import', '/* ---------------- nav / import', 'boot();', false],
];

function extract(src, [name, start, end, inclusive]) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`"${name}": start marker not found`);
  const b = src.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`"${name}": end marker not found`);
  return src.slice(a, inclusive ? b + end.length : b);
}

const sha = text => createHash('sha256').update(text).digest('hex');
const src = readFileSync(new URL('index.html', ROOT), 'utf8').replace(/\r\n/g, '\n');
const current = Object.fromEntries(UNITS.map(u => [u[0], sha(extract(src, u))]));

if (process.argv.includes('--write')) {
  writeFileSync(MANIFEST, JSON.stringify(current, null, 2) + '\n');
  console.log('Recorded', Object.keys(current).length, 'units.');
  process.exit(0);
}

const recorded = JSON.parse(readFileSync(MANIFEST, 'utf8'));
let changed = 0;
for (const [name, hash] of Object.entries(recorded)) {
  const same = current[name] === hash;
  if (!same) changed++;
  console.log(same ? 'same    ' : 'CHANGED ', name);
}
process.exit(changed ? 1 : 0);
