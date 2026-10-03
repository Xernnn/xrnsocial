/* X (Twitter).
 *
 * X is React Native for Web: class names are generated (css-175oi2r,
 * r-1awozwy) and useless, but nearly every part carries a data-testid that
 * survives builds and languages. Checked against the live, signed-in site in
 * October 2026:
 *   - every timeline row is [data-testid="cellInnerDiv"], posts or not; a
 *     post is article[data-testid="tweet"] inside one. The list is
 *     virtualized, and each row belongs to one entry for its whole life
 *   - an ad is a placementTracking box whose first children are four
 *     impression pixels (top-, right-, bottom-, left-impression-pixel),
 *     with the post inside it; ordinary posts only have placementTracking
 *     around their videos, with no pixels. Ad links carry twclid=
 *   - the right column's blocks (search, Premium, Today's News, trends, who
 *     to follow, footer) have English-only labels, but each holds something
 *     language-free: /i/premium_sign_up, news_sidebar, trend, UserCell
 *   - a promoted trend is a trend with a second icon (the promoted box)
 *     besides its "..." caret
 *   - a repost carries socialContext beside the repost arrow; the arrow in
 *     that line is not the same drawing as the repost button's
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var CELL = '[data-testid="cellInnerDiv"]';
  var POST = 'article[data-testid="tweet"]';
  var PIXEL = '[data-testid$="-impression-pixel"]';
  var AD_MARKS = PIXEL + ', a[href*="twclid="]';

  /* The arrow drawn beside "X reposted". */
  var REPOST_ICON = /^M4\.75 3\.79l4\.603 4\.3/;
  /* The box drawn beside "Promoted by". */
  var PROMOTED_ICON = 'M19.498 3h-15c-1.381';

  /* Pages that list accounts on purpose, where user cells are the content. */
  var ACCOUNT_LISTS = /^\/(search|explore|notifications|i\/|settings)|\/(followers|following|verified_followers|followers_you_follow|members|subscribers|creator-subscriptions|lists)(\/|$)/;

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'promoted',
      group: 'Ads',
      on: true,
      label: 'Promoted posts',
      desc: 'Ads in the timeline, in replies, in search and on profiles, and promoted accounts.',
      css: [
        CELL + ':has([data-testid="top-impression-pixel"])',
        CELL + ':has(a[href*="twclid="])',
        '[data-testid="placementTracking"]:has(> [data-testid="top-impression-pixel"])',
        '[data-testid="UserCell"]:has(' + PIXEL + ')'
      ],
      js: { kind: 'promoted' }
    },
    {
      id: 'promotedTrends',
      group: 'Ads',
      on: true,
      label: 'Promoted trends',
      desc: '"Promoted by …" entries in the trends list.',
      css: ['[data-testid="trend"]:has(path[d^="' + PROMOTED_ICON + '"])']
    },
    {
      id: 'premiumUpsell',
      group: 'Ads',
      on: true,
      label: 'Premium upsells',
      desc: 'The "Subscribe to Premium" card, the Premium menu item and upgrade prompts.',
      css: [
        '[data-testid="sidebarColumn"] aside:has(a[href^="/i/premium_sign_up"])',
        'header a[href^="/i/premium_sign_up"]',
        '[data-testid="premium-signup-tab"]',
        '[data-testid="super-upsell-UpsellCardRenderer"]'
      ]
    },

    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'whoToFollow',
      group: 'Feed',
      on: true,
      label: 'Who to follow',
      desc: 'Account suggestions in the timeline, under posts and in the right column.',
      css: ['[data-testid="sidebarColumn"] aside:has([data-testid="UserCell"])'],
      js: { kind: 'whoToFollow' }
    },
    {
      id: 'reposts',
      group: 'Feed',
      label: 'Reposts',
      desc: 'Posts that someone you follow reposted. Quotes stay.',
      js: { kind: 'repost' }
    },
    {
      id: 'videoPosts',
      group: 'Feed',
      label: 'All video posts',
      desc: 'Every post with a video in it — the whole post, not just the player.',
      css: [CELL + ':has(' + POST + ' [data-testid="videoPlayer"])']
    },
    {
      id: 'verifiedReplies',
      group: 'Feed',
      label: 'Replies from verified accounts',
      desc: 'Under a post you opened, replies from accounts with a checkmark — most are paid. The post and the thread above it stay.',
      js: { kind: 'verifiedReplies' }
    },
    {
      id: 'following',
      group: 'Feed',
      label: 'Open Home on "Following"',
      behavior: true,
      desc: 'Switches Home from the "For you" picks to the people you follow, each time you arrive. Click "For you" to go back for the visit.'
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Reply / repost / like bar',
      desc: 'The row of buttons under every post.',
      css: [POST + ' [role="group"]:has([data-testid="like"], [data-testid="unlike"])']
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Reply, repost, like and view counts',
      desc: 'Hides the numbers without hiding the buttons.',
      css: [POST + ' [role="group"] [data-testid="app-text-transition-container"]']
    },
    {
      id: 'media',
      group: 'Inside posts',
      label: 'Images & video in posts',
      desc: 'Keeps the text, drops pictures, videos and link cards.',
      css: [POST + ' [data-testid="tweetPhoto"]', POST + ' [data-testid="videoPlayer"]', POST + ' [data-testid="card.wrapper"]']
    },
    SITES.common.noAutoplay('Inside posts', 'Videos in the timeline stay paused while you scroll past. Click one and it plays as normal.'),

    /* ------------------------------------------------------ sidebars ---- */
    {
      id: 'rightSidebar',
      group: 'Sidebars',
      label: 'Right column',
      desc: 'Search, Premium, news, trends, who to follow — all of it.',
      css: ['[data-testid="sidebarColumn"]']
    },
    {
      id: 'trends',
      group: 'Sidebars',
      label: 'What\'s happening',
      desc: 'The trends list in the right column.',
      css: ['[data-testid="sidebarColumn"] section:has([data-testid="trend"])']
    },
    {
      id: 'news',
      group: 'Sidebars',
      label: 'Today\'s News',
      desc: 'The news stories in the right column.',
      css: ['[data-testid="sidebarColumn"] div:has(> [data-testid="news_sidebar"])']
    },
    {
      id: 'sidebarSearch',
      group: 'Sidebars',
      label: 'Search box in the right column',
      desc: 'Explore still has its own.',
      css: ['[data-testid="sidebarColumn"] form[role="search"]']
    },
    {
      id: 'navExtras',
      group: 'Sidebars',
      label: 'Extra menu items',
      desc: 'Grok, Premium, Creator Studio, History, Communities, Jobs, Lists, Business and Monetization in the left menu and the More menu. Home, Explore, Notifications, Messages and Profile stay.',
      css: navLinks(['/i/grok', '/i/premium_sign_up', '/i/jf/creators/studio', '/i/history', '/jobs', '/i/verified-orgs-signup', '/i/monetization', '/i/spaces/start'])
        .concat(navEnds(['/communities', '/lists']))
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'grok',
      group: 'Floating & badges',
      label: 'Grok',
      desc: 'The Grok button on every post, the Grok bubble, its menu item and the image button in the post box.',
      css: [
        'header a[href="/i/grok"]',
        '[data-testid="GrokDrawer"]',
        POST + ' button[aria-label="Grok actions"]',
        POST + ' button:has(path[d^="M12.745 20.54l10.97-8.19"])',
        '[data-testid="grokImgGen"]'
      ]
    },
    {
      id: 'chatDrawer',
      group: 'Floating & badges',
      label: 'Chat drawer',
      desc: 'The chat bar in the bottom corner. Messages in the menu still work.',
      css: ['[data-testid="chat-drawer-root"]']
    },
    {
      id: 'newPostsPill',
      group: 'Floating & badges',
      label: '"New posts" bubble',
      desc: 'The bubble of avatars that offers fresh posts at the top of Home.',
      css: ['button:has(> div > [data-testid="pillLabel"])', '[data-testid="pillLabel"]']
    },
    {
      id: 'composer',
      group: 'Floating & badges',
      label: 'Post box on Home and under posts',
      desc: 'The "What\'s happening?" box. The Post button in the menu still opens one.'
    },
    {
      id: 'badges',
      group: 'Floating & badges',
      on: true,
      label: 'Unread badges',
      desc: 'The counts and dots on the menu, and in the tab title.',
      css: ['header nav a div[aria-label]'],
      js: { kind: 'badges' }
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    SITES.common.blur(POST)
  ];

  /* Menu links by exact path or path prefix, in the left menu and in the More
   * menu that opens from it. */
  function navLinks(paths) {
    var out = [];
    paths.forEach(function (p) {
      out.push('header nav a[href^="' + p + '"]', '[role="menu"] a[href^="' + p + '"]');
    });
    return out;
  }
  function navEnds(ends) {
    var out = [];
    ends.forEach(function (e) {
      out.push('header nav a[href$="' + e + '"]', '[role="menu"] a[href$="' + e + '"]');
    });
    return out;
  }

  /* --------------------------------------------------------- helpers ---- */

  /* The post's own author line. A quoted post's sits inside the quote's
   * role="link" box; the post's own never does. */
  function authorLine(article) {
    var names = article.querySelectorAll('[data-testid="User-Name"]');
    for (var i = 0; i < names.length; i++) {
      if (!names[i].closest('[role="link"]')) return names[i];
    }
    return null;
  }

  /* The post a status page is about, and whether `cell` comes after it. */
  function openedId() {
    var m = /\/status\/(\d+)/.exec(location.pathname);
    return m && m[1];
  }
  function focalCell(id) {
    var times = document.querySelectorAll(POST + ' a[href$="/status/' + id + '"] time');
    for (var i = 0; i < times.length; i++) {
      var cell = times[i].closest(CELL);
      if (cell) return cell;
    }
    return null;
  }

  /* The opened post's row leaves the DOM once it scrolls far enough away,
   * so remember where on the page it was; rows below that are replies.
   * Its position is refreshed whenever it is there, since the thread above
   * it loads in after it. Null: can't tell yet. */
  var opened = { path: null, top: 0 };
  function pageTop(el) {
    return el.getBoundingClientRect().top + (window.scrollY || 0);
  }
  function belowOpened(unit, id) {
    var focal = focalCell(id);
    if (focal) {
      opened = { path: location.pathname, top: pageTop(focal) };
      return focal !== unit && !!(focal.compareDocumentPosition(unit) & 4);
    }
    if (opened.path !== location.pathname) return null;
    return pageTop(unit) > opened.top;
  }

  var HEURISTICS = {
    /* The CSS catches ads by their pixels; this also catches one whose
     * pixels are missing, by the "Ad" label X prints in the post's header. */
    promoted: function (unit, rule, ctx, api) {
      if (unit.querySelector(AD_MARKS)) return true;
      var article = unit.querySelector(POST);
      if (!article) return false;
      var spans = article.querySelectorAll('span');
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        if (s.children.length || s.closest('[data-testid="tweetText"], [data-testid="User-Name"], [role="link"]')) continue;
        if (api.AD_LABEL.test((s.textContent || '').trim())) return true;
      }
      return false;
    },

    /* Timeline modules come as rows: a heading, a few user cells, and a
     * "Show more" link to /i/connect_people. Pages that list accounts on
     * purpose are left alone. */
    whoToFollow: function (unit, rule, ctx) {
      if (ACCOUNT_LISTS.test(location.pathname)) return false;
      if (unit.querySelector(POST)) return false;
      if (unit.querySelector('[data-testid="UserCell"], a[href^="/i/connect_people"]')) return true;
      if (!unit.querySelector('h2, [role="heading"]')) return false;
      var next = unit.nextElementSibling;
      if (!next || !(next.textContent || '').trim()) { ctx.unsure(); return false; }
      return !!next.querySelector('[data-testid="UserCell"]');
    },

    repost: function (unit) {
      var line = unit.querySelector('[data-testid="socialContext"]');
      if (!line || !line.closest(POST)) return false;
      var row = line;
      for (var i = 0; i < 6 && row && !row.querySelector('svg'); i++) row = row.parentElement;
      var icon = row && row.querySelector('svg path');
      return !!icon && REPOST_ICON.test(icon.getAttribute('d') || '');
    },

    /* Only below the post that was opened: the thread above it is the
     * conversation being replied to. */
    verifiedReplies: function (unit, rule, ctx) {
      var id = openedId();
      if (!id) return false;
      var article = unit.querySelector(POST);
      if (!article) return false;
      var below = belowOpened(unit, id);
      if (below === null) { ctx.unsure(); return false; }
      if (!below) return false;
      var line = authorLine(article);
      return !!(line && line.querySelector('[data-testid="icon-verified"]'));
    }
  };

  /* --------------------------------------------------------- globals ---- */

  /* The right column's blocks have no hook of their own; each holds one
   * thing that says what it is. A block is the largest box around its mark
   * that holds no other block's mark. */
  var BLOCK_MARKS = {
    sidebarSearch: 'form[role="search"]',
    premiumUpsell: 'a[href^="/i/premium_sign_up"]',
    news: '[data-testid="news_sidebar"]',
    trends: '[data-testid="trend"]',
    whoToFollow: '[data-testid="UserCell"]',
    footer: 'nav'
  };

  function blockFor(column, kind) {
    var mark = column.querySelector(BLOCK_MARKS[kind]);
    if (!mark) return null;
    var others = Object.keys(BLOCK_MARKS).filter(function (k) { return k !== kind; })
      .map(function (k) { return BLOCK_MARKS[k]; }).join(', ');
    var node = mark;
    while (node.parentElement && node.parentElement !== column) {
      var parent = node.parentElement;
      var found = parent.querySelectorAll(others);
      for (var i = 0; i < found.length; i++) {
        if (!node.contains(found[i])) return node;
      }
      node = parent;
    }
    return null;   // the only block left: never hide the whole column
  }

  function sidebarBlock(kind) {
    return function (api) {
      var column = document.querySelector('[data-testid="sidebarColumn"]');
      var block = column && blockFor(column, kind);
      if (block) api.hide(block, kind);
    };
  }

  /* Pictures sit inside several wrappers that keep their size; hide the
   * largest box that holds media and none of the post's text or buttons. */
  var MEDIA = POST + ' [data-testid="tweetPhoto"], ' + POST + ' [data-testid="videoPlayer"], ' + POST + ' [data-testid="card.wrapper"]';
  var POST_PARTS = '[data-testid="tweetText"], [data-testid="User-Name"], [role="group"]';
  function hideMedia(api) {
    document.querySelectorAll(MEDIA).forEach(function (el) {
      if (el.closest(api.HIDDEN)) return;
      var article = el.closest(POST);
      var box = el;
      while (box.parentElement && box.parentElement !== article && !box.parentElement.querySelector(POST_PARTS)) {
        box = box.parentElement;
      }
      api.hide(box, 'media');
    });
  }

  /* The inline post box: the box around it that sits beside the timeline. */
  function hideComposer(api) {
    document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweetTextarea_0"]').forEach(function (box) {
      if (box.closest('[role="dialog"]')) return;
      var node = box;
      while (node.parentElement && !node.parentElement.querySelector(CELL + ', [role="tablist"]') &&
             !node.parentElement.matches('[data-testid="primaryColumn"]')) {
        node = node.parentElement;
      }
      api.hide(node, 'composer');
    });
  }

  /* Once per arrival on Home: if "For you" is showing, open "Following"
   * (always the second tab; pinned lists come after it). Leaving Home arms
   * it again, so clicking "For you" sticks for the visit. */
  var followingDone = false;
  function openFollowing() {
    if (location.pathname !== '/home') { followingDone = false; return; }
    if (followingDone) return;
    var tabs = document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]');
    if (tabs.length < 2) return;
    followingDone = true;
    if (tabs[0].getAttribute('aria-selected') === 'true') tabs[1].click();
  }

  /* --------------------------------------------------------- picker ---- */

  /* Picking a post means "posts from this account": keyed on the author
   * line's profile link, not a quoted post's. */
  function authorOf(cell, cssString) {
    var article = cell.querySelector(POST);
    var line = article && authorLine(article);
    var link = line && line.querySelector('a[href^="/"]');
    var handle = link && link.getAttribute('href').split(/[?#]/)[0];
    if (!handle || !/^\/\w{1,30}$/.test(handle)) return null;
    return {
      selector: CELL + ':has([data-testid="User-Name"]:not([role="link"] *) a[href=' + cssString(handle) + ' i])',
      name: '@' + handle.slice(1)
    };
  }

  SITES.register({
    id: 'x',
    units: CELL,
    presets: PRESETS,
    silent: { promoted: true },
    heuristics: HEURISTICS,
    globals: {
      premiumUpsell: sidebarBlock('premiumUpsell'),
      news: sidebarBlock('news'),
      trends: sidebarBlock('trends'),
      whoToFollow: sidebarBlock('whoToFollow'),
      sidebarSearch: sidebarBlock('sidebarSearch'),
      media: hideMedia,
      composer: hideComposer,
      following: openFollowing,
      badges: function (api) { api.stripTitleCount(); }
    },
    picker: {
      authorOf: authorOf,
      /* Generated (css-175oi2r, r-1awozwy), never meaningful. */
      classes: false
    }
  });
})(typeof self !== 'undefined' ? self : this);
