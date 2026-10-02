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
      <div data-pagelet="FeedUnit_5" role="article" id="u-ad2" data-h="300">
        <div data-ad-preview="message">Buy our thing</div>
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

const dom = new JSDOM(PAGE, {
  url: 'https://www.facebook.com/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;

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
  'src/common/presets.js',
  'src/common/storage.js',
  'src/content/engine.js',
  'src/content/picker.js'
]) {
  window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
}

const { BFX_PRESETS, BFX_STORE, BFX_ENGINE, BFX_PICKER } = window;

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
ok('hidden class is defined', css.includes('.bfx-hidden{display:none !important}'));
ok('preset selectors are emitted', css.includes('div[data-pagelet="Stories"]{display:none !important}'));
ok('effect rules keep their own CSS', css.includes('filter: blur(5px)'));
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
ok('an ordinary post survives', !$('u-ok').classList.contains('bfx-hidden'));
ok('unread badge is hidden', $('u-ad') && window.document.querySelector('[aria-label="Notifications"] span').classList.contains('bfx-hidden'));
ok('tab title count is stripped', window.document.title === 'Facebook', window.document.title);
ok('sidebar ad block is hidden', $('side-ad').closest('.bfx-hidden') !== null);

/* ---------------------------------------------------------------- ads -- */
console.log('\nads');
ok('ad markup is hidden by CSS alone, before any script runs',
  Array.from(window.document.querySelectorAll('div[data-pagelet^="FeedUnit"]:has([data-ad-preview])'))
    .some(el => el.id === 'u-ad2'));
ok('ad with no Sponsored text at all is caught', hiddenBy('u-ad2') === 'sponsored', 'got ' + hiddenBy('u-ad2'));
ok('paid partnership post is caught', hiddenBy('u-pp') === 'paidPartnership', 'got ' + hiddenBy('u-pp'));
ok('sponsored story is hidden', hiddenBy('story-2') === 'adSweep', 'got ' + hiddenBy('story-2'));
ok('the rest of the story tray survives',
  !$('story-1').classList.contains('bfx-hidden') && !$('tray').classList.contains('bfx-hidden'));
ok('sponsored marketplace tile is hidden', hiddenBy('mp-1') === 'adSweep', 'got ' + hiddenBy('mp-1'));
ok('the marketplace grid itself survives',
  !$('mp-grid').classList.contains('bfx-hidden') && !$('mp-2').classList.contains('bfx-hidden'));

/* With the feed rule off, the sweep is allowed into the feed instead. */
const sweepOnly = BFX_STORE.merge({
  enabled: true,
  presets: Object.assign(Object.fromEntries(BFX_PRESETS.map(r => [r.id, false])), { adSweep: true }),
  keywords: { enabled: false, terms: [] }
});
BFX_ENGINE.apply(sweepOnly);
await frame();
ok('sweep covers feed ads when the feed rule is off', hiddenBy('u-ad') === 'adSweep', 'got ' + hiddenBy('u-ad'));
ok('sweep leaves ordinary posts alone', !$('u-ok').classList.contains('bfx-hidden'));

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
const stuck = Array.from(window.document.querySelectorAll('.bfx-hidden'))
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
  window.document.querySelector('[aria-label="Notifications"] span').classList.contains('bfx-hidden'));

BFX_ENGINE.apply(BFX_STORE.merge({ enabled: false, presets: { stories: true } }));
ok('master switch empties the sheet',
  !window.document.getElementById('bfx-style').textContent.includes('Stories'));

/* ------------------------------------------------------------ picker -- */
console.log('\npicker selector generation');
function check(label, el, expect) {
  const built = BFX_PICKER.selectorFor(el);
  const list = window.document.querySelectorAll(built.selector);
  ok(label + ' → ' + built.selector,
    built.valid && Array.prototype.includes.call(list, el) && (!expect || expect.test(built.selector)),
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

report();
function report() {
  console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : checks + ' checks passed'));
  process.exit(failures ? 1 : 0);
}

})();
