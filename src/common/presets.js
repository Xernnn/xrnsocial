/* Preset rules.
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
 * A rule has:
 *   css   : selectors hidden with display:none !important
 *   style : raw CSS, for rules that restyle instead of hide
 *   js    : heuristic handled by the engine (things CSS cannot express)
 *
 * feedText phrases are keyed by language and all of them are tried at once,
 * against a post's header only (see headText in engine.js), so a phrase in
 * one language cannot hide a post written in another. English comes from
 * Facebook itself; the other languages are best-effort translations of its UI
 * strings — when one turns out wrong, fix it here.
 */
(function (root) {
  'use strict';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'sponsored',
      group: 'Ads',
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
      label: 'Sidebar ads',
      desc: 'The "Sponsored" block down the right column.',
      js: { kind: 'sidebarAds' }
    },
    {
      id: 'adSweep',
      group: 'Ads',
      label: 'Ads everywhere else',
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
    {
      id: 'noAutoplay',
      group: 'Inside posts',
      label: 'Stop videos playing by themselves',
      desc: 'Feed videos stay paused while you scroll past. Click one and it plays as normal.',
      /* No selector: the engine pauses any video that starts without a click
       * or key press just before it. */
      behavior: true
    },
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
      label: 'All centre tabs',
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
    {
      id: 'grayscale',
      group: 'Effects',
      label: 'Black & white',
      desc: 'The whole page in greyscale — pictures, videos, avatars, everything — and it stays grey when you hover.',
      /* On the root element a filter greys the whole canvas without making
       * it a containing block, so Facebook's fixed bars stay where they are.
       * It composes with the blur below. */
      style: 'html { filter: grayscale(1) !important; }'
    },
    {
      id: 'blurFeed',
      group: 'Effects',
      label: 'Blur posts until hovered',
      desc: 'Stops passive scrolling dead. You have to choose to read something.',
      style:
        /* Not the "show" bars BlockFB leaves behind: they are meant to be read. */
        'div[aria-posinset]:not([data-bfx-note]) { filter: blur(5px); transition: filter .15s ease; }' +
        'div[aria-posinset]:hover { filter: none; }'
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
