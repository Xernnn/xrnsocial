/* Single-key state in chrome.storage.local, shared by the content script,
 * the popup, the options page and the service worker. One key keeps change
 * notifications cheap and makes read-modify-write races obvious instead of
 * subtle.
 *
 *   { enabled, placeholders, keywords: { enabled, terms },
 *     sites: { <site id>: { enabled, presets: { <preset id>: bool }, custom: [rule],
 *                           remembered: { <group>: [preset id] } } } }
 *
 * The pause switch, the "show" bars and the word list are shared by every
 * site; switches and picked rules belong to one site. `remembered` holds what
 * was on in a group when the popup's group switch turned it off, so turning
 * it back on restores that. Settings saved before there was more than one
 * site were Facebook's and are moved there.
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

  /* Only lists of ids survive, whatever a hand-edited backup holds. */
  function cleanRemembered(map) {
    var out = {};
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      Object.keys(map).forEach(function (group) {
        if (!Array.isArray(map[group])) return;
        var ids = map[group].filter(function (id) { return typeof id === 'string' && id; });
        if (ids.length) out[group] = ids;
      });
    }
    return out;
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
      custom: Array.isArray(stored.custom) ? stored.custom : [],
      remembered: cleanRemembered(stored.remembered)
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
   * own (url() requests included). The selector parser alone is not enough:
   * as the CSS spec says, it closes whatever a selector leaves open at its
   * end, so it passes `a/*`, whose comment then runs on into the rules after
   * it. A selector must also be self-contained: no comments (none is ever
   * picked), every string and bracket closed, no escape cut off by the end.
   * Without a DOM (the service worker) nothing is accepted. */
  var CLOSER = { '(': ')', '[': ']' };

  function selfContained(sel) {
    var open = [];
    var quote = '';
    for (var i = 0; i < sel.length; i++) {
      var c = sel.charAt(i);
      if (c === '\\') {
        if (i === sel.length - 1) return false;
        i++;                       // an escaped character is never syntax
      } else if (quote) {
        if (c === quote) quote = '';
        else if (c === '\n' || c === '\r' || c === '\f') return false;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '/' && sel.charAt(i + 1) === '*') {
        return false;
      } else if (CLOSER[c]) {
        open.push(CLOSER[c]);
      } else if (c === ')' || c === ']') {
        if (open.pop() !== c) return false;
      } else if (c === '{' || c === '}' || c === ';') {
        return false;
      }
    }
    return !quote && !open.length;
  }

  var probe = null;
  function validSelector(sel) {
    if (typeof sel !== 'string' || !sel.trim() || !selfContained(sel)) return false;
    if (typeof document === 'undefined') return false;
    probe = probe || document.createDocumentFragment();
    try {
      probe.querySelector(sel);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* A /regex/ body that a backtracking engine can take seconds or hours over
   * on one post, with the tab frozen while it runs, since a scan can't be
   * interrupted: a repeat around something that repeats or branches
   * ((a+)+, (a|aa)*, (\w+\s?)*, (.*a){9}), an open-ended repeat straight
   * after another that can match the same characters (.*.*, \d+\d*, with
   * only optional bits between), or more than two open-ended repeats in all
   * (.*a.*b.*c). Read token by token; a group's prefix ("?:", "?<name>")
   * reads as plain characters, which changes nothing here. */
  var CLASSES = { d: /\d/, w: /\w/, s: /\s/, D: /\D/, W: /\W/, S: /\S/ };
  var APART = ['\\D\\d', '\\S\\s', '\\W\\w', '\\d\\s', '\\s\\w', '\\W\\d'];
  /* Whether two atoms can match no character in common. An atom is 'L' and
   * the character, '\\' and a class letter, or anything else (could be
   * anything). */
  function apart(a, b) {
    if (a[0] === 'L' && b[0] === 'L') return a !== b;
    if (a[0] === 'L' && b[0] === '\\') return !CLASSES[b[1]].test(a.slice(1));
    if (b[0] === 'L' && a[0] === '\\') return !CLASSES[a[1]].test(b.slice(1));
    return APART.indexOf([a, b].sort().join('')) !== -1;
  }

  function slowPattern(body) {
    var REPEAT = /^\{(\d+)(,(\d*))?\}/;
    var groups = [{ rep: false, alt: false, before: null }];
    var atom = null;        // what a quantifier here would apply to
    var before = null;      // the item before it, if that repeats open-endedly
    var open = null;        // the same for this item, once its quantifier is read
    var opens = 0;
    for (var i = 0; i < body.length; i++) {
      var c = body[i];
      var top = groups[groups.length - 1];
      var q = c === '{' ? REPEAT.exec(body.slice(i)) : null;
      if (c === '*' || c === '+' || c === '?' || q) {
        if (q) i += q[0].length - 1;
        if (body[i + 1] === '?') i++;   // lazy: the same work
        if (!atom) continue;
        var max = c === '*' || c === '+' ? Infinity : c === '?' ? 1 : q[2] === undefined ? +q[1] : q[3] === '' ? Infinity : +q[3];
        if (max > 1) {
          if (atom.group && (atom.group.rep || atom.group.alt)) return true;
          top.rep = true;
        }
        if (max === Infinity) {
          if ((before && !apart(before, atom.kind)) || ++opens > 2) return true;
          open = atom.kind;
        } else if (max <= 1) {
          open = before;   // optional: what came before still meets what follows
        }
        atom = null;
        continue;
      }
      if (c === '(') {
        groups.push({ rep: false, alt: false, before: open });
        atom = null;
        before = open = null;
        continue;
      }
      if (c === '|') {
        top.alt = true;
        atom = null;
        before = open = null;
        continue;
      }
      if (c === ')' && groups.length > 1) {
        var done = groups.pop();
        var outer = groups[groups.length - 1];
        outer.rep = outer.rep || done.rep;
        outer.alt = outer.alt || done.alt;
        atom = { group: done, kind: '(' };
        before = done.before;
        open = null;
        continue;
      }
      var kind = c === '.' || c === '[' ? c : 'L' + c.toLowerCase();
      if (c === '\\') {
        var e = body[++i] || '';
        var close = /[pPu]/.test(e) && body[i + 1] === '{' ? '}' : e === 'k' && body[i + 1] === '<' ? '>' : '';
        if (close) i = Math.max(i, body.indexOf(close, i));
        kind = CLASSES[e] ? '\\' + e : /[A-Za-z0-9]/.test(e) ? '?' : 'L' + e;
      } else if (c === '[') {
        for (i++; i < body.length && body[i] !== ']'; i++) if (body[i] === '\\') i++;
      }
      atom = { group: null, kind: kind };
      before = open;
      open = null;
    }
    return false;
  }

  /* A word as it is kept: a /regex/ that slowPattern() refuses becomes the
   * plain word between its slashes. */
  function cleanTerm(term) {
    var t = String(term).trim();
    var m = /^\/(.+)\/([gimsuy]*)$/.exec(t);
    return m && slowPattern(m[1]) ? m[1] : t;
  }

  function toBackup(state) {
    return {
      app: APP,
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: state
    };
  }

  /* A selector is kept trimmed: one with a space at the end hid what was
   * inside the element instead of the element (engine.js, boosted()). */
  function cleanRules(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) {
      return r && validSelector(r.selector);
    }).map(function (r) {
      return {
        id: typeof r.id === 'string' && r.id ? r.id : newId(),
        selector: r.selector.trim(),
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
          .map(cleanTerm)
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
        custom: cleanRules(sites[id].custom),
        remembered: sites[id].remembered
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
    slowPattern: slowPattern,
    cleanTerm: cleanTerm,
    toBackup: toBackup,
    fromBackup: fromBackup
  };
})(typeof self !== 'undefined' ? self : this);
