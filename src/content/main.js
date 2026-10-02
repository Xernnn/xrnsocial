/* Bootstrap: load state, apply it, and keep applying it as Facebook navigates. */
(function (root) {
  'use strict';

  var store = root.BFX_STORE;
  var engine = root.BFX_ENGINE;
  var picker = root.BFX_PICKER;

  store.get().then(function (state) {
    engine.apply(state);
  });

  store.onChange(function (state) {
    engine.apply(state);
  });

  /* Facebook is a single-page app: the path changes with no page load, which
   * matters for custom rules scoped to one page. Patching history.pushState
   * would not help — a content script runs in its own JS world and never sees
   * the page's own calls — so watch the URL instead. Once a second, one string
   * comparison. */
  var lastPath = location.pathname;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
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
