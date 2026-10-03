/* Single-key state in chrome.storage.local, shared by the content script,
 * the popup and the service worker. One key keeps change notifications cheap
 * and makes read-modify-write races obvious instead of subtle. */
(function (root) {
  'use strict';

  var KEY = 'bfx';

  var DEFAULTS = {
    enabled: true,
    presets: {
      sponsored: true,
      adSweep: true,
      rightAds: true,
      suggested: true,
      pymk: true,
      reels: true,
      badges: true
    },
    custom: [],
    keywords: { enabled: false, terms: [] },
    placeholders: false
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function merge(stored) {
    var s = Object.assign(clone(DEFAULTS), stored || {});
    s.presets = Object.assign(clone(DEFAULTS.presets), (stored && stored.presets) || {});
    s.keywords = Object.assign(clone(DEFAULTS.keywords), (stored && stored.keywords) || {});
    if (!Array.isArray(s.custom)) s.custom = [];
    return s;
  }

  function get() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(KEY, function (res) {
        resolve(merge(res && res[KEY]));
      });
    });
  }

  function set(state) {
    return new Promise(function (resolve) {
      var payload = {};
      payload[KEY] = state;
      chrome.storage.local.set(payload, function () {
        resolve(state);
      });
    });
  }

  /* Read-modify-write. fn may mutate the state or return a new one. */
  function update(fn) {
    return get().then(function (state) {
      var next = fn(state) || state;
      return set(next);
    });
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[KEY]) return;
      cb(merge(changes[KEY].newValue));
    });
  }

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* Custom selectors are pasted into a stylesheet as `selector{...}`, so one
   * that is not a real selector could close the rule and inject CSS of its
   * own (url() requests included). Anything the selector parser accepts is
   * safe there. Without a DOM (the service worker) nothing is accepted. */
  var probe = null;
  function validSelector(sel) {
    if (typeof sel !== 'string' || !sel.trim()) return false;
    if (typeof document === 'undefined') return false;
    probe = probe || document.createDocumentFragment();
    try {
      probe.querySelector(sel);
      return true;
    } catch (e) {
      return false;
    }
  }

  function toBackup(state) {
    return {
      app: 'BlockFB',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state
    };
  }

  /* Rebuild settings from an exported file field by field, so a hand-edited
   * or foreign file can only ever produce a well-formed state. Throws with a
   * message fit to show the person. */
  function fromBackup(data) {
    var s = data && data.app === 'BlockFB' ? data.settings : data;
    if (!s || typeof s !== 'object' || Array.isArray(s) ||
        !('presets' in s || 'custom' in s || 'keywords' in s)) {
      throw new Error('This file does not contain BlockFB settings.');
    }
    var out = merge(null);
    if (typeof s.enabled === 'boolean') out.enabled = s.enabled;
    if (typeof s.placeholders === 'boolean') out.placeholders = s.placeholders;
    if (s.presets && typeof s.presets === 'object') {
      Object.keys(s.presets).forEach(function (id) {
        if (typeof s.presets[id] === 'boolean') out.presets[id] = s.presets[id];
      });
    }
    if (Array.isArray(s.custom)) {
      out.custom = s.custom.filter(function (r) {
        return r && validSelector(r.selector);
      }).map(function (r) {
        return {
          id: typeof r.id === 'string' && r.id ? r.id : newId(),
          selector: r.selector,
          label: typeof r.label === 'string' ? r.label : '',
          scope: r.scope === 'path' ? 'path' : 'all',
          path: typeof r.path === 'string' ? r.path : '/',
          enabled: r.enabled !== false,
          createdAt: Number(r.createdAt) || Date.now()
        };
      });
    }
    if (s.keywords && typeof s.keywords === 'object') {
      out.keywords.enabled = s.keywords.enabled === true;
      if (Array.isArray(s.keywords.terms)) {
        out.keywords.terms = s.keywords.terms
          .filter(function (t) { return typeof t === 'string' && t.trim(); })
          .map(function (t) { return t.trim(); });
      }
    }
    return out;
  }

  root.BFX_STORE = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    get: get,
    set: set,
    update: update,
    onChange: onChange,
    merge: merge,
    newId: newId,
    validSelector: validSelector,
    toBackup: toBackup,
    fromBackup: fromBackup
  };
})(typeof self !== 'undefined' ? self : this);
