/* Keyboard shortcuts and the toolbar badge. Everything else happens in the
 * content script; the worker stays asleep almost all of the time. */
importScripts('../common/storage.js');

var store = self.BFX_STORE;

function paintBadge(state) {
  chrome.action.setBadgeText({ text: state.enabled ? '' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: '#8a8d91' });
}

function activeFacebookTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.url) return null;
    return /^https?:\/\/([a-z0-9-]+\.)?(facebook|messenger)\.com\//.test(tab.url) ? tab : null;
  });
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle-picker') {
    activeFacebookTab().then(function (tab) {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { type: 'bfx:pick' }).catch(function () {
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

store.onChange(paintBadge);

chrome.runtime.onInstalled.addListener(function () {
  store.get().then(function (state) {
    return store.set(state).then(function () { paintBadge(state); });
  });
});

chrome.runtime.onStartup.addListener(function () {
  store.get().then(paintBadge);
});
