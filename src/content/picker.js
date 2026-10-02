/* Point-and-click element picker.
 *
 * The hard part is not the overlay, it is producing a selector that still
 * matches tomorrow. Facebook's class names are generated per build
 * (x1n2onr6, xdt5ytf ...) and its React ids look like ":r7:", so both are
 * poison. We build selectors out of the attributes Facebook cannot churn
 * without breaking its own accessibility and instrumentation.
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

  /* ------------------------------------------------- selector building -- */

  var GENERATED_CLASS = /^(x[a-z0-9]{4,}|_[a-z0-9]{3,}|css-[a-z0-9]+)$/i;
  var GENERATED_ID = /[:\d]|^r[0-9a-f]{4,}$/;

  /* CSS.escape is everywhere Chrome is, but guard it so the module also runs
   * in a bare DOM (tests, older embedders). */
  var escapeIdent = (root.CSS && root.CSS.escape)
    ? root.CSS.escape.bind(root.CSS)
    : function (s) { return String(s).replace(/([^\w-])/g, '\\$1'); };

  function cssString(value) {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function stableClasses(el) {
    return Array.prototype.filter.call(el.classList, function (c) {
      return !GENERATED_CLASS.test(c);
    });
  }

  /* Selectors for one element, best first. */
  function candidates(el) {
    var tag = el.tagName.toLowerCase();
    var out = [];
    var attr = function (name) { return el.getAttribute(name); };

    if (attr('data-pagelet')) out.push('[data-pagelet=' + cssString(attr('data-pagelet')) + ']');
    if (attr('data-testid')) out.push('[data-testid=' + cssString(attr('data-testid')) + ']');
    if (attr('data-visualcompletion')) {
      out.push(tag + '[data-visualcompletion=' + cssString(attr('data-visualcompletion')) + ']');
    }
    if (attr('aria-label')) {
      var label = '[aria-label=' + cssString(attr('aria-label')) + ']';
      if (attr('role')) out.push(tag + '[role=' + cssString(attr('role')) + ']' + label);
      out.push(tag + label);
      out.push(label);
    }
    if (tag === 'a' && attr('href') && attr('href').charAt(0) === '/') {
      var path = attr('href').split('?')[0];
      if (path.length > 1 && path.length < 40) out.push('a[href^=' + cssString(path) + ']');
    }
    if (el.id && !GENERATED_ID.test(el.id)) out.push('#' + escapeIdent(el.id));
    stableClasses(el).slice(0, 2).forEach(function (c) {
      out.push(tag + '.' + escapeIdent(c));
    });
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

  /* A selector keyed on stable attributes. May legitimately match siblings —
   * "hide every Like button" is usually what a person means. */
  function broadSelector(el) {
    var own = candidates(el);
    for (var i = 0; i < own.length; i++) {
      var list = matches(own[i]);
      if (list.length && Array.prototype.indexOf.call(list, el) !== -1 && list.length <= MAX_BROAD_MATCHES) {
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
        if (found.length && Array.prototype.indexOf.call(found, el) !== -1) return sel;
      }
    }
    return null;
  }

  /* Last resort: a structural path from <body>. Precise, and fragile by
   * nature — fine for chrome, useless for anything Facebook re-renders. */
  function exactSelector(el) {
    var parts = [];
    var node = el;
    while (node && node !== document.body && parts.length < 12) {
      parts.unshift(nthChild(node));
      node = node.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  function buildSelector(el) {
    var broad = broadSelector(el);
    var exact = exactSelector(el);
    var chosen = useBroad && broad ? broad : (broad || exact);
    if (!useBroad) chosen = exact;
    var list = matches(chosen);
    return {
      selector: chosen,
      broad: broad,
      exact: exact,
      count: list.length,
      valid: Array.prototype.indexOf.call(list, el) !== -1
    };
  }

  function describe(el) {
    var label = el.getAttribute('aria-label') || el.getAttribute('data-pagelet') || '';
    if (!label) label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!label) label = el.tagName.toLowerCase();
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
      '</div>';
    document.documentElement.appendChild(host);
    return {
      host: host,
      box: host.querySelector('.bfx-box'),
      name: host.querySelector('.bfx-name'),
      sel: host.querySelector('.bfx-sel'),
      mode: host.querySelector('.bfx-mode'),
      warn: host.querySelector('.bfx-warn')
    };
  }

  function paint() {
    if (!target || !ui) return;
    var rect = target.getBoundingClientRect();
    var box = ui.box.style;
    box.top = rect.top + 'px';
    box.left = rect.left + 'px';
    box.width = rect.width + 'px';
    box.height = rect.height + 'px';

    var built = buildSelector(target);
    ui.name.textContent = describe(target);
    ui.sel.textContent = built.selector || '(no stable selector)';
    ui.mode.textContent = useBroad
      ? 'all ' + built.count + ' like it'
      : 'only this one';

    var inFeed = !!target.closest('div[role="feed"], div[data-pagelet^="FeedUnit"]');
    if (!built.valid) {
      ui.warn.textContent = 'No selector matches this element — try ↑ for its parent.';
      ui.warn.dataset.level = 'bad';
    } else if (inFeed && !built.broad) {
      ui.warn.textContent = 'This lives inside the feed, which Facebook rebuilds constantly. ' +
        'A keyword block will outlast this rule.';
      ui.warn.dataset.level = 'warn';
    } else if (built.count > 8) {
      ui.warn.textContent = 'Hides ' + built.count + ' elements on this page. Press a to narrow it to one.';
      ui.warn.dataset.level = 'warn';
    } else {
      ui.warn.textContent = '';
      ui.warn.dataset.level = '';
    }
  }

  function resolveTarget() {
    var node = hovered;
    for (var i = 0; i < climb && node && node.parentElement && node.parentElement !== document.body; i++) {
      node = node.parentElement;
    }
    target = node;
  }

  /* ---------------------------------------------------------- events -- */

  function onMove(e) {
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
    if (!active) return;
    if (e.key === 'Escape') { stop(); }
    else if (e.key === 'ArrowUp') { climb++; resolveTarget(); paint(); }
    else if (e.key === 'ArrowDown') { climb = Math.max(0, climb - 1); resolveTarget(); paint(); }
    else if (e.key === 'a' || e.key === 'A') { useBroad = !useBroad; paint(); }
    else if (e.key === 'Enter') { confirm(); }
    else { return; }
    e.preventDefault();
    e.stopPropagation();
  }

  function swallow(e) {
    if (ui && ui.host.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'click') confirm();
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
    root.BFX_STORE.update(function (s) {
      s.custom.push(rule);
      return s;
    }).then(function () {
      toast('Hidden “' + rule.label + '” — undo from the BlockFB popup');
      if (onDone) onDone(rule);
    });
  }

  function toast(text) {
    var el = document.createElement('div');
    el.className = 'bfx-toast';
    el.textContent = text;
    document.documentElement.appendChild(el);
    setTimeout(function () { el.classList.add('bfx-toast-out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3100);
  }

  var LISTEN = ['mousedown', 'mouseup', 'click', 'contextmenu', 'pointerdown', 'pointerup', 'auxclick'];

  function start(cb) {
    if (active) { stop(); return; }
    active = true;
    onDone = cb || null;
    climb = 0;
    ui = buildUi();
    document.documentElement.classList.add('bfx-picking');
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    LISTEN.forEach(function (type) { document.addEventListener(type, swallow, true); });
    window.addEventListener('scroll', paint, true);
  }

  function stop() {
    if (!active) return;
    active = false;
    document.documentElement.classList.remove('bfx-picking');
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('keydown', onKey, true);
    LISTEN.forEach(function (type) { document.removeEventListener(type, swallow, true); });
    window.removeEventListener('scroll', paint, true);
    if (ui) ui.host.remove();
    ui = null;
    target = hovered = null;
  }

  root.BFX_PICKER = {
    start: start,
    selectorFor: buildSelector,   /* exported for tests */
    stop: stop,
    toast: toast,
    isActive: function () { return active; }
  };
})(typeof self !== 'undefined' ? self : this);
