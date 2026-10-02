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
    keywords: { enabled: false, terms: [] }
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

  root.BFX_STORE = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    get: get,
    set: set,
    update: update,
    onChange: onChange,
    merge: merge,
    newId: newId
  };
})(typeof self !== 'undefined' ? self : this);
