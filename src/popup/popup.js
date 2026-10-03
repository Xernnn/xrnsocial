'use strict';

var store = window.BFX_STORE;
var SITES = window.BFX_SITES;

var state = null;
var tab = null;           // active tab, when it is on a supported site
var tabSite = null;       // that tab's site id
var siteId = null;        // the site whose settings are shown
var stats = null;         // what each rule matches on that tab
var el = {
  master: document.getElementById('master'),
  status: document.getElementById('status'),
  pick: document.getElementById('pick'),
  sites: document.getElementById('sites'),
  siteLabel: document.getElementById('siteLabel'),
  siteEnabled: document.getElementById('siteEnabled'),
  presets: document.getElementById('presets'),
  custom: document.getElementById('custom'),
  customCount: document.getElementById('customCount'),
  filter: document.getElementById('filter'),
  kwEnabled: document.getElementById('kwEnabled'),
  kwTerms: document.getElementById('kwTerms'),
  kwCount: document.getElementById('kwCount'),
  placeholders: document.getElementById('placeholders'),
  backup: document.getElementById('backup'),
  reset: document.getElementById('reset'),
  hidden: document.getElementById('hidden')
};

function pack() {
  return SITES.get(siteId);
}

function own() {
  return state.sites[siteId] || { enabled: true, presets: {}, custom: [] };
}

/* Every write is a read-modify-write against storage, never a save of this
 * popup's copy: the keyboard shortcut or another window may have changed
 * settings since the popup opened. */
function mutate(fn) {
  return store.update(fn).then(function (next) {
    state = next;
    render();
    refreshStats();
  });
}

/* A write to the shown site's settings. */
function mutateSite(fn) {
  var id = siteId;
  return mutate(function (s) { fn(store.site(s, id)); });
}

function mutateRule(ruleId, fn) {
  return mutateSite(function (mine) {
    mine.custom.forEach(function (r) {
      if (r.id === ruleId) fn(r);
    });
  });
}

function node(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function makeSwitch(checked, onChange, big) {
  var wrap = node('label', 'switch' + (big ? ' big' : ''));
  var input = node('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', function () { onChange(input.checked); });
  wrap.appendChild(input);
  wrap.appendChild(node('span', 'track'));
  wrap.input = input;
  return wrap;
}

/* Clicking anywhere on a row flips its switch. Nested <label>s would do this
 * for free but double-fire when the switch itself is clicked. */
function clickTogglesSwitch(row, sw) {
  row.addEventListener('click', function (e) {
    if (sw.contains(e.target)) return;
    sw.input.checked = !sw.input.checked;
    sw.input.dispatchEvent(new Event('change'));
  });
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

/* ------------------------------------------------------------- health -- */

/* How much a rule matched on the open tab. "None here" is often just a page
 * without that thing on it, so it is worded as a hint, not an alarm; only a
 * selector Chrome rejects is called broken. */
function healthChip(stat) {
  if (!stat) return null;
  var broken = stat.broken || [];
  var chip;
  if (stat.offPage) {
    chip = node('span', 'chip zero', 'other page');
    chip.title = 'Scoped to a different page, so it does nothing here.';
  } else if (broken.length && !stat.count) {
    chip = node('span', 'chip bad', 'broken');
    chip.title = 'Chrome rejects this selector, so it can never match:\n' + broken.join('\n');
  } else if (!stat.count) {
    chip = node('span', 'chip zero', 'none here');
    chip.title = 'Nothing on this page matched. That is fine if there is nothing to hide here. ' +
      'If you can still see it, the site probably changed: hide it with the picker to make a rule that works.';
  } else {
    chip = node('span', 'chip' + (broken.length ? ' warn' : ''), stat.count + ' here');
    chip.title = plural(stat.count, 'element') + ' matched on this page.' +
      (broken.length ? '\nSome of its selectors are rejected by Chrome:\n' + broken.join('\n') : '');
  }
  return chip;
}

/* Counts only mean something for the site of the tab they came from. */
function liveStat(kind, id) {
  if (!stats || stats.site !== siteId || !state.enabled || !own().enabled) return null;
  return stats[kind] && stats[kind][id];
}

/* --------------------------------------------------------------- sites -- */

function renderSites() {
  el.sites.textContent = '';
  SITES.available().forEach(function (p) {
    var b = node('button', 'site', p.name);
    b.classList.toggle('is-on', p.id === siteId);
    b.classList.toggle('is-here', p.id === tabSite);
    b.classList.toggle('is-off', state.sites[p.id] && state.sites[p.id].enabled === false);
    if (p.id === tabSite) b.title = 'The site of this tab';
    b.addEventListener('click', function () {
      siteId = p.id;
      el.filter.value = '';
      render();
    });
    el.sites.appendChild(b);
  });
}

/* ------------------------------------------------------------ presets -- */

function renderPresets() {
  var query = el.filter.value.trim().toLowerCase();
  var p = pack();
  var mine = own();
  el.presets.textContent = '';

  p.groups.forEach(function (group) {
    var rules = p.presets.filter(function (r) {
      if (r.group !== group) return false;
      if (!query) return true;
      return (r.label + ' ' + (r.desc || '') + ' ' + r.group).toLowerCase().indexOf(query) !== -1;
    });
    if (!rules.length) return;

    el.presets.appendChild(node('div', 'group', group));
    rules.forEach(function (rule) {
      var row = node('div', 'row');
      var text = node('div', 'row-text');
      var title = node('b', null, rule.label);
      var chip = mine.presets[rule.id] && healthChip(liveStat('presets', rule.id));
      if (chip) title.appendChild(chip);
      text.appendChild(title);
      if (rule.desc) text.appendChild(node('em', null, rule.desc));
      row.appendChild(text);
      var sw = makeSwitch(mine.presets[rule.id], function (on) {
        mutateSite(function (m) { m.presets[rule.id] = on; });
      });
      row.appendChild(sw);
      clickTogglesSwitch(row, sw);
      el.presets.appendChild(row);
    });
  });

  if (!el.presets.children.length) {
    var empty = node('div', 'empty');
    empty.appendChild(node('b', null, 'Nothing matches “' + query + '”'));
    el.presets.appendChild(empty);
  }
}

/* ------------------------------------------------------------- custom -- */

function renderCustom() {
  var mine = own();
  el.custom.textContent = '';
  el.customCount.textContent = String(mine.custom.length);

  if (!mine.custom.length) {
    var empty = node('div', 'empty');
    empty.appendChild(node('b', null, 'Nothing picked on ' + pack().name + ' yet'));
    empty.appendChild(node('span', null,
      'Open ' + pack().name + ', hit the button above, then click whatever is bothering you.'));
    el.custom.appendChild(empty);
    return;
  }

  mine.custom.slice().reverse().forEach(function (rule) {
    var row = node('div', 'custom-row');

    var text = node('div', 'row-text');
    var title = node('b', null, rule.label || 'Custom rule');
    var chip = rule.enabled !== false && healthChip(liveStat('custom', rule.id));
    if (chip) title.appendChild(chip);
    text.appendChild(title);
    text.appendChild(node('code', null, rule.selector));

    var scope = node('select', 'scope');
    [['all', 'On every page'], ['path', 'Only on ' + rule.path]].forEach(function (pair) {
      var opt = node('option', null, pair[1]);
      opt.value = pair[0];
      if (rule.scope === pair[0]) opt.selected = true;
      scope.appendChild(opt);
    });
    scope.addEventListener('change', function () {
      var value = scope.value;
      mutateRule(rule.id, function (r) { r.scope = value; });
    });
    text.appendChild(scope);
    row.appendChild(text);

    row.appendChild(makeSwitch(rule.enabled !== false, function (on) {
      mutateRule(rule.id, function (r) { r.enabled = on; });
    }));

    var del = node('button', 'del', '×');
    del.title = 'Delete this rule';
    del.addEventListener('click', function () {
      mutateSite(function (m) {
        m.custom = m.custom.filter(function (r) { return r.id !== rule.id; });
      });
    });
    row.appendChild(del);

    el.custom.appendChild(row);
  });
}

/* --------------------------------------------------------------- shell -- */

/* Stored settings can hold ids of presets that no longer exist. */
function countOn() {
  var mine = own();
  var presets = pack().presets.filter(function (r) { return mine.presets[r.id]; }).length;
  var custom = mine.custom.filter(function (r) { return r.enabled !== false; }).length;
  return presets + custom;
}

function render() {
  var mine = own();
  el.master.checked = state.enabled;
  el.status.textContent = !state.enabled ? 'paused everywhere — nothing is hidden'
    : !mine.enabled ? pack().name + ': off'
    : pack().name + ': ' + plural(countOn(), 'rule') + ' active';
  el.siteLabel.textContent = 'Use on ' + pack().name;
  el.siteEnabled.checked = mine.enabled;
  el.kwEnabled.checked = state.keywords.enabled;
  if (document.activeElement !== el.kwTerms) {
    el.kwTerms.value = (state.keywords.terms || []).join('\n');
  }
  el.kwCount.textContent = stats && stats.site === tabSite && state.enabled && state.keywords.enabled
    ? plural(stats.keyword, 'post') + ' hidden on this page.'
    : '';
  el.placeholders.checked = !!state.placeholders;
  renderSites();
  renderPresets();
  renderCustom();
}

/* Ask the tab what each rule matched. After a change, wait for the tab to
 * receive it and rescan before asking. */
function refreshStats(delay) {
  if (!tab) return;
  setTimeout(function () {
    chrome.tabs.sendMessage(tab.id, { type: 'bfx:status' }, function (res) {
      void chrome.runtime.lastError;   // tab predates install; reload fixes it
      if (!res || !res.ok) return;
      stats = res.stats || null;
      el.hidden.textContent = res.hidden + ' hidden on this page';
      if (state) render();
    });
  }, delay == null ? 250 : delay);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('is-on', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) {
    p.classList.toggle('is-on', p.dataset.panel === name);
  });
}

document.querySelectorAll('.tab').forEach(function (t) {
  t.addEventListener('click', function () { switchTab(t.dataset.tab); });
});

el.master.addEventListener('change', function () {
  var on = el.master.checked;
  mutate(function (s) { s.enabled = on; });
});

el.siteEnabled.addEventListener('change', function () {
  var on = el.siteEnabled.checked;
  mutateSite(function (m) { m.enabled = on; });
});

el.filter.addEventListener('input', renderPresets);

el.kwEnabled.addEventListener('change', function () {
  var on = el.kwEnabled.checked;
  mutate(function (s) { s.keywords.enabled = on; });
});

var kwTimer = null;
el.kwTerms.addEventListener('input', function () {
  clearTimeout(kwTimer);
  kwTimer = setTimeout(function () {
    var terms = el.kwTerms.value.split('\n')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    mutate(function (s) { s.keywords.terms = terms; });
  }, 400);
});

el.placeholders.addEventListener('change', function () {
  var on = el.placeholders.checked;
  mutate(function (s) { s.placeholders = on; });
});

el.pick.addEventListener('click', function () {
  if (!tab) {
    el.status.textContent = 'open a supported site first';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'bfx:pick' }, function () {
    void chrome.runtime.lastError;   // tab predates install; reload fixes it
    window.close();
  });
});

/* A file picker opened from a popup closes the popup on some platforms, so
 * backup and restore live on the options page. */
el.backup.addEventListener('click', function () {
  chrome.runtime.openOptionsPage();
});

el.reset.addEventListener('click', function () {
  if (!confirm('Delete every rule on every site and go back to the defaults?')) return;
  mutate(function () { return store.merge(null); });
});

/* ---------------------------------------------------------------- init -- */

/* The settings and the active tab both decide what to show first: the site
 * of the tab when it has rules, else the first site that does. */
var ready = { state: false, tab: false };

function start() {
  if (!ready.state || !ready.tab) return;
  siteId = tabSite && SITES.get(tabSite) ? tabSite : SITES.available()[0].id;
  render();
  refreshStats(0);
  /* Switches animate only once the first state is drawn; otherwise the
   * ones written into the page unchecked would slide on at every open. */
  requestAnimationFrame(function () { document.body.classList.add('is-ready'); });
}

store.get().then(function (s) {
  state = s;
  ready.state = true;
  start();
});

/* The shortcut, the picker or another window changed something. */
store.onChange(function (s) {
  state = s;
  if (siteId) render();
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  var t = tabs && tabs[0];
  tabSite = t && t.url ? SITES.forUrl(t.url) : null;
  if (tabSite && SITES.get(tabSite)) {
    tab = t;
  } else {
    el.pick.querySelector('em').textContent = 'Open a supported site to use this';
  }
  ready.tab = true;
  start();
});
