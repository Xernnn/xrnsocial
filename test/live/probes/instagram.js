/* Where each Instagram switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. */

/* Ads: the posts with no <time>, once they have loaded a picture or video. */
const ads = `() => [...document.querySelectorAll('article')].filter(a => !a.querySelector('time') && a.querySelector('a[href^="/"]') && a.querySelector('img, video'))`;

module.exports = {
  home: 'https://www.instagram.com/',
  adSteps: 16,
  ads,
  popup: { label: 'Stories', find: `() => { const u = document.querySelector('main ul canvas'); return u ? [u.closest('ul')] : []; }` },
  switches: {
    sponsored: { find: ads, scroll: 10 },
    reels: { find: `() => [...document.querySelectorAll('article')].filter(a => a.querySelector('a[href^="/reels/"]:not([href^="/reels/audio/"]), a[href^="/reel/"]')).concat([...document.querySelectorAll('a[href="/reels/"]')])`, scroll: 3 },
    suggested: { find: `() => [...document.querySelectorAll('article')].filter(a => [...a.querySelectorAll('[role="button"], button')].some(b => b.textContent.trim() === 'Follow' && !b.querySelector('svg')))`, scroll: 3 },
    videoPosts: { find: `() => [...document.querySelectorAll('article')].filter(a => a.querySelector('video'))`, scroll: 3 },
    stories: { find: `() => { const u = document.querySelector('main ul canvas'); return u ? [u.closest('ul')] : []; }` },
    postActions: { find: `() => [...document.querySelectorAll('article svg[aria-label="Like"], article svg[aria-label="Unlike"]')].map(s => s.closest('section'))` },
    counts: { find: `() => [...document.querySelectorAll('article section span[role="button"]')].filter(s => /\\d/.test(s.textContent))` },
    rightSidebar: { find: `() => [...document.querySelectorAll('a[href^="/explore/people/"]')]` },
    badges: { find: `() => [...document.querySelectorAll('a[href="/direct/inbox/"] span, a[href="/direct/inbox/"] div')].filter(e => !e.children.length && /^\\d+$/.test(e.textContent.trim()))` },
    threadsLink: { find: `() => [...document.querySelectorAll('a[href^="https://www.threads."]')]` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('article')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
