/* Where each pixiv switch's targets are on the live site (test/live/check.js).
 * This drives the computer app; the phone app is a separate codebase and has
 * its own check, test/live/pixiv-phone.js. `posts` marks a switch that hides
 * whole works. */

const all = sel => `() => [...document.querySelectorAll('${sel}')]`;

const ARTWORK = 'https://www.pixiv.net/en/artworks/151578196';
const TAG = 'https://www.pixiv.net/en/tags/landscape/artworks';

/* No size test: a frame the switch has hidden has no size, and has to stay
 * in the count to be seen as hidden. */
const FRAMES = `() => [...document.querySelectorAll('iframe[data-uid]')]`;
/* pixiv keeps some works of a tag page's grid at display: none itself, so a
 * work only counts if it shows with our stylesheet lifted. */
const WORKS = `() => {
  const sheet = document.getElementById('bfx-style');
  if (sheet) sheet.disabled = true;
  const works = [...document.querySelectorAll('a[data-ga4-label="thumbnail_link"]')].filter(a => a.checkVisibility());
  if (sheet) sheet.disabled = false;
  return works;
}`;

module.exports = {
  home: ARTWORK,
  landmarks: ['main', 'aside', 'h1'],
  alwaysThere: ['main', 'h1'],
  adPages: { 'an artwork': ARTWORK, 'a tag page': TAG, ranking: 'https://www.pixiv.net/ranking.php', 'a novel': 'https://www.pixiv.net/novel/show.php?id=29561240', 'a user': 'https://www.pixiv.net/en/users/163523' },
  adSteps: 4,
  ads: FRAMES,
  truth: {
    switches: ['ads'],
    steps: 5,
    pages: { 'an artwork': ARTWORK, 'a tag page': TAG, 'a user': 'https://www.pixiv.net/en/users/163523' },
    ads: FRAMES,
    organic: WORKS
  },
  popup: { label: 'Related works', find: all('.gtm-illust-recommend-zone') },
  pairs: [['ads', 'premium'], ['ads', 'related']],
  reveal: { page: TAG, words: ['the', 'a'] },
  nav: ['a[href^="/en/tags/"]', 'a[data-ga4-label="thumbnail_link"]'],
  custom: { find: all('.gtm-illust-recommend-zone'), preset: 'related' },
  switches: {
    ads: { scroll: 3, find: FRAMES },
    /* On a tag page, because an artwork's "Remove ads" link sits in the ad's
     * own box and goes with it, by design (test/browser.js checks that). */
    premium: { page: TAG, find: all('a[href^="/premium/lead/lp/"]') },
    related: { scroll: 3, posts: true, find: all('.gtm-illust-recommend-zone') },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` }
  }
};
