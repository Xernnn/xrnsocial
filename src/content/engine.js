/* The rule engine.
 *
 * Two mechanisms, deliberately:
 *   1. A single injected <style> sheet for everything expressible in CSS.
 *      Zero per-frame cost, survives Facebook's re-renders for free, and it is
 *      applied at document_start so hidden things never flash into view.
 *   2. A debounced MutationObserver for the handful of things CSS cannot see:
 *      "is this post an ad?", "does this post contain a word I banned?".
 */
(function (root) {
  'use strict';

  var PRESETS = root.BFX_PRESETS;
  var STYLE_ID = 'bfx-style';
  var HIDDEN = 'bfx-hidden';

  /* Post-ish containers worth inspecting. Facebook numbers feed units
   * (FeedUnit_0, FeedUnit_1 ...) and marks each post role="article". */
  var UNIT_SELECTOR = [
    'div[data-pagelet^="FeedUnit"]',
    'div[role="feed"] > div',
    'div[role="article"]'
  ].join(',');

  var state = null;
  var generation = 0;      // bumped on every settings change, invalidates marks
  var observer = null;
  var pending = false;
  var jsRules = [];        // active heuristics, recomputed on apply()

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

  function buildCss(s) {
    var out = ['.' + HIDDEN + '{display:none !important}'];
    if (!s.enabled) return out.join('\n');

    var selectors = [];

    PRESETS.forEach(function (rule) {
      if (!s.presets[rule.id]) return;
      if (rule.css) selectors = selectors.concat(rule.css);
      if (rule.style) out.push(rule.style);
    });

    var path = location.pathname;
    s.custom.forEach(function (rule) {
      if (rule.enabled === false) return;
      if (rule.scope === 'path' && rule.path !== path) return;
      if (rule.selector) selectors.push(rule.selector);
    });

    /* One selector per line: an invalid selector kills only its own rule,
     * not the whole sheet. Facebook changes; rules will break individually. */
    selectors.forEach(function (sel) {
      out.push(sel + '{display:none !important}');
    });

    return out.join('\n');
  }

  /* --------------------------------------------------------- utilities -- */

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    // Facebook's ad label hides decoy letters off-screen or at zero size.
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

  function hide(el, why) {
    if (!el || el.classList.contains(HIDDEN)) return;
    el.classList.add(HIDDEN);
    el.setAttribute('data-bfx-hidden-by', why);
  }

  function unhideAll() {
    document.querySelectorAll('.' + HIDDEN).forEach(function (el) {
      el.classList.remove(HIDDEN);
      el.removeAttribute('data-bfx-hidden-by');
    });
  }

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

  /* --------------------------------------------------------- heuristics -- */

  /* Markup Facebook only renders for ads. Language independent, and the
   * cheapest possible test, so it goes first. */
  var AD_MARKUP = '[data-ad-preview], [data-ad-rendering-role], [data-ad-client-root]';

  /* The label links to the ad-preferences explainer; ordinary posts do not. */
  var AD_LINKS = [
    'a[href*="/ads/about"]',
    'a[href*="ad_preferences"]',
    'a[aria-label="Sponsored"]',
    '[aria-label^="Sponsored"]'
  ].join(',');

  /* Where a label could be hiding. */
  var LABEL_NODES = 'span[dir="auto"], h3, h4, a[role="link"], [data-ad-rendering-role="meta"]';

  /* Facebook breaks the word "Sponsored" into shuffled spans and pads it with
   * decoy letters that CSS hides, so the raw text reads like "SpSonsoreedd".
   * This prefilter is loose on purpose; visibleText() then makes the call. */
  var FUZZY = /s.{0,3}p.{0,3}o.{0,3}n.{0,3}s.{0,3}o.{0,3}r/i;

  /* Confirmed labels. The markup and link tests above carry non-English
   * Facebook on their own; these are the languages worth spelling out. */
  var AD_WORD = /^(sponsored|sponsrad|gesponsert|gesponsord|patrocinad|sponsoris|sponsorizzat|sponsorowane|publicidade|реклама|广告|廣告|広告|إعلان)/i;
  var PARTNER_WORD = /^paid (partnership|promotion)/i;

  function looksSponsored(el) {
    if (el.matches && el.matches(AD_MARKUP)) return true;
    var raw = (el.textContent || '').trim();
    if (!raw || raw.length > 40) return false;
    if (!FUZZY.test(raw) && !AD_WORD.test(raw) && !PARTNER_WORD.test(raw)) return false;
    var shown = visibleText(el, 40).replace(/\s+/g, ' ');
    return AD_WORD.test(shown) || PARTNER_WORD.test(shown);
  }

  var HEURISTICS = {
    /* Ads in the feed. Three independent signals, because any one of them can
     * disappear in a Facebook deploy. */
    sponsored: function (unit) {
      if (unit.querySelector(AD_MARKUP)) return true;
      if (unit.querySelector(AD_LINKS)) return true;
      var labels = unit.querySelectorAll(LABEL_NODES);
      for (var i = 0; i < labels.length && i < 12; i++) {
        if (looksSponsored(labels[i])) return true;
      }
      return false;
    },

    /* Section headers and "why am I seeing this" strings that identify a whole
     * class of unit. Matched against the top of the unit only, so a post that
     * merely mentions the phrase in its body is left alone. */
    feedText: function (unit, rule) {
      var head = (unit.textContent || '').slice(0, 300).toLowerCase();
      return rule.phrases.some(function (p) {
        return head.indexOf(p.toLowerCase()) !== -1;
      });
    }
  };

  /* Heuristics that work on a container other than a feed unit, so they are
   * not part of the per-unit loop — but they still need the observer running. */
  var GLOBAL_JS = ['badges', 'rightAds', 'adSweep'];

  /* Heuristics that work on a container other than a feed unit. */
  function runGlobalHeuristics(s) {
    if (s.presets.badges) stripBadges();
    if (s.presets.rightAds) hideSidebarAds();
    if (s.presets.adSweep) sweepAds(s);
  }

  /* From a Sponsored label, find the card it belongs to.
   *
   * Climbing too far hides the whole Stories tray or the Marketplace grid, so
   * the walk stops at the first ancestor that is card-sized and sits among
   * siblings — that shape is what a list or grid item looks like — and bails
   * out on anything that is obviously a whole surface. */
  function cardFor(label) {
    var node = label;
    var best = null;
    var viewportH = window.innerHeight || 800;
    for (var depth = 0; depth < 12 && node.parentElement; depth++) {
      node = node.parentElement;
      if (node === document.body || node === document.documentElement) break;
      var role = node.getAttribute('role');
      if (role === 'feed' || role === 'main' || role === 'banner' ||
          role === 'complementary' || role === 'navigation') break;
      if (node.querySelectorAll('div[role="article"]').length > 1) break;
      var r = node.getBoundingClientRect();
      if (r.height > viewportH * 0.85) break;
      best = node;
      if (r.height >= 90 && node.parentElement &&
          node.parentElement.childElementCount >= 3) break;
    }
    return best;
  }

  /* Everything that is not the feed: stories, reels, marketplace, search,
   * watch, group listings. One pass per label node, stamped so a label is
   * only judged once per settings generation. */
  function sweepAds(s) {
    var scope = document.querySelector('div[role="main"]') || document.body;
    var nodes = scope.querySelectorAll(LABEL_NODES + ',' + AD_MARKUP);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__bfxAdGen === generation) continue;
      el.__bfxAdGen = generation;
      if (!looksSponsored(el)) continue;
      /* The per-unit rule owns the feed and picks better containers there. */
      if (s.presets.sponsored && el.closest('div[role="feed"], div[data-pagelet^="FeedUnit"]')) continue;
      if (el.closest('.' + HIDDEN)) continue;
      var card = cardFor(el);
      if (card) hide(card, 'adSweep');
    }
  }

  function stripBadges() {
    var banner = document.querySelector('div[role="banner"]');
    if (banner) {
      banner.querySelectorAll('span, div').forEach(function (el) {
        if (el.children.length) return;
        var t = (el.textContent || '').trim();
        if (!/^\d{1,3}\+?$/.test(t)) return;
        var box = el.getBoundingClientRect();
        if (box.width > 40 || box.height > 40) return;   // a real number, not a badge
        hide(el, 'badges');
      });
    }
    // "(3) Facebook" in the tab title pulls just as hard as the red dot.
    var clean = document.title.replace(/^\(\d+\+?\)\s*/, '');
    if (clean !== document.title) document.title = clean;
  }

  function hideSidebarAds() {
    document.querySelectorAll('div[role="complementary"] h3, div[role="complementary"] span[dir="auto"]')
      .forEach(function (el) {
        if (!looksSponsored(el)) return;
        var section = climbTo(el, el.closest('div[role="complementary"]'), 10);
        hide(section, 'rightAds');
      });
  }

  function matchesKeywords(unit, keywords) {
    var text = (unit.textContent || '').toLowerCase();
    if (!text) return false;
    return keywords.some(function (term) {
      if (term.re) return term.re.test(unit.textContent || '');
      return text.indexOf(term.text) !== -1;
    });
  }

  /* Accepts plain words or /regex/flags. */
  function compileKeywords(terms) {
    return (terms || []).map(function (raw) {
      var t = String(raw).trim();
      if (!t) return null;
      var m = /^\/(.+)\/([gimsuy]*)$/.exec(t);
      if (m) {
        try {
          return { re: new RegExp(m[1], m[2].replace('g', '')) };
        } catch (e) {
          return { text: t.toLowerCase() };
        }
      }
      return { text: t.toLowerCase() };
    }).filter(Boolean);
  }

  /* -------------------------------------------------------------- scan -- */

  function scan() {
    pending = false;
    if (!state || !state.enabled) return;

    var keywords = state.keywords.enabled ? compileKeywords(state.keywords.terms) : [];
    if (jsRules.length || keywords.length) {
      var units = document.querySelectorAll(UNIT_SELECTOR);
      for (var i = 0; i < units.length; i++) {
        var unit = units[i];
        if (unit.__bfxGen === generation) continue;   // already judged this unit
        unit.__bfxGen = generation;
        if (unit.classList.contains(HIDDEN)) continue;

        var hidden = false;
        for (var j = 0; j < jsRules.length; j++) {
          var rule = jsRules[j];
          var fn = HEURISTICS[rule.js.kind];
          if (!fn) continue;
          try {
            if (fn(unit, rule.js)) {
              hide(unit, rule.id);
              hidden = true;
              break;
            }
          } catch (e) { /* one bad rule must not stop the others */ }
        }
        if (!hidden && keywords.length && matchesKeywords(unit, keywords)) {
          hide(unit, 'keyword');
        }
      }
    }

    try {
      runGlobalHeuristics(state);
    } catch (e) { /* ignore */ }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(scan);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function needsObserver(s) {
    if (!s.enabled) return false;
    if (jsRules.length) return true;
    if (s.keywords.enabled && s.keywords.terms.length) return true;
    return GLOBAL_JS.some(function (id) { return s.presets[id]; });
  }

  /* --------------------------------------------------------------- api -- */

  function apply(next) {
    state = next;
    generation++;

    jsRules = state.enabled
      ? PRESETS.filter(function (r) { return r.js && state.presets[r.id] && HEURISTICS[r.js.kind]; })
      : [];

    styleEl().textContent = buildCss(state);

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
    if (state) apply(state);
  }

  root.BFX_ENGINE = {
    apply: apply,
    refresh: refresh,
    scan: schedule,
    hiddenCount: function () {
      return document.querySelectorAll('.' + HIDDEN).length;
    }
  };
})(typeof self !== 'undefined' ? self : this);
