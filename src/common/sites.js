/* The sites xrnsocial works on, and the registry their rule packs join.
 *
 * Each site's rules live in src/sites/<id>.js and register themselves here.
 * This file holds only the site list and what every pack shares, so the
 * service worker and the options page can load it without any site's rules.
 */
(function (root) {
  'use strict';

  /* Every site, in popup order. A hostname belongs to a site when it is one
   * of its hosts or a subdomain of one. */
  var SITES = [
    { id: 'facebook', name: 'Facebook', hosts: ['facebook.com', 'messenger.com'] },
    { id: 'reddit', name: 'Reddit', hosts: ['reddit.com'] },
    { id: 'x', name: 'X', hosts: ['x.com', 'twitter.com'] },
    { id: 'linkedin', name: 'LinkedIn', hosts: ['linkedin.com'] },
    { id: 'instagram', name: 'Instagram', hosts: ['instagram.com'] },
    { id: 'tiktok', name: 'TikTok', hosts: ['tiktok.com'] },
    { id: 'twitch', name: 'Twitch', hosts: ['twitch.tv'] }
  ];

  var packs = {};

  function info(id) {
    for (var i = 0; i < SITES.length; i++) {
      if (SITES[i].id === id) return SITES[i];
    }
    return null;
  }

  function forHost(hostname) {
    var host = String(hostname || '').toLowerCase();
    for (var i = 0; i < SITES.length; i++) {
      for (var j = 0; j < SITES[i].hosts.length; j++) {
        var h = SITES[i].hosts[j];
        if (host === h || host.slice(-h.length - 1) === '.' + h) return SITES[i].id;
      }
    }
    return null;
  }

  function forUrl(url) {
    try {
      var u = new URL(url);
      return /^https?:$/.test(u.protocol) ? forHost(u.hostname) : null;
    } catch (e) {
      return null;
    }
  }

  function register(pack) {
    var base = info(pack.id);
    pack.name = pack.name || (base && base.name) || pack.id;
    pack.groups = pack.presets.reduce(function (acc, r) {
      if (acc.indexOf(r.group) === -1) acc.push(r.group);
      return acc;
    }, []);
    packs[pack.id] = pack;
  }

  function get(id) {
    return packs[id] || null;
  }

  /* Sites whose rules are loaded in this context, in popup order. */
  function available() {
    return SITES.filter(function (s) { return packs[s.id]; }).map(function (s) { return packs[s.id]; });
  }

  /* The switches a site has on out of the box (presets marked on: true). */
  function defaultsFor(id) {
    var out = {};
    var pack = packs[id];
    if (!pack) return out;
    pack.presets.forEach(function (r) {
      if (r.on) out[r.id] = true;
    });
    return out;
  }

  /* Switches every site offers in the same shape. */
  var common = {
    /* On the root element a filter greys the whole canvas without making it a
     * containing block, so a site's fixed bars stay where they are. It
     * composes with the blur below. */
    blackWhite: function () {
      return {
        id: 'grayscale',
        group: 'Effects',
        label: 'Black & white',
        desc: 'The whole page in greyscale — pictures, videos, avatars, everything — and it stays grey when you hover.',
        style: 'html { filter: grayscale(1) !important; }'
      };
    },

    /* `post` is the site's selector for one post. The "show" bars xrnsocial
     * leaves behind are not blurred: they are meant to be read. */
    blur: function (post) {
      return {
        id: 'blurFeed',
        group: 'Effects',
        label: 'Blur posts until hovered',
        desc: 'Stops passive scrolling dead. You have to choose to read something.',
        style: post + ':not([data-bfx-note]) { filter: blur(5px); transition: filter .15s ease; }' +
          post + ':hover { filter: none; }'
      };
    },

    /* No selector: the engine pauses any video that starts without a click
     * or key press just before it. */
    noAutoplay: function (group, desc) {
      return {
        id: 'noAutoplay',
        group: group,
        label: 'Stop videos playing by themselves',
        desc: desc || 'Videos stay paused while you scroll past. Click one and it plays as normal.',
        behavior: true
      };
    }
  };

  root.BFX_SITES = {
    list: SITES,
    info: info,
    forHost: forHost,
    forUrl: forUrl,
    register: register,
    get: get,
    available: available,
    defaultsFor: defaultsFor,
    common: common
  };
})(typeof self !== 'undefined' ? self : this);
