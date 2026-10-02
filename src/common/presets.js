/* Preset rules.
 *
 * Facebook ships obfuscated, per-build class names (x1n2onr6, xdt5ytf ...), so
 * class selectors rot within days. Everything here keys off the hooks Facebook
 * keeps stable because its own tooling and screen readers depend on them:
 *   - data-pagelet="Stories" | "LeftRail" | "RightRail" | "FeedUnit_0" ...
 *   - data-visualcompletion="media-vc-image"
 *   - role="feed" | "article" | "banner" | "complementary" | "navigation"
 *   - aria-label="Marketplace" | "Notifications" | "Like" ...
 *
 * A rule has:
 *   css   : selectors hidden with display:none !important
 *   style : raw CSS, for rules that restyle instead of hide
 *   js    : heuristic handled by the engine (things CSS cannot express)
 */
(function (root) {
  'use strict';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'sponsored',
      group: 'Ads',
      label: 'Sponsored posts in the feed',
      desc: 'Caught three ways: the ad-only markup Facebook renders (data-ad-preview, data-ad-rendering-role), the "Why am I seeing this ad?" link, and the Sponsored label itself.',
      css: [
        'div[data-pagelet^="FeedUnit"]:has([data-ad-preview])',
        'div[data-pagelet^="FeedUnit"]:has([data-ad-rendering-role])',
        'div[data-pagelet^="FeedUnit"]:has(a[href*="/ads/about"])',
        'div[role="feed"] > div:has([data-ad-preview])',
        'div[role="feed"] > div:has(a[href*="/ads/about"])',
        'div[role="article"]:has([data-ad-rendering-role])'
      ],
      js: { kind: 'sponsored' }
    },
    {
      id: 'rightAds',
      group: 'Ads',
      label: 'Sidebar ads',
      desc: 'The "Sponsored" block down the right column.',
      js: { kind: 'sidebarAds' }
    },
    {
      id: 'adSweep',
      group: 'Ads',
      label: 'Ads everywhere else',
      desc: 'Stories, Reels, Marketplace, search results, Watch, groups — anything carrying a Sponsored label outside the feed. Hides the individual ad card, not the surface it sits in.',
      js: { kind: 'sweep' }
    },
    {
      id: 'paidPartnership',
      group: 'Ads',
      label: 'Paid partnership posts',
      desc: 'Branded content from pages you actually follow. Off by default — it is advertising, but you asked for the page.',
      js: {
        kind: 'feedText',
        phrases: ['Paid partnership', 'Paid promotion', 'Sponsored content']
      }
    },
    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'feed',
      group: 'Feed',
      label: 'The entire News Feed',
      desc: 'Nuclear option. Leaves the rest of Facebook usable for messages, groups and events.',
      css: ['div[role="feed"]', 'div[data-pagelet^="FeedUnit"]']
    },
    {
      id: 'stories',
      group: 'Feed',
      label: 'Stories tray',
      desc: 'The horizontal story carousel above the feed.',
      css: ['div[data-pagelet="Stories"]', 'div[aria-label="Stories"]']
    },
    {
      id: 'reels',
      group: 'Feed',
      label: 'Reels & short videos',
      desc: 'Reels rows injected between posts, and the Reels rail.',
      css: [
        'div[data-pagelet="VideoChainingFeedUnit"]',
        'div[data-pagelet^="VideoChaining"]',
        'div[aria-label="Reels"]',
        'a[aria-label="Reels"]'
      ],
      js: { kind: 'feedText', phrases: ['Reels and short videos', 'Reels for you'] }
    },
    {
      id: 'composer',
      group: 'Feed',
      label: "The “What’s on your mind?” box",
      desc: 'Post composer at the top of the feed and of profiles.',
      css: [
        'div[data-pagelet="ProfileComposer"]',
        'div[data-pagelet="FeedComposer"]',
        'div[role="button"][aria-label^="What\'s on your mind"]',
        'div[aria-label="Create a post"]'
      ]
    },
    {
      id: 'suggested',
      group: 'Feed',
      label: 'Suggested / recommended posts',
      desc: 'Posts from pages and people you do not follow.',
      js: {
        kind: 'feedText',
        phrases: ['Suggested for you', 'Recommended for you', 'Suggested post', 'Based on your activity']
      }
    },
    {
      id: 'pymk',
      group: 'Feed',
      label: 'People / pages / groups you may know',
      desc: 'Friend and group suggestion blocks wherever they appear in the feed.',
      js: {
        kind: 'feedText',
        phrases: ['People you may know', 'Suggested groups', 'Groups you may like', 'Pages you may like', 'Suggested for you in']
      }
    },
    {
      id: 'reactionsOnPosts',
      group: 'Feed',
      label: 'Friend activity ("X commented on this")',
      desc: 'Posts that only reached you because someone reacted or commented.',
      js: {
        kind: 'feedText',
        phrases: ['commented on this', 'replied to a comment', 'likes this', 'shared a ', 'follows this']
      }
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Like / Comment / Share bar',
      desc: 'Removes the action row at the bottom of every post.',
      css: [
        'div[role="article"] div:has([aria-label="Like"]):has([aria-label="Comment"]):not(:has(div:has([aria-label="Like"]):has([aria-label="Comment"])))'
      ]
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Reaction, comment & share counts',
      desc: 'Hides the numbers without hiding the buttons.',
      css: [
        'div[role="article"] [aria-label*="reaction"]',
        'div[role="article"] [aria-label$="comments"]',
        'div[role="article"] [aria-label$="shares"]'
      ]
    },
    {
      id: 'comments',
      group: 'Inside posts',
      label: 'Comment threads',
      desc: 'Existing comments and the reply box under each post.',
      css: [
        'div[role="article"] div[role="article"]',
        '[aria-label^="Write a comment"]',
        '[aria-label^="Write an answer"]',
        'form[role="presentation"]:has([aria-label^="Write a"])'
      ]
    },
    {
      id: 'media',
      group: 'Inside posts',
      label: 'Images & video in posts',
      desc: 'Keeps the text, drops the pictures. Surprisingly readable.',
      css: [
        'div[role="article"] [data-visualcompletion="media-vc-image"]',
        'div[role="article"] video',
        'div[role="article"] a[href*="/photo/"] img',
        'div[role="article"] a[href*="/photo.php"] img'
      ]
    },

    /* ---------------------------------------------------- navigation ---- */
    {
      id: 'leftRail',
      group: 'Sidebars',
      label: 'Left sidebar',
      desc: 'Shortcuts, Memories, Saved, Ads Manager and the rest of the left column.',
      css: ['div[data-pagelet="LeftRail"]', 'div[role="navigation"][aria-label="Shortcuts"]']
    },
    {
      id: 'rightRail',
      group: 'Sidebars',
      label: 'Right sidebar',
      desc: 'Sponsored column, birthdays, contacts and group chats.',
      css: ['div[data-pagelet="RightRail"]', 'div[role="complementary"]']
    },
    {
      id: 'contacts',
      group: 'Sidebars',
      label: 'Contacts list only',
      desc: 'Keeps the right sidebar, hides who is online.',
      css: [
        'div[aria-label="Contacts"]',
        'div[role="complementary"] div:has(> div > span > h3)'
      ]
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'search',
      group: 'Top bar',
      label: 'Search box',
      css: ['div[role="banner"] [role="search"]', 'input[aria-label^="Search Facebook"]']
    },
    {
      id: 'navTabs',
      group: 'Top bar',
      label: 'All centre tabs',
      desc: 'Home, Video, Marketplace, Groups, Gaming.',
      css: ['div[role="banner"] div[role="navigation"]:has(a[aria-label="Home"])']
    },
    {
      id: 'marketplace',
      group: 'Top bar',
      label: 'Marketplace',
      css: ['a[aria-label="Marketplace"]', 'a[href^="/marketplace"]']
    },
    {
      id: 'watch',
      group: 'Top bar',
      label: 'Video / Watch',
      css: ['a[aria-label="Video"]', 'a[aria-label="Watch"]', 'a[href^="/watch"]']
    },
    {
      id: 'gaming',
      group: 'Top bar',
      label: 'Gaming',
      css: ['a[aria-label="Gaming"]', 'a[aria-label="Gaming Video"]', 'a[href^="/gaming"]']
    },
    {
      id: 'notifications',
      group: 'Top bar',
      label: 'Notifications bell',
      css: ['div[aria-label="Notifications"]', 'div[role="banner"] a[href^="/notifications"]']
    },
    {
      id: 'messengerIcon',
      group: 'Top bar',
      label: 'Messenger icon',
      css: ['div[aria-label="Messenger"]', 'div[role="banner"] a[href^="/messages"]']
    },
    {
      id: 'badges',
      group: 'Top bar',
      label: 'Red unread badges',
      desc: 'Keeps the icons, kills the little red numbers that pull you in.',
      js: { kind: 'badges' }
    },

    /* ----------------------------------------------------------- chat ---- */
    {
      id: 'chatTabs',
      group: 'Chat',
      label: 'Chat bubbles / popup windows',
      css: [
        'div[data-pagelet="ChatTabsWrapper"]',
        'div[aria-label="Chat tab"]',
        'div[role="dialog"][aria-label*="Messenger"]'
      ]
    },
    {
      id: 'activeNow',
      group: 'Chat',
      label: 'Green "active now" dots',
      css: [
        '[aria-label="Active now"]',
        '[data-visualcompletion="ignore"] [aria-label*="Active"]'
      ]
    },

    /* -------------------------------------------------------- effects ---- */
    {
      id: 'grayscale',
      group: 'Effects',
      label: 'Grey out all media',
      desc: 'Colour comes back when you hover a post.',
      style:
        'div[role="feed"] img, div[role="feed"] video, div[data-pagelet^="FeedUnit"] img,' +
        'div[data-pagelet^="FeedUnit"] video { filter: grayscale(1); transition: filter .18s ease; }' +
        'div[role="article"]:hover img, div[role="article"]:hover video { filter: none !important; }'
    },
    {
      id: 'blurFeed',
      group: 'Effects',
      label: 'Blur posts until hovered',
      desc: 'Stops passive scrolling dead. You have to choose to read something.',
      style:
        'div[data-pagelet^="FeedUnit"], div[role="feed"] > div { filter: blur(5px); transition: filter .15s ease; }' +
        'div[data-pagelet^="FeedUnit"]:hover, div[role="feed"] > div:hover { filter: none; }'
    },
    {
      id: 'narrowFeed',
      group: 'Effects',
      label: 'Centre the feed',
      desc: 'Once the sidebars are gone, pull the column back into the middle.',
      style: 'div[role="main"] { margin-inline: auto !important; }'
    }
  ];

  root.BFX_PRESETS = PRESETS;
  root.BFX_GROUPS = PRESETS.reduce(function (acc, r) {
    if (acc.indexOf(r.group) === -1) acc.push(r.group);
    return acc;
  }, []);
})(typeof self !== 'undefined' ? self : this);
