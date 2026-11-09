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
function loadPresets(siteId) {
  const sandbox = { self: {} };
  for (const file of ['src/common/sites.js', 'src/sites/facebook.js', 'src/sites/reddit.js', 'src/sites/x.js', 'src/sites/linkedin.js', 'src/sites/instagram.js', 'src/sites/twitch.js', 'src/sites/tiktok.js', 'src/sites/pixiv.js', 'src/sites/mangadex.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  }
  return sandbox.self.BFX_SITES.get(siteId || 'facebook').presets;
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

    /* Every facebook.com document comes from `served`, every reddit.com one
     * from the Reddit fixture; nothing else is fetched. */
    let served = fs.readFileSync(path.join(fixtures, 'feed.html'), 'utf8');
    const redditDoc = fs.readFileSync(path.join(fixtures, 'reddit.html'), 'utf8');
    const xDoc = fs.readFileSync(path.join(fixtures, 'x.html'), 'utf8');
    const linkedinDoc = fs.readFileSync(path.join(fixtures, 'linkedin.html'), 'utf8');
    const instagramDoc = fs.readFileSync(path.join(fixtures, 'instagram.html'), 'utf8');
    const instagramReelsDoc = fs.readFileSync(path.join(fixtures, 'instagram-reels.html'), 'utf8');
    const twitchDoc = fs.readFileSync(path.join(fixtures, 'twitch.html'), 'utf8');
    const tiktokDoc = fs.readFileSync(path.join(fixtures, 'tiktok.html'), 'utf8');
    const pixivDoc = fs.readFileSync(path.join(fixtures, 'pixiv.html'), 'utf8');
    const mangadexDoc = fs.readFileSync(path.join(fixtures, 'mangadex.html'), 'utf8');
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (/(^|\.)facebook\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: served });
      } else if (/(^|\.)reddit\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: redditDoc });
      } else if (/(^|\.)x\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: xDoc });
      } else if (/(^|\.)linkedin\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: linkedinDoc });
      } else if (/(^|\.)instagram\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: /^\/reels?\/\w/.test(url.pathname) ? instagramReelsDoc : instagramDoc });
      } else if (/(^|\.)twitch\.tv$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: twitchDoc });
      } else if (/(^|\.)tiktok\.com$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: tiktokDoc });
      } else if (/(^|\.)pixiv\.net$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: pixivDoc });
      } else if (/(^|\.)mangadex\.org$/.test(url.hostname) && req.resourceType() === 'document') {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: mangadexDoc });
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
      await setState(`s => { const p = s.sites.facebook.presets; ${JSON.stringify(presets.map(r => r.id))}.forEach(k => { p[k] = false; }); ${ids.map(id => `p.${id} = true;`).join(' ')} }`);
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
    await setState('s => { s.sites.facebook.presets.stories = true; }');
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
    const bar = await page.evaluate(() => getComputedStyle(document.getElementById('u-kw'), '::before').content);
    ok('the bar says a word was blocked, never which: the site can read it', /a word you blocked/.test(bar) && !/crypto/i.test(bar), bar);
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
    await setState('s => { s.sites.facebook.presets.reels = false; }');
    await page.goto('https://www.facebook.com/reel/123456/', { waitUntil: 'domcontentloaded' });
    await sleep(500);
    ok('with the Reels rule off, the reel stays open', new URL(page.url()).pathname === '/reel/123456/', page.url());

    /* --------------------------------------------------------------- popup -- */
    console.log('\npopup');
    await resetState();
    const errors = [];
    const popup = await browser.newPage();
    popup.on('pageerror', e => errors.push(e.message));
    popup.on('dialog', d => d.accept());
    await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    const fbNow = () => sw.evaluate('self.BFX_STORE.get().then(s => s.sites.facebook)');
    const iconOf = () => popup.$eval('#siteIcon', n => n.getAttribute('src'));
    const groupNames = [...new Set(presets.map(r => r.group))];
    ok('every group gets a row', await until(async () =>
      (await popup.$$eval('#groups .group', rows => rows.length)) === groupNames.length));
    let rulesShown = 0;
    for (const name of groupNames) {
      await popup.click(`.group[data-group="${name}"] .group-main`);
      rulesShown += await popup.$$eval('#groups .rule', rows => rows.length);
    }
    ok('opening each group in turn shows every preset once, one group at a time', rulesShown === presets.length, rulesShown + ' of ' + presets.length);
    await popup.click(`.group[data-group="${groupNames[groupNames.length - 1]}"] .group-main`);
    ok('opening a group twice closes it', (await popup.$$eval('#groups .rule', rows => rows.length)) === 0);
    ok('a group shows one tick for each of its switches', (await popup.$$eval('.group[data-group="Ads"] .tick', t => t.length)) ===
      presets.filter(r => r.group === 'Ads').length);
    ok('the hero counts what is on, away from a site', /^\d+$/.test(await popup.$eval('#tallyNum', n => n.textContent)) &&
      await popup.$eval('#tallyWord', n => n.textContent) === 'on');
    ok('a site being worked on wears the xrnsocial icon', (await iconOf()) === 'sites/facebook-on.svg', await iconOf());
    ok('the pick button waits for a site', await popup.$eval('#pick', b => b.disabled && /Open a site/.test(b.textContent)));

    await sw.evaluate('self.BFX_STORE.update(s => { s.enabled = false; s.sites.facebook.presets.stories = true; })');
    ok('a change made elsewhere shows up in the open popup', await until(async () =>
      (await popup.$eval('#tallyWord', n => n.textContent)) === 'Paused'));
    ok('paused, the site gets its own logo back', (await iconOf()) === 'sites/facebook-off.svg', await iconOf());
    ok('paused, Resume replaces the site switch', await popup.$eval('#resume', b => !b.hidden) && await popup.$eval('#siteSwitch', b => b.hidden));
    await popup.click('#resume');
    ok('switching in the popup keeps the other change', await until(() =>
      sw.evaluate('self.BFX_STORE.get().then(s => s.enabled && s.sites.facebook.presets.stories)')));

    await popup.click('#siteButton');
    const names = await popup.$$eval('#sites .cell', c => c.map(x => x.dataset.site));
    ok('the popup offers each site that has rules', names.length === 9 && names[0] === 'facebook', JSON.stringify(names));
    const brokenIcons = await popup.evaluate(ids => Promise.all(ids.flatMap(id => ['on', 'off'].map(state => new Promise(done => {
      const img = new Image();
      img.onload = () => done(img.naturalWidth ? null : id + '-' + state);
      img.onerror = () => done(id + '-' + state);
      img.src = 'sites/' + id + '-' + state + '.svg';
    })))).then(list => list.filter(Boolean)), names);
    ok('every site icon draws, on and off', brokenIcons.length === 0, brokenIcons.join(', '));
    await popup.click('#paused');
    ok('Pause all sites stops everything', await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.enabled === false)')));
    ok('and every logo goes back to normal', await popup.$$eval('#sites img', list => list.every(i => /-off\.svg$/.test(i.getAttribute('src')))));
    await popup.click('#paused');
    await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.enabled)'));
    await popup.click('#sites .cell[data-site="reddit"]');
    ok('choosing a site goes home and shows it', await popup.$eval('#siteName', n => n.textContent) === 'Reddit' &&
      await popup.$eval('[data-view="home"]', v => v.classList.contains('is-on')));
    await popup.click('#siteButton');
    await popup.click('#sites .cell[data-site="facebook"]');

    await popup.click('#siteEnabled');
    ok('the per-site switch turns off only that site', await until(() =>
      sw.evaluate('self.BFX_STORE.get().then(s => s.enabled && s.sites.facebook.enabled === false)')));
    ok("and that site's pages stop hiding things", await until(async () => !(await isHidden('u-ad'))));
    ok('and the site gets its own logo back', await until(async () => (await iconOf()) === 'sites/facebook-off.svg'));
    await popup.click('#siteEnabled');
    await until(async () => (await iconOf()) === 'sites/facebook-on.svg');

    await setState('s => { s.sites.facebook.presets.stories = false; s.sites.facebook.presets.videoPosts = true; }');
    await until(async () => (await popup.$$eval('.group[data-group="Feed"] .tick.is-on', t => t.length)) === 5);
    const feedSwitch = '.group[data-group="Feed"] input';
    await popup.click(feedSwitch);
    ok('a group switch turns its whole group off', await until(async () => {
      const f = await fbNow();
      return presets.filter(r => r.group === 'Feed').every(r => f.presets[r.id] === false);
    }));
    ok('and remembers what was on', (await fbNow()).remembered.Feed.join() === 'videoPosts,reels,suggested,pymk', JSON.stringify((await fbNow()).remembered));
    await popup.click(feedSwitch);
    ok('on again puts back exactly that', await until(async () => {
      const f = await fbNow();
      return f.presets.videoPosts === true && f.presets.reels === true && !f.remembered.Feed;
    }));
    ok('and never the big switches nobody chose', (await fbNow()).presets.feed === false);
    await popup.click(feedSwitch);
    await until(async () => (await fbNow()).presets.reels === false);
    await sw.evaluate('self.BFX_STORE.get().then(s => { delete s.sites.facebook.remembered.Feed; return self.BFX_STORE.set(s); })');
    await until(async () => !(await fbNow()).remembered.Feed);
    await popup.click(feedSwitch);
    ok('with nothing remembered, a group comes back as the defaults', await until(async () => (await fbNow()).presets.reels === true) &&
      (await fbNow()).presets.feed === false && (await fbNow()).presets.videoPosts === false);
    await popup.click('.group[data-group="Effects"] input');
    ok('a group with no defaults opens instead of switching things on', await until(async () =>
      (await popup.$$eval('#groups .rule', r => r.length)) === presets.filter(r => r.group === 'Effects').length));
    ok('and its switch stays off', await popup.$eval('.group[data-group="Effects"] input', i => !i.checked));
    await popup.click('#groups .rule .rule-text');
    ok('clicking a rule row flips its switch', await until(async () => (await fbNow()).presets.grayscale === true));
    ok('and it stays open', (await popup.$$eval('#groups .rule', r => r.length)) > 0);
    await popup.click('#groups .rule .rule-text');
    await until(async () => (await fbNow()).presets.grayscale === false);

    await popup.click('.tab[data-view="words"]');
    await popup.type('#wordInput', 'crypto');
    await popup.keyboard.press('Enter');
    ok('the first word goes in and turns the list on', await until(() =>
      sw.evaluate('self.BFX_STORE.get().then(s => s.keywords.enabled && s.keywords.terms[0] === "crypto")')));
    ok('a word shows as a chip, counted on the tab', await until(async () =>
      await popup.$eval('#words', n => n.textContent) === 'crypto' && await popup.$eval('#wordsPip', n => n.textContent) === '1'));
    await popup.click('#kwEnabled');
    await until(() => sw.evaluate('self.BFX_STORE.get().then(s => !s.keywords.enabled)'));
    await popup.type('#wordInput', 'giveaway');
    await popup.keyboard.press('Enter');
    await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.keywords.terms.length === 2)'));
    ok('after that the switch is left as it was set', await sw.evaluate('self.BFX_STORE.get().then(s => !s.keywords.enabled)'));
    await popup.click('#words .chip-x');
    await popup.click('#words .chip-x');
    ok('a word can be removed', await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.keywords.terms.length === 0)')));

    await setState(`s => { s.sites.facebook.custom.push({ id: 'p1', selector: '#nothing', label: 'A picked thing', scope: 'all', path: '/groups/', enabled: true, createdAt: 1 }); }`);
    await popup.click('.tab[data-view="picked"]');
    ok('a picked rule is listed and counted', await until(async () =>
      /A picked thing/.test(await popup.$eval('#custom', n => n.textContent)) && await popup.$eval('#pickedPip', n => n.textContent) === '1'));
    await popup.select('#custom .scope', 'path');
    ok('its scope can be changed', await until(async () => (await fbNow()).custom[0].scope === 'path'));
    await popup.click('#custom .delete');
    ok('and it can be deleted', await until(async () => (await fbNow()).custom.length === 0));

    await popup.click('.tab[data-view="more"]');
    await popup.click('#placeholdersRow .line-text');
    ok('the "show" bar switch works from its whole row', await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.placeholders === true)')));
    await popup.click('#reset');
    ok('Reset goes back to the defaults', await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.placeholders === false)')));
    await popup.click('.tab[data-view="more"]');
    ok('the active tab closes back to home', await popup.$eval('[data-view="home"]', v => v.classList.contains('is-on')));
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
      await until(() => sw.evaluate('self.BFX_STORE.get().then(s => s.sites.facebook.custom.length === 1)'));
      return sw.evaluate('self.BFX_STORE.get()');
    })();
    const fb = restored.sites.facebook;
    ok('restoring an old BlockFB backup puts it back into Facebook', fb.presets.stories === true && fb.presets.reels === false &&
      fb.custom.length === 1 && restored.keywords.terms[0] === 'crypto', JSON.stringify(restored));
    ok('no script errors', errors.length === 0, errors.join(' | '));
    fs.rmSync(tmp, { recursive: true, force: true });

    /* -------------------------------------------------------------- reddit -- */
    console.log('\nreddit.com in real Chrome');
    await resetState();
    /* The popup and options tabs above left this one in the background, where
     * Chrome runs no animation frames, so the scan would never get its turn. */
    await page.bringToFront();
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    /* An element inside a host's shadow root, by id. */
    const shadowHidden = (host, inner) => page.evaluate((h, i) => {
      const el = document.getElementById(h);
      const t = el && el.shadowRoot && el.shadowRoot.getElementById(i);
      return !!t && !t.checkVisibility();
    }, host, inner);
    const gone = async target => Array.isArray(target) ? shadowHidden(target[0], target[1]) : isHidden(target);
    const redditIds = loadPresets('reddit').map(r => r.id);
    ok('every Reddit selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), loadPresets('reddit').flatMap(r => r.css || []))).length === 0);
    ok('feed ads go, with the line after them', await until(() => isHidden('ad')) && await isHidden('hr-ad'));
    ok('sidebar ads go', await isHidden('sad'));
    ok('ads under posts and in comment threads go', await isHidden('cad') && await isHidden('ctad'));
    ok('a recommended post on Home goes, with its line', await until(() => isHidden('a-rec')) && await isHidden('hr-rec'));
    ok('a post from a community you joined stays, with its line', !(await isHidden('a-sub')) && !(await isHidden('hr-sub')));
    ok('the chat badge goes', await isHidden('chat-badge'));
    ok('a shadow-root count is visible before its switch is on', !(await shadowHidden('t3_sub', 'score-sub')));

    const redditOnly = ids => setState(`s => { const p = s.sites.reddit.presets; ${JSON.stringify(redditIds)}.forEach(k => { p[k] = false; }); ${ids.map(id => `p.${id} = true;`).join(' ')} }`);
    const redditCases = [
      ['counts', 'vote and comment counts inside shadow roots', [['t3_sub', 'score-sub'], ['row', 'comment-score']], ['a-sub', 'bar-sub']],
      ['postActions', 'the vote / comment / share bar', [['t3_sub', 'bar-sub']], ['a-sub']],
      ['comments', 'the comment thread and box', ['comment-tree', 'composer'], ['a-sub']],
      ['media', 'the picture, not the post', ['media-sub'], ['a-sub']],
      ['videoPosts', 'video posts, whole', ['a-video'], ['a-sub', 'a-kw']],
      ['nsfw', 'NSFW posts', ['a-nsfw'], ['a-sub']],
      ['leftSidebar', 'the left sidebar', ['left-sidebar-container'], ['feed']],
      ['rightSidebar', 'the right sidebar', ['right-sidebar-container'], ['feed']],
      ['recentPosts', 'recent posts', ['recent'], ['sad-loader']],
      ['relatedCommunities', 'community suggestions', ['related'], ['recent']],
      ['games', 'the games section and badge', ['games-section', 'games-badge'], ['communities-section']],
      ['search', 'the search box', ['search'], ['chat']],
      ['createPost', 'the Create button', ['create'], ['chat']],
      ['chat', 'the chat button', ['chat'], ['create']],
      ['advertise', 'the Advertise buttons', ['advertise', 'nav-advertise'], ['create']]
    ];
    for (const [id, what, hide, keep] of redditCases) {
      await redditOnly([id]);
      let hid = await until(async () => {
        for (const g of hide) if (!(await gone(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of keep) if (await gone(k)) keeps = false;
      await redditOnly([]);
      const back = await until(async () => {
        for (const g of hide) if (await gone(g)) return false;
        return true;
      });
      ok(`reddit ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* ------------------------------------------------------------------- x -- */
    console.log('\nx.com in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const xPresets = loadPresets('x');
    const xIds = xPresets.map(r => r.id);
    ok('every X selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), xPresets.flatMap(r => r.css || []))).length === 0);
    ok('ads go, by pixels and by label', await until(() => isHidden('cell-ad')) && await until(() => isHidden('cell-adlabel')));
    ok('who to follow goes, in the timeline and the right column', await isHidden('cell-wtf-head') && await isHidden('cell-wtf-user') &&
      await isHidden('cell-wtf-more') && await isHidden('blk-wtf'));
    ok('the promoted trend and the Premium card go', await isHidden('trend-promo') && await isHidden('blk-premium') && await isHidden('nav-premium'));
    ok('ordinary posts, trends and the rest of the column stay', !(await isHidden('cell-plain')) && !(await isHidden('trend-plain')) &&
      !(await isHidden('blk-search')) && !(await isHidden('cell-quote')));
    ok('the unread badge goes', await isHidden('badge'));
    ok('the timeline closes up around a hidden ad: no gap where it was', await page.evaluate(() => {
      const a = document.getElementById('cell-plain').getBoundingClientRect();
      const b = document.getElementById('cell-repost').getBoundingClientRect();
      return Math.abs(b.top - a.bottom) < 2;
    }));

    const xOnly = list => setState(`s => { const p = s.sites.x.presets; ${JSON.stringify(xIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    const xCases = [
      ['reposts', 'reposts, not pinned posts', ['cell-repost'], ['cell-pinned', 'cell-plain']],
      ['videoPosts', 'video posts, whole', ['cell-video'], ['cell-plain']],
      ['postActions', 'the button row', ['bar-plain'], ['text-plain']],
      ['counts', 'the counts, not the buttons', ['count-reply'], ['bar-plain']],
      ['media', 'the picture box, not the text', ['media-box'], ['text-plain', 'bar-plain']],
      ['rightSidebar', 'the right column', ['blk-trends', 'blk-search'], ['timeline']],
      ['trends', 'the trends block', ['blk-trends'], ['blk-wtf', 'timeline']],
      ['news', "Today's News", ['blk-news'], ['blk-trends']],
      ['sidebarSearch', 'the column search box', ['blk-search'], ['blk-trends']],
      ['navExtras', 'the extra menu items', ['nav-grok', 'nav-history', 'nav-studio', 'nav-premium'], ['nav-profile', 'nav-notif']],
      ['grok', 'Grok everywhere', ['grok-btn', 'grok-drawer', 'nav-grok', 'grok-img'], ['bar-plain']],
      ['chatDrawer', 'the chat drawer', ['chat-drawer'], ['grok-drawer']],
      ['newPostsPill', 'the new posts bubble', ['pill'], ['timeline']],
      ['composer', 'the post box', ['composer-block'], ['timeline', 'tab-foryou']]
    ];
    for (const [id, what, hide, keep] of xCases) {
      await xOnly([id]);
      const hid = await until(async () => {
        for (const g of hide) if (!(await isHidden(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await xOnly([]);
      const back = await until(async () => {
        for (const g of hide) if (await isHidden(g)) return false;
        return true;
      });
      ok(`x ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await xOnly(['verifiedReplies']);
    await page.goto('https://x.com/alice/status/111', { waitUntil: 'domcontentloaded' });
    ok('x verifiedReplies: under an opened post, the verified reply goes and the post stays',
      await until(() => isHidden('cell-video')) && !(await isHidden('cell-plain')));
    await resetState();

    /* ------------------------------------------------------------ linkedin -- */
    console.log('\nlinkedin.com in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const liPresets = loadPresets('linkedin');
    const liIds = liPresets.map(r => r.id);
    /* Feed items are display: contents, never "visible" themselves: judge
     * the listitem inside. */
    const liGone = id => page.evaluate(i => {
      const el = document.getElementById(i);
      if (!el) return false;
      const box = el.matches('[data-testid="mainFeed"] > div') ? el.querySelector('[role="listitem"]') : el;
      return !box.checkVisibility();
    }, id);
    ok('every LinkedIn selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), liPresets.flatMap(r => r.css || []).concat([liPresets.find(r => r.id === 'blurFeed').style.split('{')[0]]))).length === 0);
    ok('promoted posts go: by label, in German, and by ad-tracking link',
      await until(() => liGone('item-ad')) && await liGone('item-ad-de') && await liGone('item-ad-link'));
    ok('Premium goes in the feed, the left column and the top bar', await liGone('item-premium') && await liGone('left-premium') && await liGone('nav-premium'));
    ok('ordinary posts and the rest of the left column stay', !(await liGone('item-plain')) && !(await liGone('left-profile')) && !(await liGone('item-suggested')));
    ok('the unread badges go', await liGone('badge-msg') && await liGone('badge-notif'));

    const liOnly = list => setState(`s => { const p = s.sites.linkedin.presets; ${JSON.stringify(liIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    const liCases = [
      ['suggested', 'posts from people you don\'t follow', ['item-suggested'], ['item-plain', 'item-activity']],
      ['activity', 'posts shown because of someone else', ['item-activity'], ['item-plain', 'item-suggested']],
      ['jobs', 'the jobs carousel', ['item-jobs'], ['item-plain']],
      ['videoPosts', 'video posts, whole', ['item-video'], ['item-plain']],
      ['composer', 'the post box', ['item-composer'], ['item-plain']],
      ['postActions', 'the button row', ['actions-plain'], ['text-plain', 'counts-plain']],
      ['counts', 'the counts line', ['counts-plain'], ['actions-plain', 'text-plain']],
      ['comments', 'comments under posts', ['comments-plain'], ['text-plain']],
      ['media', 'the picture, not the header or text', ['media-plain'], ['head-plain', 'text-plain', 'activity-author']],
      ['leftSidebar', 'the left column', ['left'], ['feed']],
      ['rightSidebar', 'the right column', ['right'], ['feed']],
      ['news', 'LinkedIn News', ['right-news'], ['right-games']],
      ['games', "today's puzzles", ['right-games'], ['right-news']]
    ];
    for (const [id, what, hide, keep] of liCases) {
      await liOnly([id]);
      const hid = await until(async () => {
        for (const g of hide) if (!(await liGone(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of keep) if (await liGone(k)) keeps = false;
      await liOnly([]);
      const back = await until(async () => {
        for (const g of hide) if (await liGone(g)) return false;
        return true;
      });
      ok(`linkedin ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await liOnly(['blurFeed']);
    ok('linkedin blur lands on the post box, not the display: contents item', await until(() => page.evaluate(() =>
      getComputedStyle(document.getElementById('li-plain')).filter.includes('blur'))));
    await resetState();

    /* ----------------------------------------------------------- instagram -- */
    console.log('\ninstagram.com in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const igPresets = loadPresets('instagram');
    const igIds = igPresets.map(r => r.id);
    ok('every Instagram selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), igPresets.flatMap(r => r.css || []))).length === 0);
    ok('ads go, labelled or not', await until(() => isHidden('a-ad')) && await until(() => isHidden('a-ad-quiet')));
    ok('reels go by default, with the menu item; ordinary posts stay', await isHidden('a-reel') && await isHidden('menu-reels') &&
      !(await isHidden('a-plain')) && !(await isHidden('a-video')) && !(await isHidden('a-suggested')));
    ok('the Messages badge goes', await isHidden('badge'));
    await page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded' });
    ok('the Reels tab with Reels on lands on the feed', await until(() => page.evaluate(() => location.pathname === '/'), 5000));

    /* A reel opened by link plays; the reels after it can't be reached. */
    await page.goto('https://www.instagram.com/reels/AAA/', { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const reel = () => page.evaluate(() => ({ path: location.pathname, top: document.getElementById('viewer').scrollTop,
      held: document.getElementById('viewer').hasAttribute('data-bfx-held'), overflow: getComputedStyle(document.getElementById('viewer')).overflowY }));
    const opened = await reel();
    ok('a reel opened by link stays open with Reels on', opened.path === '/reels/AAA/' && opened.top === 0, JSON.stringify(opened));
    await page.click('#next'); await sleep(700);
    const afterNext = await reel();
    await page.mouse.move(200, 300); await page.mouse.wheel({ deltaY: 900 }); await sleep(700);
    const afterWheel = await reel();
    ok('…but the next one can\'t be reached: the next button and the wheel leave it on the reel opened',
      opened.held && opened.overflow === 'hidden' && afterNext.top === 0 && afterWheel.top === 0, JSON.stringify({ afterNext, afterWheel }));
    await page.click('#chat-link'); await sleep(1600);
    const sent = await reel();
    await page.click('#next'); await sleep(700);
    const sentAfter = await reel();
    ok('clicking a link to another reel (from a chat) opens that one, and holds there too',
      sent.path === '/reels/BBB/' && sent.top === 600 && sentAfter.top === 600, JSON.stringify({ sent, sentAfter }));
    await setState(s => { s.sites.instagram.presets.reels = false; });
    await sleep(800);
    await page.click('#next'); await sleep(700);
    const free = await reel();
    ok('with Reels off, the next reel comes as usual', free.top === 1200 && free.overflow !== 'hidden', JSON.stringify(free));
    await setState(s => { s.sites.instagram.presets.reels = true; });
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });

    const igOnly = list => setState(`s => { const p = s.sites.instagram.presets; ${JSON.stringify(igIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    const igCases = [
      ['suggested', 'posts from accounts you don\'t follow', ['a-suggested'], ['a-plain']],
      ['videoPosts', 'video posts', ['a-video', 'a-reel'], ['a-plain']],
      ['stories', 'the stories tray', ['stories'], ['posts']],
      ['postActions', 'the button row', ['actions-plain'], ['media-plain', 'likes-plain']],
      ['counts', 'the counts, not the buttons', ['count-likes', 'likes-plain'], ['actions-plain']],
      ['rightSidebar', 'the right column', ['right-column'], ['posts']],
      ['threadsLink', 'the Threads link', ['menu-threads'], ['menu-messages']]
    ];
    for (const [id, what, hide, keep] of igCases) {
      await igOnly([id]);
      const hid = await until(async () => {
        for (const g of hide) if (!(await isHidden(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await igOnly([]);
      const back = await until(async () => {
        for (const g of hide) if (await isHidden(g)) return false;
        return true;
      });
      ok(`instagram ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* -------------------------------------------------------------- twitch -- */
    console.log('\ntwitch.tv in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://www.twitch.tv/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const twPresets = loadPresets('twitch');
    const twIds = twPresets.map(r => r.id);
    ok('every Twitch selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), twPresets.flatMap(r => r.css || []))).length === 0);
    ok('the front page ad and the display ad go', await until(() => isHidden('headliner')) && await isHidden('sda'));
    ok('Prime and Bits offers go, and the notification badge', await isHidden('prime') && await isHidden('bits') && await isHidden('badge'));
    ok('recommended channels go as their group; followed channels and the rest of the carousel stay',
      await isHidden('grp-recommended') && !(await isHidden('grp-followed')) && !(await isHidden('featured')));
    ok('a page rule with !important of its own cannot bring a hidden thing back', await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '[data-a-target="frontpage-headliner"] { display: flex !important; }';
      document.head.appendChild(st);
      const gone = !document.getElementById('headliner').checkVisibility();
      st.remove();
      return gone;
    }));

    const twOnly = list => setState(`s => { const p = s.sites.twitch.presets; ${JSON.stringify(twIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    const twCases = [
      ['similarChannels', '"viewers also watch"', ['grp-similar'], ['grp-followed']],
      ['sideNav', 'the whole side nav', ['side-nav'], ['shelf']],
      ['featuredCarousel', 'the featured carousel', ['carousel'], ['shelf']],
      ['chat', 'the chat column', ['chat-column'], ['player']],
      ['chatBadges', 'badges in chat', ['chat-badge'], ['line']],
      ['channelPoints', 'channel points', ['points'], ['line']],
      ['subGift', 'Subscribe and Gift', ['sub', 'gift'], ['follow']],
      ['aboutPanels', 'the about panels', ['about'], ['player']]
    ];
    for (const [id, what, hide, keep] of twCases) {
      await twOnly([id]);
      const hid = await until(async () => {
        for (const g of hide) if (!(await isHidden(g))) return false;
        return true;
      });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await twOnly([]);
      const back = await until(async () => {
        for (const g of hide) if (await isHidden(g)) return false;
        return true;
      });
      ok(`twitch ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* -------------------------------------------------------------- tiktok -- */
    console.log('\ntiktok.com in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const ttPresets = loadPresets('tiktok');
    const ttIds = ttPresets.map(r => r.id);
    ok('every TikTok selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), ttPresets.flatMap(r => r.css || []))).length === 0);
    ok('the coins offer and CapCut tags go by default; the video stays', await until(() => isHidden('coins')) && await isHidden('capcut') && !(await isHidden('v-1')));
    const ttOnly = list => setState(`s => { const p = s.sites.tiktok.presets; ${JSON.stringify(ttIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    for (const [id, what, hide, keep] of [
      ['counts', 'the counts', ['likes-1'], ['desc-1']],
      ['music', 'the sound link', ['music-1'], ['desc-1']],
      ['navExtras', 'LIVE and Short dramas', ['nav-live', 'nav-drama'], ['nav-profile']]
    ]) {
      await ttOnly([id]);
      const hid = await until(async () => { for (const g of hide) if (!(await isHidden(g))) return false; return true; });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await ttOnly([]);
      const back = await until(async () => { for (const g of hide) if (await isHidden(g)) return false; return true; });
      ok(`tiktok ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* --------------------------------------------------------------- pixiv -- */
    console.log('\npixiv.net in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://www.pixiv.net/en/artworks/1001', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const pxPresets = loadPresets('pixiv');
    const pxIds = pxPresets.map(r => r.id);
    ok('every pixiv selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), pxPresets.flatMap(r => r.css || []))).length === 0);
    const pxOnly = list => setState(`s => { const p = s.sites.pixiv.presets; ${JSON.stringify(pxIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    ok('the computer app\'s ads go by default, with the boxes around them',
      await until(() => isHidden('top-slot')) && await isHidden('side-pr') && await isHidden('side-slot') && await isHidden('foot-box'));
    ok('the phone app\'s ads go too: named slots, the fake work in a grid, the sticky one',
      await isHidden('p-header') && await isHidden('p-header-hb') && await isHidden('p-comment') && await isHidden('p-native') && await isHidden('p-sticky'));
    ok('a user\'s page stays, though the third box up from its ad holds it all',
      await isHidden('user-frame') && !(await isHidden('user-page')) && !(await isHidden('user-work')));
    ok('works, the name row and the recommendations stay',
      !(await isHidden('work-1')) && !(await isHidden('user-name-row')) && !(await isHidden('p-related')) && !(await isHidden('p-work')));
    await pxOnly([]);
    ok('with everything off, every ad is back', await until(async () => !(await isHidden('top-frame')) && !(await isHidden('p-sticky'))));
    for (const [id, what, hide, keep] of [
      ['ads', 'the ads alone, and the "Remove ads" link in their box', ['top-frame', 'p-comment', 'remove-ads'], ['user-badge', 'p-premium-banner']],
      ['premium', 'Premium offers', ['remove-ads', 'popular-offer', 'user-badge', 'p-premium-banner', 'p-premium-foot'], ['user-name-row', 'p-foot-link', 'top-frame']],
      ['related', 'the suggestions below a work', ['related-section', 'p-related'], ['p-text', 'side-author']]
    ]) {
      await pxOnly([id]);
      const hid = await until(async () => { for (const g of hide) if (!(await isHidden(g))) return false; return true; });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await pxOnly([]);
      const back = await until(async () => { for (const g of hide) if (await isHidden(g)) return false; return true; });
      ok(`pixiv ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* ------------------------------------------------------------ mangadex -- */
    console.log('\nmangadex.org in real Chrome');
    await resetState();
    await page.bringToFront();
    await page.goto('https://mangadex.org/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    const mdPresets = loadPresets('mangadex');
    const mdIds = mdPresets.map(r => r.id);
    ok('every MangaDex selector parses in Chrome', (await page.evaluate(list => list.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch (e) { return true; }
    }), mdPresets.flatMap(r => r.css || []))).length === 0);
    ok('banner ads go by default, picture or video, with the box around them, and the Advertise link',
      await until(() => isHidden('ad-box')) && await isHidden('ad-video-box') && await isHidden('section-link-_advertise'));
    ok('the rest of the page stays', !(await isHidden('home')) && !(await isHidden('sec-latest')) && !(await isHidden('sec-recommended')) && !(await isHidden('popular')));
    const mdOnly = list => setState(`s => { const p = s.sites.mangadex.presets; ${JSON.stringify(mdIds)}.forEach(k => { p[k] = false; }); ${list.map(id => `p.${id} = true;`).join(' ')} }`);
    for (const [id, what, hide, keep] of [
      ['popular', 'the carousel', ['popular'], ['home', 'sec-latest']],
      ['recommended', 'Recommended', ['sec-recommended'], ['sec-latest', 'sec-self']],
      ['selfPublished', 'Self-Published', ['sec-self'], ['sec-recommended']],
      ['seasonal', 'Seasonal', ['sec-seasonal'], ['sec-recent']],
      ['recentlyAdded', 'Recently Added, and not its menu link', ['sec-recent'], ['section-link-_titles_recent', 'sec-seasonal']],
      ['commentCounts', 'the comment counts', ['comment-1'], ['feed-1']]
    ]) {
      await mdOnly([id]);
      const hid = await until(async () => { for (const g of hide) if (!(await isHidden(g))) return false; return true; });
      let keeps = true;
      for (const k of keep) if (await isHidden(k)) keeps = false;
      await mdOnly([]);
      const back = await until(async () => { for (const g of hide) if (await isHidden(g)) return false; return true; });
      ok(`mangadex ${id}: hides ${what}, keeps the rest, and gives it back when off`, hid && keeps && back);
    }
    await resetState();

    /* -------------------------------------------------------------- picker -- */
    console.log('\nthe picker, by mouse and by finger');
    await resetState();
    await page.bringToFront();
    const startPicker = () => sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: ['https://www.reddit.com/*', 'https://www.linkedin.com/*', 'https://mangadex.org/*'] });
      return chrome.tabs.sendMessage(tab.id, { type: 'bfx:pick' });
    });
    const picked = () => sw.evaluate(async () => (await self.BFX_STORE.get()).sites.reddit.custom);
    const spotOf = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
    }, sel);
    const pickerNow = () => page.evaluate(() => {
      const host = document.querySelector('.bfx-picker-root');
      if (!host) return null;
      const btn = act => {
        const b = host.querySelector(`[data-act="${act}"]`);
        return { shown: b.getClientRects().length > 0, on: !b.disabled, text: b.textContent };
      };
      const r = host.querySelector('.bfx-box').getBoundingClientRect();
      const bar = host.querySelector('.bfx-bar').getBoundingClientRect();
      return {
        touch: host.hasAttribute('data-bfx-touch'),
        top: host.hasAttribute('data-bfx-top'),
        name: host.querySelector('.bfx-name').textContent,
        hint: host.querySelector('.bfx-bar-hint').getClientRects().length > 0,
        box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
        bar: { top: bar.top, bottom: bar.bottom, width: bar.width },
        smaller: btn('smaller'), bigger: btn('bigger'), mode: btn('mode'), cancel: btn('cancel'), hide: btn('hide')
      };
    });
    const tapOn = async sel => {
      const at = await spotOf(sel);
      await page.touchscreen.tap(at.x, at.y);
      await sleep(120);
    };
    const press = async act => {
      const at = await page.evaluate(a => {
        const r = document.querySelector(`.bfx-picker-root [data-act="${a}"]`).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, act);
      await page.touchscreen.tap(at.x, at.y);
      await sleep(120);
    };

    /* A computer's picker stays what it was. */
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    await startPicker();
    await until(async () => !!(await pickerNow()));
    let pk = await pickerNow();
    ok('with a mouse: the bar shows the keys and no buttons', !pk.touch && pk.hint && !pk.hide.shown && !pk.cancel.shown, JSON.stringify(pk));
    ok('nothing is marked before the mouse moves, not even a dot in the corner', pk.box.right <= 0 && pk.box.bottom <= 0, JSON.stringify(pk.box));
    let spot = await spotOf('#t3_sub > [slot="title"]');
    await page.mouse.move(spot.x, spot.y);
    await sleep(60);
    pk = await pickerNow();
    ok('moving the mouse marks what it is over', pk.name === 'My cat found a box', pk.name);
    await page.keyboard.press('ArrowUp');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    ok('↑ past the top and one ↓ moves at once', await page.evaluate(() => document.querySelector('.bfx-name').textContent) !== '' &&
      (await pickerNow()).name !== 'My cat found a box');
    await page.keyboard.press('Escape');
    ok('Esc leaves, saving nothing', !(await pickerNow()) && (await picked()).length === 0);
    await startPicker();
    await until(async () => !!(await pickerNow()));
    await page.mouse.move(spot.x, spot.y + 1);
    await page.mouse.move(spot.x, spot.y);
    await sleep(60);
    await page.mouse.down();
    await page.mouse.up();
    ok('a click hides at once and opens nothing', await until(async () => (await picked()).length === 1) &&
      new URL(page.url()).pathname === '/' && !(await pickerNow()));

    /* A finger. Input goes through Chrome's real touch path, so cancelling
     * pointerdown takes the mouse events away as it does on a phone. */
    await resetState();
    await page.setViewport({ width: 412, height: 800, hasTouch: true });
    const loadByFinger = async () => {
      await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#bfx-style');
      await startPicker();
      await until(async () => !!(await pickerNow()));
    };
    await loadByFinger();
    await page.evaluate(() => {
      self.__heard = [];
      ['touchstart', 'touchend', 'pointerdown', 'click'].forEach(t => document.addEventListener(t, e => self.__heard.push(t), false));
    });
    await tapOn('#t3_sub > [slot="title"]');
    pk = await pickerNow();
    ok('a tap selects and hides nothing yet', pk.touch && pk.hide.shown && pk.hide.on && (await picked()).length === 0, JSON.stringify(pk));
    ok('a tap in a post selects the whole post', pk.name === 'Posts from r/cats', pk.name);
    const article = await page.evaluate(() => { const r = document.getElementById('a-sub').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    ok('the highlight sits on that post', Math.abs(pk.box.top - article.top) < 5 && Math.abs(pk.box.bottom - article.bottom) < 5, JSON.stringify([pk.box, article]));
    ok('the tap opened nothing', new URL(page.url()).pathname === '/');
    ok('the page heard none of it', (await page.evaluate(() => self.__heard.length)) === 0, await page.evaluate(() => self.__heard.join()));
    ok('with a finger: buttons in place of the keys', !pk.hint && pk.smaller.shown && pk.bigger.shown && pk.cancel.shown);
    ok('a post has no "all of them" choice', !pk.mode.shown);
    const post = pk;
    await press('smaller');
    pk = await pickerNow();
    ok('Smaller steps in towards the spot touched', pk.name !== 'Posts from r/cats' && pk.bigger.on, pk.name);
    ok('one press shows on screen: same-sized wrappers are skipped', pk.box.bottom - pk.box.top < post.box.bottom - post.box.top - 2, JSON.stringify([post.box, pk.box]));
    let steps = 0;
    while ((await pickerNow()).smaller.on && steps++ < 8) await press('smaller');
    pk = await pickerNow();
    ok('it ends on what was touched, and says so by greying out', pk.name === 'My cat found a box' && !pk.smaller.on, JSON.stringify(pk.smaller));
    await press('bigger');
    await press('bigger');
    ok('Bigger steps back out', (await pickerNow()).name !== 'My cat found a box');
    await press('cancel');
    ok('Cancel leaves, saving nothing', !(await pickerNow()) && (await picked()).length === 0);

    await startPicker();
    await until(async () => !!(await pickerNow()));
    pk = await pickerNow();
    ok('before a tap: one line and Cancel, and the bar stays small', pk.name === 'Tap what you want to hide' &&
      pk.cancel.shown && !pk.hide.shown && !pk.smaller.shown && pk.bar.width < 340, JSON.stringify(pk.bar));
    ok('the hints are for a phone, and the corner is clear', !pk.hint && pk.box.right <= 0);
    await tapOn('#chat');
    pk = await pickerNow();
    ok('a tap outside any post selects that thing itself', pk.name.startsWith('Chat') && !pk.smaller.on, JSON.stringify(pk));
    await tapOn('#t3_sub > [slot="title"]');
    ok('another tap moves the selection', (await pickerNow()).name === 'Posts from r/cats');
    await press('hide');
    ok('Hide saves the rule', await until(async () => (await picked()).length === 1) && (await picked())[0].selector.includes('r/cats'),
      JSON.stringify(await picked()));
    ok('the post goes and the bar with it', await until(() => isHidden('a-sub')) && !(await pickerNow()));
    ok('and the rule that hides it is nowhere the site can read it', await page.evaluate(() =>
      !document.documentElement.outerHTML.includes('r/cats"]') && [...document.querySelectorAll('style')].every(s => !s.textContent.includes('r/cats'))));
    const toast = await page.evaluate(() => { const t = document.querySelector('.bfx-toast'); const r = t.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height, text: t.textContent }; });
    ok('the toast fits the phone', toast.left >= 0 && toast.right <= 412, JSON.stringify(toast));
    ok('and keeps what it names out of the page', toast.text === '' && toast.height > 0, JSON.stringify(toast));

    await resetState();
    await loadByFinger();
    await page.evaluate(() => {
      document.querySelectorAll('[id^="many-"]').forEach(e => e.remove());
      const list = document.createElement('div');
      list.innerHTML = Array.from({ length: 12 }, (_, i) => `<reddit-tag id="many-${i}" style="display:block;height:30px">tag ${i}</reddit-tag>`).join('');
      document.body.appendChild(list);
      list.id = 'many';
      const stuck = document.createElement('reddit-stuck-menu');
      stuck.id = 'stuck';
      stuck.textContent = 'Fixed to the bottom of the screen';
      stuck.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:64px;background:#555;z-index:5';
      document.documentElement.appendChild(stuck);
    });
    await page.evaluate(() => {
      const label = document.createElement('div');
      label.id = 'worded';
      label.innerHTML = '<script type="text/plain">code()</' + 'script><b>Real</b><i>words</i>';
      const picture = document.createElement('div');
      picture.innerHTML = '<img id="pic" alt="" width="80" height="40" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
      document.getElementById('many').before(label, picture);
    });
    await tapOn('#worded b');
    await press('bigger');
    ok('a name is the words on screen, spaced, with no script in it', (await pickerNow()).name === 'Real words', (await pickerNow()).name);
    await tapOn('#pic');
    ok('a picture is called one', (await pickerNow()).name === 'Picture', (await pickerNow()).name);
    await tapOn('#many-3');
    pk = await pickerNow();
    ok('many alike offers all of them', pk.name === 'tag 3' && pk.mode.shown && pk.mode.text === 'All 12', JSON.stringify(pk));
    await press('mode');
    pk = await pickerNow();
    ok('and that switches to only this one', pk.mode.text === 'Only this', JSON.stringify(pk.mode));
    await press('mode');
    await press('cancel');
    await startPicker();
    await until(async () => !!(await pickerNow()));
    const edge = await page.evaluate(() => { const r = document.getElementById('stuck').getBoundingClientRect(); return { x: 12, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(edge.x, edge.y);
    await sleep(120);
    pk = await pickerNow();
    ok('what is fixed to the bottom can be reached beside the small bar', pk.name.startsWith('Fixed to the bottom'), pk.name);
    ok('and the bar moves off it', pk.top && pk.bar.bottom < 300, JSON.stringify(pk.bar));
    ok('Bigger stops short of the page itself', pk.bigger.on === false, JSON.stringify(pk.bigger));
    await press('cancel');

    await startPicker();
    await until(async () => !!(await pickerNow()));
    await page.evaluate(() => scrollTo(0, 0));
    await sleep(60);
    const scrollFrom = await page.evaluate(() => scrollY);
    await page.touchscreen.touchStart(200, 500);
    await page.touchscreen.touchMove(200, 420);
    await page.touchscreen.touchMove(200, 300);
    await page.touchscreen.touchEnd();
    await sleep(250);
    pk = await pickerNow();
    ok('a swipe scrolls and selects nothing', pk.name === 'Tap what you want to hide' && (await page.evaluate(() => scrollY)) !== scrollFrom, pk.name);
    await press('cancel');
    await page.evaluate(() => document.getElementById('stuck').remove());

    /* LinkedIn's posts are display: contents, with no box of their own. */
    await resetState();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    await startPicker();
    await until(async () => !!(await pickerNow()));
    await tapOn('#item-plain h2 ~ div');
    pk = await pickerNow();
    ok('a post with no box of its own still gets a highlight', pk.name.startsWith('Posts from') && pk.box.right - pk.box.left > 100 && pk.box.bottom - pk.box.top > 20, JSON.stringify(pk));
    await press('cancel');

    /* MangaDex's home rows: the rule must follow the title, not the row's place. */
    await resetState();
    await page.goto('https://mangadex.org/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bfx-style');
    await startPicker();
    await until(async () => !!(await pickerNow()));
    await tapOn('#hrow-1 img');
    ok('a tap on a home row selects that title', (await pickerNow()).name === 'Posts from Harbour Lights', (await pickerNow()).name);
    await press('cancel');

    /* Someone with a touch screen and a mouse is served by whichever they use. */
    await page.setViewport({ width: 800, height: 600, hasTouch: true });
    await resetState();
    await loadByFinger();
    spot = await spotOf('#t3_sub > [slot="title"]');
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.move(spot.x + 1, spot.y);
    await sleep(60);
    await page.touchscreen.tap(spot.x, spot.y);
    await sleep(120);
    pk = await pickerNow();
    ok('a touch screen beside a mouse: a tap still only selects', pk && pk.touch && (await picked()).length === 0, JSON.stringify(pk));
    await press('cancel');
    await resetState();
    await page.setViewport({ width: 800, height: 600 });

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
