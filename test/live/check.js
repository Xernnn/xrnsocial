/* Live check of one site's rules: node test/live/check.js <site> [parts]
 *
 * parts: any of ads,switches,truth,pairs,flows,combos (default all), driven
 * by test/live/probes/<site>.js. In a background window of the signed-in
 * test window:
 *   ads       the person's settings: ad markers stay hidden while scrolling
 *             and hovering
 *   switches  each switch alone: its targets visible off, hidden on, back
 *             off — and nothing else gone: no post it should leave (unless
 *             the probe says it hides whole posts and the post is one of its
 *             targets) and no landmark (feed, header, columns, player)
 *   truth     the ad switches alone, posts classified independently of the
 *             extension: no ad left visible, no ordinary post hidden
 *   pairs     switches whose targets overlap or nest, on together, then off
 *             in either order: each gives back only its own part
 *   flows     a "show" bar clicked open stays open; navigating inside the
 *             site; the picker started and cancelled; a picked rule over a
 *             switch; regex and broken word blocks
 *   combos    everything on (speed), pause, site off, rapid flips, errors
 * ONLY=id,id limits the switch part to those switches. Switches with nothing
 * to act on are tried again further down or on the probe's other pages, and
 * whatever is still untested is listed at the end. The person's own
 * settings are saved first and put back at the end.
 */
const { connect, workTab, ensureVisible, contentWorld, guardSettings, sleep } = require('./lib');

const siteId = process.argv[2];
const parts = (process.argv[3] || 'ads,switches,truth,pairs,flows,combos').split(',');
const P = require('./probes/' + siteId);

let failures = 0;
const untested = [];
const ok = (label, cond, detail) => { if (!cond) failures++; console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? '  — ' + detail : '')); };
const na = (label, why) => { untested.push(label + (why ? ' (' + why + ')' : '')); console.log('  - ' + label + (why ? ': ' + why : '')); };

/* A step that never finishes (a page that stops answering) would hold the
 * whole run; after six quiet minutes, say where it stuck and stop. The
 * person's settings are still on disk (guardSettings) for the next run. */
let lastStep = 'start', lastAt = Date.now();
const step = label => { lastStep = label; lastAt = Date.now(); };
const watchdog = setInterval(() => {
  if (Date.now() - lastAt > 6 * 60 * 1000) {
    console.log('  ✗ stuck for six minutes at: ' + lastStep + ' — stopping; the next run puts the settings back');
    process.exit(3);
  }
}, 30000);
watchdog.unref();

/* Count a probe's elements on the page, and how many are hidden. A probe is
 * a function source returning elements (shadow-root elements are fine).
 * With mark, the ones visible now are remembered; later calls with only
 * judge just those, since sites keep some of their own elements hidden. */
function measure(page, src, how, tag) {
  return page.evaluate((src, how, tag) => {
    const key = '__lt' + (tag || '');
    let els = new Function('return (' + src + ')()')() || [];
    if (how === 'mark') els.forEach(e => { e[key] = e.checkVisibility(); });
    if (how === 'only' || how === 'mark') els = els.filter(e => e[key]);
    return { n: els.length, hidden: els.filter(e => !e.checkVisibility()).length };
  }, src, how || null, tag || '');
}

/* Remember every post and landmark visible now. A post is judged by its
 * first box with a layout (LinkedIn's posts are display: contents). */
function markWatch(page, units, landmarks) {
  return page.evaluate((units, landmarks) => {
    const boxOf = el => { let b = el; for (let i = 0; i < 4 && b; i++) { if (b.checkVisibility()) return b; b = b.firstElementChild; } return null; };
    window.__lw = [];
    document.querySelectorAll(units).forEach(u => { const b = boxOf(u); if (b) window.__lw.push({ el: u, box: b, kind: 'post' }); });
    (landmarks || []).forEach(sel => document.querySelectorAll(sel).forEach(l => {
      if (l.checkVisibility()) window.__lw.push({ el: l, box: l, kind: 'landmark ' + sel });
    }));
    return window.__lw.length;
  }, units, landmarks);
}

/* What went missing that the switch's targets don't account for. */
function collateral(page, src, posts) {
  return page.evaluate((src, posts) => {
    const T = new Function('return (' + src + ')()')() || [];
    const name = el => el.localName + ['data-testid', 'data-e2e', 'data-a-target', 'data-test-selector', 'id', 'role', 'aria-label']
      .filter(a => el.getAttribute(a)).map(a => '[' + a + '=' + el.getAttribute(a).slice(0, 24) + ']').slice(0, 2).join('') +
      (el.getAttribute('data-bfx-hidden-by') ? ' (hidden by ' + el.getAttribute('data-bfx-hidden-by') + ')' : '');
    const bad = [];
    (window.__lw || []).forEach(w => {
      if (!w.el.isConnected || w.box.checkVisibility()) return;
      const covered = T.some(t => t === w.el || t === w.box || t.contains(w.el) ||
        (posts && w.kind === 'post' && w.el.contains(t)));
      if (!covered) bad.push(w.kind + ': ' + name(w.el));
    });
    return bad;
  }, src, !!posts);
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
  const restoreSettings = await guardSettings(run);
  const ids = await run(`BFX_SITES.get(${JSON.stringify(siteId)}).presets.map(function (r) { return r.id; })`);
  const units = await run(`BFX_SITES.get(${JSON.stringify(siteId)}).units`);
  const set = body => run(`BFX_STORE.update(function (s) { var me = BFX_STORE.site(s, ${JSON.stringify(siteId)}); ${body} }).then(function () { return 1; })`);
  const only = list => set(`${JSON.stringify(ids)}.forEach(function (k) { me.presets[k] = false; }); ${JSON.stringify(list)}.forEach(function (k) { me.presets[k] = true; }); me.custom = []; me.enabled = true; s.enabled = true; s.placeholders = false; s.keywords.enabled = false;`);
  const goto = async url => {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(5000);
    run = await contentWorld(page);
  };
  const resolve = async where => (typeof where === 'function' ? where(page) : where);
  const markers = () => page.evaluate(() => document.querySelectorAll('[data-bfx-hidden-by]').length);
  /* Everything hidden by us, CSS rules and markers alike. */
  const hiddenByUs = () => page.evaluate(() => {
    const sheet = document.getElementById('bfx-style');
    const seen = new Set();
    if (sheet) sheet.textContent.split('\n').forEach(line => {
      if (!/display:none/.test(line)) return;
      try { document.querySelectorAll(line.slice(0, line.lastIndexOf('{'))).forEach(e => seen.add(e)); } catch (e) { /* not ours to judge */ }
    });
    return seen.size;
  });
  /* A nav step is a selector, or a function source returning the element
   * (for links inside a shadow root). */
  const clickNav = step => page.evaluate(step => {
    const el = /^\s*\(/.test(step) ? new Function('return (' + step + ')()')() : document.querySelector(step);
    if (!el) return false;
    el.click();
    return true;
  }, step);
  const errors = [];
  page.on('pageerror', e => { if (/bfx|BFX/.test(e.stack || e.message)) errors.push(e.message); });

  try {
    /* ------------------------------------------------------------- ads -- */
    if (parts.includes('ads')) {
      console.log('\n' + siteId + ': ads stay hidden while scrolling and hovering');
      await set('');   // the person's settings, as they are
      for (const [name, url] of Object.entries(P.adPages || { home: P.home })) {
        step('ads on ' + name);
        await goto(await resolve(url));
        const samples = [];
        for (let i = 0; i < (P.adSteps || 12); i++) {
          await wheel(page, 1, true);
          samples.push(await measure(page, P.ads));
        }
        const seen = Math.max(...samples.map(s => s.n));
        const leaked = samples.filter(s => s.hidden < s.n);
        if (!seen) { na(`ads on ${name}`, 'no ads served this time'); continue; }
        ok(`${name}: ${seen} ad markers seen, none visible at any step`, !leaked.length,
          leaked.map(s => (s.n - s.hidden) + ' visible').join(', '));
      }
    }

    /* -------------------------------------------------------- switches -- */
    if (parts.includes('switches')) {
      console.log('\n' + siteId + ': every switch on its own, and nothing else with it');
      for (const id of ids.filter(i => !process.env.ONLY || process.env.ONLY.split(',').includes(i))) {
        step('switch ' + id);
        const probe = P.switches[id] || (id === 'noAutoplay' ? { autoplay: true } : null);
        if (!probe) { na(id, 'no live probe'); continue; }
        /* Autoplay: off, some video starts by itself after the page loads;
         * on, none does (nothing is clicked). */
        if (probe.autoplay) {
          const url = await resolve(probe.page || P.home);
          /* Videos anywhere, shadow roots included (Reddit's player). */
          const playing = () => page.evaluate(() => {
            const out = [];
            const walk = root => { root.querySelectorAll('video').forEach(v => out.push(v)); root.querySelectorAll('*').forEach(e => e.shadowRoot && walk(e.shadowRoot)); };
            walk(document);
            window.__videos = out;
            return { videos: out.length, playing: out.filter(v => !v.paused && !v.ended).length };
          });
          /* Start one from script, no click, the way a site's autoplay does. */
          const scripted = () => page.evaluate(async () => {
            const v = (window.__videos || []).find(x => x.isConnected);
            if (!v) return null;
            (v.getRootNode().host || v).scrollIntoView({ block: 'center' });
            v.muted = true;
            if (!v.paused) v.pause();
            await new Promise(r => setTimeout(r, 1700));
            const started = await v.play().then(() => true, () => false);
            await new Promise(r => setTimeout(r, 900));
            return { started, playing: !v.paused };
          });
          await only([]); await goto(url); await wheel(page, probe.scroll || 1, false); await sleep(2500);
          const off = await playing();
          const offScript = await scripted();
          await only(['noAutoplay']); await goto(url); await wheel(page, probe.scroll || 1, false); await sleep(3500);
          const on = await playing();
          const onScript = await scripted();
          await only([]);
          if (!off.videos) { na(id, 'no videos on the page'); continue; }
          if (off.playing) ok(`${id}: ${off.playing} of ${off.videos} videos start by themselves with it off; with it on, ${on.playing} of ${on.videos} play`, on.playing === 0);
          else na(id + ' (videos starting on their own)', `none did, even with it off (${off.videos} videos)`);
          if (offScript && offScript.started && offScript.playing && !onScript) {
            na(id + ' (scripted start)', 'no video on the page with the switch on');
          } else if (offScript && offScript.started && offScript.playing) {
            ok(`${id}: a video started from script without a click keeps playing with it off, and is paused with it on`,
              !!onScript && !onScript.playing, JSON.stringify({ offScript, onScript }));
          } else na(id + ' (scripted start)', 'the page would not play a video from script: ' + JSON.stringify(offScript));
          continue;
        }
        /* Where to look: the probe's page, then its other pages, scrolling
         * further each time, until something is there to act on. */
        const tries = [{ where: probe.page || P.home, scroll: probe.scroll || 0 }]
          .concat((probe.retry || []).map(w => ({ where: w, scroll: probe.scroll || 0 })))
          .concat([{ where: probe.page || P.home, scroll: (probe.scroll || 0) + 10 }]);
        let a = null;
        for (const t of tries) {
          const url = await resolve(t.where);
          if (page.url().split('#')[0] !== url) await goto(url);
          await only([]); await sleep(1200);
          if (t.scroll) await wheel(page, t.scroll, false);
          if (probe.effect) { a = { effect: true }; break; }
          a = await measure(page, probe.find, 'mark');
          if (a.n) break;
        }
        if (probe.effect) {
          /* Effects like blur lift while the mouse is over a post. */
          await page.mouse.move(2, 2);
          const x = await page.evaluate(probe.effect);
          await only([id]); await sleep(1500);
          const y = await page.evaluate(probe.effect);
          await only([]); await sleep(1500);
          const z = await page.evaluate(probe.effect);
          ok(`${id}: off/on/off = ${x} / ${y} / ${z}`, x !== y && x === z);
          continue;
        }
        if (!a.n) { na(id, 'nothing to act on, even after scrolling further' + (probe.retry ? ' and other pages' : '')); continue; }
        await markWatch(page, units, P.landmarks);
        await only([id]); await sleep(1600);
        const b = await measure(page, probe.find, 'only');
        const extra = await collateral(page, probe.find, probe.posts);
        await only([]); await sleep(1600);
        const c = await measure(page, probe.find, 'only');
        const back = await page.evaluate(() => (window.__lw || []).filter(w => w.el.isConnected && !w.box.checkVisibility()).length);
        ok(`${id}: ${a.n} targets — on ${b.hidden}/${b.n} hidden, off again ${c.hidden} hidden; nothing else hidden${back ? ', ' + back + ' still gone after' : ''}`,
          b.n > 0 && b.hidden === b.n && c.hidden === 0 && !extra.length && !back,
          extra.length ? extra.slice(0, 4).join(' | ') + (extra.length > 4 ? ' … ' + extra.length + ' in all' : '') : '');
      }
    }

    /* ----------------------------------------------------------- truth -- */
    if (parts.includes('truth') && P.truth) {
      console.log('\n' + siteId + ': ads against an independent count');
      for (const [name, where] of Object.entries(P.truth.pages || { home: P.home })) {
        step('truth on ' + name);
        await goto(await resolve(where));
        await only(P.truth.switches); await sleep(1500);
        await page.evaluate(() => { window.__tr = { ads: new Set(), organic: new Set(), leak: new Set(), wrong: new Set() }; });
        for (let i = 0; i < (P.truth.steps || 14); i++) {
          await wheel(page, 1, true);
          await page.evaluate((adSrc, orgSrc) => {
            const R = window.__tr;
            const boxOf = el => { let b = el; for (let k = 0; k < 4 && b; k++) { if (getComputedStyle(b).display !== 'contents') return b; b = b.firstElementChild; } return el; };
            const shown = el => boxOf(el).checkVisibility();
            (new Function('return (' + adSrc + ')()')() || []).forEach(el => { R.ads.add(el); if (shown(el)) R.leak.add(el); });
            (new Function('return (' + orgSrc + ')()')() || []).forEach(el => { R.organic.add(el); if (!shown(el)) R.wrong.add(el); });
          }, P.truth.ads, P.truth.organic);
        }
        const r = await page.evaluate(() => ({ ads: window.__tr.ads.size, organic: window.__tr.organic.size, leak: window.__tr.leak.size, wrong: window.__tr.wrong.size }));
        if (!r.ads) na(`truth on ${name}`, 'no ads served this time; ' + r.organic + ' ordinary posts, ' + r.wrong + ' wrongly hidden');
        ok(`${name}: ${r.ads} ads, ${r.organic} ordinary posts — ${r.leak} ads left visible, ${r.wrong} ordinary posts hidden`,
          r.leak === 0 && r.wrong === 0 && r.organic > 0);
      }
    }

    /* ----------------------------------------------------------- pairs -- */
    if (parts.includes('pairs') && P.pairs) {
      console.log('\n' + siteId + ': switches that overlap, together and apart');
      for (const [A, B] of P.pairs) {
        step('pair ' + A + ' + ' + B);
        const pa = P.switches[A], pb = P.switches[B];
        if (!pa || !pb) { na(`${A} + ${B}`, 'no probe'); continue; }
        const url = await resolve(pa.page || pb.page || P.home);
        if (page.url().split('#')[0] !== url) await goto(url);
        await only([]); await sleep(1200);
        await wheel(page, Math.max(pa.scroll || 0, pb.scroll || 0), false);
        await page.mouse.move(2, 2);
        if (pa.effect || pb.effect) {
          const fx = async () => [pa.effect ? await page.evaluate(pa.effect) : null, pb.effect ? await page.evaluate(pb.effect) : null];
          const off = await fx();
          await only([A, B]); await sleep(1500);
          const both = await fx();
          await only([B]); await sleep(1500);
          const bOnly = await fx();
          await only([A]); await sleep(1500);
          const aOnly = await fx();
          await only([]); await sleep(1500);
          const none = await fx();
          const okA = !pa.effect || (both[0] !== off[0] && aOnly[0] === both[0] && bOnly[0] === off[0] && none[0] === off[0]);
          const okB = !pb.effect || (both[1] !== off[1] && bOnly[1] === both[1] && aOnly[1] === off[1] && none[1] === off[1]);
          ok(`${A} + ${B}: both apply together, each lifts alone`, okA && okB, JSON.stringify({ off, both, aOnly, bOnly, none }));
          continue;
        }
        const ma = await measure(page, pa.find, 'mark', 'A');
        const mb = await measure(page, pb.find, 'mark', 'B');
        if (!ma.n || !mb.n) { na(`${A} + ${B}`, `nothing to act on (${ma.n} / ${mb.n} targets)`); continue; }
        /* A target of one switch inside a target of the other stays hidden
         * while the other is on; everything else follows its own switch. */
        const stage = async on => {
          await only(on); await sleep(1600);
          return page.evaluate((srcA, srcB) => {
            const get = src => (new Function('return (' + src + ')()')() || []);
            const A = get(srcA).filter(e => e.__ltA), B = get(srcB).filter(e => e.__ltB);
            /* contains() is true for the element itself: two switches
             * hiding the very same element count as covering each other. */
            const inside = (e, list) => list.some(o => o.contains(e));
            const hid = list => list.filter(e => !e.checkVisibility());
            return {
              aHidden: hid(A).length, aN: A.length, bHidden: hid(B).length, bN: B.length,
              /* elements of one switch that sit inside the other's targets */
              aInB: A.filter(e => inside(e, B)).length, bInA: B.filter(e => inside(e, A)).length,
              aShownOutsideB: A.filter(e => !inside(e, B) && !e.checkVisibility()).length,
              bShownOutsideA: B.filter(e => !inside(e, A) && !e.checkVisibility()).length
            };
          }, pa.find, pb.find);
        };
        const both = await stage([A, B]);
        if (!both.aN || !both.bN) { na(`${A} + ${B}`, `the targets left the page before the test (${both.aN} / ${both.bN})`); await stage([]); continue; }
        const bOnly = await stage([B]);     // A switched off first
        const none1 = await stage([]);
        await stage([A, B]);
        const aOnly = await stage([A]);     // B switched off first
        const none2 = await stage([]);
        const good =
          both.aHidden === both.aN && both.bHidden === both.bN &&
          bOnly.bHidden === bOnly.bN && bOnly.aShownOutsideB === 0 &&
          aOnly.aHidden === aOnly.aN && aOnly.bShownOutsideA === 0 &&
          none1.aHidden === 0 && none1.bHidden === 0 && none2.aHidden === 0 && none2.bHidden === 0;
        ok(`${A} + ${B}: together ${both.aHidden}/${both.aN} + ${both.bHidden}/${both.bN} hidden; ${A} off first leaves ${B}'s hidden, ${B} off first leaves ${A}'s; all back after`,
          good, good ? '' : JSON.stringify({ both, bOnly, aOnly, none1, none2 }));
      }
    }

    /* ----------------------------------------------------------- flows -- */
    if (parts.includes('flows')) {
      console.log('\n' + siteId + ': risky flows');

      /* A "show" bar clicked open stays open, through scrolling and a
       * settings change. */
      step('flow: show bar');
      if (P.reveal) {
        await goto(await resolve(P.reveal.page || P.home));
        await only([]);
        await set(`s.placeholders = true; s.keywords = { enabled: true, terms: ${JSON.stringify(P.reveal.words)} };`);
        let bar = 0;
        for (let i = 0; i < 6 && !bar; i++) {
          bar = await page.evaluate(() => document.querySelectorAll('[data-bfx-hidden-by][data-bfx-note]').length);
          if (!bar) await wheel(page, 1, false);
        }
        if (!bar) na('"show" bars', 'no post matched ' + P.reveal.words.join(', '));
        else {
          const opened = await page.evaluate(() => {
            const el = [...document.querySelectorAll('[data-bfx-hidden-by][data-bfx-note]')].find(e => e.getBoundingClientRect().height > 0);
            if (!el) return null;
            el.setAttribute('data-bfx-test-opened', '');
            el.click();
            return { revealed: el.hasAttribute('data-bfx-revealed'), stillMarked: el.hasAttribute('data-bfx-hidden-by') };
          });
          await wheel(page, 2, false);
          await set('me.presets[' + JSON.stringify(ids[0]) + '] = true;'); await sleep(1500);
          const after = await page.evaluate(() => {
            const el = document.querySelector('[data-bfx-test-opened]');
            if (!el) return 'gone from the page';
            const box = (() => { let b = el; for (let k = 0; k < 4 && b; k++) { if (getComputedStyle(b).display !== 'contents') return b; b = b.firstElementChild; } return el; })();
            const res = { revealed: el.hasAttribute('data-bfx-revealed'), hidden: el.hasAttribute('data-bfx-hidden-by'), visible: box.checkVisibility() };
            el.removeAttribute('data-bfx-test-opened');
            return res;
          });
          ok(`a "show" bar (${bar} on the page) opens its post, which stays open through scrolling and a settings change`,
            opened && opened.revealed && !opened.stillMarked && (after === 'gone from the page' || (after.revealed && !after.hidden && after.visible)),
            JSON.stringify({ opened, after }));
        }
      }

      /* Navigating inside the site with the defaults on: rules apply on the
       * new page and on the way back. */
      step('flow: navigation');
      if (P.nav) {
        await goto(P.home);
        await set(`${JSON.stringify(ids)}.forEach(function (k) { delete me.presets[k]; }); me.custom = []; me.enabled = true; s.enabled = true; s.keywords.enabled = false; s.placeholders = false;`);
        await sleep(1500);
        const hops = [];
        for (const sel of P.nav) {
          const clicked = await clickNav(sel);
          await sleep(4000);
          const st = await page.evaluate(ads => ({
            path: location.pathname,
            sheet: document.querySelectorAll('#bfx-style').length,
            rules: (document.getElementById('bfx-style') || { textContent: '' }).textContent.split('\n').length,
            adsShown: (new Function('return (' + ads + ')()')() || []).filter(e => e.checkVisibility()).length
          }), P.ads);
          hops.push(Object.assign({ clicked }, st));
        }
        ok(`moving around inside the site (${hops.map(h => h.path).join(' → ')}): one stylesheet with the rules on every page, no ad shown`,
          hops.every(h => h.clicked && h.sheet === 1 && h.rules > 2 && h.adsShown === 0), JSON.stringify(hops));
      }

      step('flow: picker');
      /* The picker over a page with everything on, then cancelled: nothing
       * hidden changes and nothing is saved. */
      await goto(P.home);
      await only(ids.filter(i => !(P.skipInAllOn || []).includes(i))); await sleep(2000);
      const before = await hiddenByUs();
      const picking = await run(`(function () { BFX_PICKER.start(function () {}); return document.documentElement.hasAttribute('data-bfx-picking'); })()`);
      await page.mouse.move(500, 400); await sleep(400);
      await page.keyboard.press('Escape'); await sleep(800);
      const afterPick = await page.evaluate(() => ({ picking: document.documentElement.hasAttribute('data-bfx-picking'), overlay: !!document.querySelector('.bfx-picker-root') }));
      const savedRules = await run(`BFX_STORE.get().then(function (s) { return BFX_STORE.site(s, ${JSON.stringify(siteId)}).custom.length; })`);
      const afterMarkers = await hiddenByUs();
      ok(`the picker over everything-on, then Esc: it opens and closes, ${before} hidden things stay hidden (${afterMarkers} after), nothing saved`,
        picking && !afterPick.picking && !afterPick.overlay && savedRules === 0 && before > 0 && afterMarkers >= before * 0.8,
        JSON.stringify({ picking, afterPick, savedRules, before, afterMarkers }));

      /* A picked rule over a switch's target: either one hides it, and it
       * comes back only when both let go. */
      step('flow: picked rule');
      if (P.custom) {
        const sw = P.switches[P.custom.preset];
        await goto(await resolve((sw && sw.page) || P.home));
        await only([]); await sleep(1200);
        const sel = await run(`(function () { var el = (${P.custom.find})()[0]; if (!el) return null; var r = BFX_PICKER.selectorFor(el); return r.valid ? r.selector : null; })()`);
        if (!sel) na('a picked rule over a switch', 'nothing to pick');
        else {
          const target = `() => [...document.querySelectorAll(${JSON.stringify(sel)})]`;
          await measure(page, target, 'mark', 'C');
          const addRule = enabled => set(`me.custom = [{ id: 'live-test', selector: ${JSON.stringify(sel)}, label: 'live test', scope: 'all', enabled: ${enabled}, createdAt: Date.now() }];`);
          const hidden = async () => (await measure(page, target, 'only', 'C'));
          await addRule(true); await sleep(1500); const r1 = await hidden();
          await set(`me.presets[${JSON.stringify(P.custom.preset)}] = true;`); await sleep(1500); const r2 = await hidden();
          await set(`me.custom[0].enabled = false;`); await sleep(1500); const r3 = await hidden();
          await set(`me.presets[${JSON.stringify(P.custom.preset)}] = false;`); await sleep(1500); const r4 = await hidden();
          await set(`me.custom[0].enabled = true; me.custom[0].scope = 'path'; me.custom[0].path = '/somewhere-else/';`); await sleep(2500); const r5 = await hidden();
          await set(`me.custom = [];`); await sleep(1500); const r6 = await hidden();
          const all = r => r.n > 0 && r.hidden === r.n, none = r => r.hidden === 0;
          ok(`a picked rule (${sel.slice(0, 60)}) with ${P.custom.preset} over it: hidden by either, back when both let go, not applied on other pages`,
            all(r1) && all(r2) && all(r3) && none(r4) && none(r5) && none(r6), JSON.stringify([r1, r2, r3, r4, r5, r6]));
        }
      }

      /* Word blocks: a regex works, a broken one is treated as a plain
       * word, and an empty list hides nothing. */
      await goto(P.home);
      await only([]);
      await set(`s.keywords = { enabled: true, terms: ['/(unclosed/', '', '   ', '/zzqx(yy|ww)\\\\d{9}/i'] };`); await sleep(2000);
      await wheel(page, 2, false);
      const kw = await page.evaluate(() => document.querySelectorAll('[data-bfx-hidden-by="keyword"]').length);
      ok('word blocks with a broken regex, blanks and a regex matching nothing: nothing hidden, no errors', kw === 0 && !errors.length,
        kw + ' hidden; ' + errors.join(' | '));
    }

    /* ---------------------------------------------------------- combos -- */
    if (parts.includes('combos')) {
      step('everything at once');
      console.log('\n' + siteId + ': everything at once');
      await goto(P.home);
      const state = () => page.evaluate(() => ({
        markers: document.querySelectorAll('[data-bfx-hidden-by]').length,
        styles: document.querySelectorAll('#bfx-style').length
      }));
      await only(ids.filter(i => !(P.skipInAllOn || []).includes(i)));
      await set('s.placeholders = true; s.keywords = { enabled: true, terms: ["crypto"] };');
      await sleep(2000);
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
      const hiddenAll = await hiddenByUs();
      ok(`everything on: one stylesheet, ${ownMs}ms in the extension's scripts over 8 scrolls (longest page task ${lt}ms)`,
        all.styles === 1 && ownMs < 250);
      const landmarksLeft = await page.evaluate(sels => (sels || []).filter(s => [...document.querySelectorAll(s)].some(e => e.checkVisibility())).length, P.alwaysThere || []);
      if (P.alwaysThere) ok(`everything on still leaves the page usable (${(P.alwaysThere || []).join(', ')})`, landmarksLeft === P.alwaysThere.length);
      await set('s.enabled = false;'); await sleep(1500);
      const paused = await state();
      ok('pause with everything on: every marker removed', paused.markers === 0, JSON.stringify(paused));
      const pausedHidden = await hiddenByUs();
      await set('s.enabled = true;'); await sleep(2500);
      const resumed = await state();
      const resumedHidden = await hiddenByUs();
      ok(`pause hides nothing (${pausedHidden}); resume brings the rules back (${hiddenAll} hidden before the pause, ${resumedHidden} after)`,
        pausedHidden === 0 && resumed.styles === 1 && resumedHidden >= hiddenAll * 0.7 && resumedHidden > 0);
      await set('me.enabled = false;'); await sleep(1500);
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
    await restoreSettings(again);
    if (P.cleanup) await P.cleanup(page).catch(() => {});
    await page.close();
    browser.disconnect();
  }
  if (untested.length) console.log('\nnot tested on the live site this run:\n  ' + untested.join('\n  '));
  console.log('\n' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
