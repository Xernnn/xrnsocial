/* X's two switches that act over time, live: node test/live/x-following.js
 *   following        arriving on Home opens "Following"; a click on "For you"
 *                    sticks for the visit; switched off, Home stays put
 *   verifiedReplies  replies from verified accounts stay hidden all the way
 *                    down a scrolled thread
 * X remembers the selected tab for the account, so the tab Home was on is
 * put back at the end, along with the person's settings. */
const { connect, workTab, ensureVisible, contentWorld, guardSettings, sleep } = require('./lib');
const P = require('./probes/x');
let fail = 0; const ok = (l, c, d) => { if (!c) fail++; console.log((c ? '  ✓ ' : '  ✗ ') + l + (d ? '  — ' + d : '')); };
(async () => {
  const b = await connect(); const page = await workTab(b, 'https://x.com/home'); await ensureVisible(page, { focus: false }); await sleep(6000);
  let run = await contentWorld(page);
  const restoreSettings = await guardSettings(run);
  const tabs = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]')].map(t => t.getAttribute('aria-selected')).join(','));
  const orig = await tabs();
  const set = body => run(`BFX_STORE.update(function (s) { var me = BFX_STORE.site(s, 'x'); ${body} }).then(function () { return 1; })`);
  try {
    console.log('tabs at start:', orig);
    // make sure we start on For you, the case the switch is for
    if (!orig.startsWith('true')) { await page.evaluate(() => document.querySelector('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]').click()); await sleep(2000); }
    await set('me.presets.following = true;');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); await sleep(6000); run = await contentWorld(page);
    ok('arriving on Home opens Following', (await tabs()).startsWith('false,true'), await tabs());
    await page.evaluate(() => document.querySelector('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]').click()); await sleep(3500);
    ok('clicking For you sticks for the visit', (await tabs()).startsWith('true'), await tabs());
    await set('me.presets.following = false;');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); await sleep(5000); run = await contentWorld(page);
    ok('switched off: Home stays on For you', (await tabs()).startsWith('true'), await tabs());

    // verified replies while scrolling a thread, switch on before opening it
    await set('me.presets.verifiedReplies = true;');
    const url = await P.postPage(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(6000); run = await contentWorld(page);
    const judge = () => page.evaluate(() => {
      const id = location.pathname.split('/status/')[1];
      window.__seenV = window.__seenV || { leaks: 0, wrong: 0, hidden: 0, checked: 0 };
      const W = window.__seenV;
      const cells = [...document.querySelectorAll('[data-testid="cellInnerDiv"]')];
      const fi = cells.findIndex(c => c.querySelector('a[href$="/status/' + id + '"] time'));
      if (fi >= 0) W.focalTop = cells[fi].getBoundingClientRect().top + scrollY;
      cells.forEach(c => {
        const art = c.querySelector('article[data-testid="tweet"]'); if (!art || W.focalTop === undefined) return;
        const below = c.getBoundingClientRect().top + scrollY > W.focalTop + 5;
        const n = [...art.querySelectorAll('[data-testid="User-Name"]')].find(x => !x.closest('[role="link"]'));
        const v = !!(n && n.querySelector('[data-testid="icon-verified"]'));
        const by = c.getAttribute('data-bfx-hidden-by');
        if (by === 'promoted' || by === 'whoToFollow' || by === 'keyword') return;
        W.checked++;
        if (below && v && by !== 'verifiedReplies') W.leaks++;
        if (by === 'verifiedReplies' && (!below || !v)) W.wrong++;
        if (by === 'verifiedReplies') W.hidden++;
      });
      return W;
    });
    let W;
    for (let i = 0; i < 10; i++) { await page.mouse.wheel({ deltaY: 700 }); await sleep(1300); W = await judge(); }
    ok(`verified replies hidden all the way down the thread (${W.hidden} hidden over ${W.checked} looks)`, W.leaks === 0 && W.wrong === 0 && W.hidden > 0, JSON.stringify(W));
  } finally {
    run = await contentWorld(page).catch(() => run);
    await restoreSettings(run);
    // put Home back on the tab it was on
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); await sleep(5000);
    const want = orig.split(',').indexOf('true');
    if (want >= 0 && (await tabs()).split(',').indexOf('true') !== want) { await page.evaluate(i => document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]')[i].click(), want); await sleep(2000); }
    console.log('tabs at end:', await tabs());
    await page.close(); b.disconnect();
  }
  console.log(fail ? fail + ' failed' : 'all passed');
})().catch(e => { console.error(e); process.exit(1); });
