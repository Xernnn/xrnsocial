/* Bootstrap: load state, apply it, and keep applying it as Facebook navigates. */
(function (root) {
  'use strict';

  var store = root.BFX_STORE;
  var engine = root.BFX_ENGINE;
  var picker = root.BFX_PICKER;

  var current = null;

  function applyState(state) {
    current = state;
    engine.apply(state);
    guardRoute();
  }

  /* Pages that are blocked outright rather than trimmed. On a page load this
   * runs as soon as settings are read, early in parsing; on in-app navigation,
   * within a second, from the route watcher below. */
  function guardRoute() {
    var to = engine.redirectFor(current, location);
    if (to) location.replace(to);
  }

  store.get().then(applyState);
  store.onChange(applyState);

  /* Facebook is a single-page app: the path changes with no page load, which
   * matters for custom rules scoped to one page. Patching history.pushState
   * would not help — a content script runs in its own JS world and never sees
   * the page's own calls — so watch the URL instead. Once a second, one string
   * comparison. */
  var lastPath = location.pathname;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    guardRoute();
    engine.refresh();
  }
  setInterval(onRoute, 1000);
  window.addEventListener('popstate', function () { setTimeout(onRoute, 0); });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    switch (msg && msg.type) {
      case 'bfx:pick':
        picker.start();
        sendResponse({ ok: true });
        break;
      case 'bfx:stopPick':
        picker.stop();
        sendResponse({ ok: true });
        break;
      case 'bfx:status':
        sendResponse({
          ok: true,
          hidden: engine.hiddenCount(),
          stats: engine.stats(),
          picking: picker.isActive(),
          path: location.pathname
        });
        break;
      case 'bfx:rescan':
        engine.refresh();
        sendResponse({ ok: true });
        break;
      default:
        return false;
    }
    return true;
  });
})(typeof self !== 'undefined' ? self : this);
