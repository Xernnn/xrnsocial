/* What a page really loads and shows as ads: node test/live/ads-survey.js <url> [scrolls]
 *
 * Complements survey.js for sites whose ads are third-party boxes rather than
 * their own elements. Prints the iframes, every request to a host other than
 * the page's own, and large boxes in the page whose attributes or text look
 * like an ad. Read-only: it never clicks anything.
 */
const { connect, workTab, ensureVisible, scroll, sleep } = require('./lib');

(async () => {
  const url = process.argv[2];
  const steps = Number(process.argv[3] || 5);
  const browser = await connect();
  const page = await workTab(browser);
  const hosts = {};
  page.on('request', r => {
    try {
      const h = new URL(r.url()).hostname;
      const k = h + ' ' + r.resourceType();
      hosts[k] = (hosts[k] || 0) + 1;
    } catch (e) { /* data: and the like */ }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await ensureVisible(page, { focus: false });
  await sleep(6000);
  await scroll(page, steps, 800, 1500);
  await sleep(2000);
  const out = await page.evaluate(() => {
    const css = e => {
      const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (c ? '.' + c : '');
    };
    const path = (e, n) => { const p = []; for (let i = 0; e && i < (n || 4); i++, e = e.parentElement) p.push(css(e)); return p.join(' < '); };
    const box = e => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top + scrollY); };
    const frames = [...document.querySelectorAll('iframe')].map(f => box(f) + ' ' + (f.src || f.name || '(no src)').slice(0, 110) + '  ' + path(f, 5));
    const smell = [];
    document.querySelectorAll('body *').forEach(e => {
      const at = [...e.attributes].map(a => a.name + '=' + a.value).join(' ');
      if (/(^|[\s_\-="/])(ad|ads|adsense|advert\w*|sponsor\w*|promo\w*|banner|premium|gam)([\s_\-="/]|$)/i.test(at) && e.getBoundingClientRect().height > 10) {
        smell.push(box(e) + ' ' + path(e, 3) + '  [' + at.slice(0, 120) + ']');
      }
    });
    const labels = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = tw.nextNode())) {
      const v = t.nodeValue.trim();
      if (v.length < 40 && /\b(ads?|advertisement|sponsored|promoted|premium|広告|プレミアム|プロモーション)\b/i.test(v)) labels.push(v + '  ' + path(t.parentElement, 3));
    }
    return { url: location.href, title: document.title, height: document.documentElement.scrollHeight, frames, smell: [...new Set(smell)].slice(0, 50), labels: [...new Set(labels)].slice(0, 30) };
  });
  for (const [k, v] of Object.entries(out)) console.log('## ' + k + '\n' + (Array.isArray(v) ? v.join('\n') : v) + '\n');
  const own = new URL(page.url()).hostname.replace(/^www\./, '');
  console.log('## third-party requests\n' + Object.entries(hosts).filter(([k]) => !k.startsWith(own) && !k.includes('.' + own)).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => v + ' ' + k).join('\n'));
  if (!process.env.KEEP) await page.close();
  browser.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
