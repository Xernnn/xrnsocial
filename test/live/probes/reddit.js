/* Where each Reddit switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. `posts`
 * marks switches that hide whole posts; any other switch hiding a post is
 * collateral damage. */

/* A post page with a real comment thread, found from the home feed. Not
 * every post page carries ads, so the ad check looks at two. */
const postPage = (page, nth) => findPost(page, nth || 0);
async function findPost(page, nth) {
  if (!/reddit\.com\/?$/.test(page.url().split('?')[0])) {
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
  }
  const link = await page.evaluate(nth => {
    const posts = [...document.querySelectorAll('shreddit-post')].filter(p => +p.getAttribute('comment-count') > 15);
    return posts.length ? posts[Math.min(nth, posts.length - 1)].getAttribute('permalink') : '/r/AskReddit/';
  }, nth);
  return 'https://www.reddit.com' + link;
}

const shadow = (host, inner) => `() => [...document.querySelectorAll('${host}')].flatMap(h => h.shadowRoot ? [...h.shadowRoot.querySelectorAll('${inner}')] : [])`;
const ADS = `() => [...document.querySelectorAll('shreddit-ad-post, shreddit-feed > article:has(> shreddit-post[promoted])')]`;

module.exports = {
  home: 'https://www.reddit.com/',
  landmarks: ['shreddit-feed', 'reddit-header-large', 'flex-left-nav-container', '#right-sidebar-container'],
  alwaysThere: ['reddit-header-large', 'shreddit-feed'],
  popup: { label: 'Search box', find: `() => [...document.querySelectorAll('reddit-search-large')]` },
  adPages: { home: 'https://www.reddit.com/', 'a post page': postPage, 'another post page': page => postPage(page, 2), popular: 'https://www.reddit.com/r/popular/' },
  ads: `() => [...document.querySelectorAll('shreddit-ad-post, shreddit-sidebar-ad, shreddit-comments-page-ad, [data-ad-click-location="promoted_label"]')]`,
  truth: {
    switches: ['promoted'],
    pages: { home: 'https://www.reddit.com/', popular: 'https://www.reddit.com/r/popular/' },
    ads: ADS,
    organic: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => !a.querySelector('shreddit-post[promoted]'))`
  },
  pairs: [
    ['postActions', 'counts'], ['media', 'videoPosts'], ['rightSidebar', 'recentPosts'], ['rightSidebar', 'sidebarAds'],
    ['leftSidebar', 'games'], ['commentAds', 'comments'], ['videoPosts', 'nsfw'], ['recommended', 'videoPosts'],
    ['promoted', 'videoPosts'], ['grayscale', 'blurFeed']
  ],
  reveal: { words: ['the'] },
  /* Home and Popular live inside the left menu's shadow root. */
  nav: [
    `() => { const s = document.querySelector('left-nav-top-section'); return s && s.shadowRoot && s.shadowRoot.querySelector('a[href*="/r/popular/"]'); }`,
    `() => { const s = document.querySelector('left-nav-top-section'); return s && s.shadowRoot && s.shadowRoot.querySelector('a[href*="feed=home"], a[href="https://www.reddit.com/"]'); }`
  ],
  custom: { find: `() => [...document.querySelectorAll('reddit-search-large')]`, preset: 'search' },
  switches: {
    promoted: { posts: true, find: ADS, scroll: 6 },
    noAutoplay: { autoplay: true, scroll: 6 },
    sidebarAds: { find: `() => [...document.querySelectorAll('shreddit-sidebar-ad')]`, retry: [page => postPage(page, 2)] },
    commentAds: { page: page => postPage(page, 2), retry: [page => postPage(page, 4), page => postPage(page, 6)], find: `() => [...document.querySelectorAll('shreddit-comments-page-ad, shreddit-comment-tree-ad')]` },
    recommended: { posts: true, find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => { const p = a.querySelector('shreddit-post'); return p && p.hasAttribute('user-logged-in') && !p.hasAttribute('is-subscribed'); })`, scroll: 6, retry: ['https://www.reddit.com/new/', 'https://www.reddit.com/top/'] },
    relatedCommunities: { page: postPage, find: `() => [...document.querySelectorAll('faceplate-partial[name^="RelatedCommunityRecommendation"], shreddit-post > [slot="related-community-recommendation"]')]` },
    videoPosts: { posts: true, find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => a.querySelector('shreddit-player') || a.querySelector('shreddit-post[post-type="video"]'))`, scroll: 6 },
    nsfw: { posts: true, find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => a.querySelector(':scope > shreddit-post[nsfw]'))`, scroll: 14, retry: ['https://www.reddit.com/r/popular/'] },
    /* The bar itself is display: contents, never "visible"; its row is. */
    postActions: { find: shadow('shreddit-feed > article > shreddit-post', 'rpl-action-bar > *') },
    counts: { find: shadow('shreddit-feed > article > shreddit-post', 'rpl-action-bar faceplate-number') },
    comments: { page: postPage, find: `() => [...document.querySelectorAll('shreddit-comment-tree, comment-composer-host, section[aria-label="Comments"]')]` },
    media: { find: `() => [...document.querySelectorAll('shreddit-post > [slot="post-media-container"], shreddit-post > [slot="thumbnail"]')]` },
    leftSidebar: { find: `() => [...document.querySelectorAll('flex-left-nav-container, #left-sidebar-container')]` },
    rightSidebar: { find: `() => [...document.querySelectorAll('#right-sidebar-container')]` },
    recentPosts: { find: `() => [...document.querySelectorAll('recent-posts')]` },
    games: { find: `() => [...document.querySelectorAll('faceplate-expandable-section-helper:has(summary[aria-controls="games_section"]), games-section-badge-wrapper')]` },
    search: { find: `() => [...document.querySelectorAll('reddit-search-large')]` },
    createPost: { find: `() => [...document.querySelectorAll('create-post-entry-point-wrapper')]` },
    chat: { find: `() => [...document.querySelectorAll('reddit-chat-header-button')]` },
    advertise: { find: `() => [...document.querySelectorAll('advertise-button, a[href^="https://ads.reddit.com"]')]` },
    badges: { find: `() => [...document.querySelectorAll('dynamic-badge')].filter(b => b.textContent.trim())` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('shreddit-feed > article')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
