'use strict';

var store = window.BFX_STORE;
var PRESETS = window.BFX_PRESETS;
var GROUPS = window.BFX_GROUPS;

var state = null;
var tab = null;           // active Facebook tab, if any
var el = {
  master: document.getElementById('master'),
  status: document.getElementById('status'),
  pick: document.getElementById('pick'),
  presets: document.getElementById('presets'),
  custom: document.getElementById('custom'),
  customCount: document.getElementById('customCount'),
  filter: document.getElementById('filter'),
  kwEnabled: document.getElementById('kwEnabled'),
  kwTerms: document.getElementById('kwTerms'),
  reset: document.getElementById('reset'),
  hidden: document.getElementById('hidden')
};

function save() {
  return store.set(state).then(render);
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

/* ------------------------------------------------------------ presets -- */

function renderPresets() {
  var query = el.filter.value.trim().toLowerCase();
  el.presets.textContent = '';

  GROUPS.forEach(function (group) {
    var rules = PRESETS.filter(function (r) {
      if (r.group !== group) return false;
      if (!query) return true;
      return (r.label + ' ' + (r.desc || '') + ' ' + r.group).toLowerCase().indexOf(query) !== -1;
    });
    if (!rules.length) return;

    el.presets.appendChild(node('div', 'group', group));
    rules.forEach(function (rule) {
      var row = node('div', 'row');
      var text = node('div', 'row-text');
      text.appendChild(node('b', null, rule.label));
      if (rule.desc) text.appendChild(node('em', null, rule.desc));
      row.appendChild(text);
      var sw = makeSwitch(state.presets[rule.id], function (on) {
        state.presets[rule.id] = on;
        save();
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
  el.custom.textContent = '';
  el.customCount.textContent = String(state.custom.length);

  if (!state.custom.length) {
    var empty = node('div', 'empty');
    empty.appendChild(node('b', null, 'Nothing picked yet'));
    empty.appendChild(node('span', null,
      'Open Facebook, hit the button above, then click whatever is bothering you.'));
    el.custom.appendChild(empty);
    return;
  }

  state.custom.slice().reverse().forEach(function (rule) {
    var row = node('div', 'custom-row');

    var text = node('div', 'row-text');
    text.appendChild(node('b', null, rule.label || 'Custom rule'));
    text.appendChild(node('code', null, rule.selector));

    var scope = node('select', 'scope');
    [['all', 'On every page'], ['path', 'Only on ' + rule.path]].forEach(function (pair) {
      var opt = node('option', null, pair[1]);
      opt.value = pair[0];
      if (rule.scope === pair[0]) opt.selected = true;
      scope.appendChild(opt);
    });
    scope.addEventListener('change', function () {
      rule.scope = scope.value;
      save();
    });
    text.appendChild(scope);
    row.appendChild(text);

    row.appendChild(makeSwitch(rule.enabled !== false, function (on) {
      rule.enabled = on;
      save();
    }));

    var del = node('button', 'del', '×');
    del.title = 'Delete this rule';
    del.addEventListener('click', function () {
      state.custom = state.custom.filter(function (r) { return r.id !== rule.id; });
      save();
    });
    row.appendChild(del);

    el.custom.appendChild(row);
  });
}

/* --------------------------------------------------------------- shell -- */

function countOn() {
  var presets = Object.keys(state.presets).filter(function (k) { return state.presets[k]; }).length;
  var custom = state.custom.filter(function (r) { return r.enabled !== false; }).length;
  return presets + custom;
}

function render() {
  el.master.checked = state.enabled;
  el.status.textContent = state.enabled
    ? countOn() + ' rule' + (countOn() === 1 ? '' : 's') + ' active'
    : 'paused — nothing is hidden';
  el.kwEnabled.checked = state.keywords.enabled;
  if (document.activeElement !== el.kwTerms) {
    el.kwTerms.value = (state.keywords.terms || []).join('\n');
  }
  renderPresets();
  renderCustom();
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
  state.enabled = el.master.checked;
  save();
});

el.filter.addEventListener('input', renderPresets);

el.kwEnabled.addEventListener('change', function () {
  state.keywords.enabled = el.kwEnabled.checked;
  save();
});

var kwTimer = null;
el.kwTerms.addEventListener('input', function () {
  clearTimeout(kwTimer);
  kwTimer = setTimeout(function () {
    state.keywords.terms = el.kwTerms.value.split('\n')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    store.set(state);
  }, 400);
});

el.pick.addEventListener('click', function () {
  if (!tab) {
    el.status.textContent = 'open a Facebook tab first';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'bfx:pick' }, function () {
    void chrome.runtime.lastError;   // tab predates install; reload fixes it
    window.close();
  });
});

el.reset.addEventListener('click', function () {
  if (!confirm('Delete every rule and go back to the defaults?')) return;
  state = store.merge(null);
  save();
});

/* ---------------------------------------------------------------- init -- */

store.get().then(function (s) {
  state = s;
  render();
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  var t = tabs && tabs[0];
  if (!t || !t.url || !/^https?:\/\/([a-z0-9-]+\.)?(facebook|messenger)\.com\//.test(t.url)) {
    el.pick.querySelector('em').textContent = 'Open a Facebook tab to use this';
    return;
  }
  tab = t;
  chrome.tabs.sendMessage(t.id, { type: 'bfx:status' }, function (res) {
    void chrome.runtime.lastError;
    if (res && res.ok) {
      el.hidden.textContent = res.hidden + ' element' + (res.hidden === 1 ? '' : 's') + ' hidden on this page';
    }
  });
});
