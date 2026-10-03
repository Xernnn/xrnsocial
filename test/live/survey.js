/* First look at a site's markup: node test/live/survey.js <url> [scrolls]
 *
 * Opens the URL in its own tab of the live test window, scrolls, and prints
 * what a rule pack could key on: custom elements, landmarks, data-testid and
 * aria-label values, anything that smells of ads, and visible ad labels.
 * Read-only: it never clicks anything.
 */
const { connect, workTab, ensureVisible, scroll, sleep } = require('./lib');

(async () => {
  const url = process.argv[2];
  const steps = Number(process.argv[3] || 6);
  const browser = await connect();
  const page = await workTab(browser, url);
  await ensureVisible(page, { focus: false });
  await sleep(4000);
  await scroll(page, steps, 800, 1200);
  const out = await page.evaluate(() => {
    const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n || 40).map(([k, v]) => k + (v > 1 ? '×' + v : ''));
    const count = (sel, attr) => { const m = {}; document.querySelectorAll(sel).forEach(e => { const k = attr ? e.getAttribute(attr) : e.tagName.toLowerCase(); m[k] = (m[k] || 0) + 1; }); return m; };
    const custom = {};
    document.querySelectorAll('*').forEach(e => { if (e.tagName.includes('-')) custom[e.tagName.toLowerCase()] = (custom[e.tagName.toLowerCase()] || 0) + 1; });
    const shadowHosts = new Set();
    document.querySelectorAll('*').forEach(e => { if (e.shadowRoot) shadowHosts.add(e.tagName.toLowerCase()); });
    const adAttr = [];
    document.querySelectorAll('*').forEach(e => {
      for (const a of e.attributes) {
        if (/(^|[-_])(ad|ads|promoted|sponsor|sponsored|advert)([-_]|$)/i.test(a.name) || /^(promoted|sponsored|ad)$/i.test(a.value)) {
          adAttr.push(e.tagName.toLowerCase() + '[' + a.name + '=' + JSON.stringify(a.value.slice(0, 30)) + ']');
        }
      }
    });
    const labels = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = tw.nextNode())) {
      const v = t.nodeValue.replace(/[​-‍⁠﻿]/g, '').trim();
      if (/^(promoted|sponsored|ad|advertisement|paid partnership)$/i.test(v)) {
        let p = t.parentElement, chain = [];
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) chain.push(p.tagName.toLowerCase());
        labels.push(v + ' in ' + chain.join('<'));
      }
    }
    const roles = count('[role]', 'role');
    const landmarks = ['header', 'nav', 'main', 'aside', 'footer'].map(t => t + ':' + document.querySelectorAll(t).length).join(' ');
    return {
      url: location.href.replace(/\?.*/, ''),
      title: document.title,
      lang: document.documentElement.lang,
      landmarks,
      roles: top(roles, 20),
      custom: top(custom, 60),
      shadowHosts: [...shadowHosts].slice(0, 40),
      testids: top(count('[data-testid]', 'data-testid'), 50),
      ariaLabels: top(count('[aria-label]', 'aria-label'), 50),
      adAttr: [...new Set(adAttr)].slice(0, 40),
      adLabels: [...new Set(labels)].slice(0, 20)
    };
  });
  for (const [k, v] of Object.entries(out)) console.log('## ' + k + '\n' + (Array.isArray(v) ? v.join('\n') : v) + '\n');
  if (!process.env.KEEP) await page.close();
  browser.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
