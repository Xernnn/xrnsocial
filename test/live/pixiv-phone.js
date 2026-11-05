/* pixiv's phone app against the live site: node test/live/pixiv-phone.js
 *
 * pixiv serves phones a separate app, which check.js (a computer-sized window
 * with a computer's user agent) never sees. This opens each kind of page with
 * a phone's user agent and screen, scrolls by hand, and compares: with the ad
 * switches off some ads must show, with them on none may, and the works must
 * stay either way. It also reports what is left at the bottom of the screen,
 * since the sticky ads are the worst of them. Settings are put back at the end.
 */
const { connect, workTab, contentWorld, guardSettings, sleep } = require('./lib');

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
const PAGES = {
  'an artwork': 'https://www.pixiv.net/en/artworks/151578196',
  'a tag page': 'https://www.pixiv.net/en/tags/landscape/artworks',
  'a novel': 'https://www.pixiv.net/novel/show.php?id=29561240',
  ranking: 'https://www.pixiv.net/ranking.php'
};

let failures = 0;
const ok = (label, cond, detail) => { if (!cond) failures++; console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? '  — ' + detail : '')); };

/* Independent of the extension: what a person would see as an ad. */
const COUNT = `(() => {
  const R = window.__px || (window.__px = { ads: new Set(), shown: new Set(), works: new Set(), gone: new Set() });
  document.querySelectorAll('iframe[data-uid], iframe[id^="google_ads_iframe"], iframe[aria-label="Advertisement"]').forEach(f => {
    R.ads.add(f);
    const b = f.getBoundingClientRect();
    if (f.checkVisibility() && b.width > 1 && b.height > 1) R.shown.add(f);
  });
  /* A grid cell marked .ads is an ad even before its frame loads. */
  document.querySelectorAll('.works-item:not(:has(.ad-frame-container)):not(.ads *), .novel-display').forEach(w => { R.works.add(w); if (!w.checkVisibility()) R.gone.add(w); });
  /* reCAPTCHA's badge is fixed and holds a frame too, but it is no ad. */
  const fixed = [...document.querySelectorAll('body *')].filter(e => { const c = getComputedStyle(e); return c.position === 'fixed' && c.display !== 'none' && e.querySelector('iframe') && !e.matches('.grecaptcha-badge') && e.checkVisibility() && e.getBoundingClientRect().height > 20; });
  return { ads: R.ads.size, shown: R.shown.size, works: R.works.size, gone: R.gone.size, goneAs: [...R.gone].slice(0, 2).map(g => g.className + ' < ' + g.parentElement.className), fixed: fixed.length, fixedAs: fixed.map(e => e.tagName + '.' + e.className), wrapper: !!document.getElementById('wrapper'), bottomPad: parseFloat(getComputedStyle(document.body).paddingBottom) || 0 };
})()`;

async function measure(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(4500);
  let last;
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await sleep(1000);
    last = await page.evaluate(COUNT);
  }
  return last;
}

(async () => {
  const browser = await connect();
  const page = await workTab(browser);
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(PAGES['an artwork'], { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(4000);
  let run = await contentWorld(page);
  const restore = await guardSettings(run);
  /* Each page load makes a new content-script world. */
  const set = async on => {
    run = await contentWorld(page);
    return run(`BFX_STORE.update(function (s) { var me = BFX_STORE.site(s, 'pixiv'); s.enabled = true; me.enabled = true; me.presets.ads = ${on}; me.presets.premium = ${on}; }).then(function () { return 1; })`);
  };
  try {
    for (const [name, url] of Object.entries(PAGES)) {
      await set(false);
      const off = await measure(page, url);
      await set(true);
      const on = await measure(page, url);
      if (!off.shown) console.log(`  - ${name}: no ads served with the switches off`);
      /* pixiv hides some works itself (an unopened tab), so compare with the
       * same page with the switches off. */
      ok(`${name}: ${off.shown} ads and ${off.fixed} sticky off → ${on.shown} and ${on.fixed} on; works hidden ${off.gone}/${off.works} off, ${on.gone}/${on.works} on`,
        off.wrapper && on.shown === 0 && on.fixed === 0 && on.gone <= off.gone && (on.works > 0 || off.works === 0),
        [].concat(on.fixedAs, on.goneAs).join(' | '));
    }
    await set(true);
    await page.goto(PAGES['an artwork'], { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(4000);
    run = await contentWorld(page);
  } finally {
    await restore(run);
    await page.close();
    browser.disconnect();
  }
  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
