/* LinkedIn.
 *
 * LinkedIn's 2026 feed dropped the old feed-shared-update classes. Classes
 * are generated, component keys are random per render, and most labels are
 * English-only. Checked against the live, signed-in site in October 2026:
 *   - the feed is [data-testid="mainFeed"] (role="list"); each child is one
 *     item, lazily mounted: a post, or an insert (the post box, a Premium
 *     offer, a jobs carousel). Items are display: contents around a grid
 *     holding one role="listitem"; display: none still hides them
 *   - a post is a list of sections under a screen-reader <h2> ("Feed post"):
 *     an optional social line, the header, the text, media, counts, and the
 *     action bar. The h2 is there in every language, so sections are found
 *     from it and recognised by what they hold
 *   - icons carry stable design-system tokens (svg[data-token-id]): 289 the
 *     reaction button, 202 Comment, 255 Repost, 86 the "+" of Follow, 383
 *     the post's "…" menu, which marks the header
 *   - a post shown because of someone you know starts with an activity line
 *     ("IBM commented", "X likes this", "Followed by X") that holds the menu,
 *     then a rule, then the author's block
 *   - ads print "Promoted" where other posts print their time; no
 *     language-free marker was found on them. Some ad links carry li_fat_id=
 *   - both rails are <aside>s inside <main>, labelled in English only; their
 *     blocks are told apart by their links (/news/story, /games, /premium)
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var FEED = '[data-testid="mainFeed"]';
  var ITEM = FEED + ' > div';

  /* The label in a promoted post's header, in the languages LinkedIn
   * ships most. Exact, so a post that merely says "promoted" is not one. */
  var PROMOTED = /^(promoted|sponsored|promocionado|promovido|promosso|sponsorizzato|gesponsert|sponsorisé|promu|gepromoot|promowane|beworben|được quảng bá|quảng cáo|reklam|продвигается|реклама|プロモーション|広告|推广|推廣|프로모션|광고)$/i;

  var TOKEN = function (id) { return 'svg[data-token-id="' + id + '"]'; };
  var LIKE = TOKEN(289);
  var COMMENT = TOKEN(202);
  var REPOST = TOKEN(255);
  var FOLLOW = TOKEN(86);
  var MENU = TOKEN(383);

  /* A post's sections: everything after its screen-reader heading. */
  var SECTION = ITEM + ' h2 ~ div';

  var LEFT_RAIL = 'aside:has(a[href*="/me/profile-views"], a[href*="/my-items/"], a[href*="/mynetwork/network-manager"])';
  var RIGHT_RAIL = 'aside:has([componentkey="feedRightNavGamesComponentRef"], a[href*="/news/story/"], a[href*="/ad/start"])';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'promoted',
      group: 'Ads',
      on: true,
      label: 'Promoted posts',
      desc: 'Ads in the feed, and promoted cards in the right column.',
      css: [ITEM + ':has([aria-label="View Sponsored Content"])', ITEM + ':has(a[href*="li_fat_id="])'],
      js: { kind: 'promoted' }
    },
    {
      id: 'premiumUpsell',
      group: 'Ads',
      on: true,
      label: 'Premium upsells',
      desc: 'Premium offers in the feed, the left column and the top bar.',
      css: [ITEM + ':has(a[href*="/premium/"])', 'header a[href*="/premium/"]']
    },

    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'suggested',
      group: 'Feed',
      label: 'Posts from people you don\'t follow',
      desc: 'Posts with a Follow button on them: LinkedIn\'s picks, and posts shown because someone you know reacted. Often most of the feed.',
      js: { kind: 'suggested' }
    },
    {
      id: 'activity',
      group: 'Feed',
      label: 'Posts shown because of someone you know',
      desc: '"X likes this", "X commented", "Followed by X": posts in your feed only because of someone else\'s activity.',
      js: { kind: 'activity' }
    },
    {
      id: 'jobs',
      group: 'Feed',
      label: 'Jobs recommended for you',
      desc: 'The jobs carousel in the feed.',
      css: [ITEM + ':has([data-testid="carousel"]):has(a[href*="/jobs/"])']
    },
    {
      id: 'videoPosts',
      group: 'Feed',
      label: 'All video posts',
      desc: 'Every post with a video in it — the whole post, not just the player.',
      css: [ITEM + ':has(video)']
    },
    {
      id: 'composer',
      group: 'Feed',
      label: '"Start a post" box',
      desc: 'The post box at the top of the feed.',
      css: [ITEM + ':has(a[href*="/article/new/"])']
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Like / comment / repost bar',
      desc: 'The row of buttons under every post.',
      css: [SECTION + ':has(button ' + COMMENT + ', button ' + REPOST + ')']
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Reaction and comment counts',
      desc: 'The "275 reactions · 28 comments" line under posts.',
      css: [SECTION + ':has(ul[role="presentation"]):not(:has(button ' + LIKE + '))']
    },
    {
      id: 'comments',
      group: 'Inside posts',
      label: 'Comments under posts',
      desc: 'The comments that open beneath a post in the feed.',
      css: ['[data-testid*="commentList"]']
    },
    {
      id: 'media',
      group: 'Inside posts',
      label: 'Images & video in posts',
      desc: 'Keeps the text, drops pictures, videos and documents.',
      /* Not the parts with small pictures of people: the header and the
       * activity line (both hold the menu), the author block after an
       * activity line's rule, the counts. */
      css: [
        SECTION + ':has(video, img):not(hr + div):not(:has(button ' + MENU + ', [data-testid="expandable-text-box"], ul[role="presentation"], button ' + LIKE + '))',
        /* Some posts (ads, link posts) keep the text and the picture in one
         * section, at any depth: then the picture's own link goes, or the
         * video's box. Never inside the text, never in comments (whose
         * avatars are links with pictures too). Keyed on the link or video
         * box rather than "any box with a picture", which would make every
         * div on the page a candidate. */
        SECTION + ':has([data-testid="expandable-text-box"]) a:has(> figure img):not([data-testid="expandable-text-box"] *):not([data-testid*="commentList"] *)',
        SECTION + ':has([data-testid="expandable-text-box"]) div:has(> video):not([data-testid*="commentList"] *)',
        /* An event's picture is a section of its own: a link, not a box. */
        ITEM + ' h2 ~ a:has(> figure img)'
      ]
    },
    SITES.common.noAutoplay('Inside posts', 'Videos in the feed stay paused while you scroll past. Click one and it plays as normal.'),

    /* ------------------------------------------------------ sidebars ---- */
    {
      id: 'leftSidebar',
      group: 'Sidebars',
      label: 'Left column',
      desc: 'Your profile card, its stats, saved items, groups and events.',
      css: [LEFT_RAIL]
    },
    {
      id: 'rightSidebar',
      group: 'Sidebars',
      label: 'Right column',
      desc: 'News, puzzles and the footer — all of it.',
      css: [RIGHT_RAIL]
    },
    {
      id: 'news',
      group: 'Sidebars',
      label: 'LinkedIn News',
      desc: 'The top stories in the right column.'
    },
    {
      id: 'games',
      group: 'Sidebars',
      label: 'Today\'s puzzles',
      desc: 'LinkedIn\'s games in the right column.',
      css: ['[componentkey="feedRightNavGamesComponentRef"]']
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'badges',
      group: 'Top bar',
      on: true,
      label: 'Red notification badges',
      desc: 'The counts on Messaging, Notifications and the rest, and in the tab title.',
      js: { kind: 'badges' }
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    /* The item itself is display: contents, with no box to blur. */
    SITES.common.blur(ITEM + ' [role="listitem"]:not([role="listitem"] [role="listitem"])')
  ];

  /* --------------------------------------------------------- helpers ---- */

  /* The sections of a post: the children of the box that holds its h2. */
  function sectionsOf(item) {
    var h2 = item.querySelector('h2');
    return h2 && h2.parentElement ? Array.prototype.slice.call(h2.parentElement.children) : [];
  }

  /* The section with the post's "…" menu. In a plain post that is the
   * author's header. In a post shown because of someone's activity it is the
   * activity line ("IBM commented", with the reactor's picture), followed by
   * a rule and then the author's block. */
  function menuSection(item) {
    var parts = sectionsOf(item);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].querySelector('button ' + MENU)) return parts[i];
    }
    return null;
  }
  function authorAfter(line) {
    var rule = line && line.nextElementSibling;
    var block = rule && rule.localName === 'hr' && rule.nextElementSibling;
    return block && block.querySelector('a figure') ? block : null;
  }
  function headerOf(item) {
    var menu = menuSection(item);
    return authorAfter(menu) || menu;
  }

  var HEURISTICS = {
    promoted: function (unit, rule, ctx, api) {
      var header = headerOf(unit);
      if (!header) return false;
      var leaves = header.querySelectorAll('span, p');
      for (var i = 0; i < leaves.length; i++) {
        if (leaves[i].children.length) continue;
        var t = (leaves[i].textContent || '').trim();
        if (PROMOTED.test(t) || api.AD_LABEL.test(t)) return true;
      }
      return false;
    },

    /* A Follow button in the header: the author is someone you don't follow. */
    suggested: function (unit) {
      var header = headerOf(unit);
      return !!(header && header.querySelector('button ' + FOLLOW));
    },

    activity: function (unit) {
      return !!authorAfter(menuSection(unit));
    }
  };

  /* --------------------------------------------------------- globals ---- */

  /* Global rules run on every scan, and LinkedIn changes the page
   * constantly; a box is looked at again only when the settings or its
   * content changed. */
  function changed(box, key, api) {
    var stamp = api.generation() + ':' + box.textContent.length;
    if (box[key] === stamp) return false;
    box[key] = stamp;
    return true;
  }

  /* What each block of either rail holds. */
  var RAIL_MARKS = {
    news: 'a[href*="/news/story/"]',
    games: '[componentkey="feedRightNavGamesComponentRef"]',
    footer: 'footer',
    profile: 'a[href*="/in/"]',
    premium: 'a[href*="/premium/"]',
    stats: 'a[href*="/me/profile-views"], a[href*="/analytics/"]',
    shortcuts: 'a[href*="/my-items/"], a[href*="/events/"], a[href*="/groups/"]'
  };
  var ALL_MARKS = Object.keys(RAIL_MARKS).map(function (k) { return RAIL_MARKS[k]; }).join(', ');
  function railBlock(id, kind) {
    var others = Object.keys(RAIL_MARKS).filter(function (k) { return k !== kind; })
      .map(function (k) { return RAIL_MARKS[k]; }).join(', ');
    return function (api) {
      document.querySelectorAll('main aside').forEach(function (aside) {
        if (!changed(aside, '__bfxLi_' + id, api)) return;
        var mark = aside.querySelector(RAIL_MARKS[kind]);
        var block = mark && api.blockOf(mark, others, aside);
        if (block) api.hide(block, id);
      });
    };
  }

  /* Unread counts are small digit-only spans inside the top bar's links;
   * the span around the digits is the red circle. */
  function stripBadges(api) {
    var nav = document.querySelector('[data-testid="primary-nav"]') || document.querySelector('header nav');
    if (!nav) return;
    nav.querySelectorAll('a span, button span').forEach(function (el) {
      if (el.children.length || !/^\d{1,3}\+?$/.test((el.textContent || '').trim())) return;
      var circle = el.parentElement && el.parentElement.localName === 'span' && el.parentElement.children.length === 1 ? el.parentElement : el;
      api.hide(circle, 'badges');
    });
    api.stripTitleCount();
  }

  /* Premium in the left column goes with the other Premium upsells. */
  var premiumRail = railBlock('premiumUpsell', 'premium');
  var promotedRail = function (api) {
    /* A promoted card in a column carries the same label as a feed ad. */
    document.querySelectorAll('main aside').forEach(function (aside) {
      if (!changed(aside, '__bfxLiPromoted', api)) return;
      aside.querySelectorAll('span, p').forEach(function (el) {
        if (el.children.length || !PROMOTED.test((el.textContent || '').trim())) return;
        var block = api.blockOf(el, ALL_MARKS, aside);
        if (block) api.hide(block, 'promoted');
      });
    });
  };

  /* --------------------------------------------------------- picker ---- */

  /* Picking a post means "posts from this person or page": keyed on the
   * header's picture link, up to its query string. The header follows the
   * h2, or the social line ("Followed by …") and its rule; commenters'
   * pictures further down don't count. */
  function authorOf(item, cssString) {
    var header = headerOf(item);
    var link = header && header.querySelector('a[href*="/in/"], a[href*="/company/"], a[href*="/school/"], a[href*="/showcase/"]');
    if (!link) return null;
    var href = link.getAttribute('href').split('?')[0];
    var m = /\/(in|company|school|showcase)\/[^/]+\/?/.exec(href);
    if (!m) return null;
    /* The picture's label names the author: "Ana Li’s profile", "View
     * company: IAPP". */
    var pic = link.querySelector('[aria-label]');
    var label = (pic && pic.getAttribute('aria-label')) || link.getAttribute('aria-label') || link.textContent || '';
    var name = label.trim().replace(/^View (company|school|page): /i, '').replace(/[’']s profile$/i, '').slice(0, 40) || m[0];
    var key = cssString(m[0].replace(/\/?$/, '/'));
    return {
      selector: ITEM + ':has(h2 + div a[href*=' + key + '] > figure, h2 + div + hr + div a[href*=' + key + '] > figure)',
      name: name
    };
  }

  SITES.register({
    id: 'linkedin',
    units: ITEM,
    presets: PRESETS,
    silent: { promoted: true },
    /* The screen-reader heading every post starts with ("Feed post"). */
    unseen: 'h2',
    heuristics: HEURISTICS,
    globals: {
      promoted: promotedRail,
      premiumUpsell: premiumRail,
      news: railBlock('news', 'news'),
      badges: stripBadges
    },
    picker: {
      authorOf: authorOf,
      classes: false
    }
  });
})(typeof self !== 'undefined' ? self : this);
