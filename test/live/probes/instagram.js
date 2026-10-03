/* Where each Instagram switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. `posts`
 * marks switches that hide whole posts; any other switch hiding a post is
 * collateral damage. */

/* Ads: the posts with no <time>, once they have loaded a picture or video. */
const ads = `() => [...document.querySelectorAll('article')].filter(a => !a.querySelector('time') && a.querySelector('a[href^="/"]') && a.querySelector('img, video'))`;

module.exports = {
  home: 'https://www.instagram.com/',
  landmarks: ['main', 'a[href="/explore/"]', 'a[href="/direct/inbox/"]'],
  alwaysThere: ['main', 'a[href="/explore/"]'],
  adSteps: 16,
  ads,
  /* Not stories: the tray only exists while someone you follow has one. */
  popup: { label: 'Right column', find: `() => [...document.querySelectorAll('a[href^="/explore/people/"]')]` },
  truth: {
    switches: ['sponsored'],
    steps: 18,
    ads,
    organic: `() => [...document.querySelectorAll('article')].filter(a => a.querySelector('time'))`
  },
  pairs: [['postActions', 'counts'], ['videoPosts', 'reels'], ['sponsored', 'videoPosts'], ['suggested', 'reels'], ['grayscale', 'blurFeed']],
  reveal: { words: ['the'] },
  nav: ['a[href="/explore/"]', 'a[href="/"]'],
  custom: { find: `() => [...document.querySelectorAll('a[href^="https://www.threads."]')]`, preset: 'threadsLink' },
  switches: {
    noAutoplay: { autoplay: true, scroll: 2 },
    sponsored: { posts: true, find: ads, scroll: 10 },
    reels: { posts: true, find: `() => [...document.querySelectorAll('article')].filter(a => a.querySelector('a[href^="/reels/"]:not([href^="/reels/audio/"]), a[href^="/reel/"]')).concat([...document.querySelectorAll('a[href="/reels/"]')])`, scroll: 3 },
    suggested: { posts: true, find: `() => [...document.querySelectorAll('article')].filter(a => [...a.querySelectorAll('[role="button"], button')].some(b => b.textContent.trim() === 'Follow' && !b.querySelector('svg')))`, scroll: 3 },
    videoPosts: { posts: true, find: `() => [...document.querySelectorAll('article')].filter(a => a.querySelector('video'))`, scroll: 3 },
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
