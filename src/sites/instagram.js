/* Instagram.
 *
 * Instagram is built like Facebook: generated classes, no test ids, and
 * aria-labels in the reader's language. Checked against the live,
 * signed-in site in October 2026:
 *   - every feed post is an <article>: a header row (avatar with its story
 *     ring on a <canvas>, name, time, maybe a Follow button, the "…"
 *     button), the media, then the action bar (the article's first
 *     <section>), the likes line (its second) and the caption
 *   - every post shows when it was posted in a <time> element — every post
 *     except ads, which print "Ad" there instead. Most ads also link through
 *     facebook.com/ads/ig_redirect/
 *   - a post from an account you don't follow has a Follow button in its
 *     header: a button with text and no icon (the "…" button is an icon,
 *     the avatar a canvas)
 *   - the reel viewer (/reels/<id>/) is a scroll list: the reel opened, then
 *     reels picked for you; the address follows the one in view
 *   - the stories tray sits above the feed and the right column beside it;
 *     neither has a hook, so each is found by what it holds (a canvas ring,
 *     the /explore/people/ link) as the largest box without the feed in it
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var POST = 'article';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'sponsored',
      group: 'Ads',
      on: true,
      label: 'Sponsored posts',
      desc: 'Ads in the feed: the posts that show "Ad" where others show when they were posted.',
      css: [POST + ':has(a[href*="/ads/ig_redirect/"])'],
      js: { kind: 'sponsored' }
    },

    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'reels',
      group: 'Feed',
      on: true,
      label: 'Recommended Reels',
      desc: 'Reels in the feed, the Reels tab and the next reels after one you open. A reel someone sends you still opens.',
      css: ['a[href="/reels/"]'],
      style: '[data-bfx-held] { overflow: hidden !important; }',
      js: { kind: 'reel' }
    },
    {
      id: 'suggested',
      group: 'Feed',
      label: 'Posts from accounts you don\'t follow',
      desc: '"Suggested for you" and everything else with a Follow button on it. Often most of the feed once you have seen your follows.',
      js: { kind: 'suggested' }
    },
    {
      id: 'videoPosts',
      group: 'Feed',
      label: 'All video posts',
      desc: 'Every post with a video in it — the whole post, not just the player.',
      css: [POST + ':has(video)']
    },
    {
      id: 'stories',
      group: 'Feed',
      label: 'Stories',
      desc: 'The row of stories above the feed.'
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Like / comment / share bar',
      desc: 'The row of buttons under every post.',
      css: [POST + ' div > section:first-of-type']
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Like and comment counts',
      desc: 'The numbers beside the buttons and the "Liked by …" line, not the buttons.',
      css: [POST + ' div > section:first-of-type span[role="button"]', POST + ' div > section:nth-of-type(2)']
    },
    SITES.common.noAutoplay('Inside posts', 'Videos in the feed stay paused while you scroll past. Click one and it plays as normal.'),

    /* ------------------------------------------------------ sidebars ---- */
    {
      id: 'rightSidebar',
      group: 'Sidebars',
      label: 'Right column',
      desc: 'Your account, "Suggested for you" and the footer beside the feed.'
    },

    /* -------------------------------------------------------- badges ---- */
    {
      id: 'badges',
      group: 'Menu',
      on: true,
      label: 'Red badges',
      desc: 'The counts and dots on Messages and Notifications, and in the tab title.',
      js: { kind: 'badges' }
    },
    {
      id: 'threadsLink',
      group: 'Menu',
      label: 'Threads and "Also from Meta"',
      desc: 'Meta\'s cross-promotion in the menu.',
      css: ['a[href^="https://www.threads.com"]', 'a[href^="https://www.threads.net"]']
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    SITES.common.blur(POST)
  ];

  /* --------------------------------------------------------- helpers ---- */

  /* The header row: the smallest box around the post's first icon button
   * (the "…") that also holds the avatar, whose story ring is a canvas. */
  function headerOf(post) {
    var buttons = post.querySelectorAll('[role="button"], button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (!b.querySelector('svg') || b.querySelector('canvas')) continue;
      var row = b;
      while (row !== post && row.parentElement && !row.querySelector('canvas')) row = row.parentElement;
      return row === post ? null : row;
    }
    return null;
  }

  var HEURISTICS = {
    /* Every post prints its time except ads. A post still loading has no
     * time yet either, so judge only once the header has a name in it. */
    sponsored: function (unit, rule, ctx, api) {
      if (unit.querySelector('a[href*="/ads/ig_redirect/"]')) return true;
      var header = headerOf(unit);
      if (!header || !header.querySelector('a[href^="/"]')) { ctx.unsure(); return false; }
      if (unit.querySelector('time')) return false;
      var spans = header.querySelectorAll('span');
      for (var i = 0; i < spans.length; i++) {
        if (!spans[i].children.length && api.AD_LABEL.test((spans[i].textContent || '').trim())) return true;
      }
      /* No time and no label we know: still an ad, as far as the live site
       * goes, but wait for the media to be sure the post finished loading. */
      if (!unit.querySelector('img, video')) { ctx.unsure(); return false; }
      return true;
    },

    /* A reel in the feed: a post linking to its reel page. */
    reel: function (unit) {
      return !!unit.querySelector('a[href^="/reel/"], a[href^="/reels/"]:not([href^="/reels/audio/"])');
    },

    suggested: function (unit) {
      var header = headerOf(unit);
      if (!header) return false;
      var buttons = header.querySelectorAll('[role="button"], button');
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b.querySelector('svg, canvas, img') && (b.textContent || '').trim()) return true;
      }
      return false;
    }
  };

  /* --------------------------------------------------------- globals ---- */

  /* The largest box around a mark that holds no post: the stories tray
   * above the feed, the right column beside it. */
  function besideFeed(id, markSelector) {
    return function (api) {
      var main = document.querySelector('main');
      var mark = main && main.querySelector(markSelector);
      if (!mark || !main.querySelector(POST)) return;
      var block = api.blockOf(mark, POST, main);
      if (block) api.hide(block, id);
    };
  }

  /* Counts on the menu's Messages and Notifications entries: digit-only
   * text inside a menu link; the box around the digits is the red circle. */
  function stripBadges(api) {
    document.querySelectorAll('a[href="/direct/inbox/"], a[href*="/notifications"], a[href="#"]').forEach(function (link) {
      link.querySelectorAll('span, div').forEach(function (el) {
        if (el.children.length || !/^\d{1,3}\+?$/.test((el.textContent || '').trim())) return;
        var circle = el.parentElement && el.parentElement !== link && el.parentElement.children.length === 1 ? el.parentElement : el;
        api.hide(circle, 'badges');
      });
    });
    api.stripTitleCount();
  }

  /* A reel you open stays watchable; the ones after it do not. The reel
   * viewer is a scroll list of reels: the one opened first, then reels
   * picked for you (ads among them), and the address follows whichever is
   * in view. With Reels on, the list is held on the reel that was opened:
   * it cannot be scrolled (style), and any scroll the page makes itself —
   * the next button, the arrow keys, moving on when a reel ends — is put
   * back. Clicking a link to another reel (in a chat, say) opens that one. */
  var REEL_PATH = /^\/reels?\/([\w-]+)\/?$/;
  var visit = null;              // { id, box, top, at } for the reel being watched
  var clicked = { id: null, at: 0 };
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      var m = a && REEL_PATH.exec((a.getAttribute('href') || '').split('?')[0]);
      if (m) clicked = { id: m[1], at: Date.now() };
    }, true);
  }

  /* The scroll list: the nearest box around a video whose children hold
   * videos of their own. */
  function viewerOf(video) {
    for (var n = video.parentElement; n && n !== document.body; n = n.parentElement) {
      var withVideo = 0;
      for (var i = 0; i < n.children.length; i++) {
        if (n.children[i].querySelector('video')) withVideo++;
      }
      if (withVideo >= 2) return n;
    }
    return null;
  }

  function holding(api) {
    var s = api.state();
    return !!(s && s.enabled && s.presets.reels);
  }

  function keepReel(box, api) {
    if (!visit || visit.box !== box || !holding(api)) return;
    /* A link to another reel was just clicked: that reel is the one opened
     * now, wherever the list moves to show it. */
    if (clicked.id && clicked.id !== visit.id && Date.now() - clicked.at < 4000) {
      visit = { id: clicked.id, box: box, top: box.scrollTop, at: Date.now() };
      return;
    }
    /* Instagram places the list itself just after it opens; that first
     * second sets where the opened reel is. */
    if (Date.now() - visit.at < 1500) { visit.top = box.scrollTop; return; }
    if (Math.abs(box.scrollTop - visit.top) > 4) box.scrollTop = visit.top;
  }

  function holdReel(api) {
    var m = REEL_PATH.exec(location.pathname);
    if (!m || m[1] === 'audio') { visit = null; return; }
    var video = document.querySelector('main video');
    var box = video && viewerOf(video);
    if (!box) return;
    var opened = clicked.id === m[1] && Date.now() - clicked.at < 4000 && (!visit || visit.id !== m[1]);
    if (!visit || visit.box !== box || opened) {
      visit = { id: m[1], box: box, top: box.scrollTop, at: Date.now() };
      if (!box.__bfxHeld) {
        box.__bfxHeld = true;
        box.addEventListener('scroll', function () { keepReel(box, api); }, { passive: true });
      }
    }
    if (!box.hasAttribute('data-bfx-held')) box.setAttribute('data-bfx-held', '');
    keepReel(box, api);
  }

  /* --------------------------------------------------------- picker ---- */

  /* Picking a post means "posts from this account", keyed on the header's
   * profile link (a caption that mentions the account doesn't count). */
  function authorOf(post, cssString) {
    var header = headerOf(post);
    var links = header ? header.querySelectorAll('a[href^="/"]') : [];
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href').split('?')[0];
      if (/^\/[\w.]+\/$/.test(href) && !/^\/(explore|reels|p|reel|direct|stories)\//.test(href)) {
        return {
          selector: POST + ':has(> div > div:first-child a[href=' + cssString(href) + '])',
          name: '@' + href.slice(1, -1)
        };
      }
    }
    return null;
  }

  SITES.register({
    id: 'instagram',
    units: POST,
    presets: PRESETS,
    silent: { sponsored: true },
    heuristics: HEURISTICS,
    globals: {
      reels: holdReel,
      stories: besideFeed('stories', 'ul canvas'),
      rightSidebar: besideFeed('rightSidebar', 'a[href^="/explore/people/"]'),
      badges: stripBadges
    },
    /* With Reels on, the Reels tab itself sends you to the feed. A single
     * reel (/reel/<id>/, /reels/<id>/) still opens; holdReel keeps it to that
     * one. */
    redirect: function (view, loc) {
      if (!view.presets.reels) return null;
      return /^\/reels\/?$/.test(loc.pathname) ? '/' : null;
    },
    /* Messages are left alone: a reel or a word in a chat is yours to see. */
    skip: function (unit) {
      return location.pathname.indexOf('/direct/') === 0 || !!unit.closest('[role="dialog"]');
    },
    picker: {
      authorOf: authorOf,
      classes: false
    }
  });
})(typeof self !== 'undefined' ? self : this);
