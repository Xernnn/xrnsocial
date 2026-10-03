/* The rule engine, shared by every site.
 *
 * Two mechanisms, deliberately:
 *   1. A single injected <style> sheet for everything expressible in CSS.
 *      Zero per-frame cost, survives a site's re-renders for free, and it is
 *      applied at document_start so hidden things never flash into view.
 *   2. A debounced MutationObserver for the handful of things CSS cannot see:
 *      "is this post an ad?", "does this post contain a word I banned?".
 *
 * What a post is, which switches exist and how a site's ads give themselves
 * away come from the site's rule pack (src/sites/<id>.js). The engine hands
 * each pack the same small API (see `api` below).
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;
  var STORE = root.BFX_STORE;
  var STYLE_ID = 'bfx-style';
  /* What is hidden is marked with attributes, never classes. React rewrites
   * an element's class list whenever it re-renders it (hover, scroll, new
   * data), which silently un-hid ads that had been hidden with a class.
   * Attributes it did not set, it leaves alone. */
  var BY = 'data-bfx-hidden-by';
  var NOTE = 'data-bfx-note';
  var REVEALED = 'data-bfx-revealed';
  var HIDDEN = '[' + BY + ']';

  /* The rule pack for the site this page is on; null on a site without one. */
  var site = SITES.get(SITES.forHost(location.hostname));
  var UNITS = site ? site.units : null;
  var SILENT = (site && site.silent) || {};

  var full = null;         // the full settings last applied, for refresh()
  var state = null;        // the current site's view of them (STORE.view)
  var generation = 0;      // bumped on every settings change, invalidates marks
  var observer = null;
  var pending = false;
  var jsRules = [];        // active heuristics, recomputed on apply()
  var keywords = [];       // compiled once per apply(), not once per frame

  /* ------------------------------------------------------------ styles -- */

  function styleEl() {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      // documentElement, not head: at document_start there is no head yet.
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  /* A hidden post that keeps a one-line bar in its place. Higher specificity
   * than the plain hidden rule, so it wins without fighting over order. The
   * colours are Facebook's variables, with neutral fallbacks elsewhere. */
  var PLACEHOLDER = HIDDEN + '[' + NOTE + ']';
  var PLACEHOLDER_CSS = [
    PLACEHOLDER + '{display:block !important;cursor:pointer}',
    PLACEHOLDER + ' > *{display:none !important}',
    PLACEHOLDER + '::before{content:attr(' + NOTE + ');display:block;' +
      'margin:0 0 12px;padding:9px 14px;border-radius:8px;' +
      'background:var(--card-background,#f0f2f5);color:var(--secondary-text,#65676b);' +
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    PLACEHOLDER + ':hover::before{color:var(--primary-text,#050505)}'
  ].join('\n');

  function buildCss(s) {
    var out = [
      HIDDEN + '{display:none !important}',
      /* Feeds that divide posts with <hr> (Reddit) would stack the lines of
       * the posts around one that is gone. */
      HIDDEN + ':not([' + NOTE + ']) + hr{display:none !important}'
    ];
    if (!s.enabled) return out.join('\n');
    if (s.placeholders) out.push(PLACEHOLDER_CSS);

    var selectors = [];

    site.presets.forEach(function (rule) {
      if (!s.presets[rule.id]) return;
      if (rule.css) selectors = selectors.concat(rule.css);
      if (rule.style) out.push(rule.style);
    });

    var path = location.pathname;
    s.custom.forEach(function (rule) {
      if (rule.enabled === false) return;
      if (rule.scope === 'path' && rule.path !== path) return;
      /* Stored selectors can come from an imported file; one that does not
       * parse could close its rule and smuggle in CSS of its own. */
      if (STORE.validSelector(rule.selector)) selectors.push(rule.selector);
    });

    /* One selector per line: an invalid selector kills only its own rule,
     * not the whole sheet. Sites change; rules will break individually. */
    selectors.forEach(function (sel) {
      out.push(sel + '{display:none !important}');
    });

    return out.join('\n');
  }

  /* ------------------------------------------------------ shadow roots -- */

  /* Some sites keep parts of a post inside open shadow roots (Reddit's vote
   * counts and action bar), where the page stylesheet cannot reach. A rule
   * lists { host, css } pairs; each matching host gets one <style> of its own
   * inside its shadow root, rewritten when the rules change and checked on
   * every scan for hosts that are new or re-rendered. */
  var shadowCss = {};       // host selector -> css from the rules that are on
  var SHADOW_HOSTS = [];    // every host selector this site's rules use
  if (site) {
    site.presets.forEach(function (rule) {
      (rule.shadow || []).forEach(function (sh) {
        if (SHADOW_HOSTS.indexOf(sh.host) === -1) SHADOW_HOSTS.push(sh.host);
      });
    });
  }

  function collectShadow(s) {
    var out = {};
    if (!s.enabled) return out;
    site.presets.forEach(function (rule) {
      if (!s.presets[rule.id] || !rule.shadow) return;
      rule.shadow.forEach(function (sh) {
        out[sh.host] = (out[sh.host] || '') + sh.css + '\n';
      });
    });
    return out;
  }

  function styleShadowRoots() {
    SHADOW_HOSTS.forEach(function (host) {
      var text = shadowCss[host] || '';
      document.querySelectorAll(host).forEach(function (el) {
        var root = el.shadowRoot;
        if (!root) return;
        var style = root.querySelector('style[data-bfx]');
        if (!style) {
          if (!text) return;
          style = document.createElement('style');
          style.setAttribute('data-bfx', '');
          root.appendChild(style);
        }
        if (style.textContent !== text) style.textContent = text;
      });
    });
  }

  function hasShadowRules() {
    return Object.keys(shadowCss).some(function (h) { return shadowCss[h]; });
  }

  /* --------------------------------------------------------- utilities -- */

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    // Ad labels hide decoy letters off-screen or at zero size.
    if (cs.position === 'absolute' && (parseFloat(cs.left) < -500 || parseFloat(cs.top) < -500)) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return true;
  }

  /* Text as a human actually sees it, with hidden decoy characters dropped. */
  function visibleText(el, limit) {
    limit = limit || 120;
    var out = '';
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value || !value.trim()) continue;
      if (!isVisible(node.parentElement)) continue;
      out += value;
      if (out.length > limit) break;
    }
    return out.trim();
  }

  /* Text in a post that nobody sees: hidden decoys (Facebook hides the word
   * "Facebook" thirty-odd times in every post), icon titles ("Shared with
   * Public"), plus whatever the site adds. */
  var UNSEEN = '[aria-hidden="true"], svg, script, style' + (site && site.unseen ? ', ' + site.unseen : '');
  var BODY = (site && site.body) || '';

  /* The words a reader of the post actually sees. Word blocks match against
   * this, or blocking "public" or "Facebook" would hide every post. */
  function readableText(unit) {
    var out = '';
    var walker = document.createTreeWalker(unit, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
        return n.matches(UNSEEN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
    });
    var node;
    while ((node = walker.nextNode())) out += node.nodeValue;
    return out;
  }

  /* A comment, or a shared post quoted inside this one. */
  function isNestedArticle(el, unit) {
    if (el.getAttribute('role') !== 'article' || el === unit) return false;
    var outer = el.parentElement && el.parentElement.closest('[role="article"]');
    return !!outer && (outer === unit || unit.contains(outer));
  }

  /* The top of a unit with the post body (the site's `body` selector),
   * comments and unseen text cut out: the section header ("Suggested for
   * you") and the author line ("Ana commented on this") are what identify a
   * kind of post. Matching here instead of the whole text means a post that
   * merely mentions the phrase is left alone. */
  function headText(unit, limit) {
    var out = '';
    var walker = document.createTreeWalker(unit, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
        if ((BODY && n.matches(BODY)) || n.matches(UNSEEN) || isNestedArticle(n, unit)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    var node;
    while ((node = walker.nextNode()) && out.length < limit) {
      out += node.nodeValue;
    }
    return out.slice(0, limit).replace(/\s+/g, ' ').toLowerCase();
  }

  /* feedText phrases are listed per language; every language is tried, so a
   * page whose lang attribute is missing or wrong still works. Flattened and
   * lowercased once per rule. */
  function phrasesOf(rule) {
    if (!rule.__bfxPhrases) {
      var p = rule.phrases || [];
      var list = Array.isArray(p) ? p : Object.keys(p).reduce(function (acc, lang) {
        return acc.concat(p[lang]);
      }, []);
      rule.__bfxPhrases = list.map(function (x) { return x.toLowerCase(); });
    }
    return rule.__bfxPhrases;
  }

  /* Everything hidden by code since the last settings change, so a marker
   * that something else removes can be put back on the next scan. */
  var hiddenEls = new Set();

  function mark(el, why, note) {
    el.setAttribute(BY, why);
    if (note) el.setAttribute(NOTE, note);
  }

  function hide(el, why, note) {
    if (!el || el.hasAttribute(BY)) return;
    var text = note && state && state.placeholders ? 'Hidden by BlockDistractXrn · ' + note + ' — click to show' : null;
    mark(el, why, text);
    el.__bfxHide = { why: why, note: text };
    hiddenEls.add(el);
  }

  /* Put back any marker that was stripped from something still on the page. */
  function reassert() {
    hiddenEls.forEach(function (el) {
      if (!el.isConnected) { hiddenEls.delete(el); return; }
      if (!el.hasAttribute(BY) && !el.hasAttribute(REVEALED)) mark(el, el.__bfxHide.why, el.__bfxHide.note);
    });
  }

  function unhide(el) {
    el.removeAttribute(BY);
    el.removeAttribute(NOTE);
    el.__bfxHide = null;
    hiddenEls.delete(el);
  }

  function unhideAll() {
    document.querySelectorAll(HIDDEN).forEach(unhide);
    hiddenEls.clear();
  }

  /* Clicking a placeholder shows the post and keeps it shown for the life of
   * the page, across settings changes. The post's children are display:none,
   * so the click always lands on the unit itself. */
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches(PLACEHOLDER)) return;
    if (document.documentElement.hasAttribute('data-bfx-picking')) return;
    e.preventDefault();
    e.stopPropagation();
    unhide(el);
    el.setAttribute(REVEALED, '');
  }, true);

  /* ------------------------------------------------------- autoplay -- */

  /* Sites start videos as they scroll into view. With the switch on, a video
   * that starts playing without a click or Enter/Space in the moment before
   * is paused again; one the person started plays on. Media events do not
   * bubble, but capturing listeners on the document still see them. */
  var GESTURE_MS = 1500;
  var lastGesture = 0;

  function noteGesture(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    lastGesture = Date.now();
  }
  document.addEventListener('pointerdown', noteGesture, true);
  document.addEventListener('keydown', noteGesture, true);

  document.addEventListener('play', function (e) {
    var video = e.target;
    if (!state || !state.enabled || !state.presets.noAutoplay) return;
    if (!video || video.tagName !== 'VIDEO') return;
    if (Date.now() - lastGesture < GESTURE_MS) return;
    video.pause();
  }, true);

  /* Walk up from `el` until just below `stop`, at most `max` levels. */
  function climbTo(el, stop, max) {
    var node = el;
    var depth = 0;
    while (node && node.parentElement && node.parentElement !== stop && depth < (max || 12)) {
      node = node.parentElement;
      depth++;
    }
    return node;
  }

  /* "(3) Facebook" in the tab title pulls just as hard as the red dot. */
  function stripTitleCount() {
    var clean = document.title.replace(/^\(\d+\+?\)\s*/, '');
    if (clean !== document.title) document.title = clean;
  }

  /* ----------------------------------------------------------- ad labels -- */

  /* Labels sites print on ads, as a prefix of the label's visible text. */
  var AD_WORD = /^(sponsored|sponsrad|gesponsert|gesponsord|patrocinad|publicidad|sponsoris|sponsorizzat|sponsorowane|sponsorlu|bersponsor|được tài trợ|publicidade|реклама|广告|廣告|広告|إعلان)/i;
  var PARTNER_WORD = /^paid (partnership|promotion)/i;

  /* The whole label, for labels too short to match as a prefix. */
  var AD_LABEL = /^(ad|sponsored|quảng cáo|được tài trợ|publicidad|anuncio|patrocinado|anúncio|publicité|sponsorisé|anzeige|gesponsert|annuncio|sponsorizzato|iklan|bersponsor|реклама|广告|廣告|広告|إعلان)$/i;

  /* Facebook breaks the word "Sponsored" into shuffled spans and pads it with
   * decoy letters that CSS hides, so the raw text reads like "SpSonsoreedd".
   * This prefilter is loose on purpose; visibleText() then makes the call. */
  var FUZZY = /s.{0,3}p.{0,3}o.{0,3}n.{0,3}s.{0,3}o.{0,3}r/i;

  var INVISIBLE_CHARS = /[​-‍⁠﻿]/g;

  function looksSponsored(el) {
    var raw = (el.textContent || '').replace(INVISIBLE_CHARS, '').trim();
    if (!raw || raw.length > 40) return false;
    if (!FUZZY.test(raw) && !AD_WORD.test(raw) && !AD_LABEL.test(raw) && !PARTNER_WORD.test(raw)) return false;
    var shown = visibleText(el, 40).replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ');
    return AD_WORD.test(shown) || AD_LABEL.test(shown) || PARTNER_WORD.test(shown);
  }

  /* The text an element is labelled by, or null while a referenced element
   * is missing or empty: sites fill them in a frame or two later. */
  function referencedText(el) {
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    var out = '';
    for (var i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      var target = document.getElementById(ids[i]);
      if (!target) return null;
      out += target.textContent;
    }
    out = out.replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
    return out || null;
  }

  /* From an ad label, find the card it belongs to.
   *
   * Climbing too far hides a whole tray or grid, so the walk stops at the
   * first ancestor that is card-sized and sits among siblings — that shape
   * is what a list or grid item looks like — and bails out on anything that
   * is obviously a whole surface, or that holds more than one post (the
   * site's `cardStop`, else its post selector). */
  function cardFor(label) {
    var node = label;
    var best = null;
    var viewportH = window.innerHeight || 800;
    var stop = site.cardStop || UNITS;
    for (var depth = 0; depth < 12 && node.parentElement; depth++) {
      node = node.parentElement;
      if (node === document.body || node === document.documentElement) break;
      var role = node.getAttribute('role');
      if (role === 'feed' || role === 'main' || role === 'banner' ||
          role === 'complementary' || role === 'navigation') break;
      if (node.querySelectorAll(stop).length > 1) break;
      var r = node.getBoundingClientRect();
      if (r.height > viewportH * 0.85) break;
      best = node;
      if (r.height >= 90 && node.parentElement &&
          node.parentElement.childElementCount >= 3) break;
    }
    return best;
  }

  /* Judge a label once per settings generation. Labels that are still empty
   * are not stamped: sites often fill the text in a frame later. */
  function firstLook(el, mark) {
    if (el[mark] === generation) return false;
    if (!(el.textContent || '').trim()) return false;
    el[mark] = generation;
    return true;
  }

  /* --------------------------------------------------------- heuristics -- */

  /* Shared by every site; a pack adds its own (site.heuristics). */
  var CORE = {
    /* Section headers and "why am I seeing this" strings that identify a whole
     * class of unit. Matched against the unit's header only. */
    feedText: function (unit, rule, ctx) {
      var head = ctx.head();
      return phrasesOf(rule).some(function (p) {
        return head.indexOf(p) !== -1;
      });
    }
  };

  function heuristic(kind) {
    return (site.heuristics && site.heuristics[kind]) || CORE[kind] || null;
  }

  /* Everything a site's rule pack may use. Pack heuristics are called as
   * fn(unit, rule.js, ctx, api), its global rules as fn(api). */
  var api = {
    HIDDEN: HIDDEN,
    hide: hide,
    state: function () { return state; },
    generation: function () { return generation; },
    units: function () { return UNITS; },
    firstLook: firstLook,
    isVisible: isVisible,
    visibleText: visibleText,
    readableText: readableText,
    headText: headText,
    looksSponsored: looksSponsored,
    referencedText: referencedText,
    cardFor: cardFor,
    climbTo: climbTo,
    stripTitleCount: stripTitleCount,
    feedText: function (unit, rule, ctx) { return CORE.feedText(unit, rule, ctx); },
    AD_WORD: AD_WORD,
    AD_LABEL: AD_LABEL,
    INVISIBLE_CHARS: INVISIBLE_CHARS
  };

  /* Global rules work on a container other than a feed unit, so they are
   * not part of the per-unit loop — but they still need the observer
   * running. Keyed by preset id. */
  function globalIds() {
    return Object.keys(site.globals || {});
  }

  function runGlobalHeuristics(s) {
    globalIds().forEach(function (id) {
      if (!s.presets[id]) return;
      try {
        site.globals[id](api);
      } catch (e) { /* one bad rule must not stop the others */ }
    });
  }

  /* The term that matched, for the placeholder, or null. */
  function matchKeyword(unit, ctx) {
    var raw = ctx.text();
    var text = raw.toLowerCase();
    if (!text) return null;
    for (var i = 0; i < keywords.length; i++) {
      var term = keywords[i];
      if (term.re ? term.re.test(raw) : text.indexOf(term.text) !== -1) return term.source;
    }
    return null;
  }

  /* Accepts plain words or /regex/flags. */
  function compileKeywords(terms) {
    return (terms || []).map(function (raw) {
      var t = String(raw).trim();
      if (!t) return null;
      var m = /^\/(.+)\/([gimsuy]*)$/.exec(t);
      if (m) {
        try {
          // No g or y: both make test() stateful between posts.
          return { re: new RegExp(m[1], m[2].replace(/[gy]/g, '')), source: t };
        } catch (e) { /* not a valid regex: treat it as a plain word */ }
      }
      return { text: t.toLowerCase(), source: t };
    }).filter(Boolean);
  }

  /* -------------------------------------------------------------- scan -- */

  /* Per-unit work shared between heuristics, computed only if one asks. A
   * heuristic that is missing information (a label not filled in yet) marks
   * the unit unsure, and it is looked at again on a later frame. */
  function unitContext(unit) {
    var head = null;
    var text = null;
    var unsure = false;
    return {
      head: function () {
        if (head === null) head = headText(unit, 300);
        return head;
      },
      text: function () {
        if (text === null) text = readableText(unit);
        return text;
      },
      unsure: function () { unsure = true; },
      isUnsure: function () { return unsure; }
    };
  }

  /* How many frames a unit may stay unsure before its verdict stands. */
  var MAX_TRIES = 40;

  /* Elements that changed since the last scan. Sites render a post in
   * pieces and empty posts that scroll away, then refill them, so a verdict
   * only holds until the post's content changes. */
  var dirty = new Set();
  /* A label attached to an existing element changes no text, so these are
   * looked at again regardless. */
  var relabelled = new Set();

  function onMutations(records) {
    for (var i = 0; i < records.length; i++) {
      (records[i].type === 'attributes' ? relabelled : dirty).add(records[i].target);
    }
    schedule();
  }

  /* A feed renders thousands of changes a frame, most of them inside a
   * handful of posts, so the post an element belongs to is remembered on the
   * element, and each changed post's text is measured once per frame rather
   * than once per change. */
  function unitOf(el) {
    if (el.__bfxUnit === undefined) el.__bfxUnit = el.closest(UNITS);
    return el.__bfxUnit;
  }

  function invalidateChanged() {
    var changed = new Set();
    dirty.forEach(function (t) {
      var unit = t.nodeType === 1 && unitOf(t);
      if (unit && unit.__bfxGen === generation) changed.add(unit);
    });
    dirty.clear();
    changed.forEach(function (unit) {
      if (unit.__bfxLen !== unit.textContent.length) unit.__bfxGen = 0;
    });
    relabelled.forEach(function (t) {
      var unit = unitOf(t);
      if (unit) unit.__bfxGen = 0;
    });
    relabelled.clear();
  }

  function skipUnit(unit) {
    /* Units can nest. Once the outer one is hidden or clicked open, the
     * inner ones belong to it. */
    return !!(unit.closest(HIDDEN + ', [' + REVEALED + ']') ||
      /* A post opened in a dialog is one you asked to see. */
      unit.closest('[role="dialog"]') ||
      (site.skip && site.skip(unit)));
  }

  function scan() {
    pending = false;
    if (!state || !state.enabled) {
      dirty.clear();
      relabelled.clear();
      return;
    }

    if (jsRules.length || keywords.length) {
      invalidateChanged();
      var units = document.querySelectorAll(UNITS);
      for (var i = 0; i < units.length; i++) {
        var unit = units[i];
        if (unit.__bfxGen === generation) continue;   // already judged this unit
        if (skipUnit(unit)) {
          unit.__bfxGen = generation;
          continue;
        }
        /* An empty shell: a post not rendered yet, or one scrolled away. */
        var len = unit.textContent.length;
        if (!len) continue;

        var ctx = unitContext(unit);

        var hidden = false;
        for (var j = 0; j < jsRules.length; j++) {
          var rule = jsRules[j];
          var fn = heuristic(rule.js.kind);
          if (!fn) continue;
          try {
            if (fn(unit, rule.js, ctx, api)) {
              hide(unit, rule.id, SILENT[rule.id] ? null : rule.label);
              hidden = true;
              break;
            }
          } catch (e) { /* one bad rule must not stop the others */ }
        }
        if (!hidden && keywords.length) {
          var term = matchKeyword(unit, ctx);
          if (term) {
            hide(unit, 'keyword', 'word: ' + term);
            hidden = true;
          }
        }
        if (!hidden && ctx.isUnsure() && (unit.__bfxTries = (unit.__bfxTries || 0) + 1) < MAX_TRIES) {
          continue;
        }
        unit.__bfxGen = generation;
        unit.__bfxLen = len;
      }
    } else {
      dirty.clear();
      relabelled.clear();
    }

    runGlobalHeuristics(state);
    styleShadowRoots();
    reassert();
    ensureStyle();
  }

  /* If the page ever drops the stylesheet (a head rebuild on navigation),
   * every CSS rule would stop at once; put it back. */
  var css = '';
  function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) styleEl().textContent = css;
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(scan);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-labelledby']
    });
  }

  function needsObserver(s) {
    if (!s.enabled) return false;
    if (jsRules.length || keywords.length || hasShadowRules()) return true;
    return globalIds().some(function (id) { return s.presets[id]; });
  }

  /* ------------------------------------------------------------- stats -- */

  /* What each active rule matches on this page, for the popup. A rule that
   * matches nothing where you can still see its target is the usual sign that
   * the site changed underneath it. Effect-only rules (style, no css or js)
   * have nothing to count and are left out. */
  /* The popup's "3 here" should count things a person would have seen: not
   * the empty slots a site keeps on every post for content it may load later
   * (Reddit has one per post), not the divider line that goes with a hidden
   * post, and not a match inside another match of the same rule. */
  /* Something that draws: text, a picture or video, or a control. Custom
   * elements may draw everything inside shadow roots, so look there too; a
   * shadow root holding only wrappers and a <slot> (Reddit's loaders) is
   * still empty. */
  var DRAWS = 'img, video, iframe, svg, canvas, picture, input, textarea, select, button';
  var some = function (list, fn) { return Array.prototype.some.call(list, fn); };
  function shadowDraws(root, depth) {
    if (root.querySelector(DRAWS)) return true;
    return some(root.querySelectorAll('*'), function (c) {
      if (c.localName === 'style' || c.localName === 'script') return false;
      if (some(c.childNodes, function (t) { return t.nodeType === 3 && t.nodeValue.trim(); })) return true;
      return depth < 2 && !!c.shadowRoot && shadowDraws(c.shadowRoot, depth + 1);
    });
  }
  function hasContent(el) {
    if (el.matches(DRAWS) || el.querySelector(DRAWS) || (el.textContent || '').trim()) return true;
    if (el.shadowRoot && shadowDraws(el.shadowRoot, 0)) return true;
    return some(el.querySelectorAll('*'), function (c) { return !!c.shadowRoot && shadowDraws(c.shadowRoot, 1); });
  }

  function countSeen(seen) {
    var n = 0;
    seen.forEach(function (el) {
      if (el.localName === 'hr' || !hasContent(el)) return;
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (seen.has(p)) return;
      }
      n++;
    });
    return n;
  }

  function stats() {
    var out = { site: site ? site.id : null, presets: {}, custom: {}, keyword: 0 };
    if (!state || !state.enabled) return out;

    var tagged = {};
    document.querySelectorAll(HIDDEN).forEach(function (el) {
      var why = el.getAttribute(BY);
      (tagged[why] = tagged[why] || []).push(el);
    });

    site.presets.forEach(function (rule) {
      if (!state.presets[rule.id] || (!rule.css && !rule.js)) return;
      var seen = new Set(tagged[rule.id] || []);
      var broken = [];
      (rule.css || []).forEach(function (sel) {
        try {
          document.querySelectorAll(sel).forEach(function (el) { seen.add(el); });
        } catch (e) {
          broken.push(sel);
        }
      });
      out.presets[rule.id] = { count: countSeen(seen), broken: broken };
    });

    var path = location.pathname;
    state.custom.forEach(function (rule) {
      if (rule.enabled === false) return;
      if (rule.scope === 'path' && rule.path !== path) {
        out.custom[rule.id] = { offPage: true };
        return;
      }
      if (!STORE.validSelector(rule.selector)) {
        out.custom[rule.id] = { count: 0, broken: [rule.selector] };
        return;
      }
      out.custom[rule.id] = { count: document.querySelectorAll(rule.selector).length, broken: [] };
    });

    out.keyword = (tagged.keyword || []).length;
    return out;
  }

  /* ------------------------------------------------------------ routes -- */

  /* Pages a site's rules block outright rather than trim (Facebook's reels,
   * for one): the path to send the tab to instead, or null. Takes the full
   * settings and picks the site from the location. */
  function redirectFor(full, loc) {
    var pack = SITES.get(SITES.forHost(loc.hostname));
    if (!full || !pack || !pack.redirect) return null;
    var s = STORE.view(full, pack.id);
    return s.enabled ? pack.redirect(s, loc) : null;
  }

  /* --------------------------------------------------------------- api -- */

  /* `next` is the full settings; the page runs on its own site's view. */
  function apply(next) {
    if (!site) return;
    full = next;
    state = STORE.view(next, site.id);
    generation++;

    jsRules = state.enabled
      ? site.presets.filter(function (r) { return r.js && state.presets[r.id] && heuristic(r.js.kind); })
      : [];
    keywords = state.enabled && state.keywords.enabled ? compileKeywords(state.keywords.terms) : [];

    css = buildCss(state);
    styleEl().textContent = css;
    shadowCss = collectShadow(state);
    styleShadowRoots();

    /* Anything hidden by a rule that is now off must come back. Cheap, and it
     * means toggling a switch is instantly visible instead of needing F5. */
    unhideAll();

    if (needsObserver(state)) {
      startObserver();
      schedule();
    } else if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function refresh() {
    if (full) apply(full);
  }

  root.BFX_ENGINE = {
    site: site,
    apply: apply,
    refresh: refresh,
    scan: schedule,
    stats: stats,
    redirectFor: redirectFor,
    hiddenCount: function () {
      return document.querySelectorAll(HIDDEN).length;
    }
  };
})(typeof self !== 'undefined' ? self : this);
