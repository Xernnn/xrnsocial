/* Live check of one site's rules: node test/live/check.js <site> [parts]
 *
 * parts: any of ads,switches,combos (default all). Uses test/live/probes/<site>.js
 * for where to look. In a background window of the signed-in test window:
 *   ads       scroll and hover for a while; ad markers must stay hidden
 *   switches  each switch alone: its targets visible off, hidden on, back off
 *   combos    every switch on at once, pause, rapid flips
 * ONLY=id,id limits the switch part to those switches. The person's own
 * settings are saved first and put back at the end.
 */
const { connect, workTab, ensureVisible, contentWorld, sleep } = require('./lib');

const siteId = process.argv[2];
const parts = (process.argv[3] || 'ads,switches,combos').split(',');
const P = require('./probes/' + siteId);

let failures = 0;
const ok = (label, cond, detail) => { if (!cond) failures++; console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? '  — ' + detail : '')); };
const na = label => console.log('  - ' + label);

/* Count a probe's elements on the page, and how many are hidden. A probe is
 * a function source returning elements (shadow-root elements are fine).
 * With mark, the ones visible now are remembered; later calls with only
 * judge just those, since sites keep some of their own elements hidden. */
function measure(page, src, how) {
  return page.evaluate((src, how) => {
    let els = new Function('return (' + src + ')()')() || [];
    if (how === 'mark') els.forEach(e => { e.__lt = e.checkVisibility(); });
    if (how === 'only') els = els.filter(e => e.__lt);
    else if (how === 'mark') els = els.filter(e => e.__lt);
    return { n: els.length, hidden: els.filter(e => !e.checkVisibility()).length };
  }, src, how || null);
}

/* Microseconds of a CPU profile spent in, or called from, extension code. */
function extensionTime(profile) {
  const parent = {}, node = {};
  profile.nodes.forEach(n => { node[n.id] = n; (n.children || []).forEach(c => { parent[c] = n.id; }); });
  const ours = {};
  const inExtension = id => {
    if (id in ours) return ours[id];
    const n = node[id];
    return (ours[id] = /^chrome-extension:/.test(n.callFrame.url) || (parent[id] !== undefined && inExtension(parent[id])));
  };
  let t = 0;
  profile.samples.forEach((id, i) => { if (inExtension(id)) t += profile.timeDeltas[i] || 0; });
  return t;
}

async function wheel(page, steps, hover) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: 700 }).catch(() => {});
    if (hover) for (let k = 0; k < 4; k++) { await page.mouse.move(300 + k * 150, 250 + (k % 2) * 200); await sleep(150); }
    await sleep(800);
  }
}

(async () => {
  const browser = await connect();
  const page = await workTab(browser, P.home);
  await ensureVisible(page, { focus: false });
  await sleep(4000);
  let run = await contentWorld(page);
  const saved = await run('BFX_STORE.get().then(function (s) { return JSON.stringify(s); })');
  const ids = await run(`BFX_SITES.get(${JSON.stringify(siteId)}).presets.map(function (r) { return r.id; })`);
  const set = body => run(`BFX_STORE.update(function (s) { var me = BFX_STORE.site(s, ${JSON.stringify(siteId)}); ${body} }).then(function () { return 1; })`);
  const only = list => set(`${JSON.stringify(ids)}.forEach(function (k) { me.presets[k] = false; }); ${JSON.stringify(list)}.forEach(function (k) { me.presets[k] = true; }); me.enabled = true; s.enabled = true; s.placeholders = false; s.keywords.enabled = false;`);
  const goto = async url => {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(4000);
    run = await contentWorld(page);
  };

  try {
    /* ------------------------------------------------------------- ads -- */
    if (parts.includes('ads')) {
      console.log('\n' + siteId + ': ads stay hidden while scrolling and hovering');
      await set('');   // the person's settings, as they are
      for (const [name, url] of Object.entries(P.adPages || { home: P.home })) {
        await goto(typeof url === 'function' ? await url(page) : url);
        const samples = [];
        for (let i = 0; i < (P.adSteps || 12); i++) {
          await wheel(page, 1, true);
          samples.push(await measure(page, P.ads));
        }
        const seen = Math.max(...samples.map(s => s.n));
        const leaked = samples.filter(s => s.hidden < s.n);
        ok(`${name}: ${seen} ad markers seen, none visible at any step`, !leaked.length,
          leaked.map(s => (s.n - s.hidden) + ' visible').join(', '));
      }
    }

    /* -------------------------------------------------------- switches -- */
    if (parts.includes('switches')) {
      console.log('\n' + siteId + ': every switch on its own');
      for (const id of ids.filter(i => !process.env.ONLY || process.env.ONLY.split(',').includes(i))) {
        const probe = P.switches[id];
        if (!probe) { na(id + ': no live probe'); continue; }
        if (probe.page) await goto(typeof probe.page === 'function' ? await probe.page(page) : probe.page);
        else if (page.url().split('?')[0] !== P.home) await goto(P.home);
        await only([]); await sleep(1200);
        if (probe.scroll) await wheel(page, probe.scroll, false);
        if (probe.effect) {
          /* Effects like blur lift while the mouse is over a post. */
          await page.mouse.move(2, 2);
          const a = await page.evaluate(probe.effect);
          await only([id]); await sleep(1500);
          const b = await page.evaluate(probe.effect);
          await only([]); await sleep(1500);
          const c = await page.evaluate(probe.effect);
          ok(`${id}: off/on/off = ${a} / ${b} / ${c}`, a !== b && a === c);
          continue;
        }
        const a = await measure(page, probe.find, 'mark');
        if (!a.n) { na(`${id}: nothing to act on here`); continue; }
        await only([id]); await sleep(1500);
        const b = await measure(page, probe.find, 'only');
        await only([]); await sleep(1500);
        const c = await measure(page, probe.find, 'only');
        ok(`${id}: ${a.n} targets — off ${a.hidden} hidden, on ${b.hidden}/${b.n} hidden, off again ${c.hidden} hidden`,
          a.hidden === 0 && b.n > 0 && b.hidden === b.n && c.hidden === 0);
      }
    }

    /* ---------------------------------------------------------- combos -- */
    if (parts.includes('combos')) {
      console.log('\n' + siteId + ': risky combinations');
      await goto(P.home);
      const state = () => page.evaluate(() => ({
        markers: document.querySelectorAll('[data-bfx-hidden-by]').length,
        styles: document.querySelectorAll('#bfx-style').length
      }));
      await only(ids.filter(i => !(P.skipInAllOn || []).includes(i)));
      await set('s.placeholders = true; s.keywords = { enabled: true, terms: ["crypto"] };');
      await sleep(2000);
      const errors = [];
      page.on('pageerror', e => { if (/bfx|BFX/.test(e.stack || e.message)) errors.push(e.message); });
      /* The site's own long tasks (rendering a new batch of posts takes
       * Reddit 300 ms with every rule off) say little about us, so judge the
       * time spent in the extension's own scripts, from a CPU profile. */
      await page.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask' }); });
      const cdp = await page.createCDPSession();
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('Profiler.start');
      await wheel(page, 8, true);
      const { profile } = await cdp.send('Profiler.stop');
      await cdp.detach();
      const lt = await page.evaluate(() => Math.round(Math.max(0, ...window.__lt)));
      const ownMs = Math.round(extensionTime(profile) / 1000);
      const all = await state();
      ok(`everything on: one stylesheet, ${ownMs}ms in the extension's scripts over 8 scrolls (longest page task ${lt}ms)`,
        all.styles === 1 && ownMs < 250);
      await set('s.enabled = false;'); await sleep(1500);
      const paused = await state();
      ok('pause with everything on: every marker removed', paused.markers === 0, JSON.stringify(paused));
      await set('s.enabled = true; me.enabled = false;'); await sleep(1500);
      ok('this site switched off: every marker removed', (await state()).markers === 0);
      await set('me.enabled = true;');
      for (let i = 0; i < 16; i++) { await set(`me.presets[${JSON.stringify(ids[i % ids.length])}] = ${i % 2 === 0};`); await sleep(100); }
      await only([]); await sleep(1800);
      const flip = await state();
      ok('16 rapid flips, then all off: nothing hidden, one stylesheet', flip.markers === 0 && flip.styles === 1, JSON.stringify(flip));
      ok('no page errors from the extension', !errors.length, errors.join(' | '));
    }
  } finally {
    const again = await contentWorld(page).catch(() => run);
    await again(`BFX_STORE.set(${saved}).then(function () { return 1; })`);
    await page.close();
    browser.disconnect();
  }
  console.log('\n' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
