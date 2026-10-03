/* Where each Twitch switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. `posts`
 * marks switches that hide whole stream cards or side nav entries; any
 * other switch hiding one is collateral damage. */

/* A live channel, from the directory. Watching only: nothing is clicked. */
async function channelPage(page) {
  await page.goto('https://www.twitch.tv/directory/all', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[data-a-target="preview-card-image-link"]')].map(x => x.getAttribute('href')).find(h => /^\/\w+$/.test(h));
    return a || '/directory';
  });
  return 'https://www.twitch.tv' + href;
}

const all = sel => `() => [...document.querySelectorAll('${sel}')]`;

module.exports = {
  home: 'https://www.twitch.tv/',
  channelPage,
  landmarks: ['[data-a-target="top-nav-container"]', 'main', '[data-a-target="video-player"]'],
  alwaysThere: ['[data-a-target="top-nav-container"]', 'main'],
  adPages: { 'front page': 'https://www.twitch.tv/', 'a channel': channelPage },
  adSteps: 4,
  ads: all('[data-a-target="frontpage-headliner"], [data-test-selector="sda-wrapper"]'),
  popup: { label: 'Featured carousel', find: all('[data-a-target="front-page-carousel"]') },
  pairs: [
    ['sideNav', 'recommendedChannels'], ['sideNav', 'similarChannels'], ['chat', 'chatBadges'], ['chat', 'channelPoints'],
    ['featuredCarousel', 'displayAds'], ['grayscale', 'blurFeed']
  ],
  reveal: { page: 'https://www.twitch.tv/directory/all', words: ['the'] },
  nav: ['a[data-a-target="browse-link"]', 'a[data-a-target="home-link"]'],
  custom: { find: all('[data-a-target="top-nav-get-bits-button"]'), preset: 'upsells' },
  switches: {
    displayAds: { find: all('[data-a-target="frontpage-headliner"], [data-test-selector="sda-wrapper"]'), retry: [channelPage, channelPage] },
    upsells: { find: all('[data-a-target="prime-offers-icon"], [data-a-target="top-nav-get-bits-button"]') },
    recommendedChannels: { posts: true, find: all('[data-test-selector="recommended-channel"]') },
    similarChannels: { posts: true, page: channelPage, find: all('[data-test-selector="similarity-channel"]') },
    sideNav: { posts: true, find: all('[data-test-selector="side-nav"]') },
    featuredCarousel: { find: all('[data-a-target="front-page-carousel"]') },
    chat: { page: channelPage, find: all('.channel-root__right-column') },
    chatBadges: { page: channelPage, find: all('[data-a-target="chat-badge"]') },
    channelPoints: { page: channelPage, find: all('[data-test-selector="community-points-summary"]') },
    subGift: { page: channelPage, find: all('[data-a-target="subscribe-button"], [data-a-target="gift-button"]') },
    aboutPanels: { page: channelPage, scroll: 2, find: all('[data-a-target="about-panel"]') },
    badges: { find: all('[data-test-selector="onsite-notifications__badge"]') },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { page: 'https://www.twitch.tv/directory/all', effect: `(() => { const a = [...document.querySelectorAll('article')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
