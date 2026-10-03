/* Twitch.
 *
 * Twitch mixes generated styled-components classes (Layout-sc-1xcs6mc-0,
 * cZjbEG) with stable hooks of its own: data-a-target, data-test-selector,
 * and BEM-style classes (chat-line__message, channel-root__right-column).
 * Checked against the live, signed-in site in October 2026:
 *   - the front page's ad is the "headliner" in the featured carousel
 *     (data-a-target="frontpage-headliner", aria-label "Advertisement")
 *   - during a stream's ad break, a display ad can sit beside the player
 *     (data-test-selector="sda-wrapper"). The video ads themselves are part
 *     of the stream: nothing on the page can hide or skip them
 *   - the side nav's sections are role="group"s told apart by their cards:
 *     followed-channel, recommended-channel, similarity-channel
 *   - stream cards in the directory and on the front page are <article>s
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var CARD = 'article';
  var SIDE_CARDS = '[data-test-selector="followed-channel"], [data-test-selector="recommended-channel"], [data-test-selector="similarity-channel"]';
  var SIDE_NAV = '[data-test-selector="side-nav"]';

  var PRESETS = [
    /* ----------------------------------------------------------- ads ---- */
    {
      id: 'displayAds',
      group: 'Ads',
      on: true,
      label: 'Display ads',
      desc: 'The ad in the front page\'s featured carousel, and the display ad beside the player during an ad break. Video ads are part of the stream and can\'t be hidden.',
      css: ['[data-a-target="frontpage-headliner"]', '[data-test-selector="sda-wrapper"]']
    },
    {
      id: 'upsells',
      group: 'Ads',
      on: true,
      label: 'Prime and Bits offers',
      desc: 'The Prime offers crown and the "Get Bits" sale button in the top bar.',
      css: [
        '[data-test-selector="test_selector_prime_tracking_button_wrapper"]',
        '[data-a-target="prime-offers-icon"]',
        '[data-a-target="top-nav-get-bits-button"]'
      ]
    },

    /* ----------------------------------------------------- discovery ---- */
    {
      id: 'recommendedChannels',
      group: 'Side nav',
      on: true,
      label: 'Recommended channels',
      desc: 'The "Live channels" Twitch suggests in the side nav. Channels you follow stay.',
      css: [SIDE_NAV + ' [role="group"]:has([data-test-selector="recommended-channel"])', '[data-test-selector="recommended-channel"]']
    },
    {
      id: 'similarChannels',
      group: 'Side nav',
      label: '"Viewers also watch"',
      desc: 'Channels similar to the one you are watching, in the side nav.',
      css: [SIDE_NAV + ' [role="group"]:has([data-test-selector="similarity-channel"])', '[data-test-selector="similarity-channel"]']
    },
    {
      id: 'sideNav',
      group: 'Side nav',
      label: 'The whole side nav',
      desc: 'Followed, recommended and similar channels — all of it.',
      css: [SIDE_NAV, '[data-a-target="side-nav-bar"]']
    },
    {
      id: 'featuredCarousel',
      group: 'Front page',
      label: 'Featured carousel',
      desc: 'The autoplaying featured streams at the top of the front page.',
      css: ['[data-a-target="front-page-carousel"]']
    },

    /* --------------------------------------------------------- watching -- */
    {
      id: 'chat',
      group: 'Watching',
      label: 'Chat',
      desc: 'The whole chat column beside a stream.',
      css: ['.channel-root__right-column']
    },
    {
      id: 'chatBadges',
      group: 'Watching',
      label: 'Badges in chat',
      desc: 'Subscriber, bits and other badges before names in chat.',
      css: ['[data-a-target="chat-badge"]', '.chat-badge']
    },
    {
      id: 'channelPoints',
      group: 'Watching',
      label: 'Channel points',
      desc: 'The points balance and the claim button under chat.',
      css: ['[data-test-selector="community-points-summary"]']
    },
    {
      id: 'subGift',
      group: 'Watching',
      label: 'Subscribe and Gift buttons',
      desc: 'The upsell buttons under a stream. Follow stays.',
      css: ['[data-a-target="subscribe-button"]', '[data-a-target="gift-button"]']
    },
    {
      id: 'aboutPanels',
      group: 'Watching',
      label: 'About panels',
      desc: 'The channel\'s panels below the stream.',
      css: ['[data-a-target="about-panel"]']
    },

    /* -------------------------------------------------------- top bar ---- */
    {
      id: 'badges',
      group: 'Top bar',
      on: true,
      label: 'Notification badges',
      desc: 'The count on the notifications bell, and in the tab title.',
      css: ['[data-test-selector="onsite-notifications__badge"]'],
      js: { kind: 'badges' }
    },

    /* -------------------------------------------------------- effects ---- */
    SITES.common.blackWhite(),
    SITES.common.blur(CARD)
  ];

  /* --------------------------------------------------------- picker ---- */

  /* Picking a stream card or a side nav entry means "this channel",
   * wherever it is listed. */
  function authorOf(card, cssString) {
    /* A side nav entry is itself the link. */
    var link = card.matches('a[href]') ? card :
      card.querySelector('a[data-a-target="preview-card-image-link"], a[data-a-target="preview-card-channel-link"]');
    var href = link && link.getAttribute('href').split('?')[0];
    if (!href || !/^\/\w+$/.test(href)) return null;
    var key = cssString(href) + ' i';
    return {
      selector: CARD + ':has(a[data-a-target="preview-card-image-link"][href=' + key + ']), ' +
        'a[data-test-selector$="-channel"][href=' + key + ']',
      name: href.slice(1)
    };
  }

  SITES.register({
    id: 'twitch',
    units: CARD + ', ' + SIDE_CARDS,
    presets: PRESETS,
    silent: { displayAds: true },
    globals: {
      badges: function (api) { api.stripTitleCount(); }
    },
    picker: {
      authorOf: authorOf,
      attrs: ['data-a-target', 'data-test-selector'],
      /* Only Twitch's own BEM-style classes, which always have a - or __
       * in them; styled-components ones are generated (Layout-sc-1xcs6mc-0,
       * cZjbEG, ernidy). */
      classes: /^[a-z][a-z0-9]*((-[a-z0-9]+)+(__[a-z0-9-]+)?|__[a-z0-9-]+)(--[a-z0-9-]+)?$/
    }
  });
})(typeof self !== 'undefined' ? self : this);
