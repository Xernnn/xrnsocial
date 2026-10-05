/* Facebook.
 *
 * Facebook ships obfuscated, per-build class names (x1n2onr6, xdt5ytf ...), so
 * class selectors rot within days. Everything here keys off the hooks Facebook
 * keeps stable because its own tooling and screen readers depend on them.
 * Checked against the live site in October 2026:
 *   - aria-posinset on every feed post (there is no role="feed" any more,
 *     no data-pagelet at all, and role="article" now means a comment)
 *   - data-ad-rendering-role="like_button" | "comment_button" | "image" ...,
 *     which marks parts of every post, ads or not
 *   - data-imgperflogname="feedImage", data-focus-target="stories_tray"
 *   - role="banner" | "complementary" | "navigation" | "region" | "toolbar"
 *   - aria-label="Marketplace" | "Notifications, 3 unread" | "Like" ...
 * The older hooks are kept where they cost nothing, for builds that still
 * ship them.
 *
 * A preset has:
 *   css   : selectors hidden with display:none !important
 *   style : raw CSS, for rules that restyle instead of hide
 *   js    : heuristic handled by the engine (things CSS cannot express)
 *   on    : true when the switch is on out of the box
 *
 * feedText phrases are keyed by language and all of them are tried at once,
 * against a post's header only (see headText in engine.js), so a phrase in
 * one language cannot hide a post written in another. English comes from
 * Facebook itself; the other languages are best-effort translations of its UI
 * strings — when one turns out wrong, fix it here.
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  /* Feed posts. Today's feed marks each post with aria-posinset (the ARIA
   * feed pattern) and nothing else stable. The older hooks stay for builds
   * that still ship them. */
  var UNITS = [
    'div[aria-posinset]',
    'div[data-pagelet^="FeedUnit"]',
    'div[role="feed"] > div'
  ].join(',');

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'sponsored',
      group: 'Ads',
      on: true,
      label: 'Sponsored posts in the feed',
      desc: 'Facebook marks every feed ad with a hidden character and an "Ad" label. Both are checked, so ads go before they are drawn.',
      /* Not data-ad-preview or data-ad-rendering-role: despite the names,
       * Facebook renders ordinary posts through the same story template, so
       * keying off them hides the whole feed. */
      css: [
        'div[aria-posinset]:has(a[href*="/ads/about"])',
        'div[data-pagelet^="FeedUnit"]:has(a[href*="/ads/about"])',
        'div[role="feed"] > div:has(a[href*="/ads/about"])'
      ],
      js: { kind: 'sponsored' }
    },
    {
      id: 'rightAds',
      group: 'Ads',
      on: true,
      label: 'Sidebar ads',
      desc: 'The "Sponsored" block down the right column.',
      js: { kind: 'sidebarAds' }
    },
    {
      id: 'adSweep',
      group: 'Ads',
      on: true,
      label: 'Ads in Marketplace, search & Watch',
      desc: 'Marketplace, search results, groups — any card labelled Ad or Sponsored outside the feed. Hides that one card, not the grid around it.',
      js: { kind: 'sweep' }
    },
    {
      id: 'paidPartnership',
      group: 'Ads',
      label: 'Paid partnership posts',
      desc: 'Branded content from pages you actually follow. Off by default — it is advertising, but you asked for the page.',
      js: {
        kind: 'feedText',
        phrases: {
          en: ['Paid partnership', 'Paid promotion', 'Sponsored content'],
          vi: ['Quan hệ đối tác có trả tiền', 'Nội dung được tài trợ'],
          es: ['Colaboración pagada', 'Promoción pagada', 'Contenido patrocinado'],
          pt: ['Parceria paga', 'Promoção paga', 'Conteúdo patrocinado'],
          fr: ['Partenariat rémunéré', 'Promotion payée', 'Contenu sponsorisé'],
          de: ['Bezahlte Partnerschaft', 'Bezahlte Werbung', 'Gesponserte Inhalte'],
          it: ['Partnership retribuita', 'Promozione a pagamento', 'Contenuto sponsorizzato'],
          id: ['Kemitraan berbayar', 'Promosi berbayar', 'Konten bersponsor']
        }
      }
    },
    /* ---------------------------------------------------------- feed ---- */
    {
      id: 'feed',
      group: 'Feed',
      label: 'The entire News Feed',
      desc: 'Nuclear option. Leaves the rest of Facebook usable for messages, groups and events.',
      /* The posts go at once; the engine then hides the box around them, so
       * the loading skeleton below stops pulling in more. */
      css: ['div[aria-posinset]', 'div[role="feed"]', 'div[data-pagelet^="FeedUnit"]']
    },
    {
      id: 'stories',
      group: 'Feed',
      label: 'Stories tray',
      desc: 'The horizontal story carousel above the feed.',
      css: [
        'div[data-focus-target="stories_tray"]',
        'div[aria-label="Stories"]',
        'div[aria-label="stories tray"]',
        'div[data-pagelet="Stories"]'
      ]
    },
    {
      id: 'videoPosts',
      group: 'Feed',
      label: 'All video posts',
      desc: 'Every post with a video in it — the whole post, not just the player. Shared videos and reels included.',
      /* :has() keeps up as Facebook swaps a thumbnail for the player. Not in
       * a dialog: a video post you opened yourself stays. */
      css: [
        'div[aria-posinset]:not([role="dialog"] *):has([data-video-id])',
        'div[aria-posinset]:not([role="dialog"] *):has(video)',
        'div[aria-posinset]:not([role="dialog"] *):has(a[href*="/videos/"])',
        'div[aria-posinset]:not([role="dialog"] *):has(a[href*="/watch/"])',
        'div[aria-posinset]:not([role="dialog"] *):has(a[href*="/reel/"])'
      ]
    },
    {
      id: 'reels',
      group: 'Feed',
      on: true,
      label: 'Reels & short videos',
      desc: 'Reels rows injected between posts, the Reels rail, links to reels anywhere — and opening a reel sends you back to the feed.',
      css: [
        'div[data-pagelet="VideoChainingFeedUnit"]',
        'div[data-pagelet^="VideoChaining"]',
        'div[aria-label="Reels"]',
        'a[aria-label="Reels"]',
        'div[aria-label="Thước phim"]',
        'a[aria-label="Thước phim"]',
        /* The URL is the same in every language. */
        'a[href^="/reel/"]',
        'a[href^="/reels/"]',
        'a[href*="facebook.com/reel/"]',
        'a[href*="facebook.com/reels/"]',
        /* The Reels shelf in the feed, and posts sharing a reel. */
        'div[aria-posinset]:has(a[href*="/reel/"])'
      ],
      js: {
        kind: 'reels',
        phrases: {
          en: ['Reels and short videos', 'Reels for you'],
          vi: ['Reels và video ngắn', 'Thước phim và video ngắn', 'Reels dành cho bạn'],
          es: ['Reels y videos cortos', 'Reels para ti'],
          pt: ['Reels e vídeos curtos', 'Reels para você'],
          fr: ['Reels et vidéos courtes', 'Reels pour vous'],
          de: ['Reels und Kurzvideos', 'Reels für dich'],
          it: ['Reel e video brevi', 'Reel per te'],
          id: ['Reels dan video pendek', 'Reels untuk Anda']
        }
      }
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
      on: true,
      label: 'Suggested / recommended posts',
      desc: 'Posts from pages, people and groups you do not follow — the ones with a Follow or Join button next to the name.',
      js: {
        kind: 'suggested',
        phrases: {
          en: ['Suggested for you', 'Recommended for you', 'Suggested post', 'Based on your activity'],
          vi: ['Gợi ý cho bạn', 'Được đề xuất cho bạn', 'Bài viết được đề xuất', 'Dựa trên hoạt động của bạn'],
          es: ['Sugerencias para ti', 'Recomendado para ti', 'Publicación sugerida', 'Según tu actividad'],
          pt: ['Sugestões para você', 'Recomendado para você', 'Publicação sugerida', 'Com base na sua atividade'],
          fr: ['Suggestions pour vous', 'Recommandé pour vous', 'Publication suggérée', 'En fonction de votre activité'],
          de: ['Vorschläge für dich', 'Empfohlen für dich', 'Vorgeschlagener Beitrag', 'Basierend auf deinen Aktivitäten'],
          it: ['Suggeriti per te', 'Consigliati per te', 'Post suggerito', 'In base alla tua attività'],
          id: ['Disarankan untuk Anda', 'Direkomendasikan untuk Anda', 'Postingan yang disarankan', 'Berdasarkan aktivitas Anda']
        }
      }
    },
    {
      id: 'pymk',
      group: 'Feed',
      on: true,
      label: 'People / pages / groups you may know',
      desc: 'Friend and group suggestion blocks wherever they appear in the feed.',
      js: {
        kind: 'recommendations',
        phrases: {
          en: ['People you may know', 'Your group suggestions', 'Suggested groups', 'Groups you may like', 'Pages you may like', 'Suggested for you in'],
          vi: ['Những người bạn có thể biết', 'Nhóm gợi ý', 'Nhóm bạn có thể thích', 'Trang bạn có thể thích'],
          es: ['Personas que quizá conozcas', 'Grupos sugeridos', 'Grupos que te podrían gustar', 'Páginas que te podrían gustar'],
          pt: ['Pessoas que você talvez conheça', 'Grupos sugeridos', 'Grupos que você talvez curta', 'Páginas que você talvez curta'],
          fr: ['Vous connaissez peut-être', 'Groupes suggérés', 'Groupes qui pourraient vous plaire', 'Pages qui pourraient vous plaire'],
          de: ['Personen, die du kennen könntest', 'Vorgeschlagene Gruppen', 'Gruppen, die dir gefallen könnten', 'Seiten, die dir gefallen könnten'],
          it: ['Persone che potresti conoscere', 'Gruppi suggeriti', 'Gruppi che potrebbero piacerti', 'Pagine che potrebbero piacerti'],
          id: ['Orang yang Mungkin Anda Kenal', 'Grup yang disarankan', 'Grup yang mungkin Anda sukai', 'Halaman yang mungkin Anda sukai']
        }
      }
    },
    {
      id: 'reactionsOnPosts',
      group: 'Feed',
      label: 'Friend activity ("X commented on this")',
      desc: 'Posts that only reached you because a friend reacted, commented or was tagged.',
      js: {
        kind: 'feedText',
        /* Not "shared a": that is how a friend's own post is introduced. */
        phrases: {
          en: ['commented on this', 'replied to a comment', 'likes this', 'follows this', 'was tagged'],
          vi: ['đã bình luận về nội dung này', 'đã trả lời một bình luận', 'thích nội dung này', 'theo dõi nội dung này', 'được gắn thẻ'],
          es: ['comentó esto', 'respondió a un comentario', 'le gusta esto', 'sigue esto'],
          pt: ['comentou isto', 'respondeu a um comentário', 'curtiu isto', 'segue isto'],
          fr: ['a commenté ceci', 'a répondu à un commentaire', 'aime ceci', 'suit ceci'],
          de: ['hat das kommentiert', 'hat auf einen Kommentar geantwortet', 'gefällt das', 'folgt dem'],
          it: ['ha commentato questo', 'ha risposto a un commento', 'piace questo', 'segue questo'],
          id: ['mengomentari ini', 'membalas komentar', 'menyukai ini', 'mengikuti ini']
        }
      }
    },

    /* --------------------------------------------------------- posts ---- */
    {
      id: 'postActions',
      group: 'Inside posts',
      label: 'Like / Comment / Share bar',
      desc: 'Removes the action row at the bottom of every post.',
      /* "The smallest box holding both buttons" needs :has() inside :has(),
       * which Chrome rejects, so the engine finds the row instead. */
      js: { kind: 'actionBar' }
    },
    {
      id: 'counts',
      group: 'Inside posts',
      label: 'Reaction, comment & share counts',
      desc: 'Hides the numbers without hiding the buttons.',
      css: [
        /* The reaction icons, and the numbers inside the Like, Comment and
         * Share buttons (each button carries a *_button marker). */
        '[aria-posinset] span[role="toolbar"]',
        '[aria-posinset] [role="button"]:has([data-ad-rendering-role$="_button"]) span[dir="auto"]',
        '[aria-label="See who reacted to this"]'
      ]
    },
    {
      id: 'comments',
      group: 'Inside posts',
      label: 'Comment threads',
      desc: 'Existing comments and the reply box under each post.',
      css: [
        /* Comments are role="article" with a "Comment by ..." label; loading
         * skeletons share the role but have no label. */
        'div[role="article"][aria-label]:not([aria-posinset])',
        '[aria-posinset] form[role="presentation"]:has([role="textbox"])',
        '[role="dialog"] form[role="presentation"]:has([role="textbox"])',
        '[aria-label^="Write a comment"]'
      ]
    },
    SITES.common.noAutoplay('Inside posts', 'Feed videos stay paused while you scroll past. Click one and it plays as normal.'),
    {
      id: 'media',
      group: 'Inside posts',
      label: 'Images & video in posts',
      desc: 'Keeps the text, drops the pictures. Surprisingly readable.',
      css: [
        /* Albums sit in an aspect-ratio box (inline padding-top) that keeps
         * its full height when only the photos inside it are hidden. */
        '[aria-posinset] div[style*="padding-top"]:has(a[href*="/photo"] img)',
        '[aria-posinset] div[style*="padding-top"]:has(video)',
        '[aria-posinset] div:has(> div[data-video-id])',
        '[aria-posinset] div[data-video-id]',
        '[aria-posinset] a[href*="/photo"]:has(img)',
        '[aria-posinset] a[role="link"]:has(img[data-imgperflogname="feedImage"])',
        '[aria-posinset] [data-ad-rendering-role="image"]',
        '[aria-posinset] [aria-label="Video player"]',
        '[aria-posinset] div:has(> video)'
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
      id: 'metaAi',
      group: 'Sidebars',
      label: 'Meta AI',
      desc: 'The Meta AI entry in the left menu, the contacts list and the chat heads.',
      css: [
        '[role="navigation"] li:has(a[href*="meta.ai"])',
        '[role="complementary"] li:has([aria-label="Meta AI profile photo"])',
        '[role="button"][aria-label="Open chat with Meta AI"]',
        'a[href*="meta.ai"]'
      ]
    },
    {
      id: 'contacts',
      group: 'Sidebars',
      label: 'Contacts & group chats',
      desc: 'Keeps the right sidebar, hides who is online.',
      css: [
        'div[role="complementary"] div[data-visualcompletion="ignore-dynamic"]:has(ul)',
        'div[aria-label="Contacts"]'
      ]
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'search',
      group: 'Top bar',
      label: 'Search box',
      /* The rounded box is the label wrapped around the input; hiding only
       * the input leaves the empty box. */
      css: [
        'div[role="banner"] label:has(input[type="search"])',
        'div[role="banner"] [role="search"]',
        'input[aria-label^="Search Facebook"]'
      ]
    },
    {
      id: 'navTabs',
      group: 'Top bar',
      label: 'Top bar tabs (all)',
      desc: 'Home, Reels, Friends, Marketplace, Gaming.',
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
      desc: 'Most accounts no longer have this tab; harmless to leave on.',
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
      /* The label carries the unread count: "Notifications, 3 unread". */
      css: [
        'div[role="banner"] [role="button"][aria-label^="Notifications"]',
        'div[role="banner"] a[href^="/notifications"]'
      ]
    },
    {
      id: 'messengerIcon',
      group: 'Top bar',
      label: 'Messenger icon',
      /* Like the bell, the label carries the count: "Messenger, 1 unread". */
      css: [
        'div[role="banner"] [role="button"][aria-label^="Messenger"]',
        'div[role="banner"] a[href^="/messages"]'
      ]
    },
    {
      id: 'badges',
      group: 'Top bar',
      on: true,
      label: 'Red unread badges',
      desc: 'Keeps the icons, kills the little red numbers that pull you in.',
      js: { kind: 'badges' }
    },

    /* ----------------------------------------------------------- chat ---- */
    {
      id: 'chatTabs',
      group: 'Chat',
      label: 'Chat bubbles / popup windows',
      desc: 'The round chat heads down the right edge, and open chat windows.',
      css: [
        /* The round chat heads down the right edge. */
        '[role="button"][aria-label^="Open chat with"]',
        'div[data-pagelet="ChatTabsWrapper"]',
        'div[aria-label="Chat tab"]',
        'div[role="dialog"][aria-label*="Messenger"]'
      ]
    },
    {
      id: 'activeNow',
      group: 'Chat',
      label: 'Green "active now" dots',
      desc: 'On avatars in posts, in the contacts list and on chat heads.',
      /* The dot, by shape: the "Online status indicator" text in an ignored
       * span, followed by the coloured ring. Same in the contacts list, on
       * post avatars and on chat heads. */
      css: [
        'div:has(> span[data-visualcompletion="ignore"] + div[role="none"][data-visualcompletion="ignore"])',
        '[aria-label="Active now"]'
      ]
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    SITES.common.blur('div[aria-posinset]'),
    {
      id: 'narrowFeed',
      group: 'Effects',
      label: 'Center the feed',
      desc: 'Once the sidebars are gone, pull the column back into the middle.',
      style: 'div[role="main"] { margin-inline: auto !important; }'
    }
  ];

  /* ------------------------------------------------------------- ads ---- */

  /* No markup signal here on purpose. data-ad-preview, data-ad-rendering-role
   * and friends sound ad-only but are rendered on ordinary posts too — the
   * story template is shared — so any of them would hide the whole feed.
   * (They are fine as structure, e.g. to find the Like button.) */

  /* The label links to the ad-preferences explainer; ordinary posts do not. */
  var AD_LINKS = [
    'a[href*="/ads/about"]',
    'a[href*="ad_preferences"]',
    'a[aria-label="Sponsored"]',
    '[aria-label^="Sponsored"]'
  ].join(',');

  /* Where a label could be hiding. */
  var LABEL_NODES = 'span[dir="auto"], h3, h4, a[role="link"]';

  /* Facebook's current label is not text in the post at all. Where an
   * ordinary post's header links to "2 hours ago", an ad's header link holds
   * an empty span whose aria-labelledby points at a detached element reading
   * "Ad". Matched whole, so a timestamp or a page name can never pass. */
  var LABEL_REFS = 'a[role="link"] [aria-labelledby]';

  var INVISIBLE_CHARS = /[​-‍⁠﻿]/g;

  /* Facebook attaches that label only once the ad scrolls into view, but the
   * header link gives the ad away before then: its whole text is an
   * invisible word joiner (U+2060), and Facebook draws the word "Ad" over it
   * from elsewhere. On the live feed it was on every ad and on nothing else,
   * so ads go before they are ever drawn. A link that merely starts with one
   * (pasted text, check-ins) does not count. */
  function isAdSlot(link) {
    var text = link.textContent;
    return text.charAt(0) === '⁠' && !text.replace(INVISIBLE_CHARS, '').trim();
  }

  /* The header links come first, so only the first few are looked at. */
  function hasAdJoiner(root) {
    var links = root.querySelectorAll('a');
    for (var i = 0; i < links.length && i < 10; i++) {
      if (isAdSlot(links[i])) return true;
    }
    return false;
  }

  /* 'ad', 'unknown' while labels are still being filled in, or null. */
  function adLabelIn(root, api) {
    var refs = root.querySelectorAll(LABEL_REFS);
    var pending = false;
    for (var i = 0; i < refs.length && i < 8; i++) {
      var text = api.referencedText(refs[i]);
      if (text === null) pending = true;
      else if (api.AD_LABEL.test(text)) return 'ad';
    }
    return pending ? 'unknown' : null;
  }

  var HEURISTICS = {
    /* Ads in the feed. Independent signals, because any one of them can
     * disappear in a Facebook deploy: the explainer link, the word-joiner
     * slot, the referenced "Ad" label, and a "Sponsored" label written out in
     * the post (issue ads still do that, with "Paid for by ..." under it). */
    sponsored: function (unit, rule, ctx, api) {
      if (unit.querySelector(AD_LINKS) || hasAdJoiner(unit)) return true;
      var label = adLabelIn(unit, api);
      if (label === 'ad') return true;
      var labels = unit.querySelectorAll(LABEL_NODES);
      for (var i = 0; i < labels.length && i < 12; i++) {
        if (api.looksSponsored(labels[i])) return true;
      }
      if (label === 'unknown') ctx.unsure();
      return false;
    },

    /* Facebook dropped the "Suggested for you" line. A post from a page or
     * person you do not follow now has a Follow button inside its title (Join,
     * for a group) — no text needed, so any language. Only the first title
     * counts: a friend sharing a page's post carries the page's title, with
     * its own Follow button, further down. */
    suggested: function (unit, rule, ctx, api) {
      var title = unit.querySelector('h4');
      if (title && title.querySelector('[role="button"]')) return true;
      return api.feedText(unit, rule, ctx);
    },

    /* "People you may know", "Your group suggestions" and the like are
     * carousels, not posts: no author title, and the same button (Add
     * friend, Join group) on every card. Counting repeated button text needs
     * no language. The Reels shelf has the same shape, so it is left to the
     * Reels rule. */
    recommendations: function (unit, rule, ctx, api) {
      if (!unit.querySelector('h4') && !unit.querySelector('a[href*="/reel/"]')) {
        var seen = {};
        var buttons = unit.querySelectorAll('[role="button"]');
        for (var i = 0; i < buttons.length; i++) {
          /* Every comment has its own Like and Reply. */
          if (buttons[i].closest('[role="article"]')) continue;
          var text = buttons[i].textContent.trim();
          /* Words only: equal counts ("1" comment, "1" share) are not cards. */
          if (text.length > 30 || !/\p{L}/u.test(text)) continue;
          if (seen[text]) return true;
          seen[text] = true;
        }
      }
      return api.feedText(unit, rule, ctx);
    },

    /* A Reels shelf is a feed unit full of /reel/ links. A post sharing one
     * reel goes too: the switch promises every reel. */
    reels: function (unit, rule, ctx, api) {
      if (unit.querySelector('a[href*="/reel/"], [aria-label^="Reel by"]')) return true;
      return api.feedText(unit, rule, ctx);
    }
  };

  /* ----------------------------------------- outside the feed units ---- */

  /* The whole feed: the first box above the posts that holds more than a
   * couple of things — every post, plus the loading skeleton under them.
   * Hiding only the posts would leave that skeleton in view, and while it is
   * in view Facebook keeps fetching more posts. The main column's posts, not
   * a post open in a dialog; whether the first post is itself already hidden
   * by another rule does not matter. */
  function hideFeed(api) {
    var post = document.querySelector('[role="main"] [aria-posinset]') || document.querySelector('[aria-posinset]');
    if (!post) return;
    var node = post;
    while (node.parentElement && node.parentElement.childElementCount < 3) node = node.parentElement;
    var feed = node.parentElement;
    if (!feed || feed === document.body || feed.matches('[role="main"], [role="main"] > *')) return;
    api.hide(feed, 'feed');
  }

  /* Everything that is not the feed: stories, reels, marketplace, search,
   * watch, group listings. */
  function sweepAds(api) {
    var generation = api.generation();
    var scope = document.querySelector('div[role="main"]') || document.body;
    var nodes = scope.querySelectorAll(LABEL_NODES + ',' + LABEL_REFS + ', a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      /* A verdict is kept per label, but an ad label is looked at again
       * every scan: Facebook can rebuild the card around the same label. */
      if (el.__bfxAdGen === generation && !el.__bfxIsAd) continue;
      if (el.__bfxAdGen !== generation) {
        var isAd;
        if (el.tagName === 'A' && isAdSlot(el)) {
          isAd = true;
        } else if (el.hasAttribute('aria-labelledby')) {
          /* A referenced label has no text of its own; judge it once the
           * text it points at exists. */
          var text = api.referencedText(el);
          if (!text) continue;
          isAd = api.AD_LABEL.test(text);
        } else {
          if (!(el.textContent || '').trim()) continue;
          isAd = el.tagName !== 'A' || el.matches(LABEL_NODES) ? api.looksSponsored(el) : false;
        }
        el.__bfxAdGen = generation;
        el.__bfxIsAd = isAd;
      }
      if (!el.__bfxIsAd) continue;
      /* The per-unit rule owns the feed and picks better containers there. */
      if (api.state().presets.sponsored && el.closest('div[role="feed"], div[data-pagelet^="FeedUnit"], [aria-posinset]')) continue;
      if (el.closest(api.HIDDEN)) continue;
      var card = api.cardFor(el);
      if (card) api.hide(card, 'adSweep');
    }
  }

  function stripBadges(api) {
    var banner = document.querySelector('div[role="banner"]');
    if (banner) {
      banner.querySelectorAll('span, div').forEach(function (el) {
        if (el.children.length) return;
        var t = (el.textContent || '').trim();
        if (!/^\d{1,3}\+?$/.test(t)) return;
        var box = el.getBoundingClientRect();
        if (box.width > 40 || box.height > 40) return;   // a real number, not a badge
        /* The red circle belongs to a screen-reader-hidden copy of the
         * button; hiding only the digits leaves an empty red dot behind. */
        var badge = el.closest('[aria-hidden="true"][role="button"]');
        var b = badge && badge.getBoundingClientRect();
        api.hide(b && b.width <= 40 && b.height <= 40 ? badge : el, 'badges');
      });
    }
    // "(3) Facebook" in the tab title pulls just as hard as the red dot.
    api.stripTitleCount();
  }

  /* The Like / Comment / Share row is the smallest box around a post's Like
   * button that also holds a Comment button. A box with a second Like in it
   * has climbed past the row into the comments, which have Likes of their
   * own, so the walk stops there. Undecided rows (Comment not rendered yet)
   * are left unstamped and looked at again.
   *
   * Facebook marks the buttons themselves, in every language; the English
   * labels are the fallback. The marker sits inside the labelled button, so a
   * labelled button only counts when it has no marker — otherwise every Like
   * would be counted twice. */
  var LIKE = '[data-ad-rendering-role="like_button"], ' +
    '[aria-label="Like"]:not(:has([data-ad-rendering-role="like_button"]))';
  var COMMENT = '[data-ad-rendering-role="comment_button"], [aria-label="Leave a comment"], [aria-label="Comment"]';

  function hideActionBars(api) {
    var generation = api.generation();
    document.querySelectorAll(LIKE).forEach(function (like) {
      if (like.__bfxBarGen === generation || like.closest(api.HIDDEN)) return;
      var node = like.parentElement;
      for (var depth = 0; node && depth < 10; depth++, node = node.parentElement) {
        /* Past the row, or about to take the whole post with it. */
        if (node === document.body || node.matches(UNITS) ||
            node.querySelectorAll(LIKE).length > 1) {
          like.__bfxBarGen = generation;
          return;
        }
        if (node.querySelector(COMMENT)) {
          like.__bfxBarGen = generation;
          api.hide(node, 'postActions');
          return;
        }
      }
    });
  }

  function hideSidebarAds(api) {
    document.querySelectorAll('div[role="complementary"] h3, div[role="complementary"] span[dir="auto"]')
      .forEach(function (el) {
        if (!api.firstLook(el, '__bfxSideGen')) return;
        if (!api.looksSponsored(el)) return;
        var section = api.climbTo(el, el.closest('div[role="complementary"]'), 10);
        api.hide(section, 'rightAds');
      });
  }

  /* --------------------------------------------------------- picker ---- */

  /* A feed post is rebuilt and renumbered as you scroll, so no selector for
   * it survives. Picking one means "posts from this author": the first link
   * in its title (a page, a person or a group), matched up to its query
   * string, which carries per-view tracking. */
  function authorOf(post, cssString) {
    var link = post.querySelector('h4 a[href]');
    if (!link) return null;
    var href = link.getAttribute('href');
    var m = /^([^?#]*)(\?id=\d+)?/.exec(href);
    var base = m[1] + (m[2] || '');
    if (!base || base === '/' || /facebook\.com\/?$/.test(base)) return null;
    var next = base.indexOf('?') === -1 ? '?' : '&';
    var selector = ['=', '^='].map(function (op) {
      return 'div[aria-posinset]:has(h4 a[href' + op + cssString(op === '=' ? base : base + next) + '])';
    }).join(', ');
    return { selector: selector, name: link.textContent.trim() };
  }

  /* With the Reels rule on, a reel opened from a link, a notification or the
   * address bar sends you back to the feed instead of playing. */
  var REEL_PATH = /^\/reels?(\/|$)/;

  SITES.register({
    id: 'facebook',
    units: UNITS,
    presets: PRESETS,
    /* Rules that leave no placeholder behind: an ad is never something you
     * want to click back open. */
    silent: { sponsored: true },
    /* The post's own words, as opposed to the frame Facebook puts around them.
     * Facebook marks the message body this way on every post, ads or not. */
    body: '[data-ad-preview="message"], [data-ad-comet-preview="message"], blockquote',
    /* Text nobody sees: the "Online status indicator" and "Active" of an
     * avatar dot. (Hidden decoys and icon titles are covered for every site.) */
    unseen: '[data-visualcompletion="ignore"]',
    /* What a climb from an ad label must not swallow more than one of. */
    cardStop: 'div[role="article"], [aria-posinset]',
    /* A comment or a quoted share: the post around it is judged with
     * everything it contains, so judging it again only adds misfires. */
    skip: function (unit) {
      return !!(unit.parentElement && unit.parentElement.closest('[role="article"]'));
    },
    heuristics: HEURISTICS,
    globals: {
      badges: stripBadges,
      rightAds: hideSidebarAds,
      adSweep: sweepAds,
      postActions: hideActionBars,
      feed: hideFeed
    },
    redirect: function (s, loc) {
      if (!s.presets.reels) return null;
      if (!/(^|\.)facebook\.com$/.test(loc.hostname)) return null;
      return REEL_PATH.test(loc.pathname) ? '/' : null;
    },
    picker: { authorOf: authorOf }
  });
})(typeof self !== 'undefined' ? self : this);
