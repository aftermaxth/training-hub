/* UI kit: small HTML builders shared by the Lift Guide and the daily check-in.
 * Styles live in ui-kit.css. Uses the global esc() from index.html.
 */
const UI = (() => {

  // A collapsible card. Title and note are trusted HTML-free text.
  function section(title, note, body, { open = true, id = '' } = {}) {
    return `<details class="card ui-section" ${open ? 'open' : ''} ${id ? `id="${id}"` : ''}>
      <summary><h2>${esc(title)}${note ? ` <small>${esc(note)}</small>` : ''}</h2></summary>
      ${body}</details>`;
  }

  // A single-select row of chips. options = [[value, text], ...] (text is escaped). label is trusted HTML.
  // selected = current value or null. grid = number of columns, 0 for a wrapping row.
  // Each chip carries data-act (for the module's click handler) and data-group / data-value.
  function chips(group, options, label, { selected = null, act = 'chip', grid = 0, styleFor = null } = {}) {
    const id = 'ui-' + group + '-label';
    return `<div class="ui-field">
      ${label ? `<span class="ui-label" id="${id}">${label}</span>` : ''}
      <div class="ui-chips" role="group" ${label ? `aria-labelledby="${id}"` : ''}
        ${grid ? `style="--cols:${grid}" data-grid` : ''}>
        ${options.map(([value, text]) => {
          const on = selected !== null && selected !== undefined && String(selected) === String(value);
          const style = styleFor ? ` style="${styleFor(value)}"` : '';
          return `<button type="button" class="ui-chip" data-act="${act}" data-group="${group}"
            data-value="${esc(value)}" aria-pressed="${on}"${style}>${esc(text)}</button>`;
        }).join('')}
      </div></div>`;
  }

  // Flips a chip in a single-select group. Returns the group's new value, or null when cleared.
  function pick(chip) {
    const turnOn = chip.getAttribute('aria-pressed') !== 'true';
    chip.closest('.ui-chips').querySelectorAll('.ui-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(turnOn));
    return turnOn ? chip.dataset.value : null;
  }

  // The value currently pressed in a group inside root, or null.
  function picked(root, group) {
    return root.querySelector(`.ui-chip[data-group="${group}"][aria-pressed="true"]`)?.dataset.value ?? null;
  }

  return { section, chips, pick, picked };
})();
