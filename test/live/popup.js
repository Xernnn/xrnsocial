/* The popup against a live tab: node test/live/popup.js <site>
 *
 * Opens popup.html as a background tab in the same window as a work tab on
 * the site, where its tabs.query({ active, currentWindow }) finds that tab.
 * Checks the site cell, the hero's count and icon, the live counts, one switch
 * from the site's probe file (`popup: { label, find }`), and the site switch. The
 * person's own settings are saved first and put back at the end. */
const { connect, workTab, ensureVisible, contentWorld, guardSettings, sleep } = require('./lib');

const siteId = process.argv[2];
const P = require('./probes/' + siteId);

let failures = 0;
const ok = (label, cond, detail) => { if (!cond) failures++; console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? '  — ' + detail : '')); };

(async () => {
  const browser = await connect();
  const page = await workTab(browser, P.home);
  await ensureVisible(page, { focus: false });
  await sleep(5000);
  const run = await contentWorld(page);
  const restoreSettings = await guardSettings(run);
  const name = await run(`BFX_SITES.info(${JSON.stringify(siteId)}).name`);
  let popup;
  try {
    /* Start from the defaults for this site, with the extension on. */
    await run(`BFX_STORE.update(function (s) { s.enabled = true; var me = BFX_STORE.site(s, ${JSON.stringify(siteId)}); me.enabled = true; me.presets = {}; }).then(function () { return 1; })`);
    await sleep(1500);

    /* The service worker may be asleep; an extension page of our own can
     * open the tab as well. */
    const ext = await workTab(browser, 'chrome://extensions/');
    await sleep(500);
    const extId = await ext.evaluate(app => new Promise(r => chrome.management.getAll(l => r((l.find(e => e.name === app) || {}).id))), 'xrnsocial');
    const url = 'chrome-extension://' + extId + '/src/popup/popup.html';
    await ext.goto('chrome-extension://' + extId + '/src/options/options.html');
    const { windowId } = await (await page.createCDPSession()).send('Browser.getWindowForTarget');
    await ext.evaluate((windowId, url) => chrome.tabs.create({ windowId, url, active: false }).then(() => 1), windowId, url);
    popup = await (await browser.waitForTarget(t => t.url() === url)).page();
    await ext.close();
    await sleep(2500);

    const view = () => popup.evaluate(() => {
      const cell = sel => {
        const c = document.querySelector(sel);
        return c ? BFX_SITES.info(c.dataset.site).name : undefined;
      };
      const here = [...document.querySelectorAll('#sites .cell')].find(c => !c.querySelector('.cell-here').hidden);
      return {
        chosen: cell('#sites .cell.is-on'),
        here: here ? BFX_SITES.info(here.dataset.site).name : undefined,
        status: [document.getElementById('tallyNum').textContent, document.getElementById('tallyWord').textContent].filter(Boolean).join(' '),
        icon: document.getElementById('siteIcon').getAttribute('src'),
        groups: [...document.querySelectorAll('#groups .group-name')].map(g => g.textContent)
      };
    });
    const v = await view();
    ok(`the popup opens on ${name}, marked as this tab's site`, v.chosen === name && v.here === name, JSON.stringify(v.chosen + ' / ' + v.here));
    ok(`the hero reads "${v.status}"`, /^\d+ hidden here$/.test(v.status));
    ok(`${name} wears the xrnsocial icon`, v.icon === 'sites/' + siteId + '-on.svg', v.icon);
    ok(`${name}'s own groups are listed: ${v.groups.join(', ')}`, v.groups.length > 1);

    /* Counts show only on switches that hide something on this page. */
    const counts = await popup.evaluate(async () => {
      const out = [];
      for (const b of [...document.querySelectorAll('#groups .group-main')].map(x => x.closest('.group').dataset.group)) {
        document.querySelector(`.group[data-group="${b}"] .group-main`).click();
        await new Promise(r => setTimeout(r, 30));
        document.querySelectorAll('#groups .rule').forEach(r => {
          const chip = r.querySelector('.count');
          if (chip) out.push(r.querySelector('.rule-text').textContent + ': ' + chip.textContent);
        });
        document.querySelector(`.group[data-group="${b}"] .group-main`).click();
        await new Promise(r => setTimeout(r, 30));
      }
      return out;
    });
    console.log(`  · counts on this page: ${counts.join('; ') || 'none hide anything here'}`);

    const measure = () => page.evaluate(src => {
      const els = new Function('return (' + src + ')()')() || [];
      return { n: els.length, hidden: els.filter(e => !e.checkVisibility()).length };
    }, P.popup.find);
    const flip = () => popup.evaluate(async (id, label) => {
      const rule = BFX_SITES.get(id).presets.find(r => r.label === label);
      if (!rule) return false;
      const head = document.querySelector(`.group[data-group="${rule.group}"]`);
      if (!head.classList.contains('is-open')) head.querySelector('.group-main').click();
      await new Promise(r => setTimeout(r, 50));
      const row = [...document.querySelectorAll('#groups .rule')].find(r => r.querySelector('.rule-text').textContent === label);
      if (!row) return false;
      row.querySelector('input[type="checkbox"]').click();
      return true;
    }, siteId, P.popup.label);
    const before = await measure();
    if (!before.n) {
      console.log(`  - "${P.popup.label}": nothing on this page to toggle`);
    } else {
      const found = await flip(); await sleep(1500);
      const on = await measure();
      await flip(); await sleep(1500);
      const off = await measure();
      ok(`the "${P.popup.label}" switch in the popup hides it on the page and gives it back`,
        found && before.hidden === 0 && on.hidden === on.n && off.hidden === 0, JSON.stringify([before, on, off]));
    }

    const markers = () => page.evaluate(() => document.querySelectorAll('[data-bfx-hidden-by]').length);
    const rulesIn = () => page.evaluate(() => document.getElementById('bfx-style').textContent.split('\n').length);
    const rulesBefore = await rulesIn();
    await popup.evaluate(() => document.getElementById('siteEnabled').click()); await sleep(1500);
    const offView = await view();
    const offState = { markers: await markers(), rules: await rulesIn() };
    await popup.evaluate(() => document.getElementById('siteEnabled').click()); await sleep(1500);
    const backView = await view();
    ok(`the site switch off: nothing hidden, "${offView.status}", its own logo; back on: "${backView.status}"`,
      offState.markers === 0 && offState.rules < rulesBefore && offView.status === 'Off here' && offView.icon === 'sites/' + siteId + '-off.svg' &&
      /hidden here$/.test(backView.status) && backView.icon === v.icon,
      JSON.stringify(offState));

    /* Hide something starts the picker on the tab and closes the popup. */
    await popup.evaluate(() => document.getElementById('pick').click());
    await sleep(1000);
    const picking = await page.evaluate(() => document.documentElement.hasAttribute('data-bfx-picking'));
    ok('"Hide something" starts the picker on the page', picking);
    await page.keyboard.press('Escape');
    await sleep(300);
    ok('and Esc leaves it', !(await page.evaluate(() => document.documentElement.hasAttribute('data-bfx-picking'))));
  } finally {
    if (popup) await popup.close().catch(() => {});
    const again = await contentWorld(page).catch(() => run);
    await restoreSettings(again);
    await page.close();
    browser.disconnect();
  }
  console.log('\n' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
