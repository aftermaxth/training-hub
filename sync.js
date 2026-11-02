/* Sync: database writes that survive a bad connection.
 * A write that fails is kept on the phone (localStorage) and retried by Sync.flush() on the next load.
 * Used by the Lift Guide and the daily check-in. The Week tab keeps its own draft system.
 * Uses globals from index.html: sb, banner.
 */
const Sync = (() => {
  const KEY = 'th:pending';

  // op = { table, kind: 'insert' | 'upsert' | 'update' | 'delete', row, match, onConflict }
  function run({ table, kind, row, match, onConflict }) {
    const q = sb.from(table);
    if (kind === 'insert') return q.insert(row).select().single();
    if (kind === 'upsert') return q.upsert(row, { onConflict, defaultToNull: false });
    if (kind === 'update') return q.update(row).match(match);
    if (kind === 'delete') return q.delete().match(match);
    return Promise.resolve({ error: { message: 'Unknown write: ' + kind } });
  }

  function pending() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function store(ops) {
    try { ops.length ? localStorage.setItem(KEY, JSON.stringify(ops)) : localStorage.removeItem(KEY); }
    catch (e) { /* storage blocked: nothing more we can do */ }
  }

  // Returns { ok, data }. On failure the write is queued and a banner explains it.
  async function write(op, what = 'That') {
    const { data, error } = await run(op);
    if (!error) return { ok: true, data };
    store([...pending(), op]);
    banner(`${what} didn't save: ${error.message} It is held on this phone and will retry.`, 'err', 'Try again', flush);
    return { ok: false, data: null };
  }

  // Replays queued writes in order. Returns true when nothing is left.
  async function flush() {
    const ops = pending();
    if (!ops.length) return true;
    const left = [];
    for (const op of ops) if ((await run(op)).error) left.push(op);
    store(left);
    if (!left.length) banner('Entries held on this phone are now saved.', 'ok');
    return !left.length;
  }

  return { write, flush };
})();
