/* Where each MangaDex switch's targets are on the live site (test/live/check.js).
 * MangaDex is one responsive app, so this covers phones as well. */

const all = sel => `() => [...document.querySelectorAll('${sel}')]`;
const section = href => all(`.page-container > div:has(a[href="${href}"])`);

const HOME = 'https://mangadex.org/';
const LATEST = 'https://mangadex.org/titles/latest';

const ADS = `() => [...document.querySelectorAll('a:has(> img[src^="/temp/"]), a:has(> video > source[src^="/temp/"])')]`;

module.exports = {
  home: HOME,
  landmarks: ['.drawer', '.page-container', '.nav-bar'],
  alwaysThere: ['.page-container'],
  adPages: { home: HOME, 'latest updates': LATEST, search: 'https://mangadex.org/titles' },
  adSteps: 3,
  ads: ADS,
  truth: {
    switches: ['banners'],
    steps: 3,
    pages: { home: HOME, 'latest updates': LATEST },
    ads: ADS,
    organic: all('.page-container a[href^="/chapter/"], .manga-card')
  },
  popup: { label: 'Recommended', find: section('/titles/recommended') },
  pairs: [['banners', 'recommended'], ['recommended', 'selfPublished'], ['popular', 'banners']],
  reveal: { page: LATEST, words: ['the', 'a'] },
  nav: ['#section-link-_titles_latest', 'a.md-logo-wrap'],
  custom: { find: section('/titles/recommended'), preset: 'recommended' },
  switches: {
    banners: { find: ADS, retry: [LATEST] },
    advertiseLink: { find: all('#section-link-_advertise') },
    popular: { find: all('.md-content > .relative:has(> div > .swiper .banner-bg)') },
    recommended: { find: section('/titles/recommended') },
    selfPublished: { find: section('/titles/selfpublished') },
    seasonal: { find: section('/titles/seasonal') },
    recentlyAdded: { find: section('/titles/recent') },
    commentCounts: { page: LATEST, find: all('button.comment-container') },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` }
  }
};
