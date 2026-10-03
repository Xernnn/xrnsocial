/* Where each TikTok switch's targets are on the live site (test/live/check.js).
 * Mapped signed out: no ad probe until the signed-in feed has been measured. */

const all = sel => `() => [...document.querySelectorAll('${sel}')]`;

module.exports = {
  home: 'https://www.tiktok.com/foryou',
  landmarks: ['main', '[data-e2e="nav-foryou"]', '[data-e2e="feed-video"]'],
  alwaysThere: ['main', '[data-e2e="nav-foryou"]'],
  adPages: {},
  ads: all('[data-bfx-never]'),
  popup: { label: 'Like, comment, save and share counts', find: all('[data-e2e="like-count"]') },
  pairs: [['counts', 'music'], ['upsells', 'navExtras'], ['grayscale', 'blurFeed']],
  reveal: { words: ['the', 'a'] },
  nav: ['a[data-e2e="nav-explore"]', 'a[data-e2e="nav-foryou"]'],
  custom: { find: all('[data-e2e="nav-live"]'), preset: 'navExtras' },
  switches: {
    noAutoplay: { autoplay: true, scroll: 1 },
    upsells: { find: all('[data-e2e="top-right-action-bar-get-coin"], [data-e2e="capcut-tag"]') },
    counts: { find: all('[data-e2e="like-count"], [data-e2e="comment-count"], [data-e2e="favorite-count"], [data-e2e="share-count"]') },
    music: { find: all('[data-e2e="video-music"]') },
    navExtras: { find: all('[data-e2e="nav-live"], [data-e2e="nav-short-drama"]') },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('article[data-e2e="recommend-list-item-container"]')].find(x => x.checkVisibility() && x.getBoundingClientRect().bottom > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
