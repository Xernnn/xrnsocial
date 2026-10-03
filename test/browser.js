/* Real-browser test: loads the unpacked extension into Chrome and serves
 * fixture pages at https://www.facebook.com/, so the content scripts inject
 * exactly as they do on the real site. This is where :has() selectors, the
 * real cascade, storage-driven updates, the popup and the options page get
 * checked — the things jsdom cannot do. Run with `npm run test:browser`.
 *
 * Needs Chrome for Testing or Chromium; branded Chrome ignores unpacked
 * extensions from the command line. Set CHROME_PATH, or have one in the
 * Playwright or Puppeteer cache.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');
let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks++;
  if (condition) {
    console.log('  ✓ ' + label);
  } else {
    failures++;
    console.log('  ✗ ' + label + (detail ? '  — ' + detail : ''));
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const caches = [
    [path.join(os.homedir(), '.cache/ms-playwright'), /^chromium-\d+$/, 'chrome-linux64/chrome'],
    [path.join(os.homedir(), '.cache/ms-playwright'), /^chromium-\d+$/, 'chrome-linux/chrome'],
    [path.join(os.homedir(), '.cache/puppeteer/chrome'), /^linux64-/, 'chrome-linux64/chrome']
  ];
  for (const [dir, pattern, exe] of caches) {
    if (!fs.existsSync(dir)) continue;
    const found = fs.readdirSync(dir).filter(d => pattern.test(d)).sort().reverse()
      .map(d => path.join(dir, d, exe)).find(p => fs.existsSync(p));
    if (found) return found;
  }
  return null;
}

/* The preset list, read the same way the extension reads it. */
function loadPresets() {
  const sandbox = { self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/common/presets.js'), 'utf8'), sandbox);
  return sandbox.self.BFX_PRESETS;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch (e) { /* page mid-navigation */ }
    await sleep(50);
  }
  return false;
}

(async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.log('No Chrome for Testing or Chromium found. Install one with\n' +
      '  npx @puppeteer/browsers install chrome@stable\n' +
      'or point CHROME_PATH at a Chromium binary.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    enableExtensions: [root],
    args: ['--no-first-run', '--no-default-browser-check']
  });

  try {
    const swTarget = await browser.waitForTarget(
      t => t.type() === 'service_worker' && t.url().endsWith('src/background/service-worker.js'),
      { timeout: 10000 });
    const sw = await swTarget.worker();
    const extId = new URL(swTarget.url()).host;
    const setState = fn => sw.evaluate(`self.BFX_STORE.update(${fn})`);
    const resetState = () => sw.evaluate('self.BFX_STORE.set(self.BFX_STORE.merge(null))');

    /* Every facebook.com document comes from `served`; nothing else is fetched. */
    let served = fs.readFileSync(path.join(fixtures, 'feed.html'), 'utf8');
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (/(^|\.)facebook\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: served });
      } else if (url.protocol === 'http:' || url.protocol === 'https:') {
        req.abort();
      } else {
        req.continue();
      }
    });
    page.on('dialog', d => d.accept());

    /* Gone from the page: display:none on the element or any ancestor. */
    const isHidden = id => page.evaluate(i => {
      const el = document.getElementById(i);
      return !!el && !el.checkVisibility();
    }, id);
    const load = async () => {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#bfx-style');
    };
    const only = async (...ids) => {
      await setState(`s => { Object.keys(s.presets).forEach(k => { s.presets[k] = false; }); ${ids.map(id => `s.presets.${id} = true;`).join(' ')} }`);
    };

    /* ---------------------------------------------------------- selectors -- */
    console.log('\nselectors in real Chrome');
    await resetState();
    await load();
    const presets = loadPresets();
    const rejected = await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), presets.flatMap(r => r.css || []));
    ok('every preset selector parses', rejected.length === 0, rejected.join(' | '));

    /* ----------------------------------------------------------- defaults -- */
    console.log('\ndefault settings, on Facebook as of October 2026');
    ok('an ad marked by the word joiner is hidden', await until(() => isHidden('u-ad')));
    ok('an ad marked only by its "Ad" label is hidden', await isHidden('u-ad-label'));
    ok('an issue ad saying "Sponsored" is hidden', await isHidden('u-issue'));
    ok('an ordinary post stays', !(await isHidden('u-organic')));
    ok('a post with Follow in its title is hidden', await isHidden('u-sug'));
    ok('a friend sharing a page post stays', !(await isHidden('u-shared')));
    ok('people you may know is hidden', await isHidden('u-pymk'));
    ok('group suggestions are hidden', await isHidden('u-groups'));
    ok('the Reels shelf is hidden', await isHidden('u-reels'));
    ok('the Reels tab is hidden', await isHidden('nav-reels'));
    ok('a post opened in a dialog stays', !(await isHidden('dialog-post')));
    ok('the whole unread badge is hidden', await until(() => isHidden('badge')));
    ok('the tab title count is stripped', await until(async () => (await page.title()) === 'Facebook'));
    ok('the sidebar ad is hidden', await until(() => isHidden('side-ad')));
    ok('Stories (off by default) are visible', !(await isHidden('stories')));

    ok('a link that merely starts with a word joiner is not an ad', !(await isHidden('u-pasted')));
    ok('Marketplace ad tiles go, one card each', await until(() => isHidden('mp-ad')) && await isHidden('mp-ad2') &&
      !(await isHidden('mp-1')) && !(await isHidden('mp-2')) && !(await isHidden('mp-grid')));
    await page.evaluate(() => { document.getElementById('u-ad').className = 'x1n2onr6 x1ja2u2z'; });
    ok('a React-style class rewrite does not bring an ad back', await isHidden('u-ad'));
    await page.evaluate(() => {
      document.getElementById('u-ad').removeAttribute('data-bfx-hidden-by');
      document.getElementById('bfx-style').remove();
      document.getElementById('feedbox').appendChild(document.createElement('div'));
    });
    ok('a stripped marker and a removed stylesheet both come back', await until(() => isHidden('u-ad')) &&
      await page.evaluate(() => !!document.getElementById('bfx-style')));

    await page.evaluate(() => document.getElementById('late-ref').setAttribute('aria-labelledby', 'lbl-ad'));
    ok('an ad whose label arrives later is hidden then', await until(() => isHidden('u-ad-late')));
    await page.evaluate(() => {
      document.getElementById('u-shell').innerHTML =
        '<h4><a role="link" href="/x">Late Page</a><div role="button"><span>Follow</span></div></h4>Filled in';
    });
    ok('an empty shell is judged once it is filled', await until(() => isHidden('u-shell')));

    /* --------------------------------------------------------- live update -- */
    console.log('\nsettings changes reach open tabs');
    await setState('s => { s.presets.stories = true; }');
    ok('turning Stories on hides them without a reload', await until(() => isHidden('stories')));
    await setState('s => { s.enabled = false; }');
    ok('pausing brings the ad back', await until(async () => !(await isHidden('u-ad'))));
    await setState('s => { s.enabled = true; }');

    /* -------------------------------------------------------- each switch -- */
    console.log('\nevery other switch, one at a time');
    const cases = [
      ['postActions', 'the Like / Comment / Share row', ['bar'], ['u-organic']],
      ['counts', 'the counts and reaction icons', ['like-count', 'reactions'], ['bar']],
      ['media', 'the photo album', ['album'], ['u-organic']],
      ['comments', 'comments and the comment box', ['comment', 'comment-box'], ['dialog-post']],
      ['composer', 'the composer', ['composer'], []],
      ['search', 'the search box', ['searchbox'], []],
      ['messengerIcon', 'the Messenger button ("Messenger, 1 unread")', ['messenger'], []],
      ['notifications', 'the bell ("Notifications, 3 unread")', ['bell'], []],
      ['contacts', 'the contacts list', ['contacts'], ['side-section']],
      ['activeNow', 'the online dot', ['dot'], ['contacts']],
      ['chatTabs', 'the chat head', ['chathead'], []],
      ['metaAi', 'Meta AI in the left menu and the contacts', ['meta-ai-row', 'meta-ai-contact'], ['friends-row', 'contacts']],
      ['videoPosts', 'every post with a video, whole post, reels too', ['u-video', 'u-reels'], ['u-organic', 'u-kw', 'dialog-post']],
      ['reactionsOnPosts', 'a post shown because a friend was tagged', ['u-tagged'], ['u-organic']],
      ['feed', 'the box around the posts, skeleton included', ['feedbox', 'loading'], ['stories', 'composer']]
    ];
    for (const [id, what, gone, kept] of cases) {
      await only(id);
      const hid = await until(async () => {
        for (const g of gone) if (!(await isHidden(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of kept) if (await isHidden(k)) keeps = false;
      ok(`${id}: hides ${what}` + (kept.length ? ', keeps the rest' : ''), hid && keeps,
        `hidden: ${JSON.stringify(await Promise.all(gone.concat(kept).map(async x => x + '=' + await isHidden(x))))}`);
    }

    /* Black & white with blur: grey everywhere and for good; blur lifts on hover. */
    await only('grayscale', 'blurFeed');
    await page.mouse.move(5, 5);
    const fx = () => page.evaluate(() => ({
      page: getComputedStyle(document.documentElement).filter,
      post: getComputedStyle(document.getElementById('u-organic')).filter
    }));
    const still = await until(async () => /grayscale/.test((await fx()).page));
    const idle = await fx();
    const box = await page.evaluate(() => { const r = document.getElementById('u-organic').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
    await page.mouse.move(box.x, box.y); await sleep(300);
    const hovered = await fx();
    ok('black & white greys the whole page, and blur blurs the posts', still && /blur/.test(idle.post), JSON.stringify(idle));
    ok('hovering a post lifts the blur but keeps it grey', hovered.post === 'none' && /grayscale/.test(hovered.page), JSON.stringify(hovered));
    await page.mouse.move(5, 5);
    await resetState();

    /* --------------------------------------------------------- rule health -- */
    console.log('\nrule health over messaging');
    const fbTab = await sw.evaluate(() =>
      chrome.tabs.query({ url: '*://www.facebook.com/*' }).then(t => t[0] && t[0].id));
    /* Right after a settings change the tab rescans on its next frame; ask
     * until the counts reflect it. */
    let status = null;
    await until(async () => {
      status = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'bfx:status' }), fbTab);
      return status && status.stats && status.stats.presets.sponsored && status.stats.presets.sponsored.count >= 1;
    });
    ok('the tab answers with per-rule counts', status && status.ok && status.stats &&
      status.stats.presets.sponsored.count >= 1, JSON.stringify(status && status.stats && status.stats.presets));
    ok('the suggested rule reports what it hid', status.stats.presets.suggested.count >= 1);

    /* -------------------------------------------------------- placeholders -- */
    console.log('\nplaceholders in the real cascade');
    await setState('s => { s.keywords = { enabled: true, terms: ["crypto"] }; s.placeholders = true; }');
    ok('a word-blocked post shows a bar instead of vanishing', await until(() => page.evaluate(() => {
      const el = document.getElementById('u-kw');
      return el.hasAttribute('data-bfx-note') && getComputedStyle(el).display === 'block';
    })));
    ok('the bar names the word', /word: crypto/.test(await page.evaluate(() =>
      getComputedStyle(document.getElementById('u-kw'), '::before').content)));
    ok('the post itself stays hidden behind it', await page.evaluate(() =>
      getComputedStyle(document.querySelector('#u-kw h4')).display === 'none'));
    await page.click('#u-kw');
    ok('clicking the bar shows the post', await until(() => page.evaluate(() =>
      getComputedStyle(document.querySelector('#u-kw h4')).display !== 'none')));

    /* ---------------------------------------------------------- reel pages -- */
    console.log('\nreel pages');
    await resetState();
    await page.goto('https://www.facebook.com/reel/123456/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    ok('opening a reel lands on the home feed', await until(() => new URL(page.url()).pathname === '/', 5000),
      'stayed on ' + page.url());
    await setState('s => { s.presets.reels = false; }');
    await page.goto('https://www.facebook.com/reel/123456/', { waitUntil: 'domcontentloaded' });
    await sleep(500);
    ok('with the Reels rule off, the reel stays open', new URL(page.url()).pathname === '/reel/123456/', page.url());

    /* --------------------------------------------------------------- popup -- */
    console.log('\npopup');
    await resetState();
    const errors = [];
    const popup = await browser.newPage();
    popup.on('pageerror', e => errors.push(e.message));
    await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    ok('every preset gets a row', await until(async () =>
      (await popup.$$eval('#presets .row', rows => rows.length)) === presets.length));
    ok('the status line counts active rules', /^\d+ rules active$/.test(
      await popup.$eval('#status', n => n.textContent)), await popup.$eval('#status', n => n.textContent));
    await sw.evaluate('self.BFX_STORE.update(s => { s.enabled = false; s.presets.stories = true; })');
    ok('a change made elsewhere shows up in the open popup', await until(async () =>
      (await popup.$eval('#status', n => n.textContent)).startsWith('paused')));
    await popup.click('#master');
    ok('switching in the popup keeps the other change', await until(() =>
      sw.evaluate('self.BFX_STORE.get().then(s => s.enabled && s.presets.stories)')));
    ok('no script errors', errors.length === 0, errors.join(' | '));
    await popup.close();

    /* ------------------------------------------------------ backup/restore -- */
    console.log('\nbackup and restore');
    const options = await browser.newPage();
    options.on('pageerror', e => errors.push(e.message));
    options.on('dialog', d => d.accept());
    await options.goto(`chrome-extension://${extId}/src/options/options.html`);
    ok('the page shows current settings', await until(async () =>
      /blocks? on/.test(await options.$eval('#current', n => n.textContent))));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blockfb-'));
    const backupFile = path.join(tmp, 'backup.json');
    fs.writeFileSync(backupFile, JSON.stringify({
      app: 'BlockFB', version: 1,
      settings: {
        enabled: true,
        presets: { stories: true, reels: false },
        custom: [
          { id: 'r1', selector: '[aria-label="Marketplace"]', label: 'Marketplace', scope: 'all', enabled: true },
          { id: 'r2', selector: 'x{}body{background:red}', label: 'evil', scope: 'all', enabled: true }
        ],
        keywords: { enabled: true, terms: ['crypto'] }
      }
    }));
    const input = await options.$('#file');
    await input.uploadFile(backupFile);
    ok('a chosen file is previewed before anything changes', await until(async () =>
      /This backup has/.test(await options.$eval('#preview', n => n.textContent))));
    ok('the invalid picked rule is called out', /1 picked rule will be skipped/.test(
      await options.$eval('#preview', n => n.textContent)));
    await options.click('#restore');
    const restored = await (async () => {
      await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.custom.length === 1)'));
      return sw.evaluate('self.BFX_STORE.get()');
    })();
    ok('restoring replaces the settings', restored.presets.stories === true && restored.presets.reels === false &&
      restored.custom.length === 1 && restored.keywords.terms[0] === 'crypto', JSON.stringify(restored));
    ok('no script errors', errors.length === 0, errors.join(' | '));
    fs.rmSync(tmp, { recursive: true, force: true });

    /* ----------------------------------------------------------- snapshots -- */
    console.log('\nsaved Facebook pages (test/fixtures/snapshots)');
    const snapDir = path.join(fixtures, 'snapshots');
    const snaps = fs.readdirSync(snapDir).filter(f => f.endsWith('.html'));
    if (!snaps.length) console.log('  - none saved; see test/fixtures/snapshots/README.md');
    await resetState();
    for (const file of snaps) {
      // Facebook's own scripts would try to boot and fetch; the DOM is enough.
      served = fs.readFileSync(path.join(snapDir, file), 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
      await load();
      await sleep(800);
      const adCss = presets.find(r => r.id === 'sponsored').css.join(',');
      const feed = await page.evaluate(adCss => {
        const units = Array.from(document.querySelectorAll('div[role="feed"] > div, div[aria-posinset]'))
          .filter(el => el.textContent.trim().length > 40);
        const byAds = units.filter(el => {
          const tagged = el.closest('[data-bfx-hidden-by]');
          return !!el.closest(adCss) ||
            (!!tagged && /^(sponsored|adSweep)$/.test(tagged.getAttribute('data-bfx-hidden-by')));
        });
        return { units: units.length, byAds: byAds.length };
      }, adCss);
      ok(`${file}: ad rules hide ${feed.byAds} of ${feed.units} feed posts, not most of them`,
        feed.units === 0 || feed.byAds <= feed.units / 2);
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : checks + ' checks passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
