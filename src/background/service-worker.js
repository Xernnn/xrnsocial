/* Keyboard shortcuts, the toolbar badge, and the stylesheets of picked rules.
 * Everything else happens in the content script; the worker stays asleep
 * almost all of the time.
 *
 * Chrome runs this as a service worker and needs importScripts. Firefox runs
 * it as a background page, with sites.js and storage.js listed before it in
 * the manifest, and has no importScripts there. */
if (typeof importScripts === 'function' && !self.BFX_STORE) {
  importScripts('../common/sites.js', '../common/storage.js');
}

/* Promise-returning calls: Firefox's browser.*, Chrome's chrome.*. */
var ext = (typeof browser !== 'undefined' && browser.tabs) ? browser : chrome;
var store = self.BFX_STORE;

function paintBadge(state) {
  chrome.action.setBadgeText({ text: state.enabled ? '' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: '#8a8d91' });
}

/* The active tab, when it is on one of the supported sites. */
function activeSiteTab() {
  return ext.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    var tab = tabs && tabs[0];
    return tab && tab.url && self.BFX_SITES.forUrl(tab.url) ? tab : null;
  });
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle-picker') {
    activeSiteTab().then(function (tab) {
      if (!tab) return;
      ext.tabs.sendMessage(tab.id, { type: 'bfx:pick' }).catch(function () {
        /* content script not injected yet (tab predates the install) */
      });
    });
    return;
  }
  if (command === 'toggle-master') {
    store.update(function (s) {
      s.enabled = !s.enabled;
      return s;
    }).then(paintBadge);
  }
});

/* Picked rules arrive from a tab's content script, one stylesheet each, to go
 * in where the page's scripts cannot read them: an injected sheet is in
 * neither the DOM nor document.styleSheets. As user styles, their !important
 * also beats anything the site sets. Chrome names the document that asked,
 * so a sheet never lands on the page the tab has moved on to; Firefox names
 * the frame. New sheets go in before old ones come out, so nothing flashes. */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'bfx:css' || !sender.tab) return false;
  var target = { tabId: sender.tab.id };
  if (sender.documentId) target.documentIds = [sender.documentId];
  else target.frameIds = [sender.frameId || 0];
  var each = function (list, fn) {
    return Promise.all((list || []).map(function (css) {
      return fn({ target: target, css: String(css), origin: 'USER' });
    }));
  };
  /* Chrome stacks a sheet inserted twice, and one removal then leaves a copy:
   * a sheet sent again (its answer lost on the way back) first comes out. */
  var add = function (sheet) {
    return ext.scripting.removeCSS(sheet).then(function () { return ext.scripting.insertCSS(sheet); });
  };
  var remove = function (sheet) {
    return ext.scripting.removeCSS(sheet);
  };
  each(msg.add, add).then(function () {
    return each(msg.remove, remove);
  }).then(function () {
    sendResponse({ ok: true });
  }, function (e) {
    sendResponse({ ok: false, error: String(e && e.message || e) });
  });
  return true;
});

store.onChange(paintBadge);

chrome.runtime.onInstalled.addListener(function () {
  store.get().then(function (state) {
    return store.set(state).then(function () { paintBadge(state); });
  });
});

chrome.runtime.onStartup.addListener(function () {
  store.get().then(paintBadge);
});
