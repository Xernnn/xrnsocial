/* Where each X switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. */

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

/* A sidebar block: the box the pack hides, judged by what it holds. */
const block = mark => `() => { const m = document.querySelector('[data-testid="sidebarColumn"] ${mark}'); return m ? [m] : []; }`;

module.exports = {
  home: 'https://x.com/home',
  postPage,
  adPages: { home: 'https://x.com/home', 'a reply thread': postPage },
  adSteps: 14,
  /* It clicks the Following tab, which X remembers for the account. */
  skipInAllOn: ['following'],
  ads: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('[data-testid="top-impression-pixel"], a[href*="twclid="]'))`,
  popup: { label: 'Chat drawer', find: `() => [...document.querySelectorAll('[data-testid="chat-drawer-root"]')]` },
  switches: {
    promoted: { find: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('[data-testid="top-impression-pixel"]'))`, scroll: 8 },
    promotedTrends: { find: `() => [...document.querySelectorAll('[data-testid="trend"]')].filter(t => t.querySelectorAll('svg').length > 1)` },
    premiumUpsell: { find: `() => [...document.querySelectorAll('[data-testid="sidebarColumn"] a[href^="/i/premium_sign_up"], header a[href^="/i/premium_sign_up"]')]` },
    whoToFollow: { find: `() => [...document.querySelectorAll('[data-testid="UserCell"]')]` },
    reposts: { find: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('[data-testid="socialContext"]'))`, scroll: 14 },
    videoPosts: { find: `() => [...document.querySelectorAll('${CELL}')].filter(c => c.querySelector('article [data-testid="videoPlayer"]'))`, scroll: 6 },
    /* No scrolling first: the rule needs to have seen the opened post, which
     * it does whenever the switch is on as a thread opens. */
    verifiedReplies: { page: postPage, find: `() => { const id = location.pathname.split('/status/')[1]; const cells = [...document.querySelectorAll('${CELL}')]; const i = cells.findIndex(c => c.querySelector('a[href$="/status/' + id + '"] time')); return cells.slice(i + 1).filter(c => { const n = [...c.querySelectorAll('[data-testid="User-Name"]')].find(x => !x.closest('[role="link"]')); return n && n.querySelector('[data-testid="icon-verified"]'); }); }` },
    postActions: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [role="group"]')]` },
    counts: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [role="group"] [data-testid="app-text-transition-container"]')].filter(e => e.textContent.trim())` },
    media: { find: `() => [...document.querySelectorAll('article[data-testid="tweet"] [data-testid="tweetPhoto"], article[data-testid="tweet"] [data-testid="card.wrapper"]')]` },
    rightSidebar: { find: `() => [...document.querySelectorAll('[data-testid="sidebarColumn"]')]` },
    trends: { find: block('[data-testid="trend"]') },
    news: { find: block('[data-testid="news_sidebar"] ~ * [role="link"]') },
    sidebarSearch: { find: block('form[role="search"] input') },
    navExtras: { find: `() => [...document.querySelectorAll('header nav a[href="/i/grok"], header nav a[href="/i/history"], header nav a[href^="/i/premium_sign_up"], header nav a[href="/i/jf/creators/studio"]')]` },
    grok: { find: `() => [...document.querySelectorAll('header a[href="/i/grok"], [data-testid="GrokDrawer"], article button[aria-label="Grok actions"]')]` },
    chatDrawer: { find: `() => [...document.querySelectorAll('[data-testid="chat-drawer-root"]')]` },
    newPostsPill: { find: `() => [...document.querySelectorAll('[data-testid="pillLabel"]')]` },
    composer: { find: `() => [...document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweetTextarea_0"]')]` },
    badges: { find: `() => [...document.querySelectorAll('header nav a div[aria-label]')].filter(e => e.textContent.trim())` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('article[data-testid="tweet"]')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
