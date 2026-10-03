/* Where each LinkedIn switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. `posts`
 * marks switches that hide whole feed items; any other switch hiding an item
 * is collateral damage. */

const ITEM = '[data-testid="mainFeed"] > div';
/* A post's sections are the children of the box holding its h2. */
const sections = `(item) => { const h2 = item.querySelector('h2'); return h2 ? [...h2.parentElement.children] : []; }`;
const isPromoted = `(it) => [...it.querySelectorAll('span, p')].some(e => !e.children.length && e.textContent.trim() === 'Promoted')`;
/* The author's header: the section with the "…" menu, or, when that is an
 * activity line followed by a rule, the block after the rule. */
const header = `(it) => { const h2 = it.querySelector('h2'); const ps = h2 ? [...h2.parentElement.children] : []; const m = ps.find(p => p.querySelector('button svg[data-token-id="383"]')); const r = m && m.nextElementSibling; return r && r.localName === 'hr' && r.nextElementSibling && r.nextElementSibling.querySelector('a figure') ? r.nextElementSibling : m; }`;
/* Items are display: contents and never "visible"; judge their listitem. */
const box = `(it) => it.querySelector('[role="listitem"]') || it.firstElementChild`;
const rail = mark => `() => [...document.querySelectorAll('main aside')].filter(a => a.querySelector('${mark}'))`;

module.exports = {
  home: 'https://www.linkedin.com/feed/',
  landmarks: ['[data-testid="mainFeed"]', 'header', 'main aside'],
  alwaysThere: ['[data-testid="mainFeed"]', 'header'],
  adSteps: 16,
  ads: `() => [...document.querySelectorAll('${ITEM}')].filter(${isPromoted}).map(${box})`,
  popup: { label: "Today's puzzles", find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]` },
  truth: {
    switches: ['promoted'],
    steps: 16,
    ads: `() => [...document.querySelectorAll('${ITEM}')].filter(${isPromoted})`,
    organic: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('h2') && !(${isPromoted})(it))`
  },
  pairs: [
    ['postActions', 'counts'], ['media', 'videoPosts'], ['suggested', 'activity'], ['promoted', 'suggested'],
    ['leftSidebar', 'premiumUpsell'], ['rightSidebar', 'news'], ['rightSidebar', 'games'], ['comments', 'postActions'],
    ['grayscale', 'blurFeed']
  ],
  reveal: { words: ['the'] },
  /* Home is a button in the top bar, not a link. */
  nav: ['header a[href*="/mynetwork"]', `() => document.querySelector('header nav a[href*="/feed"]') || (document.querySelector('header nav li') || document).querySelector('a, button')`],
  custom: { find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]`, preset: 'games' },
  switches: {
    noAutoplay: { autoplay: true, scroll: 4 },
    promoted: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(${isPromoted}).map(${box})`, scroll: 8 },
    premiumUpsell: { posts: true, find: `() => [...document.querySelectorAll('a[href*="/premium/"]')]` },
    /* Promoted posts from pages you don't follow carry a Follow button too,
     * and count as "from people you don't follow". */
    suggested: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => { const h = (${header})(it); return h && h.querySelector('button svg[data-token-id="86"]'); }).map(${box})`, scroll: 4 },
    activity: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => { const m = (${sections})(it).find(p => p.querySelector('button svg[data-token-id="383"]')); const r = m && m.nextElementSibling; return !!(r && r.localName === 'hr' && r.nextElementSibling && r.nextElementSibling.querySelector('a figure')); }).map(${box})`, scroll: 6 },
    jobs: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('[data-testid="carousel"]') && it.querySelector('a[href*="/jobs/"]')).map(${box})`, scroll: 6 },
    videoPosts: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('video')).map(${box})`, scroll: 6 },
    composer: { posts: true, find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('a[href*="/article/new/"]')).map(${box})` },
    postActions: { find: `() => [...document.querySelectorAll('${ITEM}')].flatMap(${sections}).filter(p => p.querySelector('button svg[data-token-id="202"], button svg[data-token-id="255"]'))` },
    counts: { find: `() => [...document.querySelectorAll('${ITEM}')].flatMap(${sections}).filter(p => p.querySelector('ul[role="presentation"]') && !p.querySelector('button svg[data-token-id="289"]'))` },
    comments: { find: `() => [...document.querySelectorAll('[data-testid*="commentList"]')]`, scroll: 6 },
    media: { find: `() => [...document.querySelectorAll('${ITEM} [role="listitem"] img')].filter(i => i.naturalWidth > 200 || +i.getAttribute('width') > 200)`, scroll: 3 },
    leftSidebar: { find: rail('a[href*="/me/profile-views"]') },
    rightSidebar: { find: rail('[componentkey="feedRightNavGamesComponentRef"], a[href*="/news/story/"]') },
    news: { find: `() => [...document.querySelectorAll('aside a[href*="/news/story/"]')]` },
    games: { find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]` },
    badges: { find: `() => [...document.querySelectorAll('header nav a span')].filter(s => !s.children.length && /^\\d{1,3}\\+?$/.test(s.textContent.trim()))` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('${ITEM} [role="listitem"]')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0 && x.querySelector('h2')); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
