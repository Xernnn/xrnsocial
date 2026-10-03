/* The popup against a live tab: node test/live/popup.js <site>
 *
 * Opens popup.html as a background tab in the same window as a work tab on
 * the site, where its tabs.query({ active, currentWindow }) finds that tab.
 * Checks the site chip, the status line, the live counts, one switch from the
 * site's probe file (`popup: { label, find }`), and the per-site switch. The
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
    const extId = await ext.evaluate(app => new Promise(r => chrome.management.getAll(l => r((l.find(e => e.name === app) || {}).id))), 'BlockDistractXrn');
    const url = 'chrome-extension://' + extId + '/src/popup/popup.html';
    await ext.goto('chrome-extension://' + extId + '/src/options/options.html');
    const { windowId } = await (await page.createCDPSession()).send('Browser.getWindowForTarget');
    await ext.evaluate((windowId, url) => chrome.tabs.create({ windowId, url, active: false }).then(() => 1), windowId, url);
    popup = await (await browser.waitForTarget(t => t.url() === url)).page();
    await ext.close();
    await sleep(2500);

    const view = () => popup.evaluate(() => ({
      chosen: (document.querySelector('.site.is-on') || {}).textContent,
      here: (document.querySelector('.site.is-here') || {}).textContent,
      status: document.getElementById('status').textContent,
      groups: [...document.querySelectorAll('#presets .group')].map(g => g.textContent),
      chips: [...document.querySelectorAll('#presets .row')].map(r => {
        const b = r.querySelector('b');
        const chip = b && b.querySelector('span');
        return chip ? b.firstChild.textContent + ': ' + chip.textContent : null;
      }).filter(Boolean)
    }));
    const v = await view();
    ok(`the popup opens on ${name}, marked as this tab's site`, v.chosen === name && v.here === name, JSON.stringify(v.chosen + ' / ' + v.here));
    ok(`status reads "${v.status}"`, new RegExp('^' + name + ': \\d+ rules? active$').test(v.status));
    ok(`${name}'s own groups are listed: ${v.groups.join(', ')}`, v.groups.length > 1);
    ok(`live counts on the switches that are on: ${v.chips.join('; ')}`, v.chips.length > 0);

    const measure = () => page.evaluate(src => {
      const els = new Function('return (' + src + ')()')() || [];
      return { n: els.length, hidden: els.filter(e => !e.checkVisibility()).length };
    }, P.popup.find);
    const flip = () => popup.evaluate(label => {
      const row = [...document.querySelectorAll('#presets .row')].find(r => r.querySelector('b') && r.querySelector('b').firstChild.textContent === label);
      if (!row) return false;
      row.querySelector('input[type="checkbox"]').click();
      return true;
    }, P.popup.label);
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
    ok(`"Use on this site" off: nothing hidden, status "${offView.status}"; back on: "${backView.status}"`,
      offState.markers === 0 && offState.rules < rulesBefore && offView.status === name + ': off' && backView.status === v.status,
      JSON.stringify(offState));
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
