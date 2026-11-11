/* Point-and-click element picker.
 *
 * The hard part is not the overlay, it is producing a selector that still
 * matches tomorrow. Facebook's and Instagram's class names are generated per
 * build (x1n2onr6, xdt5ytf ...) and React ids look like ":r7:", so both are
 * poison. We build selectors out of the attributes sites cannot churn
 * without breaking their own accessibility and instrumentation, plus the
 * hooks each site pack vouches for.
 */
(function (root) {
  'use strict';

  var MAX_BROAD_MATCHES = 30;
  var active = false;
  var ui = null;
  var target = null;      // element currently under the cursor (after climbing)
  var hovered = null;     // raw element under the cursor
  var climb = 0;          // how many parents up from `hovered`
  var useBroad = true;
  var onDone = null;
  var touch = false;      // choosing by finger: a tap selects, the bar has buttons
  var finger = false;     // the press under way is a finger's, not a mouse's
  var watcher = 0;        // keeps a finger's selection in step with the page

  /* ------------------------------------------------- selector building -- */

  /* Generated per build (x1n2onr6), or put on nearly every element of its
   * kind (html-div, html-h3): neither identifies anything. */
  var GENERATED_CLASS = /^(x[a-z0-9]{4,}|_[a-z0-9]{3,}|css-[a-z0-9]+|html-[a-z0-9]+)$/i;
  var GENERATED_ID = /[:\d]|^r[0-9a-f]{4,}$/;

  /* CSS.escape is everywhere Chrome is, but guard it so the module also runs
   * in a bare DOM (tests, older embedders). */
  var escapeIdent = (root.CSS && root.CSS.escape)
    ? root.CSS.escape.bind(root.CSS)
    : function (s) { return String(s).replace(/([^\w-])/g, '\\$1'); };

  function cssString(value) {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  /* Neither Facebook's generated classes nor our own markers: a rule keyed on
   * bfx-hidden would match everything already hidden, not the thing picked.
   * A site styled with utility classes (Reddit's block, relative, px-md)
   * turns classes off in its pack: they say how a thing looks, not what it
   * is. A pack can also pass a pattern of the classes it trusts. */
  function stableClasses(el) {
    var s = site();
    var rule = s && s.picker && s.picker.classes;
    if (rule === false) return [];
    return Array.prototype.filter.call(el.classList, function (c) {
      /* A pack may instead say which classes are its own (Twitch's BEM). */
      if (rule && rule.test && !rule.test(c)) return false;
      return !GENERATED_CLASS.test(c) && c.indexOf('bfx-') !== 0;
    });
  }

  /* Selectors that name what a thing is, so matching every one of them is
   * the point ("every post's title"), however many there are. */
  var SEMANTIC = {};

  function isCustom(tag) {
    return tag.indexOf('-') > 0;
  }

  /* Selectors for one element, best first. */
  function candidates(el) {
    var tag = el.tagName.toLowerCase();
    var out = [];
    var attr = function (name) { return el.getAttribute(name); };
    var semantic = function (sel) { SEMANTIC[sel] = true; out.push(sel); };

    /* Not data-visualcompletion: its values (ignore, ignore-dynamic,
     * css-img ...) are shared by hundreds of unrelated elements. */
    if (attr('data-focus-target')) out.push('[data-focus-target=' + cssString(attr('data-focus-target')) + ']');
    if (attr('data-pagelet')) out.push('[data-pagelet=' + cssString(attr('data-pagelet')) + ']');
    if (attr('data-testid')) out.push('[data-testid=' + cssString(attr('data-testid')) + ']');
    /* Hook attributes a pack vouches for (Twitch's data-a-target). */
    var own = (site() && site().picker && site().picker.attrs) || [];
    own.forEach(function (name) {
      if (attr(name)) out.push('[' + name + '=' + cssString(attr(name)) + ']');
    });
    /* A long label is content ("Sent at 16:53, sam: hello"), not a name. */
    if (attr('aria-label') && attr('aria-label').length <= 40 && !/\d{1,2}:\d{2}/.test(attr('aria-label'))) {
      var label = '[aria-label=' + cssString(attr('aria-label')) + ']';
      if (attr('role')) out.push(tag + '[role=' + cssString(attr('role')) + ']' + label);
      out.push(tag + label);
      out.push(label);
    }
    /* Sites built from custom elements name their parts: the element's own
     * tag (shreddit-comment-tree), or the slot a part fills in its host
     * (shreddit-post > [slot="title"]). A pack lists its generic wrappers:
     * `keys` says which attribute tells one use of a wrapper from another
     * (faceplate-partial name="RecentPosts_x7Yz"), `generic` the tags that
     * mean nothing on their own (faceplate-number). */
    var hints = (site() && site().picker) || {};
    var parent = el.parentElement;
    if (attr('slot') && parent && isCustom(parent.tagName.toLowerCase())) {
      semantic(parent.tagName.toLowerCase() + ' > [slot=' + cssString(attr('slot')) + ']');
    }
    var key = hints.keys && hints.keys[tag];
    if (key && attr(key)) {
      /* Names carry a per-build hash after the last underscore. */
      var value = attr(key);
      var hashed = /^(.+_)[A-Za-z0-9-]{4,8}$/.exec(value);
      semantic(tag + '[' + key + (hashed ? '^=' + cssString(hashed[1]) : '=' + cssString(value)) + ']');
    } else if (isCustom(tag) && !key && !/^bfx-/.test(tag) && !(hints.generic && hints.generic.test(tag))) {
      semantic(tag);
    }
    if (tag === 'a' && attr('href') && attr('href').charAt(0) === '/') {
      var path = attr('href').split('?')[0];
      if (path.length > 1 && path.length < 40) out.push('a[href^=' + cssString(path) + ']');
    }
    if (el.id && !GENERATED_ID.test(el.id)) out.push('#' + escapeIdent(el.id));
    stableClasses(el).slice(0, 2).forEach(function (c) {
      out.push(tag + '.' + escapeIdent(c));
    });
    /* A button or link with nothing of its own but a labelled icon is named
     * by the icon (Instagram's Save: div[role="button"]:has(svg[aria-label="Save"])).
     * Icons only: an image's alt text is content — someone's name. */
    var control = /^(button|link|menuitem|tab|switch|checkbox)$/.test(attr('role') || '');
    var icons = control && !attr('aria-label') ? el.querySelectorAll('svg[aria-label]') : [];
    if (icons.length === 1) {
      out.push(tag + '[role=' + cssString(attr('role')) + ']:has(svg[aria-label=' + cssString(icons[0].getAttribute('aria-label')) + '])');
    }
    if (attr('role')) out.push(tag + '[role=' + cssString(attr('role')) + ']');
    return out;
  }

  function matches(sel) {
    try {
      return document.querySelectorAll(sel);
    } catch (e) {
      return [];
    }
  }

  function nthChild(el) {
    var i = 1;
    var sib = el;
    while ((sib = sib.previousElementSibling)) i++;
    return el.tagName.toLowerCase() + ':nth-child(' + i + ')';
  }

  /* A rule for something outside the posts must not reach into them or
   * swallow them: on X, the trends list and the timeline are both
   * section[role="region"]; on Instagram, the stories tray and a post's
   * photo carousel are both a ul in a role="presentation" box. */
  function swallowsFeed(el, list, sel) {
    var s = site();
    if (!s || !s.units) return false;
    if (el.closest(s.units) || el.querySelector(s.units)) return false;
    return Array.prototype.some.call(list, function (e) {
      if (e.querySelector(s.units) || e.matches(s.units)) return true;
      /* A named part (Reddit's suggestion slot) is the same thing inside a
       * post as outside one; anything else stays out of posts. */
      return !SEMANTIC[sel] && !!e.closest(s.units);
    });
  }

  /* A selector keyed on stable attributes. May legitimately match siblings —
   * "hide every Like button" is usually what a person means. */
  function broadSelector(el) {
    var own = candidates(el);
    for (var i = 0; i < own.length; i++) {
      var list = matches(own[i]);
      if (list.length && Array.prototype.indexOf.call(list, el) !== -1 &&
          (list.length <= MAX_BROAD_MATCHES || SEMANTIC[own[i]]) && !swallowsFeed(el, list, own[i])) {
        return own[i];
      }
    }
    /* Nothing usable on the element itself: anchor it to the nearest ancestor
     * that does have a stable hook, and describe the way down structurally. */
    var node = el;
    var tail = [];
    for (var depth = 0; depth < 6 && node.parentElement; depth++) {
      tail.unshift(nthChild(node));
      node = node.parentElement;
      var anchors = candidates(node);
      for (var j = 0; j < anchors.length; j++) {
        var sel = anchors[j] + ' > ' + tail.join(' > ');
        var found = matches(sel);
        if (found.length && found.length <= MAX_BROAD_MATCHES &&
            Array.prototype.indexOf.call(found, el) !== -1 && !swallowsFeed(el, found, sel)) return sel;
      }
    }
    return null;
  }

  /* Last resort: a structural path, from the nearest ancestor that a stable
   * hook pins down to exactly one element, or else from <body>. Precise, and
   * fragile by nature — fine for chrome, useless for anything Facebook
   * re-renders. */
  function exactSelector(el) {
    var parts = [];
    var node = el;
    while (node && node !== document.body && parts.length < 40) {
      parts.unshift(nthChild(node));
      node = node.parentElement;
      if (!node || node === document.body) break;
      var anchors = candidates(node);
      for (var j = 0; j < anchors.length; j++) {
        if (matches(anchors[j]).length === 1) return anchors[j] + ' > ' + parts.join(' > ');
      }
    }
    return 'body > ' + parts.join(' > ');
  }

  /* The site this page is on, for what a post is and who wrote it. */
  function site() {
    return root.BFX_ENGINE && root.BFX_ENGINE.site;
  }

  function isPost(el) {
    var s = site();
    return !!(s && s.units && el.matches(s.units));
  }

  /* A feed post is rebuilt and renumbered as you scroll, so no selector for
   * it survives. Picking one means "posts from this author", which each site
   * pack works out from its own markup. */
  function authorOf(post) {
    var s = site();
    return s && s.picker && s.picker.authorOf ? s.picker.authorOf(post, cssString) : null;
  }

  function buildSelector(el) {
    if (isPost(el)) {
      var author = authorOf(el);
      if (author) {
        var posts = matches(author.selector);
        return {
          selector: author.selector,
          broad: author.selector,
          exact: author.selector,
          author: author.name,
          alike: 0,
          count: posts.length,
          valid: Array.prototype.indexOf.call(posts, el) !== -1
        };
      }
    }
    var broad = broadSelector(el);
    var exact = exactSelector(el);
    var chosen = useBroad && broad ? broad : (broad || exact);
    if (!useBroad) chosen = exact;
    var list = matches(chosen);
    return {
      selector: chosen,
      broad: broad,
      exact: exact,
      alike: broad ? matches(broad).length : 0,
      count: list.length,
      valid: Array.prototype.indexOf.call(list, el) !== -1
    };
  }

  /* The words a person sees first, spaced: textContent runs them together
   * ("Ch. 480Speedstar") and takes in scripts. */
  function firstWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var words = '';
    while (words.length < 40 && walker.nextNode()) {
      var text = walker.currentNode.nodeValue.trim();
      if (text && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(walker.currentNode.parentNode.nodeName)) {
        words += (words ? ' ' : '') + text;
      }
    }
    return words.replace(/\s+/g, ' ').slice(0, 40);
  }

  var KINDS = { img: 'Picture', picture: 'Picture', video: 'Video', svg: 'Icon', a: 'Link', button: 'Button' };

  function describe(el) {
    if (isPost(el)) {
      var author = authorOf(el);
      if (author) return 'Posts from ' + (author.name.length > 32 ? author.name.slice(0, 31) + '…' : author.name);
    }
    var label = el.getAttribute('aria-label') || el.getAttribute('data-pagelet') || firstWords(el);
    if (!label) label = KINDS[el.tagName.toLowerCase()] || 'This part';
    return label.length > 44 ? label.slice(0, 43) + '…' : label;
  }

  /* --------------------------------------------------------------- ui -- */

  function buildUi() {
    var host = document.createElement('div');
    host.className = 'bfx-picker-root';
    host.innerHTML =
      '<div class="bfx-box"></div>' +
      '<div class="bfx-bar">' +
        '<div class="bfx-bar-main">' +
          '<span class="bfx-dot"></span>' +
          '<span class="bfx-name"></span>' +
          '<code class="bfx-sel"></code>' +
        '</div>' +
        '<div class="bfx-bar-hint">' +
          '<b>click</b> hide &nbsp; <b>↑↓</b> select parent / child &nbsp; ' +
          '<b>a</b> <span class="bfx-mode"></span> &nbsp; <b>esc</b> cancel' +
        '</div>' +
        '<div class="bfx-warn"></div>' +
        '<div class="bfx-touch">' +
          '<div class="bfx-row bfx-adjust">' +
            '<button class="bfx-btn" type="button" data-act="smaller">Smaller</button>' +
            '<button class="bfx-btn" type="button" data-act="bigger">Bigger</button>' +
            '<button class="bfx-btn" type="button" data-act="mode"></button>' +
          '</div>' +
          '<div class="bfx-row">' +
            '<button class="bfx-btn" type="button" data-act="cancel">Cancel</button>' +
            '<button class="bfx-btn bfx-btn-hide" type="button" data-act="hide">Hide</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(host);
    LISTEN.concat(TOUCHES).forEach(function (type) { host.addEventListener(type, onBar); });
    var act = function (name) { return host.querySelector('[data-act="' + name + '"]'); };
    return {
      host: host,
      bar: host.querySelector('.bfx-bar'),
      box: host.querySelector('.bfx-box'),
      name: host.querySelector('.bfx-name'),
      sel: host.querySelector('.bfx-sel'),
      mode: host.querySelector('.bfx-mode'),
      warn: host.querySelector('.bfx-warn'),
      adjust: host.querySelector('.bfx-adjust'),
      smaller: act('smaller'),
      bigger: act('bigger'),
      modeButton: act('mode'),
      hide: act('hide')
    };
  }

  /* Building a selector runs document-wide queries, and paint() runs on every
   * mouse move and scroll; only rebuild when the target or the mode changes. */
  var cache = { target: null, broad: null, built: null };

  function builtFor(el) {
    if (cache.target !== el || cache.broad !== useBroad) {
      cache = { target: el, broad: useBroad, built: buildSelector(el) };
    }
    return cache.built;
  }

  /* The bar's own buttons, for what a finger has selected. */
  function paintButtons(built) {
    ui.adjust.hidden = !built;
    ui.hide.hidden = !built;
    if (built) {
      ui.host.setAttribute('data-bfx-chosen', '');
      ui.smaller.disabled = climb === 0;
      ui.bigger.disabled = !canGrow(target);
      ui.hide.disabled = !built.valid || !built.selector;
      ui.modeButton.hidden = built.alike < 2;
      ui.modeButton.textContent = useBroad ? 'All ' + built.alike : 'Only this';
    } else {
      ui.host.removeAttribute('data-bfx-chosen');
      ui.box.removeAttribute('style');
      ui.name.textContent = 'Tap what you want to hide';
      ui.warn.textContent = '';
      ui.warn.dataset.level = '';
    }
  }

  function paint() {
    if (!ui) return;
    /* No pointer will come along to replace a selection the page has since
     * thrown away (a carousel's next slide). */
    if (touch && target && !target.isConnected) target = hovered = null;
    if (touch) paintButtons(target ? builtFor(target) : null);
    if (!target) return;
    var rect = boxOf(target);
    var box = ui.box.style;
    box.top = rect.top + 'px';
    box.left = rect.left + 'px';
    box.width = rect.width + 'px';
    box.height = rect.height + 'px';

    var built = builtFor(target);
    ui.name.textContent = describe(target);
    ui.sel.textContent = built.selector || '(no stable selector)';
    ui.mode.textContent = built.author
      ? 'every post from ' + built.author
      : useBroad ? 'all ' + built.count + ' like it' : 'only this one';

    var inFeed = !!(site() && site().units && target.closest(site().units));
    if (!built.valid) {
      ui.warn.textContent = 'No selector matches this element — ' + (touch ? 'tap Bigger.' : 'try ↑ for its parent.');
      ui.warn.dataset.level = 'bad';
    } else if (built.author) {
      ui.warn.textContent = 'Hides every post from ' + built.author + ', wherever it shows up.';
      ui.warn.dataset.level = 'info';
    } else if (inFeed && !built.broad) {
      var info = root.BFX_SITES && root.BFX_SITES.info(site().id);
      ui.warn.textContent = 'This lives inside the feed, which ' + (info ? info.name : 'the site') +
        ' rebuilds constantly. A keyword block will outlast this rule.';
      ui.warn.dataset.level = 'warn';
    } else if (built.count > 8) {
      ui.warn.textContent = 'Hides ' + built.count + ' elements on this page.' + (touch ? '' : ' Press a to narrow it to one.');
      ui.warn.dataset.level = 'warn';
    } else {
      ui.warn.textContent = '';
      ui.warn.dataset.level = '';
    }
  }

  function canGrow(el) {
    var parent = el.parentElement;
    return !!parent && parent !== document.body && parent !== document.documentElement;
  }

  function resolveTarget() {
    var node = hovered;
    var steps = 0;
    while (node && steps < climb && canGrow(node)) {
      node = node.parentElement;
      steps++;
    }
    climb = steps;
    target = node;
  }

  function step(by) {
    climb = Math.max(0, climb + by);
    resolveTarget();
  }

  function grow(by) {
    step(by);
    paint();
  }

  /* An element with no box of its own (LinkedIn's posts are display: contents)
   * is seen as what it holds. */
  function boxOf(el) {
    var rect = el.getBoundingClientRect();
    for (var child = el.firstElementChild; child && !rect.width && !rect.height; child = child.firstElementChild) {
      rect = child.getBoundingClientRect();
    }
    return rect;
  }

  function sameBox(a, b) {
    var x = boxOf(a);
    var y = boxOf(b);
    return Math.abs(x.width - y.width) < 2 && Math.abs(x.height - y.height) < 2;
  }

  /* One press goes to a box that looks different. Most elements are wrappers
   * the size of what they hold, and a button that changes nothing on screen
   * looks broken. Going down it carries on through the wrappers of the box it
   * lands on, so Smaller greys out with the last press that showed anything. */
  function resize(by) {
    var from = target;
    var last;
    do {
      last = target;
      step(by);
    } while (target !== last && sameBox(target, from));
    while (by < 0 && climb > 0) {
      last = target;
      step(-1);
      if (!sameBox(target, last)) {
        step(1);
        break;
      }
    }
    paint();
    placeBar();
  }

  /* The bar sits at the bottom, where a finger reaches it, unless that covers
   * most of what is selected: MangaDex's prompt and Instagram's menu are
   * fixed to the bottom of the screen. */
  function placeBar() {
    ui.host.removeAttribute('data-bfx-top');
    if (!target) return;
    var rect = boxOf(target);
    var top = Math.max(rect.top, 0);
    var bottom = Math.min(rect.bottom, window.innerHeight);
    var covered = bottom - Math.max(top, ui.bar.getBoundingClientRect().top);
    if (covered * 2 > bottom - top) ui.host.setAttribute('data-bfx-top', '');
  }

  /* From a finger's selection down to what it touched is what Smaller walks,
   * so a tap in a post starts from the post: the one choice that lasts (see
   * authorOf), and on Reddit the only way past the invisible link stretched
   * over each post, which a tap would otherwise take on all of them. */
  function stepsToPost(el) {
    var s = site();
    var post = s && s.units && el.closest(s.units);
    if (!post || !authorOf(post)) return 0;
    var steps = 0;
    for (var node = el; node !== post; node = node.parentElement) steps++;
    return steps;
  }

  function select(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return;
    hovered = el;
    climb = stepsToPost(el);
    resolveTarget();
    paint();
    placeBar();
  }

  function useTouch() {
    if (touch) return;
    touch = true;
    ui.host.setAttribute('data-bfx-touch', '');
    watcher = setInterval(paint, 400);
    paint();
  }

  /* ---------------------------------------------------------- events -- */

  /* Only what the person does counts. The page's own scripts can make up
   * events (a mousemove over the thing of its choosing, then a click or an
   * Enter, or a click on Hide) and have a rule saved that the person never
   * picked; the browser marks those untrusted. */

  function onMove(e) {
    if (!e.isTrusted) return;
    var el = e.target;
    if (!el || el.nodeType !== 1 || (ui && ui.host.contains(el))) return;
    if (el !== hovered) {
      hovered = el;
      climb = 0;
    }
    resolveTarget();
    paint();
  }

  function onKey(e) {
    if (!active || !e.isTrusted) return;
    if (e.key === 'Escape') { stop(); }
    else if (e.key === 'ArrowUp') { grow(1); }
    else if (e.key === 'ArrowDown') { grow(-1); }
    else if (e.key === 'a' || e.key === 'A') { useBroad = !useBroad; paint(); }
    else if (e.key === 'Enter') { confirm(); }
    else { return; }
    e.preventDefault();
    e.stopPropagation();
  }

  /* A mouse has already told onMove what it is over when it clicks. Cancelling
   * pointerdown stops the mouse events a tap would have made, so a finger only
   * ever arrives here. A long press ends with no click at all. */
  function swallow(e) {
    if (ui && ui.host.contains(e.target)) return;
    if (!e.isTrusted) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.type === 'pointerdown') {
      finger = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (finger) useTouch();
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'click') {
      if (finger) select(e.target);
      else confirm();
    } else if (e.type === 'contextmenu' && finger) {
      select(e.target);
    }
  }

  /* Stopped, never cancelled: that would end the scroll and the tap's click.
   * Some sites act on these rather than on the click. */
  function hush(e) {
    if (!ui || !ui.host.contains(e.target)) e.stopPropagation();
  }

  /* The page gets none of what happens on the bar. */
  function onBar(e) {
    e.stopPropagation();
    if (e.type !== 'click' || !e.isTrusted) return;
    var button = e.target.closest('[data-act]');
    var act = button && !button.disabled ? button.getAttribute('data-act') : '';
    if (act === 'smaller' || act === 'bigger') {
      resize(act === 'bigger' ? 1 : -1);
    } else if (act === 'mode') {
      useBroad = !useBroad;
      paint();
    } else if (act === 'cancel') {
      stop();
    } else if (act === 'hide') {
      confirm();
    }
  }

  function confirm() {
    if (!target) return;
    var built = buildSelector(target);
    if (!built.valid || !built.selector) return;
    var rule = {
      id: root.BFX_STORE.newId(),
      selector: built.selector,
      label: describe(target),
      scope: 'all',
      path: location.pathname,
      enabled: true,
      createdAt: Date.now()
    };
    stop();
    var siteId = site().id;
    root.BFX_STORE.update(function (s) {
      root.BFX_STORE.site(s, siteId).custom.push(rule);
      return s;
    }).then(function () {
      toast('Hidden “' + rule.label + '” — undo from the xrnsocial popup');
      if (onDone) onDone(rule);
    });
  }

  /* The toast names what was just hidden ("Posts from Dana"), which is not
   * the site's business: its words sit in a closed shadow root, which the
   * page's scripts cannot open. The box itself is styled as before. */
  function toast(text) {
    var el = document.createElement('div');
    el.className = 'bfx-toast';
    el.attachShadow({ mode: 'closed' }).textContent = text;
    document.documentElement.appendChild(el);
    setTimeout(function () { el.classList.add('bfx-toast-out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3100);
  }

  var LISTEN = ['mousedown', 'mouseup', 'click', 'contextmenu', 'pointerdown', 'pointerup', 'auxclick'];
  var TOUCHES = ['touchstart', 'touchend'];

  function start(cb) {
    if (active) { stop(); return; }
    active = true;
    onDone = cb || null;
    climb = 0;
    finger = false;
    ui = buildUi();
    document.documentElement.setAttribute('data-bfx-picking', '');
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    LISTEN.forEach(function (type) { document.addEventListener(type, swallow, true); });
    TOUCHES.forEach(function (type) { document.addEventListener(type, hush, true); });
    window.addEventListener('scroll', paint, true);
    if (root.matchMedia && root.matchMedia('(pointer: coarse)').matches) useTouch();
  }

  function stop() {
    if (!active) return;
    active = false;
    document.documentElement.removeAttribute('data-bfx-picking');
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('keydown', onKey, true);
    LISTEN.forEach(function (type) { document.removeEventListener(type, swallow, true); });
    TOUCHES.forEach(function (type) { document.removeEventListener(type, hush, true); });
    window.removeEventListener('scroll', paint, true);
    clearInterval(watcher);
    touch = false;
    if (ui) ui.host.remove();
    ui = null;
    target = hovered = null;
    cache = { target: null, broad: null, built: null };
  }

  root.BFX_PICKER = {
    start: start,
    selectorFor: buildSelector,   /* exported for tests */
    stop: stop,
    toast: toast,
    isActive: function () { return active; }
  };
})(typeof self !== 'undefined' ? self : this);
