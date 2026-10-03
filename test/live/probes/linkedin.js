/* Where each LinkedIn switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. */

const ITEM = '[data-testid="mainFeed"] > div';
/* A post's sections are the children of the box holding its h2. */
const sections = `(item) => { const h2 = item.querySelector('h2'); return h2 ? [...h2.parentElement.children] : []; }`;
const isPromoted = `(it) => [...it.querySelectorAll('span, p')].some(e => !e.children.length && e.textContent.trim() === 'Promoted')`;
/* The author's header: the section with the "…" menu, or, when that is an
 * activity line followed by a rule, the block after the rule. */
const header = `(it) => { const h2 = it.querySelector('h2'); const ps = h2 ? [...h2.parentElement.children] : []; const m = ps.find(p => p.querySelector('button svg[data-token-id="383"]')); const r = m && m.nextElementSibling; return r && r.localName === 'hr' && r.nextElementSibling && r.nextElementSibling.querySelector('a figure') ? r.nextElementSibling : m; }`;
/* Items are display: contents and never "visible"; judge their listitem. */
const box = `(it) => it.querySelector('[role="listitem"]') || it.firstElementChild`;

module.exports = {
  home: 'https://www.linkedin.com/feed/',
  adSteps: 16,
  ads: `() => [...document.querySelectorAll('${ITEM}')].filter(${isPromoted}).map(${box})`,
  popup: { label: "Today's puzzles", find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]` },
  switches: {
    promoted: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(${isPromoted}).map(${box})`, scroll: 8 },
    premiumUpsell: { find: `() => [...document.querySelectorAll('a[href*="/premium/"]')]` },
    suggested: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => { const h = (${header})(it); return h && h.querySelector('button svg[data-token-id="86"]') && !(${isPromoted})(it); }).map(${box})`, scroll: 4 },
    activity: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => { const m = (${sections})(it).find(p => p.querySelector('button svg[data-token-id="383"]')); const r = m && m.nextElementSibling; return !!(r && r.localName === 'hr' && r.nextElementSibling && r.nextElementSibling.querySelector('a figure')); }).map(${box})`, scroll: 6 },
    jobs: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('[data-testid="carousel"]') && it.querySelector('a[href*="/jobs/"]')).map(${box})`, scroll: 6 },
    videoPosts: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('video')).map(${box})`, scroll: 6 },
    composer: { find: `() => [...document.querySelectorAll('${ITEM}')].filter(it => it.querySelector('a[href*="/article/new/"]')).map(${box})` },
    postActions: { find: `() => [...document.querySelectorAll('button svg[data-token-id="255"]')].map(s => s.closest('button'))` },
    counts: { find: `() => [...document.querySelectorAll('${ITEM}')].flatMap(${sections}).filter(p => p.querySelector('ul[role="presentation"]') && !p.querySelector('button svg[data-token-id="289"]'))` },
    comments: { find: `() => [...document.querySelectorAll('[data-testid*="commentList"]')]`, scroll: 6 },
    media: { find: `() => [...document.querySelectorAll('${ITEM} [role="listitem"] img')].filter(i => i.naturalWidth > 200 || +i.getAttribute('width') > 200)`, scroll: 3 },
    leftSidebar: { find: `() => [...document.querySelectorAll('a[href*="/me/profile-views"]')]` },
    rightSidebar: { find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]` },
    news: { find: `() => [...document.querySelectorAll('aside a[href*="/news/story/"]')]` },
    games: { find: `() => [...document.querySelectorAll('[componentkey="feedRightNavGamesComponentRef"]')]` },
    badges: { find: `() => [...document.querySelectorAll('header nav a span')].filter(s => !s.children.length && /^\\d{1,3}\\+?$/.test(s.textContent.trim()))` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('${ITEM} [role="listitem"]')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0 && x.querySelector('h2')); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
