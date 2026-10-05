/* Smoke test: runs the real content scripts against a mock Facebook DOM.
 *
 * jsdom is not Chrome — notably its :has() support is thinner — so selector
 * syntax failures are reported, not asserted, and the heuristics are what we
 * actually pin down here. Run with `npm test`.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks++;
  if (condition) {
    console.log('  ✓ ' + label);
  } else {
    failures++;
    console.log('  ✗ ' + label + (detail ? '  — ' + detail : ''));
  }
}

const PAGE = `<!doctype html><html><head><title>(3) Facebook</title></head><body>
  <div role="banner">
    <div role="navigation">
      <a aria-label="Home" href="/"></a>
      <a aria-label="Marketplace" href="/marketplace/"></a>
    </div>
    <div aria-label="Notifications" role="button"><span>7</span></div>
    <div aria-label="Messenger" role="button"></div>
  </div>
  <div role="main">
    <div data-pagelet="Stories">stories tray</div>
    <div data-pagelet="ProfileComposer">What's on your mind?</div>
    <div role="feed">
      <div data-pagelet="FeedUnit_0" role="article" id="u-ad" data-h="300">
        <span dir="auto">Sponsored</span>
        <a href="/ads/about/?entry_product=ad_preferences">Why am I seeing this ad?</a>
        <div aria-label="Like" role="button"></div><div aria-label="Comment" role="button"></div>
      </div>
      <div data-pagelet="FeedUnit_1" role="article" id="u-sug">Suggested for you · Cool Page posted a thing</div>
      <div data-pagelet="FeedUnit_2" role="article" id="u-ok">A friend posted a photo of a cat</div>
      <div data-pagelet="FeedUnit_3" role="article" id="u-kw">Buy CRYPTO now, huge giveaway</div>
      <div data-pagelet="FeedUnit_4" role="article" id="u-pymk">People you may know</div>
      <div data-pagelet="FeedUnit_5" role="article" id="u-organic" data-h="300">
        <div data-ad-rendering-role="profile_name"><span dir="auto">Dana</span></div>
        <div data-ad-preview="message" data-ad-comet-preview="message" data-ad-rendering-role="story_message">Lovely day at the lake</div>
        <div data-ad-rendering-role="like_button" aria-label="Like" role="button"></div>
      </div>
      <div data-pagelet="FeedUnit_7" role="article" id="u-ad3" data-h="300">
        <span dir="auto">Sp<span style="display:none">qq</span>onso<span style="display:none">x</span>red</span>
        <div>Buy our thing</div>
      </div>
      <div data-pagelet="FeedUnit_8" role="article" id="u-act">
        <h4>Bob commented on this.</h4>
        <div data-ad-preview="message">Original post from a page</div>
      </div>
      <div data-pagelet="FeedUnit_9" role="article" id="u-body">
        <h4>Carl</h4>
        <div data-ad-preview="message">My aunt commented on this, People you may know where she lives</div>
        <div id="bar"><div><div aria-label="Like" role="button"></div></div><div><div aria-label="Comment" role="button"></div></div></div>
        <div id="comments">
          <div role="article" id="u-comment" aria-label="Comment by Fay">Fay replied to a comment above
            <div id="comment-actions"><span aria-label="Like" role="button"></span><span>Reply</span></div>
          </div>
        </div>
      </div>
      <div data-pagelet="FeedUnit_10" role="article" id="u-vi">
        <span dir="auto">Gợi ý cho bạn</span> · Trang ABC đã đăng
      </div>
      <div data-pagelet="FeedUnit_11" role="article" id="u-reel-link">
        <h4>Gina</h4><a id="reel-link" href="/reel/123456/">watch my reel</a>
      </div>
      <div data-pagelet="FeedUnit_6" role="article" id="u-pp" data-h="300">
        Paid partnership with Brand · a creator posted
      </div>
    </div>
    <div id="tray" data-h="220">
      <div id="story-1" data-h="200"><span dir="auto">Story A</span></div>
      <div id="story-2" data-h="200">
        <span dir="auto">Sp<span style="display:none">qq</span>onsored</span>
      </div>
      <div id="story-3" data-h="200"><span dir="auto">Story C</span></div>
    </div>
    <div id="mp-grid" data-h="600">
      <div id="mp-1" data-h="250">
        <span dir="auto">Sponsored</span><a href="/marketplace/item/1">Cheap thing</a>
      </div>
      <div id="mp-2" data-h="250"><a href="/marketplace/item/2">Normal thing</a></div>
      <div id="mp-3" data-h="250"><a href="/marketplace/item/3">Another thing</a></div>
    </div>
  </div>
  <div role="complementary">
    <div id="side-section">
      <div><span><h3>Sponsored</h3></span></div>
      <div id="side-ad">an advert</div>
    </div>
  </div>
</body></html>`;

/* A window running the real content scripts (except main.js) over `html`. */
function boot(html, url) {
  const { window } = new JSDOM(html, {
    url: url || 'https://www.facebook.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });

  /* jsdom has no layout: give everything a plausible box so visibility checks
   * behave like a real browser. */
  window.Element.prototype.getBoundingClientRect = function () {
    const width = Math.max(8, Math.min(600, (this.textContent || '').trim().length * 8));
    const height = Number(this.getAttribute('data-h')) || 24;
    return { top: 10, left: 10, width, height, right: 10 + width, bottom: 10 + height, x: 10, y: 10 };
  };

  const storage = {};
  window.chrome = {
    storage: {
      local: {
        get: (key, cb) => cb({ [key]: storage[key] }),
        set: (obj, cb) => { Object.assign(storage, obj); (cb || (() => {}))(); }
      },
      onChanged: { addListener: () => {} }
    },
    runtime: { onMessage: { addListener: () => {} }, lastError: null }
  };

  for (const file of [
    'src/common/sites.js',
    'src/sites/facebook.js',
    'src/sites/reddit.js',
    'src/sites/x.js',
    'src/sites/linkedin.js',
    'src/sites/instagram.js',
    'src/sites/twitch.js',
    'src/sites/tiktok.js',
    'src/common/storage.js',
    'src/content/engine.js',
    'src/content/picker.js'
  ]) {
    window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  return window;
}

/* The older markup (role="feed", data-pagelet), which Facebook no longer
 * ships but the rules still accept. Today's markup is tested further down. */
const window = boot(PAGE);
const { BFX_STORE, BFX_ENGINE, BFX_PICKER, BFX_SITES } = window;
const BFX_PRESETS = BFX_SITES.get('facebook').presets;

/* --------------------------------------------------------- selectors -- */
console.log('\nselector syntax (jsdom, :has() support is partial)');
const badSelectors = [];
for (const rule of BFX_PRESETS) {
  for (const sel of rule.css || []) {
    try {
      window.document.querySelectorAll(sel);
    } catch (e) {
      badSelectors.push(rule.id + ': ' + sel);
    }
  }
}
if (badSelectors.length) {
  console.log('  ! not parsed by jsdom (verify in Chrome):\n    ' + badSelectors.join('\n    '));
} else {
  console.log('  ✓ all ' + BFX_PRESETS.length + ' preset rules parse');
}

/* ------------------------------------------------------------ styles -- */
console.log('\nstylesheet');
const everything = BFX_STORE.merge({
  enabled: true,
  presets: Object.fromEntries(BFX_PRESETS.map(r => [r.id, true])),
  keywords: { enabled: true, terms: ['crypto', '/give\\s?away/i'] },
  custom: [
    { id: 'c1', selector: 'div[data-pagelet="Stories"]', enabled: true, scope: 'all' },
    { id: 'c2', selector: '#nope', enabled: true, scope: 'path', path: '/groups/' }
  ]
});
BFX_ENGINE.apply(everything);
const css = window.document.getElementById('bfx-style').textContent;
ok('the hidden marker rule is defined', css.includes('[data-bfx-hidden-by]:not(#bfx-z){display:none !important}'));
ok('preset selectors are emitted', css.includes('div[data-pagelet="Stories"]:not(#bfx-z){display:none !important}'));
ok('effect rules keep their own CSS', css.includes('filter: blur(5px)'));
ok('black & white greys the whole page, with no hover exception',
  css.includes('html { filter: grayscale(1) !important; }') && !/:hover[^{]*\{[^}]*grayscale/.test(css));
ok('path-scoped rule stays out on other pages', css.includes('#nope') === false, 'path-scoped rule leaked');
ok('each selector is its own rule', css.split('\n').length > BFX_PRESETS.length);

const frame = () => new Promise(r => setTimeout(r, 60));

(async function main() {
/* -------------------------------------------------------- heuristics -- */
console.log('\nheuristics');
const $ = id => window.document.getElementById(id);
const hiddenBy = id => $(id) && $(id).getAttribute('data-bfx-hidden-by');

BFX_ENGINE.apply(everything);
await frame();
ok('ad post is hidden', hiddenBy('u-ad') === 'sponsored', 'got ' + hiddenBy('u-ad'));
ok('suggested post is hidden', hiddenBy('u-sug') === 'suggested', 'got ' + hiddenBy('u-sug'));
ok('"people you may know" is hidden', hiddenBy('u-pymk') === 'pymk', 'got ' + hiddenBy('u-pymk'));
ok('keyword post is hidden', hiddenBy('u-kw') === 'keyword', 'got ' + hiddenBy('u-kw'));
ok('an ordinary post survives', !$('u-ok').hasAttribute('data-bfx-hidden-by'));
ok('unread badge is hidden', $('u-ad') && window.document.querySelector('[aria-label="Notifications"] span').hasAttribute('data-bfx-hidden-by'));
ok('tab title count is stripped', window.document.title === 'Facebook', window.document.title);
ok('sidebar ad block is hidden', $('side-ad').closest('[data-bfx-hidden-by]') !== null);

/* ---------------------------------------------------------------- ads -- */
console.log('\nads');
ok('ad with an explainer link is hidden by CSS alone, before any script runs',
  Array.from(window.document.querySelectorAll('div[data-pagelet^="FeedUnit"]:has(a[href*="/ads/about"])'))
    .some(el => el.id === 'u-ad'));
ok('ad with only a decoy-padded label is caught', hiddenBy('u-ad3') === 'sponsored', 'got ' + hiddenBy('u-ad3'));
ok('ordinary post with data-ad-* markup survives (Facebook renders it on every post)',
  !$('u-organic').hasAttribute('data-bfx-hidden-by'), 'hidden by ' + hiddenBy('u-organic'));
ok('the ad rule never keys on data-ad-* markup (it is on every post)',
  BFX_PRESETS.find(r => r.id === 'sponsored').css.every(sel => !/data-ad-/.test(sel)));
ok('paid partnership post is caught', hiddenBy('u-pp') === 'paidPartnership', 'got ' + hiddenBy('u-pp'));
ok('sponsored story is hidden', hiddenBy('story-2') === 'adSweep', 'got ' + hiddenBy('story-2'));
ok('the rest of the story tray survives',
  !$('story-1').hasAttribute('data-bfx-hidden-by') && !$('tray').hasAttribute('data-bfx-hidden-by'));
ok('sponsored marketplace tile is hidden', hiddenBy('mp-1') === 'adSweep', 'got ' + hiddenBy('mp-1'));
ok('the marketplace grid itself survives',
  !$('mp-grid').hasAttribute('data-bfx-hidden-by') && !$('mp-2').hasAttribute('data-bfx-hidden-by'));

/* With the feed rule off, the sweep is allowed into the feed instead. */
const sweepOnly = BFX_STORE.merge({
  enabled: true,
  presets: Object.assign(Object.fromEntries(BFX_PRESETS.map(r => [r.id, false])), { adSweep: true }),
  keywords: { enabled: false, terms: [] }
});
BFX_ENGINE.apply(sweepOnly);
await frame();
ok('sweep covers feed ads when the feed rule is off', hiddenBy('u-ad') === 'adSweep', 'got ' + hiddenBy('u-ad'));
ok('sweep leaves ordinary posts alone', !$('u-ok').hasAttribute('data-bfx-hidden-by'));

/* ----------------------------------------------------------- toggles -- */
console.log('\nturning rules off');
/* Defaults sit underneath stored settings, so "off" has to be explicit —
 * which is exactly what the popup writes when a switch is flipped. */
const off = BFX_STORE.merge({
  enabled: true,
  presets: Object.fromEntries(BFX_PRESETS.map(r => [r.id, false])),
  keywords: { enabled: false, terms: [] }
});
BFX_ENGINE.apply(off);
await frame();
const stuck = Array.from(window.document.querySelectorAll('[data-bfx-hidden-by]'))
  .map(e => (e.id || e.tagName) + ':' + e.getAttribute('data-bfx-hidden-by'));
ok('previously hidden posts come back', stuck.length === 0, 'still hidden: ' + stuck.join(', '));
ok('stylesheet drops the rules', !window.document.getElementById('bfx-style').textContent.includes('Stories'));

/* The badge stripper is not a per-post rule, so it has its own path into the
 * observer: enabling it alone still has to work. */
const badgesOnly = BFX_STORE.merge({
  enabled: true,
  presets: Object.assign(Object.fromEntries(BFX_PRESETS.map(r => [r.id, false])), { badges: true }),
  keywords: { enabled: false, terms: [] }
});
BFX_ENGINE.apply(badgesOnly);
await frame();
window.document.querySelector('[aria-label="Notifications"] span').textContent = '9';
await frame();
ok('badges alone still get stripped',
  window.document.querySelector('[aria-label="Notifications"] span').hasAttribute('data-bfx-hidden-by'));

BFX_ENGINE.apply(BFX_STORE.merge({ enabled: false, presets: { stories: true } }));
ok('master switch empties the sheet',
  !window.document.getElementById('bfx-style').textContent.includes('Stories'));

/* ----------------------------------------------------- feed phrases -- */
console.log('\nfeed phrases');
BFX_ENGINE.apply(everything);
await frame();
ok('friend activity in the post header is hidden', hiddenBy('u-act') === 'reactionsOnPosts', 'got ' + hiddenBy('u-act'));
ok('the same phrase inside the post body is not', !$('u-body').hasAttribute('data-bfx-hidden-by'), 'hidden by ' + hiddenBy('u-body'));
ok('comments are not judged as posts of their own', !$('u-comment').hasAttribute('data-bfx-hidden-by'), 'hidden by ' + hiddenBy('u-comment'));
ok('Vietnamese "suggested for you" is hidden', hiddenBy('u-vi') === 'suggested', 'got ' + hiddenBy('u-vi'));
ok('links to reels are hidden by CSS', $('reel-link').matches('a[href^="/reel/"]') &&
  window.document.getElementById('bfx-style').textContent.includes('a[href^="/reel/"]:not(#bfx-z){display:none !important}'));

ok('the Like / Comment row is hidden', hiddenBy('bar') === 'postActions', 'got ' + hiddenBy('bar'));
ok('but not the comments or their own Like buttons',
  !$('comments').closest('[data-bfx-hidden-by]') && !$('comment-actions').hasAttribute('data-bfx-hidden-by'));
BFX_ENGINE.apply(BFX_STORE.merge({
  presets: Object.assign(Object.fromEntries(BFX_PRESETS.map(r => [r.id, false])), { postActions: true })
}));
await frame();
ok('a post whose buttons sit directly in it is not taken for the row',
  !$('u-ad').hasAttribute('data-bfx-hidden-by') && hiddenBy('bar') === 'postActions', 'u-ad hidden by ' + hiddenBy('u-ad'));
BFX_ENGINE.apply(everything);
await frame();

/* -------------------------------------------------------- reel pages -- */
console.log('\nreel pages');
const at = (pathname, hostname = 'www.facebook.com') => ({ pathname, hostname });
const withReels = BFX_STORE.merge(null);
ok('a reel page redirects home', BFX_ENGINE.redirectFor(withReels, at('/reel/123456/')) === '/');
ok('the reels tab redirects home', BFX_ENGINE.redirectFor(withReels, at('/reels/')) === '/');
ok('lookalike paths do not', BFX_ENGINE.redirectFor(withReels, at('/reelsandmore')) === null);
ok('nothing redirects with the Reels rule off',
  BFX_ENGINE.redirectFor(BFX_STORE.merge({ presets: { reels: false } }), at('/reel/1')) === null);
ok('nothing redirects while paused',
  BFX_ENGINE.redirectFor(BFX_STORE.merge({ enabled: false }), at('/reel/1')) === null);
ok('messenger.com is left alone', BFX_ENGINE.redirectFor(withReels, at('/reel/1', 'www.messenger.com')) === null);

/* ------------------------------------------------------- rule health -- */
console.log('\nrule health');
const stats = BFX_ENGINE.stats();
ok('CSS rules report what they match', stats.presets.stories && stats.presets.stories.count >= 1,
  JSON.stringify(stats.presets.stories));
ok('JS rules report what they hid', stats.presets.sponsored && stats.presets.sponsored.count >= 2,
  JSON.stringify(stats.presets.sponsored));
ok('effect-only rules have nothing to count', !('grayscale' in stats.presets));
ok('a rule scoped to another page says so', stats.custom.c2 && stats.custom.c2.offPage === true);
ok('word blocks are counted', stats.keyword >= 1, 'got ' + stats.keyword);
ok('nothing is reported while paused',
  (BFX_ENGINE.apply(BFX_STORE.merge({ enabled: false })), Object.keys(BFX_ENGINE.stats().presets).length === 0));

/* A stored selector that is not a selector must not reach the sheet, where
 * it could close its rule and add CSS of its own. */
BFX_ENGINE.apply(BFX_STORE.merge({
  presets: {},
  custom: [{ id: 'evil', selector: 'x{}body{background:url(https://example.invalid/t)} y', enabled: true, scope: 'all' }]
}));
ok('an invalid custom selector is kept out of the stylesheet',
  !window.document.getElementById('bfx-style').textContent.includes('example.invalid'));
ok('and is reported as broken', BFX_ENGINE.stats().custom.evil.broken.length === 1);

/* ------------------------------------------------------- late labels -- */
console.log('\nlate labels');
BFX_ENGINE.apply(BFX_STORE.merge(null));
await frame();
const lateSection = window.document.createElement('div');
lateSection.innerHTML = '<div><h3 id="late-label"></h3></div><div id="late-ad">another advert</div>';
window.document.querySelector('[role="complementary"]').appendChild(lateSection);
await frame();
$('late-label').textContent = 'Sponsored';
await frame();
ok('a sidebar label filled in after it appeared is still caught', $('late-ad').closest('[data-bfx-hidden-by]') !== null);

/* ------------------------------------------------------ placeholders -- */
console.log('\nplaceholders');
BFX_ENGINE.apply(Object.assign({}, everything, { placeholders: true }));
await frame();
const sheet = window.document.getElementById('bfx-style').textContent;
ok('placeholder styles are emitted', sheet.includes('[data-bfx-hidden-by][data-bfx-note]::before'));
ok('a word-blocked post leaves a placeholder naming the word',
  $('u-kw').hasAttribute('data-bfx-note') && /word: crypto/.test($('u-kw').getAttribute('data-bfx-note') || ''),
  $('u-kw').getAttribute('data-bfx-note'));
ok('a text-rule post names its rule',
  /Suggested \/ recommended posts/.test($('u-sug').getAttribute('data-bfx-note') || ''));
ok('ads leave no placeholder', !$('u-ad').hasAttribute('data-bfx-note'));
$('u-kw').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
ok('clicking the placeholder shows the post', !$('u-kw').hasAttribute('data-bfx-hidden-by'));
BFX_ENGINE.apply(Object.assign({}, everything, { placeholders: true }));
await frame();
ok('and it stays shown after settings change', !$('u-kw').hasAttribute('data-bfx-hidden-by'));
BFX_ENGINE.apply(everything);
await frame();
ok('with placeholders off, posts are simply gone', !$('u-sug').hasAttribute('data-bfx-note') &&
  $('u-sug').hasAttribute('data-bfx-hidden-by') && !window.document.getElementById('bfx-style').textContent.includes('[data-bfx-hidden-by][data-bfx-note]'));

/* ------------------------------------------------------------ backup -- */
console.log('\nbackup');
const mine = BFX_STORE.merge({
  presets: { stories: true, sponsored: false },
  custom: [{ id: 'k1', selector: '[aria-label="Marketplace"]', label: 'Marketplace', scope: 'all',
    path: '/marketplace/', enabled: true, createdAt: 1700000000000 }],
  keywords: { enabled: true, terms: ['crypto'] },
  placeholders: true
});
const restored = BFX_STORE.fromBackup(JSON.parse(JSON.stringify(BFX_STORE.toBackup(mine))));
ok('a backup restores to the same settings', JSON.stringify(restored) === JSON.stringify(mine));
let threw = null;
try { BFX_STORE.fromBackup({ hello: 'world' }); } catch (e) { threw = e.message; }
ok('a file that is not a backup is refused', /does not contain BlockDistractXrn settings/.test(threw || ''), threw);
const cleaned = BFX_STORE.fromBackup({
  presets: { stories: 'yes', feed: true },
  custom: [{ selector: 'div}body{color:red' }, { selector: 'a[href^="/x"]', scope: 'weird' }, null],
  keywords: { enabled: 1, terms: ['ok', 7, ' '] }
});
const cleanedFb = cleaned.sites.facebook;
ok('non-boolean switches are ignored', cleanedFb.presets.stories === undefined && cleanedFb.presets.feed === true);
ok('picked rules with invalid selectors are dropped', cleanedFb.custom.length === 1 && cleanedFb.custom[0].scope === 'all');
ok('words are cleaned', JSON.stringify(cleaned.keywords) === JSON.stringify({ enabled: false, terms: ['ok'] }));

/* ------------------------------------------------------------ picker -- */
console.log('\npicker selector generation');
function check(label, el, expect) {
  const built = BFX_PICKER.selectorFor(el);
  const list = window.document.querySelectorAll(built.selector);
  ok(label + ' → ' + built.selector,
    built.valid && Array.prototype.includes.call(list, el) && (!expect || expect.test(built.selector)) &&
      !/bfx-/.test(built.selector),
    'invalid or unexpected');
}
check('stories tray', window.document.querySelector('[data-pagelet="Stories"]'), /data-pagelet/);
check('marketplace link', window.document.querySelector('a[aria-label="Marketplace"]'), /aria-label/);
check('notifications button', window.document.querySelector('[aria-label="Notifications"]'), /aria-label/);
check('badge span (no attributes of its own)', window.document.querySelector('[aria-label="Notifications"] span'));
check('sidebar advert', $('side-ad'));

const feedPost = $('u-ok');
const built = BFX_PICKER.selectorFor(feedPost);
ok('feed post gets a selector anchored on its pagelet', /FeedUnit/.test(built.selector), built.selector);

/* ------------------------------------------------------------ sites -- */
console.log('\nsites and settings');
ok('hostnames map to their site', BFX_SITES.forHost('www.facebook.com') === 'facebook' &&
  BFX_SITES.forHost('old.reddit.com') === 'reddit' && BFX_SITES.forHost('x.com') === 'x' &&
  BFX_SITES.forHost('mobile.twitter.com') === 'x' && BFX_SITES.forHost('www.twitch.tv') === 'twitch');
ok('lookalike hosts do not', BFX_SITES.forHost('notfacebook.com') === null && BFX_SITES.forHost('example.com') === null &&
  BFX_SITES.forUrl('chrome://extensions/') === null);
const old = BFX_STORE.merge({ enabled: true, presets: { stories: true, sponsored: false }, custom: [{ id: 'o1', selector: '#x', scope: 'all' }] });
ok('settings from before other sites move to Facebook',
  old.sites.facebook.presets.stories === true && old.sites.facebook.presets.sponsored === false &&
  old.sites.facebook.custom.length === 1 && !('presets' in old) && !('custom' in old));
ok('Facebook defaults still apply underneath', old.sites.facebook.presets.reels === true);
ok('every site has a slot, even before its rules exist', BFX_SITES.list.every(x => old.sites[x.id]));
const offHere = BFX_STORE.merge(null);
offHere.sites.facebook.enabled = false;
ok('a site switched off is paused, the rest are not',
  BFX_STORE.view(offHere, 'facebook').enabled === false && BFX_STORE.view(offHere, 'reddit').enabled === true);
BFX_ENGINE.apply(offHere);
ok('with Facebook switched off its pages get no rules',
  window.document.getElementById('bfx-style').textContent.split('\n').every(l => l.startsWith('[data-bfx-hidden-by]')));
const legacy = BFX_STORE.fromBackup({ app: 'BlockFB', version: 1, settings: { presets: { stories: true }, custom: [], keywords: { enabled: true, terms: ['x'] } } });
ok('an old BlockFB backup restores into Facebook', legacy.sites.facebook.presets.stories === true && legacy.keywords.terms[0] === 'x');
const v2 = BFX_STORE.fromBackup(BFX_STORE.toBackup(Object.assign(BFX_STORE.merge(null), { sites: { facebook: { enabled: false, presets: { feed: true }, custom: [] }, nowhere: { presets: { a: true } } } })));
ok('a new backup restores per site, and drops sites that do not exist', v2.sites.facebook.enabled === false &&
  v2.sites.facebook.presets.feed === true && !('nowhere' in v2.sites));
{
  const other = boot('<!doctype html><html><head></head><body><div aria-posinset="1">hello crypto</div></body></html>', 'https://example.com/');
  other.BFX_ENGINE.apply(other.BFX_STORE.merge({ keywords: { enabled: true, terms: ['crypto'] } }));
  ok('a site without rules is left completely alone', other.BFX_ENGINE.site === null &&
    !other.document.getElementById('bfx-style') && !other.document.querySelector('[data-bfx-hidden-by]'));
}

/* ------------------------------------------ facebook.com, October 2026 -- */
console.log('\nfacebook.com as of October 2026 (test/fixtures/feed.html)');
{
  const w = boot(fs.readFileSync(path.join(__dirname, 'fixtures/feed.html'), 'utf8'));
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const shown = id => !$$(id).closest('[data-bfx-hidden-by]');
  const S = w.BFX_STORE;

  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('an ordinary post survives the defaults', shown('u-organic'), 'hidden by ' + by('u-organic'));
  ok('an ad is caught by the word joiner in its header link', by('u-ad') === 'sponsored', 'got ' + by('u-ad'));
  ok('an ad is caught by a label reading "Ad"', by('u-ad-label') === 'sponsored', 'got ' + by('u-ad-label'));
  ok('an issue ad is caught by its "Sponsored" text', by('u-issue') === 'sponsored', 'got ' + by('u-issue'));
  ok('a post with Follow in its title is suggested', by('u-sug') === 'suggested', 'got ' + by('u-sug'));
  ok('a friend sharing a page post is not', shown('u-shared'), 'hidden by ' + by('u-shared'));
  ok('people you may know, in Vietnamese, is caught by its repeated buttons', by('u-pymk') === 'pymk', 'got ' + by('u-pymk'));
  ok('group suggestions under an unknown heading are caught too', by('u-groups') === 'pymk', 'got ' + by('u-groups'));
  ok('the Reels shelf goes as a whole', by('u-reels') === 'reels', 'got ' + by('u-reels'));
  ok('a phrase in the post body does not count as a header', shown('u-organic'));
  ok('a post opened in a dialog is never judged', shown('dialog-post'), 'hidden by ' + by('dialog-post'));
  ok('the whole red badge goes, not just its digits', by('badge') === 'badges', 'got ' + by('badge'));
  ok('the sidebar ad goes', $$('side-ad').closest('[data-bfx-hidden-by]') !== null);

  ok('a link that merely starts with a word joiner is not an ad', shown('u-pasted'), 'hidden by ' + by('u-pasted'));
  ok('Marketplace: the tile with a word-joiner label goes', by('mp-ad') === 'adSweep', 'got ' + by('mp-ad'));
  ok('Marketplace: the tile labelled "Ad" goes', by('mp-ad2') === 'adSweep', 'got ' + by('mp-ad2'));
  ok('Marketplace: the listings and the grid stay', shown('mp-1') && shown('mp-2') && shown('mp-grid'));

  /* React rewrites className when it re-renders; that used to un-hide ads. */
  $$('u-ad').className = 'x1n2onr6 x1ja2u2z';
  ok('a class rewrite cannot un-hide anything', by('u-ad') === 'sponsored');
  $$('u-ad').removeAttribute('data-bfx-hidden-by');
  $$('feedbox').appendChild(w.document.createElement('div'));
  await frame();
  ok('a stripped marker is put back on the next scan', by('u-ad') === 'sponsored', 'got ' + by('u-ad'));
  $$('bfx-style').remove();
  $$('feedbox').appendChild(w.document.createElement('div'));
  await frame();
  ok('a removed stylesheet is put back', !!$$('bfx-style') && $$('bfx-style').textContent.includes('{display:none !important}'));

  $$('late-ref').setAttribute('aria-labelledby', 'lbl-ad');
  await frame();
  ok('an ad whose label is attached later is caught then', by('u-ad-late') === 'sponsored', 'got ' + by('u-ad-late'));

  $$('u-shell').innerHTML = '<h4><a role="link" href="/x">Late Page</a><div role="button"><span>Follow</span></div></h4>Filled in';
  await frame();
  ok('an empty shell is judged once Facebook fills it', by('u-shell') === 'suggested', 'got ' + by('u-shell'));

  const all = S.merge({ presets: Object.fromEntries(w.BFX_SITES.get('facebook').presets.map(r => [r.id, true])) });
  all.sites.facebook.presets.feed = false;
  w.BFX_ENGINE.apply(all);
  await frame();
  ok('the Like / Comment row is found by its button markers', by('bar') === 'postActions', 'got ' + by('bar'));
  ok('the post around it stays', !$$('u-organic').hasAttribute('data-bfx-hidden-by'));
  ok('comments in a dialog do not make the post look like a carousel', shown('dialog-post'), 'hidden by ' + by('dialog-post'));

  w.BFX_ENGINE.apply(S.merge({ presets: {}, keywords: { enabled: true, terms: ['Facebook', 'Online status', 'crypto'] } }));
  await frame();
  ok('word blocks ignore unseen text: the "Facebook" decoys and the avatar\'s online dot',
    shown('u-organic'), 'hidden by ' + by('u-organic'));
  ok('but still catch words people can read', by('u-kw') === 'keyword', 'got ' + by('u-kw'));

  w.BFX_ENGINE.apply(S.merge({ presets: { reactionsOnPosts: true } }));
  await frame();
  ok('a post shown because a friend was tagged is friend activity', by('u-tagged') === 'reactionsOnPosts', 'got ' + by('u-tagged'));

  /* jsdom cannot play media, so the switch is checked through the event it
   * listens for and the pause() it answers with. */
  const video = $$('video');
  let pauses = 0;
  video.pause = () => { pauses++; };
  const autoplay = () => video.dispatchEvent(new w.Event('play'));
  w.BFX_ENGINE.apply(S.merge({ presets: { noAutoplay: true } }));
  autoplay();
  ok('a video that starts by itself is paused', pauses === 1, pauses + ' pauses');
  video.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  autoplay();
  ok('one started by a click plays on', pauses === 1, pauses + ' pauses');
  w.BFX_ENGINE.apply(S.merge({ presets: { noAutoplay: false } }));
  pauses = 0;
  await new Promise(r => setTimeout(r, 1600));
  autoplay();
  ok('with the switch off, nothing is paused', pauses === 0, pauses + ' pauses');

  const pick = el => {
    const b = w.BFX_PICKER.selectorFor(el);
    return Object.assign(b, { hits: Array.prototype.includes.call(w.document.querySelectorAll(b.selector), el) });
  };
  const post = pick($$('u-organic'));
  ok('picking a post means every post from its author → ' + post.selector,
    post.hits && post.author === 'Dana Example' && /aria-posinset/.test(post.selector));
  ok('and that rule leaves other authors alone',
    !Array.prototype.includes.call(w.document.querySelectorAll(post.selector), $$('u-shared')));
  const tray = pick($$('stories'));
  ok('the Stories tray is picked by its focus target → ' + tray.selector, tray.hits && /data-focus-target/.test(tray.selector));
  const heading = pick(w.document.querySelector('#contacts h3'));
  ok('Facebook\'s html-* classes are never used → ' + heading.selector, heading.hits && !/html-/.test(heading.selector));

  w.BFX_ENGINE.apply(S.merge({ presets: { feed: true }, placeholders: true, keywords: { enabled: true, terms: ['Lovely day'] } }));
  await frame();
  ok('the feed switch still hides the feed when its first post is hidden by another rule',
    by('feedbox') === 'feed', 'got ' + by('feedbox'));

  w.BFX_ENGINE.apply(S.merge({ presets: { feed: true } }));
  await frame();
  ok('the feed switch hides the box around every post and the loading skeleton',
    by('feedbox') === 'feed' && $$('loading').closest('[data-bfx-hidden-by]') !== null, 'got ' + by('feedbox'));
}

/* ---------------------------------------------- reddit.com, October 2026 -- */
console.log('\nreddit.com as of October 2026 (test/fixtures/reddit.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/reddit.html'), 'utf8');
  /* jsdom leaves declarative shadow roots as inert templates; attach them
   * the way Chrome's parser does. */
  const withShadows = w => {
    w.document.querySelectorAll('template[shadowrootmode]').forEach(t => {
      const host = t.parentElement;
      if (!host.shadowRoot) host.attachShadow({ mode: 'open' }).appendChild(t.content.cloneNode(true));
      t.remove();
    });
    return w;
  };
  const w = withShadows(boot(html, 'https://www.reddit.com/'));
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const shown = id => !$$(id).closest('[data-bfx-hidden-by]');
  const S = w.BFX_STORE;
  const sheet = () => w.document.getElementById('bfx-style').textContent;
  const reddit = presets => S.merge({ sites: { reddit: { presets } } });

  ok('reddit.com runs the Reddit rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'reddit');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('feed ads are hidden by their own element, with the line after them',
    sheet().includes('shreddit-ad-post:not(#bfx-z){display:none') && sheet().includes('shreddit-ad-post + hr:not(#bfx-z){display:none'));
  ok('sidebar and comment-thread ads are hidden', sheet().includes('shreddit-sidebar-ad:not(#bfx-z){') &&
    sheet().includes('shreddit-comments-page-ad:not(#bfx-z){') && sheet().includes('shreddit-comment-tree-ad:not(#bfx-z){'));
  ok('a post from a community you have not joined is hidden on Home', by('a-rec') === 'recommended', 'got ' + by('a-rec'));
  ok('a post from a community you joined stays', shown('a-sub'));
  ok('the line after a hidden post goes with it',
    sheet().includes('[data-bfx-hidden-by]:not([data-bfx-note]) + hr:not(#bfx-z){display:none'));
  ok('the tab title count is stripped', w.document.title === 'Reddit - The heart of the internet', w.document.title);
  const counts = w.BFX_ENGINE.stats().presets;
  ok('the popup counts an ad once, not its line, and skips empty slots',
    counts.promoted.count === 1 && counts.relatedCommunities.count === 1 && counts.recommended.count === 1, JSON.stringify(counts));

  w.BFX_ENGINE.apply(reddit({ counts: true, postActions: false }));
  await frame();
  const style = host => host.shadowRoot.querySelector('style[data-bfx]');
  ok('counts are hidden inside the post\'s shadow root', !!style($$('t3_sub')) && /faceplate-number/.test(style($$('t3_sub')).textContent));
  ok('and inside each comment\'s action row', !!style($$('row')) && /faceplate-number/.test(style($$('row')).textContent));
  w.BFX_ENGINE.apply(reddit({ counts: false, postActions: true }));
  await frame();
  ok('switching counts off clears them; the action bar switch writes its own', /rpl-action-bar \{/.test(style($$('t3_sub')).textContent) &&
    !/faceplate-number/.test(style($$('t3_sub')).textContent) && style($$('row')).textContent === '');

  w.BFX_ENGINE.apply(S.merge({ sites: { reddit: { presets: { recommended: false } } }, keywords: { enabled: true, terms: ['crypto', 'Facebook', 'Upvote'] } }));
  await frame();
  ok('word blocks work on Reddit posts', by('a-kw') === 'keyword', 'got ' + by('a-kw'));
  ok('and skip screen-reader-only text', shown('a-sub'), 'hidden by ' + by('a-sub'));

  const pick = w.BFX_PICKER.selectorFor($$('a-sub'));
  ok('picking a post means every post from its community → ' + pick.selector, pick.author === 'r/cats' && pick.valid &&
    !Array.prototype.includes.call(w.document.querySelectorAll(pick.selector), $$('a-rec')));

  const title = w.BFX_PICKER.selectorFor(w.document.querySelector('#t3_sub > [slot="title"]'));
  ok('picking part of a post names the part: ' + title.selector, title.selector === 'shreddit-post > [slot="title"]');
  const tree = w.BFX_PICKER.selectorFor($$('comment-tree'));
  ok('picking a custom element uses its tag, not its id or classes: ' + tree.selector, tree.selector === 'shreddit-comment-tree');
  const recent = w.BFX_PICKER.selectorFor($$('related'));
  ok('a generic wrapper is keyed on what it holds, without the build hash: ' + recent.selector,
    recent.selector === 'faceplate-partial[name^="RelatedCommunityRecommendations_"]');
  $$('media-sub').className = 'relative block';
  const img = w.BFX_PICKER.selectorFor($$('media-sub'));
  ok('Reddit\'s utility classes are never used: ' + img.selector, !/\.relative|\.block/.test(img.selector));

  /* Reddit's videos sit in the player's shadow root, where "play" from the
   * video never reaches the document. */
  const shadowVideo = $$('player').shadowRoot.querySelector('video');
  let paused = 0;
  shadowVideo.pause = () => { paused++; };
  w.BFX_ENGINE.apply(reddit({ noAutoplay: true }));
  await frame();
  shadowVideo.dispatchEvent(new w.Event('play'));
  ok('a video inside the player\'s shadow root that starts by itself is paused', paused === 1, paused + ' pauses');
  shadowVideo.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, composed: true }));
  shadowVideo.dispatchEvent(new w.Event('play'));
  ok('…and one started by a click plays on', paused === 1, paused + ' pauses');
  w.BFX_ENGINE.apply(reddit({ noAutoplay: false }));
  await new Promise(r => setTimeout(r, 1600));
  shadowVideo.dispatchEvent(new w.Event('play'));
  ok('…and with the switch off nothing is paused', paused === 1, paused + ' pauses');

  const popular = withShadows(boot(html, 'https://www.reddit.com/r/popular/'));
  popular.BFX_ENGINE.apply(popular.BFX_STORE.merge(null));
  await frame();
  ok('recommended posts are left alone off the home feed', !popular.document.getElementById('a-rec').hasAttribute('data-bfx-hidden-by'));
  const out = withShadows(boot(html.replace(/ user-logged-in/g, ''), 'https://www.reddit.com/'));
  out.BFX_ENGINE.apply(out.BFX_STORE.merge(null));
  await frame();
  ok('signed out, nothing counts as recommended', !out.document.getElementById('a-rec').hasAttribute('data-bfx-hidden-by'));
}

/* ------------------------------------------------------ x.com, October 2026 -- */
console.log('\nx.com as of October 2026 (test/fixtures/x.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/x.html'), 'utf8');
  const w = boot(html, 'https://x.com/home');
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const shown = id => !$$(id).closest('[data-bfx-hidden-by]');
  const S = w.BFX_STORE;
  const sheet = () => w.document.getElementById('bfx-style').textContent;
  const xs = presets => S.merge({ sites: { x: { presets } } });
  const ids = w.BFX_SITES.get('x').presets.map(r => r.id);
  const only = list => { const p = {}; ids.forEach(k => { p[k] = list.includes(k); }); return xs(p); };

  ok('x.com runs the X rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'x');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('an ad is hidden by its impression pixels', sheet().includes('[data-testid="cellInnerDiv"]:has([data-testid="top-impression-pixel"]):not(#bfx-z){display:none') && by('cell-ad') === 'promoted', 'got ' + by('cell-ad'));
  ok('an ad with no pixels is caught by its "Ad" label', by('cell-adlabel') === 'promoted', 'got ' + by('cell-adlabel'));
  ok('who-to-follow rows go: heading, user cells and "Show more"',
    by('cell-wtf-head') === 'whoToFollow' && by('cell-wtf-user') === 'whoToFollow' && by('cell-wtf-more') === 'whoToFollow');
  ok('the right column\'s Premium card and suggestions go as whole blocks', by('blk-premium') === 'premiumUpsell' && by('blk-wtf') === 'whoToFollow');
  ok('a promoted trend is hidden by its icon; ordinary trends stay', sheet().includes('[data-testid="trend"]:has(path[d^="M19.498 3h-15c-1.381"])') && !by('trend-plain'));
  ok('ordinary posts, reposts, quotes and the search box stay',
    ['cell-plain', 'cell-repost', 'cell-pinned', 'cell-video', 'cell-quote', 'cell-kw', 'blk-search', 'blk-trends', 'blk-news'].every(shown));
  ok('the tab title count is stripped', w.document.title === 'Home / X', w.document.title);

  w.BFX_ENGINE.apply(only(['reposts']));
  await frame();
  ok('reposts: the repost goes, a pinned post with another context line stays', by('cell-repost') === 'reposts' && shown('cell-pinned'));
  w.BFX_ENGINE.apply(only(['media']));
  await frame();
  ok('media: the whole picture box goes, the text and buttons stay', by('media-box') === 'media' && shown('text-plain') && shown('bar-plain'));
  w.BFX_ENGINE.apply(only(['composer']));
  await frame();
  ok('the post box goes as one block, the tabs and timeline stay', by('composer-block') === 'composer' && shown('timeline') && shown('tab-foryou'));
  w.BFX_ENGINE.apply(only(['trends', 'news', 'sidebarSearch']));
  await frame();
  ok('trends, news and search go as their blocks, the rest of the column stays',
    by('blk-trends') === 'trends' && by('blk-news') === 'news' && by('blk-search') === 'sidebarSearch' && shown('blk-wtf') && shown('blk-footer'));
  let clicked = 0;
  $$('tab-following').addEventListener('click', e => { e.preventDefault(); clicked++; });
  w.BFX_ENGINE.apply(only(['following']));
  await frame();
  w.BFX_ENGINE.apply(only(['following', 'reposts']));
  await frame();
  ok('"Open Home on Following" clicks Following once per arrival, not on every change', clicked === 1, clicked + ' clicks');
  const counts = (w.BFX_ENGINE.apply(S.merge(null)), await frame(), w.BFX_ENGINE.stats().presets);
  ok('the popup counts each ad once, and who to follow as its 3 rows plus the sidebar block', counts.promoted.count === 2 && counts.whoToFollow.count === 4 && !('following' in counts), JSON.stringify(counts));

  w.BFX_ENGINE.apply(S.merge({ keywords: { enabled: true, terms: ['crypto'] } }));
  await frame();
  ok('word blocks work on X posts', by('cell-kw') === 'keyword', 'got ' + by('cell-kw'));

  const pick = w.BFX_PICKER.selectorFor($$('cell-plain'));
  const hits = Array.from(w.document.querySelectorAll(pick.selector)).map(e => e.id);
  ok('picking a post means posts from that account, not quotes of it → ' + pick.selector,
    pick.author === '@alice' && hits.join() === 'cell-plain', hits.join());
  const region = w.BFX_PICKER.selectorFor(w.document.querySelector('#blk-trends section'));
  ok('picking the trends list never yields a rule that also hides the timeline: ' + region.selector,
    !Array.prototype.includes.call(w.document.querySelectorAll(region.selector), $$('timeline')));

  const opened = boot(html, 'https://x.com/alice/status/111');
  opened.BFX_ENGINE.apply(opened.BFX_STORE.merge({ sites: { x: { presets: { verifiedReplies: true } } } }));
  await frame();
  const obi = id => opened.document.getElementById(id).getAttribute('data-bfx-hidden-by');
  ok('under an opened post, a reply from a verified account goes; the post itself stays',
    obi('cell-video') === 'verifiedReplies' && !obi('cell-plain'), obi('cell-video') + ' / ' + obi('cell-plain'));
  const lists = boot(html, 'https://x.com/alice/following');
  lists.BFX_ENGINE.apply(lists.BFX_STORE.merge(null));
  await frame();
  ok('user cells on a following list are the content, not suggestions', !lists.document.getElementById('cell-wtf-user').hasAttribute('data-bfx-hidden-by'));
}

/* ----------------------------------------------- linkedin.com, October 2026 -- */
console.log('\nlinkedin.com as of October 2026 (test/fixtures/linkedin.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/linkedin.html'), 'utf8');
  const w = boot(html, 'https://www.linkedin.com/feed/');
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const shown = id => !$$(id).closest('[data-bfx-hidden-by]');
  const S = w.BFX_STORE;
  const ids = w.BFX_SITES.get('linkedin').presets.map(r => r.id);
  const only = list => { const p = {}; ids.forEach(k => { p[k] = list.includes(k); }); return S.merge({ sites: { linkedin: { presets: p } } }); };

  ok('linkedin.com runs the LinkedIn rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'linkedin');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('a promoted post goes by its label', by('item-ad') === 'promoted', 'got ' + by('item-ad'));
  /* The label can arrive by changing a text node that was already there. */
  const late = $$('item-plain').cloneNode(true);
  late.id = 'item-late';
  late.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  const slot = Array.from(late.querySelectorAll('p span')).find(e => /2h/.test(e.textContent));
  slot.firstChild.nodeValue = '';
  $$('feed').appendChild(late);
  await frame(); await frame();
  ok('a post judged before its label arrives is looked at again', !late.hasAttribute('data-bfx-hidden-by'));
  slot.firstChild.nodeValue = 'Promoted';
  await frame(); await frame();
  ok('…when the label is written into the text that was already there', late.getAttribute('data-bfx-hidden-by') === 'promoted',
    'got ' + late.getAttribute('data-bfx-hidden-by'));
  late.remove();
  ok('the label is matched in other languages too', by('item-ad-de') === 'promoted', 'got ' + by('item-ad-de'));
  ok('a promoted card in the right column goes as its block', by('right-promo') === 'promoted' && shown('right-news'));
  ok('Premium in the left column goes as its block, the profile card stays', by('left-premium') === 'premiumUpsell' && shown('left-profile') && shown('left-stats'));
  ok('the unread badges go, and the tab title count', by('badge-msg') === 'badges' && by('badge-notif') === 'badges' && w.document.title === 'Feed | LinkedIn');
  ok('ordinary, suggested and activity posts stay by default', ['item-plain', 'item-suggested', 'item-activity', 'item-video', 'item-kw'].every(shown));

  w.BFX_ENGINE.apply(only(['suggested', 'activity']));
  await frame();
  ok('a Follow button in the header marks a post from someone you don\'t follow', by('item-suggested') === 'suggested' && shown('item-plain'));
  ok('an activity line above the author marks a post shown because of someone else', by('item-activity') === 'activity');
  w.BFX_ENGINE.apply(only(['postActions', 'counts', 'media']));
  await frame();
  /* These go by CSS: does a rule in the sheet match the element? */
  const cssHides = id => w.document.getElementById('bfx-style').textContent.split('\n').some(line => {
    const sel = line.slice(0, line.lastIndexOf('{'));
    try { return /display:none/.test(line) && $$(id).matches(sel); } catch (e) { return false; }
  });
  ok('the button row, the counts and the picture go as sections; header and text stay',
    cssHides('actions-plain') && cssHides('counts-plain') && cssHides('media-plain') &&
    !cssHides('head-plain') && !cssHides('text-plain'));
  ok('an event\'s picture, a section of its own, goes too', cssHides('event-media'));
  ok('where text and picture share a section, at any depth, only the picture goes',
    cssHides('ad-media-link') && !cssHides('ad-media-title') && !cssHides('ad-body'));
  ok('media never takes a header, an activity line or the author after it, whose pictures are people',
    !cssHides('activity-line') && !cssHides('activity-author') && !cssHides('head-plain'));
  w.BFX_ENGINE.apply(only(['news']));
  await frame();
  ok('LinkedIn News goes as its block, puzzles and footer stay', by('right-news') === 'news' && shown('right-games') && shown('right-footer'));
  const counts = (w.BFX_ENGINE.apply(S.merge(null)), await frame(), w.BFX_ENGINE.stats().presets);
  ok('the popup counts the ads, Premium and badges', counts.promoted.count >= 3 && counts.premiumUpsell.count >= 2 && counts.badges.count === 2, JSON.stringify(counts));

  w.BFX_ENGINE.apply(S.merge({ keywords: { enabled: true, terms: ['crypto', 'feed'] } }));
  await frame();
  ok('word blocks work on LinkedIn posts', by('item-kw') === 'keyword', 'got ' + by('item-kw'));
  ok('and skip the hidden "Feed post" heading every post starts with', shown('item-plain'), 'hidden by ' + by('item-plain'));

  const pick = w.BFX_PICKER.selectorFor($$('item-activity'));
  ok('picking an activity post means posts from its author, not the one who reacted → ' + pick.author, pick.author === 'Dana Example');
  const pick2 = w.BFX_PICKER.selectorFor($$('item-plain'));
  ok('the author is named from the picture\'s label', pick2.author === 'Ana Example', pick2.author);
}

/* ---------------------------------------------- instagram.com, October 2026 -- */
console.log('\ninstagram.com as of October 2026 (test/fixtures/instagram.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/instagram.html'), 'utf8');
  const w = boot(html, 'https://www.instagram.com/');
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const shown = id => !$$(id).closest('[data-bfx-hidden-by]');
  const S = w.BFX_STORE;
  const sheet = () => w.document.getElementById('bfx-style').textContent;
  const ids = w.BFX_SITES.get('instagram').presets.map(r => r.id);
  const only = list => { const p = {}; ids.forEach(k => { p[k] = list.includes(k); }); return S.merge({ sites: { instagram: { presets: p } } }); };

  ok('instagram.com runs the Instagram rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'instagram');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('an ad goes: no time, an "Ad" label and a redirect link', by('a-ad') === 'sponsored', 'got ' + by('a-ad'));
  ok('an ad with a label in another language still goes: it has no time', by('a-ad-quiet') === 'sponsored', 'got ' + by('a-ad-quiet'));
  ok('a post still loading is left alone until it has a name in its header', shown('a-loading'));
  ok('recommended reels are hidden by default in the feed, with the Reels menu item', by('a-reel') === 'reels' && sheet().includes('a[href="/reels/"]:not(#bfx-z){display:none'), 'got ' + by('a-reel'));
  ok('ordinary and suggested posts stay by default', ['a-plain', 'a-suggested', 'a-video', 'a-kw'].every(shown));
  ok('the Messages badge goes, and the tab title count', by('badge') === 'badges' && w.document.title === 'Instagram');
  const ig = path => w.BFX_ENGINE.redirectFor(S.merge(null), { hostname: 'www.instagram.com', pathname: path });
  ok('with Reels on, the Reels tab sends you to the feed', ig('/reels/') === '/' && ig('/reels') === '/');
  ok('…but a single reel, from a message or a link, still opens', ig('/reels/CCC/') === null && ig('/reel/CCC/') === null && ig('/reels/audio/123/') === null);
  const dm = boot(html, 'https://www.instagram.com/direct/t/123/');
  dm.BFX_ENGINE.apply(dm.BFX_STORE.merge({ keywords: { enabled: true, terms: ['crypto'] } }));
  await frame();
  const dmHidden = Array.from(dm.document.querySelectorAll('article[data-bfx-hidden-by], article [data-bfx-hidden-by]'));
  ok('in messages nothing is hidden: a reel or a word someone sent you is yours to see', !dmHidden.length,
    dmHidden.map(e => e.id + ':' + e.getAttribute('data-bfx-hidden-by')).join());

  w.BFX_ENGINE.apply(only(['suggested']));
  await frame();
  ok('a text-only Follow button in the header marks a post from an account you don\'t follow',
    by('a-suggested') === 'suggested' && shown('a-plain') && shown('a-reel'));
  w.BFX_ENGINE.apply(only(['stories', 'rightSidebar']));
  await frame();
  ok('the stories tray and the right column go as whole blocks, the posts stay',
    by('stories') === 'stories' && by('right-column') === 'rightSidebar' && shown('posts'));
  const counts = (w.BFX_ENGINE.apply(S.merge(null)), await frame(), w.BFX_ENGINE.stats().presets);
  ok('the popup counts the two ads and the reel', counts.sponsored.count === 2 && counts.reels.count >= 1, JSON.stringify(counts));

  w.BFX_ENGINE.apply(S.merge({ keywords: { enabled: true, terms: ['crypto'] } }));
  await frame();
  ok('word blocks work on Instagram posts', by('a-kw') === 'keyword', 'got ' + by('a-kw'));

  const pick = w.BFX_PICKER.selectorFor($$('a-plain'));
  const hits = Array.from(w.document.querySelectorAll(pick.selector)).map(e => e.id);
  ok('picking a post means posts from that account, not posts mentioning it → ' + pick.author,
    pick.author === '@alice_example' && hits.join() === 'a-plain', hits.join());
  const save = w.BFX_PICKER.selectorFor(w.document.querySelector('#actions-plain svg[aria-label="Save"]').closest('[role="button"]'));
  ok('a button with only an icon is named by the icon: ' + save.selector, /:has\(svg\[aria-label="Save"\]\)/.test(save.selector));
}

/* ------------------------------------------------- twitch.tv, October 2026 -- */
console.log('\ntwitch.tv as of October 2026 (test/fixtures/twitch.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/twitch.html'), 'utf8');
  const w = boot(html, 'https://www.twitch.tv/');
  const $$ = id => w.document.getElementById(id);
  const by = id => $$(id) && $$(id).getAttribute('data-bfx-hidden-by');
  const S = w.BFX_STORE;
  const sheet = () => w.document.getElementById('bfx-style').textContent;

  ok('twitch.tv runs the Twitch rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'twitch');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('the front page ad and the display ad are hidden by default',
    sheet().includes('[data-a-target="frontpage-headliner"]:not(#bfx-z){display:none') && sheet().includes('[data-test-selector="sda-wrapper"]:not(#bfx-z){display:none'));
  ok('recommended channels go as their side nav group; followed channels stay',
    sheet().includes('[data-test-selector="side-nav"] [role="group"]:has([data-test-selector="recommended-channel"])') &&
    !sheet().includes('followed-channel'));
  ok('the tab title count is stripped', w.document.title === 'Twitch', w.document.title);

  w.BFX_ENGINE.apply(S.merge({ keywords: { enabled: true, terms: ['crypto', 'racing'] } }));
  await frame();
  ok('word blocks work on stream cards and side nav entries', by('card-kw') === 'keyword' && by('side-bob') === 'keyword' && !by('card-dana'),
    [by('card-kw'), by('side-bob'), by('card-dana')].join());

  const pick = w.BFX_PICKER.selectorFor($$('card-dana'));
  ok('picking a stream card means that channel, wherever it is listed → ' + pick.author, pick.author === 'dana_tv' && pick.valid);
  const side = w.BFX_PICKER.selectorFor($$('side-alice'));
  ok('…and a side nav entry too', side.author === 'alice_tv' && w.document.querySelectorAll(side.selector).length === 1);
  const title = w.BFX_PICKER.selectorFor(w.document.querySelector('[data-a-target="stream-title"]'));
  ok('the picker uses Twitch\'s own hooks: ' + title.selector, title.selector === '[data-a-target="stream-title"]');
  const line = w.BFX_PICKER.selectorFor($$('line'));
  ok('and its BEM classes, never generated ones: ' + line.selector, !/sc-|^[A-Za-z]{6}$/.test(line.selector));
}

/* --------------------------------------------- tiktok.com, October 2026 -- */
console.log('\ntiktok.com as of October 2026, signed out (test/fixtures/tiktok.html)');
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/tiktok.html'), 'utf8');
  const w = boot(html, 'https://www.tiktok.com/foryou');
  const $$ = id => w.document.getElementById(id);
  const S = w.BFX_STORE;
  const sheet = () => w.document.getElementById('bfx-style').textContent;
  ok('tiktok.com runs the TikTok rules', w.BFX_ENGINE.site && w.BFX_ENGINE.site.id === 'tiktok');
  w.BFX_ENGINE.apply(S.merge(null));
  await frame();
  ok('TikTok\'s own promotions are hidden by default', sheet().includes('[data-e2e="capcut-tag"]:not(#bfx-z){display:none') &&
    sheet().includes('[data-e2e="top-right-action-bar-get-coin"]:not(#bfx-z){display:none'));
  w.BFX_ENGINE.apply(S.merge({ keywords: { enabled: true, terms: ['crypto'] } }));
  await frame();
  ok('word blocks work on video descriptions', $$('v-kw').getAttribute('data-bfx-hidden-by') === 'keyword' && !$$('v-1').hasAttribute('data-bfx-hidden-by'));
  const pick = w.BFX_PICKER.selectorFor($$('v-1'));
  const hits = Array.from(w.document.querySelectorAll(pick.selector)).map(e => e.id);
  ok('picking a video means that account, not one whose name starts the same → ' + pick.author, pick.author === '@gina_example' && hits.join() === 'v-1', hits.join());
}

report();
function report() {
  console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : checks + ' checks passed'));
  process.exit(failures ? 1 : 0);
}

})();
