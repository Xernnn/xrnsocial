/* Where each X switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. `posts`
 * marks switches that hide whole timeline rows; any other switch hiding a
 * row is collateral damage. */

const CELL = '[data-testid="cellInnerDiv"]';

/* A post with a long reply thread, found from the home timeline. */
async function postPage(page) {
  if (!/x\.com\/home/.test(page.url())) {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
  }
  const link = await page.evaluate(() => {
    const best = [...document.querySelectorAll('article[data-testid="tweet"]')].map(a => {
      const t = a.querySelector('a[href*="/status/"] time');
      const n = parseFloat(((a.querySelector('[data-testid="reply"]') || {}).textContent || '0').replace(/,/g, '')) *
        (/K/.test((a.querySelector('[data-testid="reply"]') || {}).textContent || '') ? 1000 : 1);
      return { href: t && t.parentElement.getAttribute('href'), n };
    }).filter(x => x.href).sort((a, b) => b.n - a.n)[0];
    return best ? best.href : '/home';
  });
  return 'https://x.com' + link;
}

/* A right-column block, found the way the pack finds it: the largest box
 * around its mark that holds no other block's mark. */
const block = mark => `() => {
  const col = document.querySelector('[data-testid="sidebarColumn"]');
  const marks = ['form[role="search"]', 'a[href^="/i/premium_sign_up"]', '[data-testid="news_sidebar"]', '[data-testid="trend"]', '[data-testid="UserCell"]', 'nav'];
  const m = col && col.querySelector('${mark}');
  if (!m) return [];
  const others = marks.filter(x => x !== '${mark}').join(', ');
  let n = m;
  while (n.parentElement && n.parentElement !== col) {
    if ([...n.parentElement.querySelectorAll(others)].some(o => !n.contains(o))) return [n];
    n = n.parentElement;
  }
  return [];
}`;

const AD = `c => c.querySelector('[data-testid$="-impression-pixel"], a[href*="twclid="]')`;

module.exports = {
  home: 'https://x.com/home',
  postPage,
  landmarks: ['[data-testid="primaryColumn"]', '[data-testid="sidebarColumn"]', 'header[role="banner"]', '[data-testid="primaryColumn"] section[role="region"]'],
  alwaysThere: ['[data-testid="primaryColumn"]', 'header[role="banner"]'],
  adPages: { home: 'https://x.com/home', 'a reply thread': postPage },
  adSteps: 14,
  /* It clicks the Following tab, which X remembers for the account. */
  skipInAllOn: ['following'],
  ads: `() => [...document.querySelectorAll('${CELL}')].filter(${AD})`,
  popup: { label: 'Chat drawer', find: `() => [...document.querySelectorAll('[data-testid="chat-drawer-root"]')]` },
  truth: {
    switches: ['promoted'],
    pages: { home: 'https://x.com/home', 'a reply thread': postPage },
    ads: `() => [...document.querySelectorAll('${CELL}')].filter(${AD})`,
    organic: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('article[data-testid="tweet"]') && !(${AD})(c))`
  },
  pairs: [
    ['postActions', 'counts'], ['media', 'videoPosts'], ['rightSidebar', 'trends'], ['rightSidebar', 'premiumUpsell'],
    ['rightSidebar', 'whoToFollow'], ['trends', 'promotedTrends'], ['navExtras', 'grok'], ['composer', 'grok'],
    ['promoted', 'videoPosts'], ['reposts', 'videoPosts'], ['grayscale', 'blurFeed']
  ],
  reveal: { words: ['the'] },
  nav: ['a[data-testid="AppTabBar_Explore_Link"]', 'a[data-testid="AppTabBar_Home_Link"]'],
  custom: { find: `() => [...document.querySelectorAll('header nav a[href="/i/grok"]')]`, preset: 'grok' },
  switches: {
    noAutoplay: { autoplay: true, scroll: 5 },
    promoted: { posts: true, find: `() => [...document.querySelectorAll('${CELL}')].filter(${AD})`, scroll: 8, retry: [postPage] },
    promotedTrends: { find: `() => [...document.querySelectorAll('[data-testid="trend"]')].filter(t => t.querySelector('path[d^="M19.498 3h-15c-1.381"]'))` },
    premiumUpsell: { find: `() => [...document.querySelectorAll('header a[href^="/i/premium_sign_up"]')].concat((${block('a[href^="/i/premium_sign_up"]')})())` },
    /* Timeline modules come as rows: a heading, user cells, "Show more". */
    whoToFollow: { posts: true, scroll: 10, find: `() => { const cells = [...document.querySelectorAll('${CELL}')]; const rows = cells.filter((c, i) => !c.querySelector('article') && (c.querySelector('[data-testid="UserCell"], a[href^="/i/connect_people"]') || (c.querySelector('h2, [role="heading"]') && cells[i + 1] && cells[i + 1].querySelector('[data-testid="UserCell"]')))); return rows.concat((${block('[data-testid="UserCell"]')})()); }` },
    reposts: { posts: true, find: `() => [...document.querySelectorAll('${CELL}')].filter(c => { const s = c.querySelector('[data-testid="socialContext"]'); if (!s) return false; let r = s; for (let i = 0; i < 6 && r && !r.querySelector('svg'); i++) r = r.parentElement; const p = r && r.querySelector('svg path'); return p && /^M4\\.75 3\\.79/.test(p.getAttribute('d')); })`, scroll: 14 },
    videoPosts: { posts: true, find: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('article [data-testid="videoPlayer"]'))`, scroll: 6 },
    /* No scrolling first: the rule needs to have seen the opened post, which
     * it does whenever the switch is on as a thread opens. */
    verifiedReplies: { posts: true, page: postPage, find: `() => { const id = location.pathname.split('/status/')[1]; const cells = [...document.querySelectorAll('${CELL}')]; const i = cells.findIndex(c => c.querySelector('a[href$="/status/' + id + '"] time')); return i < 0 ? [] : cells.slice(i + 1).filter(c => { const n = [...c.querySelectorAll('[data-testid="User-Name"]')].find(x => !x.closest('[role="link"]')); return n && n.querySelector('[data-testid="icon-verified"]'); }); }` },
    postActions: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [role="group"]')].filter(g => g.querySelector('[data-testid="like"], [data-testid="unlike"]'))` },
    counts: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [role="group"] [data-testid="app-text-transition-container"]')].filter(e => e.textContent.trim())` },
    media: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [data-testid="tweetPhoto"], article[data-testid="tweet"] [data-testid="card.wrapper"]')]` },
    rightSidebar: { find: `() => [...document.querySelectorAll('[data-testid="sidebarColumn"]')]` },
    trends: { find: block('[data-testid="trend"]') },
    news: { find: block('[data-testid="news_sidebar"]') },
    sidebarSearch: { find: block('form[role="search"]') },
    navExtras: { find: `() => [...document.querySelectorAll('header nav a[href="/i/grok"], header nav a[href="/i/history"], header nav a[href^="/i/premium_sign_up"], header nav a[href="/i/jf/creators/studio"]')]` },
    grok: { find: `() => [...document.querySelectorAll('header a[href="/i/grok"], [data-testid="GrokDrawer"], article button[aria-label="Grok actions"], [data-testid="grokImgGen"]')]` },
    chatDrawer: { find: `() => [...document.querySelectorAll('[data-testid="chat-drawer-root"]')]` },
    newPostsPill: { find: `() => [...document.querySelectorAll('[data-testid="pillLabel"]')]` },
    /* The box the pack hides: the post box's container beside the timeline. */
    composer: { find: `() => [...document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweetTextarea_0"]')].map(t => { let n = t; while (n.parentElement && !n.parentElement.querySelector('${CELL}, [role="tablist"]') && !n.parentElement.matches('[data-testid="primaryColumn"]')) n = n.parentElement; return n; })` },
    badges: { find: `() => [...document.querySelectorAll('header nav a div[aria-label]')].filter(e => e.textContent.trim())` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('article[data-testid="tweet"]')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  },
  /* Put Home back on the tab it was on: the following switch may move it. */
  async cleanup(page) {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
  }
};
