/* Single-key state in chrome.storage.local, shared by the content script,
 * the popup, the options page and the service worker. One key keeps change
 * notifications cheap and makes read-modify-write races obvious instead of
 * subtle.
 *
 *   { enabled, placeholders, keywords: { enabled, terms },
 *     sites: { <site id>: { enabled, presets: { <preset id>: bool }, custom: [rule] } } }
 *
 * The pause switch, the "show" bars and the word list are shared by every
 * site; switches and picked rules belong to one site. Settings saved before
 * there was more than one site were Facebook's and are moved there.
 */
(function (root) {
  'use strict';

  var KEY = 'bfx';
  var APP = 'xrnsocial';

  var DEFAULTS = {
    enabled: true,
    placeholders: false,
    keywords: { enabled: false, terms: [] },
    sites: {}
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function siteIds() {
    return root.BFX_SITES ? root.BFX_SITES.list.map(function (s) { return s.id; }) : [];
  }

  /* One site's settings over its defaults. Defaults come from the site's
   * rule pack, so where a pack is not loaded (the service worker) stored
   * switches are kept as they are and nothing is added. */
  function mergeSite(id, stored) {
    stored = stored || {};
    var defaults = root.BFX_SITES ? root.BFX_SITES.defaultsFor(id) : {};
    return {
      enabled: stored.enabled !== false,
      presets: Object.assign(defaults, stored.presets || {}),
      custom: Array.isArray(stored.custom) ? stored.custom : []
    };
  }

  function merge(stored) {
    stored = stored || {};
    var s = clone(DEFAULTS);
    if (typeof stored.enabled === 'boolean') s.enabled = stored.enabled;
    if (typeof stored.placeholders === 'boolean') s.placeholders = stored.placeholders;
    s.keywords = Object.assign(clone(DEFAULTS.keywords), stored.keywords || {});

    var sites = Object.assign({}, stored.sites || {});
    /* Saved before there were other sites: these switches are Facebook's. */
    if (!stored.sites && (stored.presets || stored.custom)) {
      sites.facebook = { enabled: true, presets: stored.presets || {}, custom: stored.custom || [] };
    }
    var ids = siteIds();
    Object.keys(sites).forEach(function (id) {
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    ids.forEach(function (id) {
      s.sites[id] = mergeSite(id, sites[id]);
    });
    return s;
  }

  /* A site's settings inside a full state, created if missing, for writers. */
  function site(state, id) {
    if (!state.sites[id]) state.sites[id] = mergeSite(id);
    return state.sites[id];
  }

  /* What a page on one site runs on: the shared settings with that site's
   * switches and picked rules. Paused when everything is paused or the site
   * is switched off. */
  function view(state, id) {
    var own = state.sites[id] || mergeSite(id);
    return {
      site: id,
      enabled: state.enabled && own.enabled,
      presets: own.presets,
      custom: own.custom,
      keywords: state.keywords,
      placeholders: state.placeholders
    };
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
      app: APP,
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: state
    };
  }

  function cleanRules(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) {
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

  function cleanSwitches(map) {
    var out = {};
    if (map && typeof map === 'object') {
      Object.keys(map).forEach(function (id) {
        if (typeof map[id] === 'boolean') out[id] = map[id];
      });
    }
    return out;
  }

  /* Rebuild settings from an exported file field by field, so a hand-edited
   * or foreign file can only ever produce a well-formed state. Files saved
   * under the extension's earlier names are still ours: "XrnSocial" and
   * "BlockDistractXrn" (same shape as today's) and "BlockFB" (one site,
   * restored into Facebook). Throws with a message fit to show the person. */
  var OLD_APPS = ['XrnSocial', 'BlockDistractXrn', 'BlockFB'];

  function fromBackup(data) {
    var s = data && (data.app === APP || OLD_APPS.indexOf(data.app) !== -1) ? data.settings : data;
    if (!s || typeof s !== 'object' || Array.isArray(s) ||
        !('sites' in s || 'presets' in s || 'custom' in s || 'keywords' in s)) {
      throw new Error('This file does not contain ' + APP + ' settings.');
    }
    var out = {};
    if (typeof s.enabled === 'boolean') out.enabled = s.enabled;
    if (typeof s.placeholders === 'boolean') out.placeholders = s.placeholders;
    if (s.keywords && typeof s.keywords === 'object') {
      out.keywords = {
        enabled: s.keywords.enabled === true,
        terms: (Array.isArray(s.keywords.terms) ? s.keywords.terms : [])
          .filter(function (t) { return typeof t === 'string' && t.trim(); })
          .map(function (t) { return t.trim(); })
      };
    }
    var sites = s.sites && typeof s.sites === 'object' ? s.sites
      : { facebook: { presets: s.presets, custom: s.custom } };
    var known = siteIds();
    out.sites = {};
    Object.keys(sites).forEach(function (id) {
      if (known.indexOf(id) === -1 || !sites[id] || typeof sites[id] !== 'object') return;
      out.sites[id] = {
        enabled: sites[id].enabled !== false,
        presets: cleanSwitches(sites[id].presets),
        custom: cleanRules(sites[id].custom)
      };
    });
    return merge(out);
  }

  root.BFX_STORE = {
    KEY: KEY,
    APP: APP,
    DEFAULTS: DEFAULTS,
    get: get,
    set: set,
    update: update,
    onChange: onChange,
    merge: merge,
    site: site,
    view: view,
    newId: newId,
    validSelector: validSelector,
    toBackup: toBackup,
    fromBackup: fromBackup
  };
})(typeof self !== 'undefined' ? self : this);
