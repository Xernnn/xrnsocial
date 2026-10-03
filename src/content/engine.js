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
  var STORE = root.BFX_STORE;
  var STYLE_ID = 'bfx-style';
  /* What is hidden is marked with attributes, never classes. Facebook's
   * React rewrites an element's class list whenever it re-renders it (hover,
   * scroll, new data), which silently un-hid ads that had been hidden with a
   * class. Attributes it did not set, it leaves alone. */
  var BY = 'data-bfx-hidden-by';
  var NOTE = 'data-bfx-note';
  var REVEALED = 'data-bfx-revealed';
  var HIDDEN = '[' + BY + ']';

  /* Feed posts. Today's feed marks each post with aria-posinset (the ARIA
   * feed pattern) and nothing else stable: no role="feed", no data-pagelet,
   * and role="article" now means a comment, which is not a post. The older
   * hooks stay for builds that still ship them. */
  var UNIT_SELECTOR = [
    'div[aria-posinset]',
    'div[data-pagelet^="FeedUnit"]',
    'div[role="feed"] > div'
  ].join(',');

  /* Rules that leave no placeholder behind: an ad is never something you
   * want to click back open. */
  var SILENT = { sponsored: true };

  var state = null;
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
   * than the plain hidden rule, so it wins without fighting over order. */
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
    var out = [HIDDEN + '{display:none !important}'];
    if (!s.enabled) return out.join('\n');
    if (s.placeholders) out.push(PLACEHOLDER_CSS);

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
      /* Stored selectors can come from an imported file; one that does not
       * parse could close its rule and smuggle in CSS of its own. */
      if (STORE.validSelector(rule.selector)) selectors.push(rule.selector);
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

  /* The post's own words, as opposed to the frame Facebook puts around them.
   * Facebook marks the message body this way on every post, ads or not. */
  var BODY = '[data-ad-preview="message"], [data-ad-comet-preview="message"], blockquote';

  /* Text in a post that nobody sees: the hidden "Facebook" decoys, the
   * "Online status indicator" and "Active" of an avatar dot, icon titles
   * ("Shared with Public"), image descriptions. */
  var UNSEEN = '[aria-hidden="true"], svg, script, style, [data-visualcompletion="ignore"]';

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

  /* The top of a unit with the post body, comments and unseen text cut out
   * (every post opens with a hidden block of the word "Facebook" repeated
   * thirty-odd times, parked off-screen): the section
   * header ("Suggested for you") and the author line ("Ana commented on
   * this") are what identify a kind of post. Matching here instead of the
   * whole text means a post that merely mentions the phrase is left alone. */
  function headText(unit, limit) {
    var out = '';
    var walker = document.createTreeWalker(unit, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
        if (n.matches(BODY) || n.matches(UNSEEN) || isNestedArticle(n, unit)) {
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
    var text = note && state && state.placeholders ? 'Hidden by BlockFB · ' + note + ' — click to show' : null;
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

  /* Facebook starts feed videos as they scroll into view. With the switch
   * on, a video that starts playing without a click or Enter/Space in the
   * moment before is paused again; one the person started plays on. Media
   * events do not bubble, but capturing listeners on the document still see
   * them. */
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

  /* --------------------------------------------------------- heuristics -- */

  /* No markup signal here on purpose. data-ad-preview, data-ad-rendering-role
   * and friends sound ad-only but are rendered on ordinary posts too — the
   * story template is shared — so any of them would hide the whole feed.
   * (They are fine as structure, e.g. to find the Like button.) */

  /* The label links to the ad-preferences explainer; ordinary posts do not. */
  var AD_LINKS = [
    'a[href*="/ads/about"]',
    'a[href*="ad_preferences"]',
    'a[aria-label="Sponsored"]',
    '[aria-label^="Sponsored"]'
  ].join(',');

  /* Where a label could be hiding. */
  var LABEL_NODES = 'span[dir="auto"], h3, h4, a[role="link"]';

  /* Facebook breaks the word "Sponsored" into shuffled spans and pads it with
   * decoy letters that CSS hides, so the raw text reads like "SpSonsoreedd".
   * This prefilter is loose on purpose; visibleText() then makes the call. */
  var FUZZY = /s.{0,3}p.{0,3}o.{0,3}n.{0,3}s.{0,3}o.{0,3}r/i;

  /* Confirmed labels. The link test above carries non-English Facebook on its
   * own; these are the languages worth spelling out. */
  var AD_WORD = /^(sponsored|sponsrad|gesponsert|gesponsord|patrocinad|publicidad|sponsoris|sponsorizzat|sponsorowane|sponsorlu|bersponsor|được tài trợ|publicidade|реклама|广告|廣告|広告|إعلان)/i;
  var PARTNER_WORD = /^paid (partnership|promotion)/i;

  /* The whole label, for labels too short to match as a prefix. */
  var AD_LABEL = /^(ad|sponsored|quảng cáo|được tài trợ|publicidad|anuncio|patrocinado|anúncio|publicité|sponsorisé|anzeige|gesponsert|annuncio|sponsorizzato|iklan|bersponsor|реклама|广告|廣告|広告|إعلان)$/i;

  var INVISIBLE_CHARS = /[\u200b-\u200d\u2060\ufeff]/g;

  function looksSponsored(el) {
    var raw = (el.textContent || '').replace(INVISIBLE_CHARS, '').trim();
    if (!raw || raw.length > 40) return false;
    if (!FUZZY.test(raw) && !AD_WORD.test(raw) && !AD_LABEL.test(raw) && !PARTNER_WORD.test(raw)) return false;
    var shown = visibleText(el, 40).replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ');
    return AD_WORD.test(shown) || AD_LABEL.test(shown) || PARTNER_WORD.test(shown);
  }

  /* Facebook's current label is not text in the post at all. Where an
   * ordinary post's header links to "2 hours ago", an ad's header link holds
   * an empty span whose aria-labelledby points at a detached element reading
   * "Ad". Matched whole, so a timestamp or a page name can never pass. */
  var LABEL_REFS = 'a[role="link"] [aria-labelledby]';

  /* The text an element is labelled by, or null while a referenced element
   * is missing or empty: Facebook fills them in a frame or two later. */
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

  /* Facebook attaches that label only once the ad scrolls into view, but the
   * header link gives the ad away before then: its text starts with an
   * invisible word joiner (U+2060). On the live feed it was on every ad and
   * on nothing else, so ads go before they are ever drawn. The header links
   * come first, so only the first few are looked at. */
  function isAdSlot(link) {
    var text = link.textContent;
    return text.charAt(0) === '\u2060' && !text.replace(INVISIBLE_CHARS, '').trim();
  }

  /* The joiner is the whole text of that link: Facebook draws the word "Ad"
   * over it from elsewhere. A link that merely starts with one (pasted text)
   * does not count. */
  function hasAdJoiner(root) {
    var links = root.querySelectorAll('a');
    for (var i = 0; i < links.length && i < 10; i++) {
      if (isAdSlot(links[i])) return true;
    }
    return false;
  }

  /* 'ad', 'unknown' while labels are still being filled in, or null. */
  function adLabelIn(root) {
    var refs = root.querySelectorAll(LABEL_REFS);
    var pending = false;
    for (var i = 0; i < refs.length && i < 8; i++) {
      var text = referencedText(refs[i]);
      if (text === null) pending = true;
      else if (AD_LABEL.test(text)) return 'ad';
    }
    return pending ? 'unknown' : null;
  }

  var HEURISTICS = {
    /* Ads in the feed. Independent signals, because any one of them can
     * disappear in a Facebook deploy: the explainer link, the referenced
     * "Ad" label, and a "Sponsored" label written out in the post (issue
     * ads still do that, with "Paid for by ..." under it). */
    sponsored: function (unit, rule, ctx) {
      if (unit.querySelector(AD_LINKS) || hasAdJoiner(unit)) return true;
      var label = adLabelIn(unit);
      if (label === 'ad') return true;
      var labels = unit.querySelectorAll(LABEL_NODES);
      for (var i = 0; i < labels.length && i < 12; i++) {
        if (looksSponsored(labels[i])) return true;
      }
      if (label === 'unknown') ctx.unsure();
      return false;
    },

    /* Facebook dropped the "Suggested for you" line. A post from a page or
     * person you do not follow now has a Follow button inside its title (Join,
     * for a group) — no text needed, so any language. Only the first title
     * counts: a friend sharing a page's post carries the page's title, with
     * its own Follow button, further down. */
    suggested: function (unit, rule, ctx) {
      var title = unit.querySelector('h4');
      if (title && title.querySelector('[role="button"]')) return true;
      return HEURISTICS.feedText(unit, rule, ctx);
    },

    /* "People you may know", "Your group suggestions" and the like are
     * carousels, not posts: no author title, and the same button (Add
     * friend, Join group) on every card. Counting repeated button text needs
     * no language. The Reels shelf has the same shape, so it is left to the
     * Reels rule. */
    recommendations: function (unit, rule, ctx) {
      if (!unit.querySelector('h4') && !unit.querySelector('a[href*="/reel/"]')) {
        var seen = {};
        var buttons = unit.querySelectorAll('[role="button"]');
        for (var i = 0; i < buttons.length; i++) {
          /* Every comment has its own Like and Reply. */
          if (buttons[i].closest('[role="article"]')) continue;
          var text = buttons[i].textContent.trim();
          /* Words only: equal counts ("1" comment, "1" share) are not cards. */
          if (text.length > 30 || !/\p{L}/u.test(text)) continue;
          if (seen[text]) return true;
          seen[text] = true;
        }
      }
      return HEURISTICS.feedText(unit, rule, ctx);
    },

    /* A Reels shelf is a feed unit full of /reel/ links. A post sharing one
     * reel goes too: the switch promises every reel. */
    reels: function (unit, rule, ctx) {
      if (unit.querySelector('a[href*="/reel/"], [aria-label^="Reel by"]')) return true;
      return HEURISTICS.feedText(unit, rule, ctx);
    },

    /* Section headers and "why am I seeing this" strings that identify a whole
     * class of unit. Matched against the unit's header only. */
    feedText: function (unit, rule, ctx) {
      var head = ctx.head();
      return phrasesOf(rule).some(function (p) {
        return head.indexOf(p) !== -1;
      });
    }
  };

  /* Heuristics that work on a container other than a feed unit, so they are
   * not part of the per-unit loop — but they still need the observer running. */
  var GLOBAL_JS = ['badges', 'rightAds', 'adSweep', 'postActions', 'feed'];

  /* Heuristics that work on a container other than a feed unit. */
  function runGlobalHeuristics(s) {
    if (s.presets.badges) stripBadges();
    if (s.presets.rightAds) hideSidebarAds();
    if (s.presets.adSweep) sweepAds(s);
    if (s.presets.postActions) hideActionBars();
    if (s.presets.feed) hideFeed();
  }

  /* The whole feed: the first box above the posts that holds more than a
   * couple of things — every post, plus the loading skeleton under them.
   * Hiding only the posts would leave that skeleton in view, and while it is
   * in view Facebook keeps fetching more posts. */
  function hideFeed() {
    /* The main column's posts, not a post open in a dialog. Whether the first
     * post is itself already hidden by another rule does not matter. */
    var post = document.querySelector('[role="main"] [aria-posinset]') || document.querySelector('[aria-posinset]');
    if (!post) return;
    var node = post;
    while (node.parentElement && node.parentElement.childElementCount < 3) node = node.parentElement;
    var feed = node.parentElement;
    if (!feed || feed === document.body || feed.matches('[role="main"], [role="main"] > *')) return;
    hide(feed, 'feed');
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
      if (node.querySelectorAll('div[role="article"], [aria-posinset]').length > 1) break;
      var r = node.getBoundingClientRect();
      if (r.height > viewportH * 0.85) break;
      best = node;
      if (r.height >= 90 && node.parentElement &&
          node.parentElement.childElementCount >= 3) break;
    }
    return best;
  }

  /* Judge a label once per settings generation. Labels that are still empty
   * are not stamped: Facebook often fills the text in a frame later. */
  function firstLook(el, mark) {
    if (el[mark] === generation) return false;
    if (!(el.textContent || '').trim()) return false;
    el[mark] = generation;
    return true;
  }

  /* Everything that is not the feed: stories, reels, marketplace, search,
   * watch, group listings. */
  function sweepAds(s) {
    var scope = document.querySelector('div[role="main"]') || document.body;
    var nodes = scope.querySelectorAll(LABEL_NODES + ',' + LABEL_REFS + ', a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      /* A verdict is kept per label, but an ad label is looked at again
       * every scan: Facebook can rebuild the card around the same label. */
      if (el.__bfxAdGen === generation && !el.__bfxIsAd) continue;
      if (el.__bfxAdGen !== generation) {
        var isAd;
        if (el.tagName === 'A' && isAdSlot(el)) {
          isAd = true;
        } else if (el.hasAttribute('aria-labelledby')) {
          /* A referenced label has no text of its own; judge it once the
           * text it points at exists. */
          var text = referencedText(el);
          if (!text) continue;
          isAd = AD_LABEL.test(text);
        } else {
          if (!(el.textContent || '').trim()) continue;
          isAd = el.tagName !== 'A' || el.matches(LABEL_NODES) ? looksSponsored(el) : false;
        }
        el.__bfxAdGen = generation;
        el.__bfxIsAd = isAd;
      }
      if (!el.__bfxIsAd) continue;
      /* The per-unit rule owns the feed and picks better containers there. */
      if (s.presets.sponsored && el.closest('div[role="feed"], div[data-pagelet^="FeedUnit"], [aria-posinset]')) continue;
      if (el.closest(HIDDEN)) continue;
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
        /* The red circle belongs to a screen-reader-hidden copy of the
         * button; hiding only the digits leaves an empty red dot behind. */
        var badge = el.closest('[aria-hidden="true"][role="button"]');
        var b = badge && badge.getBoundingClientRect();
        hide(b && b.width <= 40 && b.height <= 40 ? badge : el, 'badges');
      });
    }
    // "(3) Facebook" in the tab title pulls just as hard as the red dot.
    var clean = document.title.replace(/^\(\d+\+?\)\s*/, '');
    if (clean !== document.title) document.title = clean;
  }

  /* The Like / Comment / Share row is the smallest box around a post's Like
   * button that also holds a Comment button. A box with a second Like in it
   * has climbed past the row into the comments, which have Likes of their
   * own, so the walk stops there. Undecided rows (Comment not rendered yet)
   * are left unstamped and looked at again. */
  /* Facebook marks the buttons themselves, in every language; the English
   * labels are the fallback. The marker sits inside the labelled button, so a
   * labelled button only counts when it has no marker — otherwise every Like
   * would be counted twice. */
  var LIKE = '[data-ad-rendering-role="like_button"], ' +
    '[aria-label="Like"]:not(:has([data-ad-rendering-role="like_button"]))';
  var COMMENT = '[data-ad-rendering-role="comment_button"], [aria-label="Leave a comment"], [aria-label="Comment"]';

  function hideActionBars() {
    document.querySelectorAll(LIKE).forEach(function (like) {
      if (like.__bfxBarGen === generation || like.closest(HIDDEN)) return;
      var node = like.parentElement;
      for (var depth = 0; node && depth < 10; depth++, node = node.parentElement) {
        /* Past the row, or about to take the whole post with it. */
        if (node === document.body || node.matches(UNIT_SELECTOR) ||
            node.querySelectorAll(LIKE).length > 1) {
          like.__bfxBarGen = generation;
          return;
        }
        if (node.querySelector(COMMENT)) {
          like.__bfxBarGen = generation;
          hide(node, 'postActions');
          return;
        }
      }
    });
  }

  function hideSidebarAds() {
    document.querySelectorAll('div[role="complementary"] h3, div[role="complementary"] span[dir="auto"]')
      .forEach(function (el) {
        if (!firstLook(el, '__bfxSideGen')) return;
        if (!looksSponsored(el)) return;
        var section = climbTo(el, el.closest('div[role="complementary"]'), 10);
        hide(section, 'rightAds');
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

  /* Elements that changed since the last scan. Facebook renders a post in
   * pieces and empties posts that scroll away, then refills them, so a
   * verdict only holds until the post's content changes. */
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

  /* Facebook makes thousands of changes a frame while the feed renders, most
   * of them inside a handful of posts, so the post an element belongs to is
   * remembered on the element, and each changed post's text is measured
   * once per frame rather than once per change. */
  function unitOf(el) {
    if (el.__bfxUnit === undefined) el.__bfxUnit = el.closest(UNIT_SELECTOR);
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

  function scan() {
    pending = false;
    if (!state || !state.enabled) {
      dirty.clear();
      relabelled.clear();
      return;
    }

    if (jsRules.length || keywords.length) {
      invalidateChanged();
      var units = document.querySelectorAll(UNIT_SELECTOR);
      for (var i = 0; i < units.length; i++) {
        var unit = units[i];
        if (unit.__bfxGen === generation) continue;   // already judged this unit
        /* Facebook nests these containers. Once the outer one is hidden or
         * clicked open, the inner ones belong to it. */
        if (unit.closest(HIDDEN + ', [' + REVEALED + ']') ||
            /* A comment or a quoted share: the post around it is judged with
             * everything it contains, so judging it again only adds misfires. */
            (unit.parentElement && unit.parentElement.closest('[role="article"]')) ||
            /* A post opened in a dialog is one you asked to see. */
            unit.closest('[role="dialog"]')) {
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
          var fn = HEURISTICS[rule.js.kind];
          if (!fn) continue;
          try {
            if (fn(unit, rule.js, ctx)) {
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

    try {
      runGlobalHeuristics(state);
    } catch (e) { /* ignore */ }

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
    if (jsRules.length || keywords.length) return true;
    return GLOBAL_JS.some(function (id) { return s.presets[id]; });
  }

  /* ------------------------------------------------------------- stats -- */

  /* What each active rule matches on this page, for the popup. A rule that
   * matches nothing where you can still see its target is the usual sign that
   * Facebook changed underneath it. Effect-only rules (style, no css or js)
   * have nothing to count and are left out. */
  function stats() {
    var out = { presets: {}, custom: {}, keyword: 0 };
    if (!state || !state.enabled) return out;

    var tagged = {};
    document.querySelectorAll(HIDDEN).forEach(function (el) {
      var why = el.getAttribute(BY);
      (tagged[why] = tagged[why] || []).push(el);
    });

    PRESETS.forEach(function (rule) {
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
      out.presets[rule.id] = { count: seen.size, broken: broken };
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

  /* With the Reels rule on, a reel opened from a link, a notification or the
   * address bar sends you back to the feed instead of playing. */
  var REEL_PATH = /^\/reels?(\/|$)/;

  function redirectFor(s, loc) {
    if (!s || !s.enabled || !s.presets.reels) return null;
    if (!/(^|\.)facebook\.com$/.test(loc.hostname)) return null;
    return REEL_PATH.test(loc.pathname) ? '/' : null;
  }

  /* --------------------------------------------------------------- api -- */

  function apply(next) {
    state = next;
    generation++;

    jsRules = state.enabled
      ? PRESETS.filter(function (r) { return r.js && state.presets[r.id] && HEURISTICS[r.js.kind]; })
      : [];
    keywords = state.enabled && state.keywords.enabled ? compileKeywords(state.keywords.terms) : [];

    css = buildCss(state);
    styleEl().textContent = css;

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
    stats: stats,
    redirectFor: redirectFor,
    hiddenCount: function () {
      return document.querySelectorAll(HIDDEN).length;
    }
  };
})(typeof self !== 'undefined' ? self : this);
