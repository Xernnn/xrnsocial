/* TikTok.
 *
 * TikTok's stable hooks are data-e2e attributes. Mapped signed out in
 * October 2026 (the test window was not signed in to TikTok, and signed out
 * a login prompt stops the feed after a few videos), so this pack has no ad
 * switch yet: ads have to be measured on the signed-in feed first.
 *   - each video in For You is article[data-e2e="recommend-list-item-container"]
 *     holding the player, the author (video-author-avatar, feed-follow), the
 *     description (video-desc) and the side buttons with their counts
 *     (like-count, comment-count, favorite-count, share-count)
 *   - CapCut, TikTok's own editor, is advertised on videos made with it
 *     (data-e2e="capcut-tag"); "Get coins" sits in the top bar
 */
(function (root) {
  'use strict';

  var SITES = root.BFX_SITES;

  var VIDEO = 'article[data-e2e="recommend-list-item-container"]';

  var PRESETS = [
    {
      id: 'upsells',
      group: 'Promotions',
      on: true,
      label: '"Get coins" and CapCut tags',
      desc: 'TikTok\'s own promotions: the coins offer in the top bar and the CapCut link on videos.',
      css: ['[data-e2e="top-right-action-bar-get-coin"]', '[data-e2e="capcut-tag"]']
    },
    {
      id: 'counts',
      group: 'Inside videos',
      label: 'Like, comment, save and share counts',
      desc: 'Hides the numbers under the side buttons, not the buttons.',
      css: ['[data-e2e="like-count"]', '[data-e2e="comment-count"]', '[data-e2e="favorite-count"]', '[data-e2e="share-count"]']
    },
    {
      id: 'music',
      group: 'Inside videos',
      label: 'Sound links',
      desc: 'The "original sound" link under each video.',
      css: ['[data-e2e="video-music"]']
    },
    SITES.common.noAutoplay('Inside videos', 'Videos stay paused until you click one. For You stops playing by itself as you scroll.'),
    {
      id: 'navExtras',
      group: 'Menu',
      label: 'LIVE and Short dramas',
      desc: 'Those two entries in the left menu.',
      css: ['[data-e2e="nav-live"]', '[data-e2e="nav-short-drama"]']
    },
    SITES.common.blackWhite(),
    SITES.common.blur(VIDEO)
  ];

  /* Picking a video means "videos from this account". */
  function authorOf(video, cssString) {
    var link = video.querySelector('a[data-e2e="video-author-avatar"], [data-e2e="video-author-avatar"] a, a[href^="/@"]');
    var href = link && link.getAttribute('href').split('?')[0];
    var m = href && /^\/@[\w.]+/.exec(href);
    if (!m) return null;
    return {
      selector: VIDEO + ':has(a[href=' + cssString(m[0]) + '], a[href^=' + cssString(m[0] + '?') + '], a[href^=' + cssString(m[0] + '/') + '])',
      name: m[0].slice(1)
    };
  }

  SITES.register({
    id: 'tiktok',
    units: VIDEO,
    presets: PRESETS,
    picker: {
      authorOf: authorOf,
      attrs: ['data-e2e'],
      classes: false
    }
  });
})(typeof self !== 'undefined' ? self : this);
