'use strict';

var store = window.BFX_STORE;
var SITES = window.BFX_SITES;

var el = {
  current: document.getElementById('current'),
  exportBtn: document.getElementById('export'),
  file: document.getElementById('file'),
  preview: document.getElementById('preview'),
  restore: document.getElementById('restore'),
  message: document.getElementById('message')
};

var pending = null;       // validated settings from the chosen file

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function pickedCount(s) {
  return Object.keys(s.sites).reduce(function (n, id) { return n + s.sites[id].custom.length; }, 0);
}

/* Blocks are counted only for sites whose rules are loaded here, and only
 * for switches that still exist. */
function summary(s) {
  var on = SITES.available().reduce(function (n, p) {
    var mine = s.sites[p.id];
    return n + (mine ? p.presets.filter(function (r) { return mine.presets[r.id]; }).length : 0);
  }, 0);
  return [
    plural(on, 'block') + ' on',
    plural(pickedCount(s), 'picked rule'),
    plural(s.keywords.terms.length, 'blocked word')
  ].join(' · ') + (s.enabled ? '' : ' · paused');
}

/* Picked rules in a file as written, before validation, in either format. */
function givenCount(data) {
  var s = data && data.settings ? data.settings : data;
  if (!s) return 0;
  if (s.sites && typeof s.sites === 'object') {
    return Object.keys(s.sites).reduce(function (n, id) {
      var list = s.sites[id] && s.sites[id].custom;
      return n + (Array.isArray(list) ? list.length : 0);
    }, 0);
  }
  return Array.isArray(s.custom) ? s.custom.length : 0;
}

function message(text, level) {
  el.message.textContent = text;
  el.message.dataset.level = level || '';
}

function showCurrent() {
  store.get().then(function (s) { el.current.textContent = summary(s); });
}

el.exportBtn.addEventListener('click', function () {
  store.get().then(function (s) {
    var json = JSON.stringify(store.toBackup(s), null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'blockdistractxrn-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
});

el.file.addEventListener('change', function () {
  var file = el.file.files[0];
  pending = null;
  el.restore.disabled = true;
  el.preview.textContent = '';
  message('');
  if (!file) return;
  if (file.size > 1024 * 1024) {
    message('That file is too big to be a ' + store.APP + ' backup.', 'bad');
    return;
  }
  file.text().then(function (text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('This file is not a backup (it is not valid JSON).');
    }
    pending = store.fromBackup(data);

    var dropped = givenCount(data) - pickedCount(pending);
    el.preview.textContent = 'This backup has ' + summary(pending) + '.' +
      (dropped > 0 ? ' ' + plural(dropped, 'picked rule') + ' will be skipped: not a valid selector.' : '');
    el.restore.disabled = false;
  }).catch(function (e) {
    message(e.message, 'bad');
  });
});

el.restore.addEventListener('click', function () {
  if (!pending) return;
  if (!confirm('Replace all your current ' + store.APP + ' settings with this backup?')) return;
  store.set(pending).then(function () {
    pending = null;
    el.restore.disabled = true;
    el.file.value = '';
    el.preview.textContent = '';
    message('Restored. Open tabs have already updated.', 'ok');
  });
});

store.onChange(showCurrent);
showCurrent();
