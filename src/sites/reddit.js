/* Reddit.
 *
 * Today's Reddit ("shreddit") is built from custom elements whose names say
 * what they are, the same in every language, and those names are what this
 * pack keys on. Checked against the live, signed-in site in October 2026:
 *   - the feed is <shreddit-feed>; each post is <article> holding a
 *     <shreddit-post> whose attributes describe it (subreddit-prefixed-name,
 *     post-type, nsfw, is-subscribed, view-context ...), with an <hr> after
 *   - feed ads are a separate element, <shreddit-ad-post promoted>, directly
 *     in the feed; sidebar ads are <shreddit-sidebar-ad>; on a post's page,
 *     ads are <shreddit-comments-page-ad> and <shreddit-comment-tree-ad>
 *   - vote and comment counts and the action bar live inside the post's
 *     open shadow root (rpl-action-bar, faceplate-number), out of reach of
 *     page CSS, so those switches use `shadow` styles
 *   - the left menu's sections are <details> with stable aria-controls ids
 *     (games_section, communities_section ...), whatever the language
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  /* A post in a feed. The post you opened on its own page is not in a feed,
   * so it is never judged. */
  var UNITS = 'shreddit-feed > article';

  /* The pages whose feed is your home feed: posts there should come from
   * communities you joined. */
  var HOME = /^\/(best|hot|new|top|rising)?\/?$/;

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'promoted',
      group: 'Ads',
      on: true,
      label: 'Promoted posts',
      desc: 'Ads between posts in every feed: home, popular, communities, search.',
      css: [
        'shreddit-ad-post',
        'shreddit-ad-post + hr',
        'shreddit-feed > article:has(> shreddit-post[promoted])'
      ],
      js: { kind: 'promoted' }
    },
    {
      id: 'sidebarAds',
      group: 'Ads',
      on: true,
      label: 'Sidebar ads',
      desc: 'The ad cards down the right column, and Reddit\'s own promotion slot there.',
      css: [
        'shreddit-sidebar-ad',
        'shreddit-async-loader[bundlename="sidebar_ad"]',
        'aside#right-rail-experience-root'
      ]
    },
    {
      id: 'commentAds',
      group: 'Ads',
      on: true,
      label: 'Ads in comment threads',
      desc: 'The ad under a post and the ad slots Reddit threads between comments.',
      css: ['shreddit-comments-page-ad', 'shreddit-comment-tree-ad']
    },

    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'recommended',
      group: 'Feed',
      on: true,
      label: 'Recommended posts on your home feed',
      desc: 'Posts from communities you have not joined, mixed into Home. Popular, All and community pages are left alone.',
      js: { kind: 'recommended' }
    },
    {
      id: 'relatedCommunities',
      group: 'Feed',
      on: true,
      label: 'Community suggestions',
      desc: '"Related communities" in the right column and community suggestions attached to posts.',
      css: [
        'faceplate-partial[name^="RelatedCommunityRecommendation"]',
        'faceplate-loader[name^="RelatedCommunityRecommendation"]',
        'shreddit-post > [slot="related-community-recommendation"]'
      ]
    },
    {
      id: 'videoPosts',
      group: 'Feed',
      label: 'All video posts',
      desc: 'Every post with a video in it — the whole post, not just the player.',
      css: [
        'shreddit-feed > article:has(shreddit-player)',
        'shreddit-feed > article:has(> shreddit-post[post-type="video"])'
      ]
    },
    {
      id: 'nsfw',
      group: 'Feed',
      label: 'NSFW posts',
      desc: 'Posts marked not safe for work, instead of Reddit\'s blurred cover.',
      css: ['shreddit-feed > article:has(> shreddit-post[nsfw])']
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Vote / comment / share bar',
      desc: 'The row under every post in a feed.',
      shadow: [{ host: 'shreddit-post', css: 'rpl-action-bar { display: none !important; }' }]
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Vote and comment counts',
      desc: 'Hides the numbers on posts and comments without hiding the buttons.',
      shadow: [
        { host: 'shreddit-post', css: 'rpl-action-bar faceplate-number { display: none !important; }' },
        { host: 'shreddit-comment-action-row', css: 'faceplate-number { display: none !important; }' }
      ]
    },
    {
      id: 'comments',
      group: 'Inside posts',
      label: 'Comment threads',
      desc: 'Comments and the comment box on a post\'s page.',
      css: ['shreddit-comment-tree', 'comment-composer-host', 'section[aria-label="Comments"]']
    },
    SITES.common.noAutoplay('Inside posts', 'Videos in the feed stay paused while you scroll past. Click one and it plays as normal.'),
    {
      id: 'media',
      group: 'Inside posts',
      label: 'Images & video in posts',
      desc: 'Keeps the titles and text, drops the pictures.',
      css: ['shreddit-post > [slot="post-media-container"]', 'shreddit-post > [slot="thumbnail"]']
    },

    /* ------------------------------------------------------ sidebars ---- */
    {
      id: 'leftSidebar',
      group: 'Sidebars',
      label: 'Left sidebar',
      desc: 'Home, Popular, your communities, custom feeds, games and resources.',
      css: ['flex-left-nav-container', '#left-sidebar-container']
    },
    {
      id: 'rightSidebar',
      group: 'Sidebars',
      label: 'Right sidebar',
      desc: 'Recent posts, sidebar ads, and a community\'s about box and rules.',
      css: ['#right-sidebar-container']
    },
    {
      id: 'recentPosts',
      group: 'Sidebars',
      label: 'Recent posts',
      desc: 'The list of posts you looked at, down the right column.',
      css: ['recent-posts', 'faceplate-loader[name^="RecentPosts"]']
    },
    {
      id: 'games',
      group: 'Sidebars',
      label: 'Games on Reddit',
      desc: 'The games section of the left menu and the games badge in the top bar.',
      css: [
        'faceplate-expandable-section-helper:has(summary[aria-controls="games_section"])',
        'games-section-badge-wrapper',
        'devvit-games-drawer-item'
      ]
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'search',
      group: 'Top bar',
      label: 'Search box',
      css: ['reddit-search-large']
    },
    {
      id: 'createPost',
      group: 'Top bar',
      label: 'Create post button',
      css: ['create-post-entry-point-wrapper']
    },
    {
      id: 'chat',
      group: 'Top bar',
      label: 'Chat',
      desc: 'The chat button and the chat window.',
      css: ['reddit-chat-header-button', 'reddit-chat-host']
    },
    {
      id: 'advertise',
      group: 'Top bar',
      label: '"Advertise" buttons',
      desc: 'Reddit\'s pitch to advertisers, in the top bar and the left menu.',
      css: ['advertise-button', 'a#advertise-button', 'a[href^="https://ads.reddit.com"]']
    },
    {
      id: 'badges',
      group: 'Top bar',
      on: true,
      label: 'Red unread badges',
      desc: 'The counts on chat and notifications, and in the tab title.',
      css: ['dynamic-badge'],
      js: { kind: 'badges' }
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    SITES.common.blur('shreddit-feed > article')
  ];

  var HEURISTICS = {
    /* Promoted posts are their own element and go by CSS; this catches a
     * promoted post that turns up inside an ordinary <article>, by the ad
     * markers Reddit puts on its parts. */
    promoted: function (unit) {
      return !!unit.querySelector('shreddit-post[promoted], [data-ad-click-location="promoted_label"], shreddit-post-overflow-menu[is-ad]');
    },

    /* Signed in, every post from a community you joined carries
     * is-subscribed, rendered by the server with the post. On your home
     * feed, a post without it is one Reddit chose for you. Signed out there
     * is no such thing as joined, so nothing is judged. */
    recommended: function (unit) {
      if (!HOME.test(location.pathname)) return false;
      var post = unit.querySelector('shreddit-post');
      return !!post && post.hasAttribute('user-logged-in') && !post.hasAttribute('is-subscribed') &&
        post.getAttribute('view-context') === 'AggregateFeed';
    }
  };

  /* --------------------------------------------------------- picker ---- */

  /* Picking a post means "posts from this community". */
  function authorOf(article, cssString) {
    var post = article.querySelector('shreddit-post');
    var sub = post && post.getAttribute('subreddit-prefixed-name');
    if (!sub) return null;
    return {
      selector: UNITS + ':has(> shreddit-post[subreddit-prefixed-name=' + cssString(sub) + '])',
      name: sub
    };
  }

  SITES.register({
    id: 'reddit',
    units: UNITS,
    presets: PRESETS,
    silent: { promoted: true },
    /* Screen-reader-only labels ("Upvote", "Go to comments") are not what a
     * reader sees. */
    unseen: 'faceplate-screen-reader-content',
    heuristics: HEURISTICS,
    /* Reddit's player keeps its <video> in its shadow root. */
    videoHosts: 'shreddit-player, shreddit-player-2',
    globals: {
      badges: function (api) { api.stripTitleCount(); }
    },
    picker: {
      authorOf: authorOf,
      classes: false,
      keys: {
        'faceplate-partial': 'name',
        'faceplate-loader': 'name',
        'shreddit-async-loader': 'bundlename',
        'faceplate-tracker': 'noun',
        'faceplate-hovercard': 'data-id'
      },
      generic: /^(faceplate-(number|timeago|screen-reader-content|progress|img|icon|perfmark|batch)|image-observer|delegated-link|shreddit-post|icon-[\w-]+|svg-[\w-]+)$/
    }
  });
})(typeof self !== 'undefined' ? self : this);
