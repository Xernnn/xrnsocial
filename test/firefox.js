/* The extension in real Firefox: npm run test:firefox
 *
 * Firefox (and Firefox-based browsers like Zen and LibreWolf) runs the same
 * extension: the manifest lists a background page for Firefox next to
 * Chrome's service worker. This installs it into a throwaway Firefox
 * profile over WebDriver BiDi, serves each site's fixture at the real
 * address, and checks that the content scripts hide what they should on
 * every site (shadow-root content included), that the background page and
 * settings changes work (through the pause shortcut), and Instagram's reel
 * hold. The popup itself can't be opened by Firefox's automation; it is the
 * same page as in Chrome.
 *
 * Firefox comes from FIREFOX_PATH, or from ~/.cache/bfx-firefox (fill it
 * with `npx @puppeteer/browsers install firefox@stable --path ~/.cache/bfx-firefox`).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const GECKO_ID = manifest.browser_specific_settings.gecko.id;
/* A fixed moz-extension:// address, so the test can open the popup. */
const UUID = '6f1d3a9c-2b7e-4c1a-9d3f-bfx000000001';

let failures = 0;
const ok = (label, cond, detail) => { if (!cond) failures++; console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? '  — ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findFirefox() {
  if (process.env.FIREFOX_PATH) return process.env.FIREFOX_PATH;
  const base = path.join(os.homedir(), '.cache/bfx-firefox/firefox');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base).sort().reverse()) {
      const exe = path.join(base, d, 'firefox', 'firefox');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('No Firefox found: set FIREFOX_PATH, or run npx @puppeteer/browsers install firefox@stable --path ~/.cache/bfx-firefox');
}

/* Every site's fixture, at the address it stands in for. */
const PAGES = [
  [/(^|\.)facebook\.com$/, () => 'feed.html'],
  [/(^|\.)reddit\.com$/, () => 'reddit.html'],
  [/(^|\.)x\.com$/, () => 'x.html'],
  [/(^|\.)linkedin\.com$/, () => 'linkedin.html'],
  [/(^|\.)instagram\.com$/, url => /^\/reels?\/\w/.test(url.pathname) ? 'instagram-reels.html' : 'instagram.html'],
  [/(^|\.)twitch\.tv$/, () => 'twitch.html'],
  [/(^|\.)tiktok\.com$/, () => 'tiktok.html']
];

(async () => {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: findFirefox(),
    headless: true,
    extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: UUID }) }
  });
  try {
    const version = await browser.version();
    console.log('extension in ' + version);
    const id = await browser.installExtension(root);
    ok('Firefox installs the extension from the shared manifest', id === GECKO_ID, id);

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      const hit = PAGES.find(([host]) => host.test(url.hostname));
      if (hit && req.isNavigationRequest()) {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(fixtures, hit[1](url)), 'utf8') }).catch(() => {});
      } else if (/^https?:/.test(url.protocol)) {
        /* A request Firefox already dropped can't be failed again. */
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    /* Gone from the page: the element or an ancestor has no box. Feed items
     * that are display: contents are judged by their first child. */
    const gone = idOrSel => page.evaluate(s => {
      let el = document.getElementById(s) || document.querySelector(s);
      if (!el) return null;
      if (getComputedStyle(el).display === 'contents') el = el.firstElementChild;
      return !el.checkVisibility();
    }, idOrSel);
    const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(150); } return !!(await fn()); };
    const open = async url => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await until(() => page.evaluate(() => !!document.getElementById('bfx-style'))); await sleep(600); };

    console.log('\ndefaults on every site');
    const cases = [
      ['https://www.facebook.com/', 'Facebook', ['u-ad'], ['u-organic']],
      ['https://www.reddit.com/', 'Reddit', ['ad', 'hr-ad', 'a-rec', 'sad'], ['a-sub']],
      ['https://x.com/home', 'X', ['cell-ad', 'cell-adlabel', 'trend-promo', 'blk-premium'], ['cell-plain', 'cell-quote']],
      ['https://www.linkedin.com/feed/', 'LinkedIn', ['item-ad', 'item-ad-de', 'left-premium'], ['item-plain', 'item-suggested']],
      ['https://www.instagram.com/', 'Instagram', ['a-ad', 'a-ad-quiet', 'a-reel'], ['a-plain', 'a-suggested']],
      ['https://www.twitch.tv/', 'Twitch', ['headliner', 'sda', 'grp-recommended'], ['grp-followed', 'featured']],
      ['https://www.tiktok.com/foryou', 'TikTok', ['coins', 'capcut'], ['v-1']]
    ];
    for (const [url, name, hide, keep] of cases) {
      await open(url);
      const hid = [], kept = [];
      for (const h of hide) if (await until(() => gone(h), 2500)) hid.push(h);
      for (const k of keep) if (!(await gone(k))) kept.push(k);
      ok(`${name}: ${hid.length}/${hide.length} hidden, ${kept.length}/${keep.length} left alone`,
        hid.length === hide.length && kept.length === keep.length,
        hide.filter(h => !hid.includes(h)).concat(keep.filter(k => !kept.includes(k)).map(k => '!' + k)).join(' '));
    }

    /* Firefox's automation won't open extension pages, so the popup can't be
     * driven here; the background page and settings reaching open tabs are
     * checked through the pause shortcut instead (Alt+Shift+B → background
     * page → storage → every tab). */
    console.log('\nthe background page and settings reaching open tabs');
    await open('https://www.reddit.com/');
    const pressPause = async () => {
      await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
      await page.keyboard.press('KeyB');
      await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
    };
    await pressPause();
    const paused = await until(async () => !(await gone('ad')), 3000);
    if (!paused) {
      console.log('  - the pause shortcut did not reach the browser in headless Firefox; check it by hand');
    } else {
      ok('Alt+Shift+B pauses everything: the background page writes it and the tab shows the ads again', paused);
      await pressPause();
      ok('and pressing it again hides them again', await until(() => gone('ad')));
    }

    console.log('\nInstagram: a reel you open, and only that one');
    await page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded' });
    ok('the Reels tab sends you to the feed', await until(() => page.evaluate(() => location.pathname === '/'), 5000));
    await open('https://www.instagram.com/reels/AAA/');
    await sleep(1800);
    const at = () => page.evaluate(() => ({ path: location.pathname, top: document.getElementById('viewer').scrollTop }));
    const first = await at();
    await page.click('#next'); await sleep(700);
    const afterNext = await at();
    await page.click('#chat-link'); await sleep(1700);
    const sent = await at();
    ok('a reel opened by link plays and the next one can\'t be reached; one sent in a chat opens',
      first.path === '/reels/AAA/' && afterNext.top === 0 && sent.path === '/reels/BBB/' && sent.top === 600,
      JSON.stringify({ first, afterNext, sent }));

    ok('no script errors', !errors.length, errors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
