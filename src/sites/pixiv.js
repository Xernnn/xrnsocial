/* pixiv.
 *
 * pixiv is two sites at one address: computers get a React app (#__next,
 * generated sc- classes) and phones a Vue app (#wrapper, #spa-contents, with
 * readable classes). Every switch here has to cover both. Measured on the
 * live site in November 2026, signed out, in both layouts:
 *   - computer: every ad is an iframe[data-uid] with no src, which pixiv fills
 *     itself. Its bundles use data-uid for those frames and nothing else. The
 *     slots are a 468x60 strip at the top, 300x250/600 and a "PR" box in the
 *     side column, and 728x90 at the foot of the page
 *   - phone: the slots are named by class, t_header, t_comment_section,
 *     t_comment_tag, t_relatedworks, t_native_grid (an ad posing as a work in
 *     a grid), t_footer and t_novel_*, plus the sticky bottom ads
 *     (t_overray_combined, t_novel_overray). Each is .ad-frame-container, or
 *     .ad-frame-headerbidding around a Google ad slot
 *   - .ad-overlay-hide-area is NOT an ad. It is pixiv's own box around the
 *     recommendations, named for keeping the sticky ad out of them
 *   - Premium offers link to /premium/lead/lp/ in both layouts
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var FRAME = 'iframe[data-uid]';

  /* The boxes around a frame hold nothing else, except where they hold the
   * page: on a user's page the third box up is everything below the header.
   * Links and pictures tell the two apart, so a frame's wrappers never take
   * real content with them. */
  var ONLY_THE_AD = ':not(:has(a, img))';

  /* A work in a grid: an <li> on computers, .works-item on phones. */
  var WORK = 'li:has(a[data-ga4-label="thumbnail_link"]), .works-item';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'ads',
      group: 'Ads',
      on: true,
      label: 'Ads',
      desc: 'Every ad box, on computers and phones, including the sticky ad at the bottom of the screen on phones.',
      css: [
        FRAME,
        'div:has(> div > ' + FRAME + ')' + ONLY_THE_AD,
        'div:has(> div > div > ' + FRAME + ')' + ONLY_THE_AD,
        'section:has(> div > ' + FRAME + ')' + ONLY_THE_AD,
        /* The side column's box also holds the "Remove ads" link. */
        'div:has(> div > ' + FRAME + '):has(> div > a[href*="i=work_detail_remove_ads"])',
        '.ad-frame-container',
        '.ad-frame-headerbidding',
        'div:has(> .ad-frame-headerbidding)',
        /* The grid cell, or the ad leaves a hole among the works. */
        '.list-item.ads'
      ]
    },
    {
      id: 'premium',
      group: 'Ads',
      on: true,
      label: 'Premium offers',
      desc: 'pixiv Premium banners and links, including "Remove ads".',
      css: [
        'a[href^="/premium/lead/lp/"]',
        /* The tag page's offer sits over a box of its own. On a user's page
         * the same kind of link sits inside the name row, so this names the
         * offer and not any box holding a Premium link. */
        'div:has(> a[href*="i=popular_works_list"])',
        '.banner-ad-footer-scale',
        '.premium-lead-t-footer'
      ]
    },

    /* --------------------------------------------------------- works ---- */
    {
      id: 'related',
      group: 'Works',
      label: 'Related works',
      desc: 'The endless grid of suggestions below a work.',
      css: [
        'section:has(> .gtm-illust-recommend-zone)',
        '.ad-overlay-hide-area'
      ]
    },

    SITES.common.blackWhite()
  ];

  /* --------------------------------------------------------- picker ---- */

  /* Picking a work means "works by this artist". Phone grids hold no link
   * to the artist, so there a pick stays an ordinary one. */
  function authorOf(work, cssString) {
    var link = work.querySelector('a[href*="/users/"]');
    var m = link && /\/users\/(\d+)/.exec(link.getAttribute('href'));
    if (!m) return null;
    var key = 'a[href$=' + cssString('/users/' + m[1]) + ']';
    return {
      selector: 'li:has(a[data-ga4-label="thumbnail_link"]):has(' + key + '), .works-item:has(' + key + ')',
      name: (link.textContent || '').trim() || 'user ' + m[1]
    };
  }

  SITES.register({
    id: 'pixiv',
    units: WORK,
    presets: PRESETS,
    silent: { ads: true, premium: true },
    picker: {
      authorOf: authorOf,
      attrs: ['data-ga4-label'],
      /* Only the phone app's readable classes: the computer app's are
       * generated, and both carry Tailwind utilities. */
      classes: /^(works|illust|novel|user|segment|ranking|tag|comment)-[a-z-]+$/
    }
  });
})(typeof self !== 'undefined' ? self : this);
