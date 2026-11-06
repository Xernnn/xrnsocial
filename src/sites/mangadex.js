/* MangaDex.
 *
 * MangaDex is one responsive Vue app, the same on computers and phones, styled
 * with Tailwind utilities. Measured on the live site in November 2026, signed
 * out, and in its own bundle:
 *   - ads are not an ad network's. One component shows a partner from a list
 *     in the bundle, and every partner's picture or video is served from
 *     /temp/<partner>/. Its element ids change with the partner ("placeholder"
 *     for the "Your ad here" banners), so the address is the hook
 *   - it is placed on the home page, search, the feed, advanced search and
 *     Latest Updates, as the first thing in the page. Title pages and the
 *     reader have none
 *   - home sections are direct children of .page-container, told apart in any
 *     language by the link to their full list (/titles/recommended ...)
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var CARD = '.manga-card, .chapter-feed__container, .hchaptercard';

  /* A home section, by the link to its full list. Inside .page-container
   * because the side menu links to some of the same lists. */
  function section(path) {
    return '.page-container > div:has(a[href="' + path + '"])';
  }

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'banners',
      group: 'Ads',
      on: true,
      label: 'Banner ads',
      desc: 'The partner banners at the top of the home page, search, the feed and Latest Updates.',
      css: [
        /* The box around the ad too, or its margin stays behind. */
        'div:has(> div > a > img[src^="/temp/"])',
        'div:has(> div > a > video > source[src^="/temp/"])',
        'a:has(> img[src^="/temp/"])',
        'a:has(> video > source[src^="/temp/"])'
      ]
    },
    {
      id: 'advertiseLink',
      group: 'Ads',
      on: true,
      label: 'Advertise link',
      desc: 'The link for advertisers in the side menu.',
      css: ['#section-link-_advertise']
    },

    /* ---------------------------------------------------------- home ---- */
    {
      id: 'popular',
      group: 'Home',
      label: 'Popular titles',
      desc: 'The big carousel at the top of the home page.',
      css: ['.md-content > .relative:has(> div > .swiper .banner-bg)']
    },
    {
      id: 'recommended',
      group: 'Home',
      label: 'Recommended',
      css: [section('/titles/recommended')]
    },
    {
      id: 'selfPublished',
      group: 'Home',
      label: 'Self-Published',
      css: [section('/titles/selfpublished')]
    },
    {
      id: 'seasonal',
      group: 'Home',
      label: 'Seasonal',
      css: [section('/titles/seasonal')]
    },
    {
      id: 'recentlyAdded',
      group: 'Home',
      label: 'Recently Added',
      css: [section('/titles/recent')]
    },

    /* --------------------------------------------------------- lists ---- */
    {
      id: 'commentCounts',
      group: 'Lists',
      label: 'Comment counts',
      desc: 'The comment number beside each chapter.',
      css: ['button.comment-container']
    },

    SITES.common.blackWhite()
  ];

  /* --------------------------------------------------------- picker ---- */

  /* Picking a card means "this title", wherever it is listed. */
  function authorOf(card, cssString) {
    var link = card.querySelector('a[href^="/title/"]');
    var m = link && /^\/title\/[0-9a-f-]+/.exec(link.getAttribute('href'));
    if (!m) return null;
    var key = 'a[href^=' + cssString(m[0]) + ']';
    var title = card.querySelector('a.title, .chapter-feed__title, h6');
    return {
      selector: CARD.split(', ').map(function (c) { return c + ':has(' + key + ')'; }).join(', '),
      name: (title && title.textContent.trim()) || 'this title'
    };
  }

  SITES.register({
    id: 'mangadex',
    units: CARD,
    presets: PRESETS,
    silent: { banners: true },
    picker: {
      authorOf: authorOf,
      /* Its own names, never the Tailwind utilities around them. */
      classes: /^(manga|chapter|comment|nav-bar|page)-[a-z-]+(__[a-z-]+)?$/
    }
  });
})(typeof self !== 'undefined' ? self : this);
