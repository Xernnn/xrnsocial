'use strict';

var store = window.BFX_STORE;
var SITES = window.BFX_SITES;

var state = null;
var tab = null;           // active tab, when it is on a supported site
var tabSite = null;       // that tab's site id
var siteId = null;        // the site whose settings are shown
var stats = null;         // what each rule matches on that tab
var openGroup = null;     // the group opened on the home screen
var el = {
  siteButton: document.getElementById('siteButton'),
  siteIcon: document.getElementById('siteIcon'),
  siteName: document.getElementById('siteName'),
  tallyNum: document.getElementById('tallyNum'),
  tallyWord: document.getElementById('tallyWord'),
  siteSwitch: document.getElementById('siteSwitch'),
  siteEnabled: document.getElementById('siteEnabled'),
  resume: document.getElementById('resume'),
  groups: document.getElementById('groups'),
  sites: document.getElementById('sites'),
  paused: document.getElementById('paused'),
  kwEnabled: document.getElementById('kwEnabled'),
  wordForm: document.getElementById('wordForm'),
  wordInput: document.getElementById('wordInput'),
  words: document.getElementById('words'),
  kwCount: document.getElementById('kwCount'),
  custom: document.getElementById('custom'),
  placeholders: document.getElementById('placeholders'),
  placeholdersRow: document.getElementById('placeholdersRow'),
  backup: document.getElementById('backup'),
  reset: document.getElementById('reset'),
  pick: document.getElementById('pick'),
  pickLabel: document.getElementById('pickLabel'),
  wordsPip: document.getElementById('wordsPip'),
  pickedPip: document.getElementById('pickedPip')
};

var GROUP_ICONS = {
  'Ads': 'M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1zM19 9a4 4 0 0 1 0 6',
  'Feed': 'M4 6h16M4 12h16M4 18h10',
  'Posts': 'M4 5h16v11H9l-5 4z',
  'Sidebars': 'M4 5h16v14H4zM9 5v14',
  'Side nav': 'M4 5h16v14H4zM9 5v14',
  'Top bar': 'M4 5h16v14H4zM4 10h16',
  'Chat': 'M8 10.5h.01M12 10.5h.01M16 10.5h.01M4 5h16v11H9l-5 4z',
  'Effects': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18',
  'Floating': 'M5 5h10v10H5zM9 19h10V9',
  'Menu': 'M4 7h16M4 12h16M4 17h16',
  'Videos': 'M7 5l12 7-12 7z',
  'Watching': 'M7 5l12 7-12 7z',
  'Front page': 'M4 4h16v7H4zM4 15h7v5H4zM15 15h5v5h-5z',
  'Works': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'Home': 'M4 11l8-7 8 7M6 10v10h12V10',
  'Lists': 'M4 6h16M4 12h16M4 18h16'
};
var CHEVRON = 'M6 9l6 6 6-6';
var CLOSE = 'M6 6l12 12M18 6L6 18';

function pack() {
  return SITES.get(siteId);
}

function own() {
  return state.sites[siteId] || { enabled: true, presets: {}, custom: [], remembered: {} };
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

function button(cls, text) {
  var b = node('button', cls, text);
  b.type = 'button';
  return b;
}

function icon(d, size, cls) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function makeSwitch(checked, onChange, label) {
  var wrap = node('label', 'switch');
  var input = node('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  if (label) input.setAttribute('aria-label', label);
  input.addEventListener('change', function () { onChange(input.checked); });
  wrap.appendChild(input);
  wrap.appendChild(node('span', 'track'));
  wrap.input = input;
  return wrap;
}

/* Clicking anywhere on a row flips its switch. Nested <label>s would do this
 * for free but double-fire when the switch itself is clicked. */
function clickTogglesSwitch(row, input) {
  row.addEventListener('click', function (e) {
    if (e.target === input || (input.parentNode && input.parentNode.contains(e.target))) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change'));
  });
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function setPip(pip, n) {
  pip.textContent = n ? String(n) : '';
  pip.hidden = !n;
}

/* ------------------------------------------------------------- health -- */

/* How much a rule hides on the open tab. A switch shows a count only when
 * it hides something here — "nothing here" on every other row was noise.
 * A picked rule that matches nothing does say so: it is the usual sign the
 * site changed under it. Only a selector the browser rejects is broken. */
function healthChip(stat, picked) {
  if (!stat) return null;
  var broken = stat.broken || [];
  var chip;
  if (stat.offPage) {
    chip = node('span', 'count zero', 'other page');
    chip.title = 'Set to a different page, so it does nothing here.';
  } else if (broken.length && !stat.count) {
    chip = node('span', 'count bad', 'broken');
    chip.title = 'The browser rejects this rule, so it can never match:\n' + broken.join('\n');
  } else if (!stat.count) {
    if (!picked) return null;
    chip = node('span', 'count zero', 'none here');
    chip.title = 'Nothing on this page matches. If you can still see it, the site changed: pick it again.';
  } else {
    chip = node('span', 'count' + (broken.length ? ' warn' : ''), String(stat.count));
    chip.title = plural(stat.count, 'element') + ' matched on this page.' +
      (broken.length ? '\nSome of its selectors are rejected by the browser:\n' + broken.join('\n') : '');
  }
  return chip;
}

/* Counts only mean something for the site of the tab they came from. */
function liveStat(kind, id) {
  if (!stats || stats.site !== siteId || !state.enabled || !own().enabled) return null;
  return stats[kind] && stats[kind][id];
}

/* Everything the rules hide on the tab, stylesheet and scripts alike. */
function totalHidden(st) {
  if (!st) return 0;
  var sum = function (map) {
    return Object.keys(map || {}).reduce(function (n, k) { return n + ((map[k] && map[k].count) || 0); }, 0);
  };
  return sum(st.presets) + sum(st.custom) + (st.keyword || 0);
}

/* Stored settings can hold ids of presets that no longer exist. */
function countOn() {
  var mine = own();
  var presets = pack().presets.filter(function (r) { return mine.presets[r.id]; }).length;
  var custom = mine.custom.filter(function (r) { return r.enabled !== false; }).length;
  return presets + custom;
}

/* ---------------------------------------------------------------- icons -- */

/* A site xrnsocial is working on wears xrnsocial's colours; one it has been
 * told to leave alone shows its own logo again. */
function takenOver(id) {
  var mine = state.sites[id];
  var p = SITES.get(id);
  if (!state.enabled || !mine || !mine.enabled) return false;
  return p.presets.some(function (r) { return mine.presets[r.id]; }) ||
    mine.custom.some(function (r) { return r.enabled !== false; });
}

function showIcon(img, id) {
  var src = 'sites/' + id + (takenOver(id) ? '-on' : '-off') + '.svg';
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
}

/* ----------------------------------------------------------------- hero -- */

function renderHero() {
  var mine = own();
  var on = countOn();
  var num = '';
  var word;
  if (!state.enabled) {
    word = 'Paused';
  } else if (!mine.enabled) {
    word = siteId === tabSite ? 'Off here' : 'Off';
  } else if (!on) {
    word = 'Nothing on';
  } else if (stats && stats.site === siteId) {
    num = String(totalHidden(stats));
    word = 'hidden here';
  } else {
    num = String(on);
    word = 'on';
  }
  showIcon(el.siteIcon, siteId);
  el.siteName.textContent = pack().name;
  el.siteButton.setAttribute('aria-label', 'Choose a site, now ' + pack().name);
  el.tallyNum.textContent = num;
  el.tallyNum.hidden = !num;
  el.tallyWord.textContent = word;
  el.siteSwitch.hidden = !state.enabled;
  el.resume.hidden = state.enabled;
  el.siteEnabled.checked = mine.enabled;
  el.siteEnabled.setAttribute('aria-label', 'Use on ' + pack().name);
}

/* --------------------------------------------------------------- groups -- */

/* The list is rebuilt only when its shape changes. A settings change updates
 * it in place, so a switch slides instead of being replaced mid-way and
 * keyboard focus stays where it was. */
var builtFor = null;
var parts = {};

function rulesOf(group) {
  return pack().presets.filter(function (r) { return r.group === group; });
}

/* Off remembers what was on and on puts exactly that back, so a group's switch
 * can never turn on something nobody chose, such as "Whole feed". A group
 * with nothing to put back opens instead, to choose from. */
function flipGroup(group, on) {
  var rules = rulesOf(group);
  var ids = rules.map(function (r) { return r.id; });
  if (!on) {
    return mutateSite(function (m) {
      var was = ids.filter(function (id) { return m.presets[id]; });
      if (was.length) m.remembered[group] = was;
      ids.forEach(function (id) { m.presets[id] = false; });
    });
  }
  var saved = own().remembered[group];
  var back = saved
    ? saved.filter(function (id) { return ids.indexOf(id) !== -1; })
    : rules.filter(function (r) { return r.on; }).map(function (r) { return r.id; });
  if (!back.length) {
    openGroup = group;
    render();
    return null;
  }
  return mutateSite(function (m) {
    back.forEach(function (id) { m.presets[id] = true; });
    delete m.remembered[group];
  });
}

function buildRule(rule, list) {
  var row = node('div', 'rule');
  /* The longer explanation is there on hover, not in the way. */
  if (rule.desc) row.title = rule.desc;
  var chip = node('span');
  var sw = makeSwitch(false, function (on) {
    mutateSite(function (m) { m.presets[rule.id] = on; });
  }, rule.label);
  row.appendChild(node('span', 'rule-text', rule.label));
  row.appendChild(chip);
  row.appendChild(sw);
  clickTogglesSwitch(row, sw.input);
  list.appendChild(row);
  return { id: rule.id, chip: chip, input: sw.input };
}

function buildGroups() {
  var key = siteId + '/' + openGroup;
  if (builtFor === key) return;
  builtFor = key;
  parts = {};
  el.groups.textContent = '';

  pack().groups.forEach(function (group) {
    var rules = rulesOf(group);
    var open = group === openGroup;
    var row = node('div', 'group' + (open ? ' is-open' : ''));
    row.dataset.group = group;

    var main = button('group-main');
    main.setAttribute('aria-expanded', String(open));
    main.appendChild(icon(GROUP_ICONS[group] || GROUP_ICONS.Feed, 20));
    main.appendChild(node('span', 'group-name', group));
    var ticks = node('span', 'ticks');
    ticks.setAttribute('aria-hidden', 'true');
    var marks = rules.map(function () { return ticks.appendChild(node('span', 'tick')); });
    main.appendChild(ticks);
    main.appendChild(icon(CHEVRON, 16, 'chev'));
    main.addEventListener('click', function () {
      openGroup = open ? null : group;
      render();
      if (parts[group]) parts[group].main.focus();
    });
    row.appendChild(main);

    var sw = makeSwitch(false, function (on) { flipGroup(group, on); }, 'All of ' + group);
    row.appendChild(sw);
    el.groups.appendChild(row);

    var shown = [];
    if (open) {
      var list = node('div', 'rules');
      shown = rules.map(function (rule) { return buildRule(rule, list); });
      el.groups.appendChild(list);
    }
    parts[group] = { main: main, marks: marks, rules: rules, input: sw.input, shown: shown };
  });
}

function renderGroups() {
  var mine = own();
  var live = state.enabled && mine.enabled;
  buildGroups();
  el.groups.classList.toggle('is-off', !live);
  el.groups.inert = !live;

  Object.keys(parts).forEach(function (group) {
    var part = parts[group];
    var on = 0;
    part.rules.forEach(function (rule, i) {
      var isOn = !!mine.presets[rule.id];
      if (isOn) on++;
      part.marks[i].classList.toggle('is-on', isOn);
    });
    part.input.checked = on > 0;
    var summary = on + ' of ' + part.rules.length + ' on';
    part.main.title = summary;
    part.main.setAttribute('aria-label', group + ', ' + summary);

    part.shown.forEach(function (row) {
      var isOn = !!mine.presets[row.id];
      var chip = isOn && healthChip(liveStat('presets', row.id));
      row.input.checked = isOn;
      row.chip.textContent = '';
      if (chip) row.chip.appendChild(chip);
    });
  });
}

/* ---------------------------------------------------------------- sites -- */

var cells = null;

function chooseSite(id) {
  siteId = id;
  openGroup = null;
  render();
  setView('home');
}

function buildSites() {
  cells = SITES.available().map(function (p) {
    var cell = button('cell');
    var img = node('img', 'site-icon');
    var name = node('span', 'cell-name');
    var here = node('span', 'cell-here');
    var off = node('span', 'cell-off', 'off');
    img.alt = '';
    img.width = 72;
    img.height = 72;
    here.title = 'The site of this tab';
    name.appendChild(here);
    name.appendChild(node('span', null, p.name));
    name.appendChild(off);
    cell.appendChild(img);
    cell.appendChild(name);
    cell.dataset.site = p.id;
    cell.addEventListener('click', function () { chooseSite(p.id); });
    el.sites.appendChild(cell);
    return { id: p.id, cell: cell, img: img, here: here, off: off };
  });
}

function renderSites() {
  if (!cells) buildSites();
  cells.forEach(function (c) {
    var isOff = state.sites[c.id] && state.sites[c.id].enabled === false;
    c.cell.classList.toggle('is-on', c.id === siteId);
    c.cell.setAttribute('aria-label', SITES.info(c.id).name + (isOff ? ', off' : ''));
    c.here.hidden = c.id !== tabSite;
    c.off.hidden = !isOff;
    showIcon(c.img, c.id);
  });
  el.paused.checked = !state.enabled;
}

/* ---------------------------------------------------------------- words -- */

/* The first word turns the list on: adding one and seeing nothing happen
 * would look broken. After that the switch is the person's. */
function addWords(text) {
  var added = text.split('\n')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  if (!added.length) return;
  mutate(function (s) {
    var terms = s.keywords.terms || [];
    if (!terms.length) s.keywords.enabled = true;
    added.forEach(function (term) {
      if (terms.indexOf(term) === -1) terms.push(term);
    });
    s.keywords.terms = terms;
  });
}

function renderWords() {
  var terms = state.keywords.terms || [];
  el.kwEnabled.checked = state.keywords.enabled;
  el.words.classList.toggle('is-off', !state.keywords.enabled);
  el.words.textContent = '';
  terms.forEach(function (term) {
    var chip = node('span', 'chip');
    var remove = button('chip-x');
    chip.appendChild(node('span', 'chip-text', term));
    remove.setAttribute('aria-label', 'Remove ' + term);
    remove.appendChild(icon(CLOSE, 14));
    remove.addEventListener('click', function () {
      mutate(function (s) {
        s.keywords.terms = (s.keywords.terms || []).filter(function (t) { return t !== term; });
      });
    });
    chip.appendChild(remove);
    el.words.appendChild(chip);
  });
  el.kwCount.textContent = stats && stats.site === tabSite && state.enabled && state.keywords.enabled
    ? stats.keyword + ' hidden here'
    : '';
  setPip(el.wordsPip, terms.length);
}

/* --------------------------------------------------------------- picked -- */

function renderCustom() {
  var mine = own();
  el.custom.textContent = '';
  setPip(el.pickedPip, mine.custom.length);

  if (!mine.custom.length) {
    var empty = node('div', 'empty');
    empty.appendChild(node('b', null, 'Nothing picked yet'));
    empty.appendChild(node('span', null, 'Use “Hide something” on ' + pack().name + '.'));
    el.custom.appendChild(empty);
    return;
  }

  mine.custom.slice().reverse().forEach(function (rule) {
    var row = node('div', 'picked');

    var text = node('div', 'picked-text');
    text.title = rule.selector;
    var title = node('div', 'picked-name');
    title.appendChild(node('span', 'picked-label', rule.label || 'Picked element'));
    var chip = rule.enabled !== false && healthChip(liveStat('custom', rule.id), true);
    if (chip) title.appendChild(chip);
    text.appendChild(title);

    var scope = node('select', 'scope');
    scope.setAttribute('aria-label', 'Where it applies');
    [['all', 'All pages'], ['path', 'Only ' + rule.path]].forEach(function (pair) {
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
    }, rule.label || 'Picked element'));

    var del = button('delete');
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete ' + (rule.label || 'picked element'));
    del.appendChild(icon(CLOSE, 16));
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

function render() {
  renderHero();
  renderGroups();
  renderSites();
  renderWords();
  renderCustom();
  el.placeholders.checked = !!state.placeholders;
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
      if (state) render();
    });
  }, delay == null ? 250 : delay);
}

/* Screens other than home all sit one step away from it. Focus moves to the
 * new screen, or it would be left on a button that just disappeared. */
function setView(name) {
  document.querySelectorAll('.view').forEach(function (v) {
    v.classList.toggle('is-on', v.dataset.view === name);
  });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('is-on', t.dataset.view === name);
  });
  var first = document.querySelector('.view.is-on button');
  if (first) first.focus();
}

function currentView() {
  return document.querySelector('.view.is-on').dataset.view;
}

document.querySelectorAll('.tab').forEach(function (t) {
  t.addEventListener('click', function () {
    setView(currentView() === t.dataset.view ? 'home' : t.dataset.view);
  });
});

document.querySelectorAll('.back').forEach(function (b) {
  b.addEventListener('click', function () { setView('home'); });
});

el.siteButton.addEventListener('click', function () { setView('sites'); });

el.siteEnabled.addEventListener('change', function () {
  var on = el.siteEnabled.checked;
  mutateSite(function (m) { m.enabled = on; });
});

el.paused.addEventListener('change', function () {
  var paused = el.paused.checked;
  mutate(function (s) { s.enabled = !paused; });
});

el.resume.addEventListener('click', function () {
  mutate(function (s) { s.enabled = true; });
});

el.kwEnabled.addEventListener('change', function () {
  var on = el.kwEnabled.checked;
  mutate(function (s) { s.keywords.enabled = on; });
});

el.wordForm.addEventListener('submit', function (e) {
  e.preventDefault();
  addWords(el.wordInput.value);
  el.wordInput.value = '';
});

/* One-line inputs flatten what is pasted: keep a pasted list a list. */
el.wordInput.addEventListener('paste', function (e) {
  var text = e.clipboardData && e.clipboardData.getData('text');
  if (!text || text.indexOf('\n') === -1) return;
  e.preventDefault();
  addWords(text);
});

el.placeholders.addEventListener('change', function () {
  var on = el.placeholders.checked;
  mutate(function (s) { s.placeholders = on; });
});
clickTogglesSwitch(el.placeholdersRow, el.placeholders);

el.pick.addEventListener('click', function () {
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
    el.pick.disabled = true;
    el.pick.title = 'Open a supported site to pick something on it';
    el.pickLabel.textContent = 'Open a site first';
  }
  ready.tab = true;
  start();
});
