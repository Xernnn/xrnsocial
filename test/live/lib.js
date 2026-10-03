/* Helpers for checking the extension against the real, logged-in sites.
 *
 * These drive a Chrome for Testing window that a person launched and signed
 * into themselves (see CLAUDE.md, "Checking against live sites"); nothing
 * here handles credentials. Start the window with:
 *
 *   chrome --user-data-dir=<scratch dir> --remote-debugging-port=9333 \
 *     --load-extension=<repo> --disable-extensions-except=<repo>
 *
 * Every helper that changes settings restores the person's own afterwards.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.LIVE_PORT || 9333);
const APP = 'BlockDistractXrn';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The site list, read the way the extension reads it. */
function sites() {
  const sandbox = { self: {}, URL };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/common/sites.js'), 'utf8'), sandbox);
  return sandbox.self.BFX_SITES;
}

async function connect() {
  return puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null, protocolTimeout: 120000 });
}

/* The tab on a site (opening one at `url` when there is none). */
async function tabFor(browser, siteId, url) {
  const S = sites();
  const pages = await browser.pages();
  let page = pages.find(p => S.forUrl(p.url()) === siteId);
  if (!page) {
    page = await browser.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  return page;
}

/* A minimized or hidden window renders nothing and ignores input. */
async function ensureVisible(page) {
  const c = await page.createCDPSession();
  const { windowId, bounds } = await c.send('Browser.getWindowForTarget');
  if (bounds.windowState === 'minimized') {
    await c.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  }
  await page.bringToFront();
  await sleep(400);
}

/* Evaluate in the extension's content-script world on the page, where
 * BFX_ENGINE and BFX_STORE live. */
async function contentWorld(page) {
  const client = await page.createCDPSession();
  const contexts = [];
  client.on('Runtime.executionContextCreated', e => contexts.push(e.context));
  await client.send('Runtime.enable');
  await sleep(300);
  for (const c of contexts.filter(c => /BlockFB|BlockDistractXrn/.test(c.name)).reverse()) {
    const r = await client.send('Runtime.evaluate', { contextId: c.id, expression: 'typeof BFX_STORE', returnByValue: true }).catch(() => null);
    if (r && r.result && r.result.value === 'object') {
      return async expr => {
        const res = await client.send('Runtime.evaluate', { contextId: c.id, expression: expr, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception && res.exceptionDetails.exception.description));
        return res.result.value;
      };
    }
  }
  throw new Error('extension content script not found on ' + page.url());
}

/* Run fn with the person's settings saved, and put them back afterwards. */
async function withSettingsRestored(page, fn) {
  const run = await contentWorld(page);
  const saved = await run('BFX_STORE.get().then(function (s) { return JSON.stringify(s); })');
  try {
    return await fn();
  } finally {
    const again = await contentWorld(page).catch(() => run);
    await again(`BFX_STORE.set(${saved}).then(function () { return 1; })`);
  }
}

/* Reload the unpacked extension so code edits take effect. developerPrivate
 * reload and chrome.runtime.reload() leave a command-line-loaded extension
 * disabled; switching it off and on re-reads the files from disk. */
async function reloadExtension(browser) {
  const tab = await browser.newPage();
  await tab.goto('chrome://extensions/');
  await sleep(500);
  const ok = await tab.evaluate(name => new Promise(res => chrome.management.getAll(list => {
    const ext = list.find(e => e.name === name || /BlockFB/.test(e.name));
    if (!ext) return res(false);
    chrome.management.setEnabled(ext.id, false, () => setTimeout(() => chrome.management.setEnabled(ext.id, true, () => res(ext.id)), 300));
  })), APP);
  await sleep(1000);
  await tab.close();
  return ok;
}

/* Signed in, judged by each site's session cookie. */
async function logins(browser) {
  const page = (await browser.pages())[0];
  const c = await page.createCDPSession();
  const { cookies } = await c.send('Storage.getCookies');
  const has = (domain, names) => cookies.some(k => k.domain.endsWith(domain) && names.includes(k.name));
  return {
    facebook: has('facebook.com', ['c_user']),
    reddit: has('reddit.com', ['reddit_session']),
    x: has('x.com', ['auth_token']),
    linkedin: has('linkedin.com', ['li_at']),
    instagram: has('instagram.com', ['sessionid']),
    tiktok: has('tiktok.com', ['sessionid', 'sid_tt']),
    twitch: has('twitch.tv', ['auth-token'])
  };
}

/* Trusted wheel scrolling: sites ignore synthetic scrollBy for loading more. */
async function scroll(page, steps, dy, pause) {
  await page.mouse.move(700, 450);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: dy || 800 }).catch(() => {});
    await sleep(pause || 1000);
  }
}

module.exports = { ROOT, sleep, sites, connect, tabFor, ensureVisible, contentWorld, withSettingsRestored, reloadExtension, logins, scroll };
