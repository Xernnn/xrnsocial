/* Where each Reddit switch's targets are on the live site (test/live/check.js).
 * Probes are function sources run in the page, returning elements. */

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

module.exports = {
  home: 'https://www.reddit.com/',
  adPages: { home: 'https://www.reddit.com/', 'a post page': postPage, 'another post page': page => postPage(page, 2), popular: 'https://www.reddit.com/r/popular/' },
  popup: { label: 'Search box', find: `() => [...document.querySelectorAll('reddit-search-large')]` },
  ads: `() => [...document.querySelectorAll('shreddit-ad-post, shreddit-sidebar-ad, shreddit-comments-page-ad, [data-ad-click-location="promoted_label"]')]`,
  switches: {
    promoted: { find: `() => [...document.querySelectorAll('shreddit-ad-post')]`, scroll: 6 },
    sidebarAds: { find: `() => [...document.querySelectorAll('shreddit-sidebar-ad')]` },
    commentAds: { page: page => postPage(page, 2), find: `() => [...document.querySelectorAll('shreddit-comments-page-ad, shreddit-comment-tree-ad')]` },
    recommended: { find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => { const p = a.querySelector('shreddit-post'); return p && p.hasAttribute('user-logged-in') && !p.hasAttribute('is-subscribed'); })`, scroll: 6 },
    relatedCommunities: { page: postPage, find: `() => [...document.querySelectorAll('faceplate-partial[name^="RelatedCommunityRecommendation"], shreddit-post > [slot="related-community-recommendation"]')]` },
    videoPosts: { find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => a.querySelector('shreddit-player'))`, scroll: 6 },
    nsfw: { find: `() => [...document.querySelectorAll('shreddit-feed > article')].filter(a => a.querySelector('shreddit-post[nsfw]'))`, scroll: 14 },
    /* The bar itself is display: contents, never "visible"; its row is. */
    postActions: { find: shadow('shreddit-feed > article > shreddit-post', 'rpl-action-bar > *') },
    counts: { find: shadow('shreddit-feed > article > shreddit-post', 'rpl-action-bar faceplate-number') },
    comments: { page: postPage, find: `() => [...document.querySelectorAll('shreddit-comment-tree, comment-composer-host')]` },
    media: { find: `() => [...document.querySelectorAll('shreddit-post > [slot="post-media-container"]')]` },
    leftSidebar: { find: `() => [...document.querySelectorAll('flex-left-nav-container')]` },
    rightSidebar: { find: `() => [...document.querySelectorAll('#right-sidebar-container')]` },
    recentPosts: { find: `() => [...document.querySelectorAll('recent-posts')]` },
    games: { find: `() => [...document.querySelectorAll('summary[aria-controls="games_section"]')]` },
    search: { find: `() => [...document.querySelectorAll('reddit-search-large')]` },
    createPost: { find: `() => [...document.querySelectorAll('create-post-entry-point-wrapper')]` },
    chat: { find: `() => [...document.querySelectorAll('reddit-chat-header-button')]` },
    advertise: { find: `() => [...document.querySelectorAll('advertise-button, a[href^="https://ads.reddit.com"]')]` },
    badges: { find: `() => [...document.querySelectorAll('dynamic-badge')]` },
    grayscale: { effect: `getComputedStyle(document.documentElement).filter` },
    blurFeed: { effect: `(() => { const a = [...document.querySelectorAll('shreddit-feed > article')].find(x => x.checkVisibility() && x.getBoundingClientRect().top > 0); return a ? getComputedStyle(a).filter : 'none found'; })()` }
  }
};
