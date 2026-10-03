# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BlockDistractXrn (formerly BlockFB) is a Manifest V3 Chrome/Edge extension that hides the distracting parts of social sites: presets, a point-and-click picker and keyword blocks. Facebook, Reddit, X, LinkedIn, Instagram and Twitch are done, one rule pack per site. TikTok has a pack for what could be mapped signed out; its ads still need measuring on a signed-in feed. There is no build step, no bundler, and no runtime dependencies. `jsdom` and `puppeteer-core` are only used by the tests. `main` holds the last Facebook-only release; multi-site work is on the `multi-site` branch. Internal names keep the old `bfx` prefix (storage key `bfx`, `data-bfx-*` attributes, `BFX_*` globals); renaming them would reset users' settings.

## Commands

- `npm test`: runs `test/smoke.js` (jsdom, fast). It has no runner or filtering. Each check prints ✓/✗ and the process exits 1 on any failure. To focus on one area, temporarily comment out sections of `main()`. Sections share DOM and engine state, so a section that applies its own settings must re-apply `everything` before the next section relies on it.
- `npm run test:browser`: runs `test/browser.js`, which loads the unpacked extension into Chrome for Testing headlessly. It serves `test/fixtures/feed.html` at `https://www.facebook.com/` through request interception, so content scripts inject for real. It changes settings through the service worker (`sw.evaluate('self.BFX_STORE.update(...)')`) and also drives the popup and options pages. Chrome comes from `CHROME_PATH` or the Playwright/Puppeteer cache. Branded Chrome won't load unpacked extensions from the command line. Run it after touching selectors, CSS, or anything in the popup or options page.
- `npm run zip`: builds `blockdistractxrn.zip` (manifest, icons, src) for the Web Store.
- Manual testing: `chrome://extensions` → Developer mode → **Load unpacked** → this folder. After editing content scripts, reload the extension and then reload the site's tab, because content scripts are injected only at page load.

## Module system (no imports)

Every file in `src/` is an ES5 IIFE that attaches a global to `self`: `BFX_SITES` (common/sites.js, the site list and pack registry), the site packs (`src/sites/<id>.js`, which call `BFX_SITES.register`), `BFX_STORE` (storage.js), `BFX_ENGINE` (engine.js) and `BFX_PICKER` (picker.js). Later files read earlier globals, so **load order matters**: `sites.js` → every `src/sites/*.js` → `storage.js` → engine → picker → main. It is declared in five places that must stay in sync when you add or rename a file, **including every new site pack**:

1. `manifest.json` → `content_scripts[0].js` (and its `matches` plus `host_permissions` for a new site's hosts)
2. `src/popup/popup.html` `<script>` tags (sites + packs + storage)
3. `src/options/options.html` `<script>` tags (sites + packs + storage)
4. `src/background/service-worker.js` `importScripts` (sites + storage only; it has no `document` and no packs)
5. `test/smoke.js` `boot()` eval list (all content scripts except `main.js`)

Match the existing style in `src/`: `var`, function expressions, `'use strict'`, no arrow functions, and comments that explain *why*.

## State and data flow

- All settings live under **one key, `bfx`, in `chrome.storage.local`** (`src/common/storage.js`). Shape: `{ enabled, placeholders, keywords: { enabled, terms }, sites: { <siteId>: { enabled, presets: {id: bool}, custom: [rule] } } }`. The pause switch, "show" bars and word list are shared by every site; switches and picked rules belong to one site. A custom rule is `{ id, selector, label, scope: 'all'|'path', path, enabled, createdAt }`.
- `merge()` builds a full state, with a slot for every site in `BFX_SITES.list`. Old single-site settings (top-level `presets`/`custom`) move into `sites.facebook`. Each site's default-on presets come from its pack (`on: true` on the preset), so turning one off must be stored as an explicit `false`. In the service worker no pack is loaded, so `merge()` there adds no defaults and keeps stored switches as they are.
- `store.view(state, siteId)` is what a page runs on: the shared settings plus that site's `presets`/`custom`. Its `enabled` is false when everything is paused or that site is switched off. The engine only ever sees a view. Writers use `store.site(state, id)` to reach a site's slot inside `update()`.
- Write with `store.update(fn)` (read-modify-write), never `store.set()` of a copy held in a page. The popup routes every write through `mutate()` for this reason and re-renders on `store.onChange`. The `Alt+Shift+B` shortcut and other windows write while the popup is open.
- Backups go through `store.toBackup()`/`store.fromBackup()`: `app: 'BlockDistractXrn'`, `version: 2`. `fromBackup` rebuilds the state field by field. It drops picked rules whose selector fails `store.validSelector()` and drops sites that don't exist. It still accepts old `app: 'BlockFB'` single-site files, which restore into Facebook.
- Settings changes do **not** use messaging. The popup or service worker writes to storage, and `storage.onChanged` → `engine.apply(state)` in every open tab. Runtime messages (`bfx:pick`, `bfx:stopPick`, `bfx:status`, `bfx:rescan`, handled in `src/content/main.js`) are only for actions and querying tab status. `bfx:status` returns `engine.stats()`: per-rule match counts that the popup shows as "3 here", "none here" or "broken".
- Every supported site is an SPA. `main.js` polls `location.pathname` once a second and calls `engine.refresh()` so path-scoped custom rules update. It also calls `guardRoute()`: `engine.redirectFor(fullState, location)` asks the site pack's `redirect(view, loc)`, e.g. Facebook sends `/reel(s)/` home when the Reels preset is on. Patching `history.pushState` would not work because content scripts run in an isolated world. On a host with no pack, `engine.site` is null and `main.js` exits immediately.

## Site packs (`src/sites/<id>.js`)

A pack calls `BFX_SITES.register({...})` with:
- `id`, matching an entry in `BFX_SITES.list` (hostnames live there).
- `units`: the selector for one post or feed unit.
- `presets`: the switches, schema below. Shared ones come from `BFX_SITES.common` (`blackWhite()`, `blur(postSelector)`, `noAutoplay(group, desc)`).
- `heuristics` (per-unit, keyed by `js.kind`, called as `fn(unit, rule.js, ctx, api)`) and `globals` (keyed by preset id, called as `fn(api)`).
- Optional:
  - `silent`: preset ids that leave no "show" bar.
  - `body`: a selector for the post's own text, cut out of `headText`.
  - `unseen`: extra subtrees `readableText` skips.
  - `cardStop`: what `cardFor` must not swallow more than one of.
  - `skip(unit)`: units not to judge.
  - `redirect(view, loc)`.
  - `videoHosts`: elements that keep their `<video>` in an open shadow root (Reddit's `shreddit-player`). "play" never leaves a shadow root, so the autoplay switch listens inside these too.
  - `picker.authorOf(post, cssString)`: what picking a whole post means (posts from this author or community).
  - `picker.classes: false`: never use classes. Set it for sites styled with utility classes (Reddit's `block`, `relative`), which say how a thing looks, not what it is. Or a RegExp of the classes to trust (Twitch's BEM classes, never its generated ones).
  - `picker.attrs: [names]`: hook attributes the picker may use (Twitch's `data-a-target`, `data-test-selector`).
  - `picker.keys: { tag: attribute }`: generic wrapper elements and the attribute that tells one use from another (`faceplate-partial` → `name`). A trailing `_hash` in the value becomes a `^=` prefix.
  - `picker.generic`: a regex of custom tags that mean nothing alone (`faceplate-number`). Every other custom tag, and `host > [slot="…"]` for a slotted part, is a "semantic" candidate the picker may use however many elements it matches.

`api` (built in engine.js) gives packs `hide`, `HIDDEN`, `state()`, `generation()`, `firstLook`, `visibleText`, `readableText`, `headText`, `looksSponsored`, `referencedText`, `cardFor`, `climbTo`, `blockOf(mark, others, stop)` (one block of a column whose blocks have no hooks), `stripTitleCount`, `feedText`, `AD_WORD`, `AD_LABEL` and `INVISIBLE_CHARS`. Don't reach into engine internals from a pack.

Adding a site:
1. Write the pack, following the live-check method below. Detection must come from measuring the logged-in site, never guessing.
2. Add it to the five load-order places and the manifest.
3. Add a fixture `test/fixtures/<id>.html` copied from the live structure with made-up text, plus jsdom and real-Chrome checks.
4. Write `test/live/probes/<id>.js` and verify live with `node test/live/check.js <id>` (ads stay hidden while scrolling and hovering, every switch on its own, risky combinations) and `node test/live/popup.js <id>`. Then update the README's Sites table and known limits, and this file's "What identifies things" paragraph for the site.

## Engine (`src/content/engine.js`)

Elements are hidden in two ways:

1. **One `<style id="bfx-style">`** built from preset `css` selectors, preset `style` blocks, and custom-rule selectors. Each selector is emitted as its own rule, so one invalid selector cannot break the rest of the sheet. The sheet is injected at `document_start` to prevent a flash of hidden content.
2. **A rAF-debounced `MutationObserver`** for heuristics that CSS can't express. It only runs when `needsObserver()` says a rule requires it.

How `apply()` works:
- It bumps `generation`, rebuilds the sheet, and calls `unhideAll()`, so turning a rule off takes effect immediately.
- Every hide rule ends in `:not(#bfx-z)` (`BOOST`, via `boosted()`, which wraps a selector list in `:is()`): one id's worth of specificity that never changes what matches. Twitch sets `display: … !important` at the same specificity later in the cascade, which beat the plain rules. The "show" bar rules carry two (`BOOST2`) so they still win over the rule that hid their post. Tests that look for sheet text must include the suffix.
- Elements hidden by JS get **only attributes, never classes**: `data-bfx-hidden-by="<ruleId|keyword>"`, and the sheet's first rule is `[data-bfx-hidden-by]{display:none !important}`. React rewrites `className` whenever it re-renders an element (hover, scroll, new data). When hiding used a class, that silently un-hid ads on the live site; attributes React didn't set survive. The picker's page marker is `data-bfx-picking` for the same reason. Don't reintroduce class-based markers.
- `hide()` also records the element in `hiddenEls`. On every scan, `reassert()` puts back any marker that was stripped from a still-connected element, and `ensureStyle()` re-inserts `#bfx-style` if the page dropped it. The tests and `stats()` rely on the attribute.
- The sheet's second built-in rule hides an `<hr>` right after a hidden unit (Reddit divides posts with one), except after a unit showing a "show" bar.
- Presets with `shadow: [{ host, css }]` style inside open shadow roots, where the page sheet can't reach (Reddit's counts and vote bar). `styleShadowRoots()` keeps one `<style data-bfx>` per matching host, rewritten on `apply()` and checked on every scan for new or re-rendered hosts. Shadow rules alone keep the observer running.
- `stats()` counts every preset that hides something: CSS, a heuristic, or a global keyed by its id (X's `composer` is global-only). Presets marked `behavior: true` are left out, including pack ones that act rather than hide (X's `following`).
- `stats()` counts what a person would have seen (`countSeen`/`hasContent`): no empty slots (Reddit keeps empty recommendation loaders on every post, some with a shadow root holding only a wrapper and a `<slot>`), no `<hr>`, and no match nested inside another match of the same rule.
- With `placeholders` on, per-unit hides (except the ids in `SILENT`) also get a `data-bfx-note`. The placeholder CSS in `buildCss` turns these into a clickable bar. Clicking one sets `data-bfx-revealed`, and the scan skips that unit and everything inside it for the rest of the page's life.
- Each element is judged at most once per generation, using the `__bfxGen` / `__bfxAdGen` / `__bfxSideGen` / `__bfxBarGen` expandos. `firstLook()` doesn't stamp a label while its text is still empty, because Facebook fills text in a frame later.

Live Facebook renders posts in pieces and virtualizes the feed, so a verdict about a unit (`UNIT_SELECTOR`, mainly `div[aria-posinset]`) only lasts until its content changes:
- An empty unit (no `textContent`, i.e. a virtualized shell) isn't stamped. It gets judged once it fills.
- The observer also watches `aria-labelledby` attribute changes, because Facebook attaches an ad's label late, and `characterData`, because text can be written into a node that was already there (a LinkedIn ad's "Promoted" filled into its empty time slot); a text change is filed under its parent element. `unitOf()` caches an element's unit only while the element is connected: a detached element may be put into a post later. `onMutations` collects targets into `dirty` (childList) and `relabelled` (attributes). On each scan, `invalidateChanged()` maps targets to units through the `__bfxUnit` cache. It re-judges a unit whose `textContent.length` changed, and always re-judges a relabelled unit. Group the targets by unit before doing any per-unit work: Facebook makes thousands of changes per frame.
- A heuristic missing information calls `ctx.unsure()`. The unit then stays unstamped and is retried for up to `MAX_TRIES` scans.
- Word blocks match `readableText()`, which leaves out `UNSEEN` subtrees: `aria-hidden` decoys (every post holds about 33 hidden "Facebook" spans), `svg` titles ("Shared with Public"), and `data-visualcompletion="ignore"` (the online dot's "Active"). Matching raw `textContent` would let "Facebook" or "public" hide every post.
- Units are skipped when they are inside a hidden or revealed unit, nested in a `role="article"` (comments, quoted shares), or inside `role="dialog"` (a post the user opened).

Heuristics come in two kinds, wired differently:
- **Per-feed-unit**: the preset's `js.kind` must be a key in `HEURISTICS` (`sponsored`, `suggested`, `recommendations`, `reels`, `feedText`). Presets whose kind isn't in `HEURISTICS` are silently filtered out of `jsRules`. `feedText` matches only `headText()`: the start of the unit with the message body (`data-ad-preview="message"`) and nested articles cut out. Its `phrases` are keyed by language, and all languages are tried at once.
- **Global**: `badges`, `rightAds`, `adSweep`, `postActions`, `feed`. These are keyed by **preset id**, not by kind. A new global heuristic must be added to both `GLOBAL_JS` and `runGlobalHeuristics()`.

What identifies things on live Facebook, implemented in `src/sites/facebook.js` (verified October 2026; re-verify before "fixing" any of it). Each new site gets its own paragraph like this:
- **Ads**: in the post header, a link whose **entire** text is a word joiner (U+2060), checked by `isAdSlot`/`hasAdJoiner` and present from first render. Facebook draws the visible "Ad" over that slot from another element, so the label never exists as text in the post. A link that merely *starts* with a joiner (check-ins, pasted text) is not an ad; this was seen in search results. The fallback is an `a [aria-labelledby]` whose referenced element reads exactly "Ad" (`referencedText`/`AD_LABEL`). Facebook now rarely attaches that reference, so don't rely on it. `sweepAds` uses the same slot test outside the feed (Watch, search and Marketplace, where tiles also show a visible "Ad"). It keeps a per-label verdict and re-checks known ad labels every scan, in case the card around them is rebuilt. Issue ads still show a visible "Sponsored". **Never use `data-ad-preview`, `data-ad-comet-preview` or `data-ad-rendering-role` as ad signals.** They are on every post; use them only as structure (e.g. `like_button`/`comment_button` markers for the action bar and counts).
- **Suggested posts**: a `[role="button"]` (Follow/Join) inside the unit's *first* `h4` (the title). A shared page post has its own Follow button further down, so don't look past the first `h4`.
- **Recommendation carousels** (people you may know, group suggestions): a unit with no `h4` whose buttons repeat the same text. Count only text with letters, and ignore buttons inside comments. The Reels shelf has the same shape and is excluded via `/reel/` links. Facebook obfuscates the label with shuffled spans and hidden decoy letters, so `FUZZY` is a loose prefilter and `visibleText()`/`isVisible()` make the final call. `cardFor()` climbs from a label to the card-sized ancestor and must never hide a whole surface (feed, main, Stories tray, Marketplace grid).

What identifies things on live Reddit, in `src/sites/reddit.js` (verified October 2026, signed in):
- The feed is `shreddit-feed`; a post is `shreddit-feed > article` holding a `shreddit-post` whose attributes describe it (`subreddit-prefixed-name`, `post-type`, `nsfw`, `is-subscribed`, `view-context`, `permalink`, `comment-count`), followed by an `<hr>`.
- **Ads** are their own elements, in every language: `shreddit-ad-post[promoted]` straight in the feed, `shreddit-sidebar-ad` (inside `shreddit-async-loader[bundlename="sidebar_ad"]`), and on a post's page `shreddit-comments-page-ad` and `shreddit-comment-tree-ad`. Not every post page carries them; the live check looks at two.
- **Recommended posts**: signed in, posts from joined communities carry `is-subscribed`, rendered by the server. On Home (`/`, `/best`, `/hot`, `/new`, `/top`, `/rising`) a post without it was picked by Reddit. `recommendation-source="subscribed_personalized_sort"` is on joined-community posts too, so it is not a signal. On the test account every Home post was joined, so this was never seen hiding live.
- Votes, comment counts and the vote/share bar are inside `shreddit-post`'s open shadow root (`rpl-action-bar`, which is `display: contents`, holding `faceplate-number`s); comment scores are inside `shreddit-comment-action-row`'s. No `::part` is exposed, hence `shadow` presets.
- The left menu's sections are `details` whose `summary[aria-controls]` names them (`games_section`, `communities_section` …) whatever the language, inside `faceplate-expandable-section-helper`. Top bar parts are named elements (`reddit-search-large`, `create-post-entry-point-wrapper`, `reddit-chat-header-button`, `advertise-button`, `dynamic-badge`).
- Videos sit inside `shreddit-player`'s shadow root (`videoHosts`); without that, the autoplay switch never heard them start.
- Wrappers like `faceplate-partial`/`faceplate-loader` (`name="RecentPosts_x7Yz"`, hash per build) are everywhere; select them by a `name^=` prefix.

What identifies things on live X, in `src/sites/x.js` (verified October 2026, signed in). Classes are generated (`css-175oi2r`, `r-1awozwy`); `data-testid`s survive builds and languages:
- Every timeline row is `[data-testid="cellInnerDiv"]` (the unit), posts or not; a post is `article[data-testid="tweet"]`. The list is virtualized and positions rows absolutely, but it re-measures, so a hidden row leaves no gap (checked live). React keys each row to one entry, so a row is never reused for another post.
- **Ads**: a `placementTracking` box whose first children are four impression pixels (`top-`/`right-`/`bottom-`/`left-impression-pixel`), with the post inside. Ordinary posts have `placementTracking` only around videos, without pixels. Ad links carry `twclid=`. The same structure appears in reply threads. The JS fallback is an "Ad" label (`AD_LABEL`) in the post outside the text and author line.
- **Right column**: blocks under one container: search (`form[role="search"]`), Premium (`a[href^="/i/premium_sign_up"]`), Today's News (`news_sidebar`), trends (`trend`), who to follow (`UserCell`), footer (`nav`). Labels like "Who to follow" are English-only `aria-label`s, so `sidebarBlock()` uses `api.blockOf()` to climb from a block's mark to the largest box that holds no other block's mark.
- **Promoted trend**: a `trend` with a second icon (path `M19.498 3h-15c-1.381…`) besides the caret. **Repost**: `socialContext` with the repost arrow (path `M4.75 3.79l4.603 4.3…`) in its line. That arrow is **not** the same drawing as the repost button's (`M4.5 3.88…`), so don't compare the two.
- **Opened post** on `/status/<id>`: the row whose `time` link ends in `/status/<id>`. It leaves the DOM once scrolled far away, so `belowOpened()` remembers its page position.
- A post's own author line is the first `User-Name` not inside a `[role="link"]` box; a quoted post's always is. The unread badge is the only `div[aria-label]` inside a menu link (`header nav a div[aria-label]`).
- `following` clicks the second tab (`[role="tablist"] [role="tab"]`), once per arrival on `/home`. X remembers the tab for the account: live checks exclude it from "everything on" (`skipInAllOn` in the probe file) and put the person's tab back afterwards.

What identifies things on live LinkedIn, in `src/sites/linkedin.js` (verified October 2026, signed in). Classes are generated, `componentkey`s are random per render (except `feedRightNavGamesComponentRef`), and labels are English-only:
- The feed is `[data-testid="mainFeed"]`; each child is one lazily mounted item (the unit). Items are **`display: contents`** around a grid holding one `role="listitem"`: `display: none` still hides them, but `checkVisibility()` is always false for them (probe the listitem) and a filter on them does nothing (blur targets the listitem).
- A post is the children of the box holding its screen-reader `h2` ("Feed post"); the h2 is there in every language. Icons carry design-system tokens (`svg[data-token-id]`): 383 the post's "…" menu, 206 its ✕, 289 Like, 380 reactions menu, 202 Comment, 255 Repost, 86 the Follow "+".
- The section with the menu (383) is the author's header, **unless** it is followed by an `hr` and a block with an `a figure`: then it is an activity line ("IBM commented", "X likes this", "Followed by X", holding the reactor's picture and the menu) and that block is the header. `headerOf()`/`authorAfter()`.
- **Ads** print "Promoted" where other posts print the time. Nothing language-free was found (attributes, links and icons were diffed against organic posts); ads usually lack the ✕ (206), but so does the occasional organic post, so that is not used. `li_fat_id=` on outbound links and the "View Sponsored Content" label catch some ads by CSS.
- Both rails are `aside`s inside `main`. Their blocks are told apart by links with `api.blockOf()`: profile (`/in/`), Premium (`/premium/`), stats (`/me/profile-views`, `/analytics/`), shortcuts (`/my-items/`, `/groups/`, `/events/`), news (`/news/story/`), games, footer.
- The section switches (`postActions`, `counts`, `media`) are plain CSS on `h2 ~ div` sections (`SECTION`), recognised by what they hold; an event's picture is a section of its own that is a link (`h2 ~ a:has(> figure img)`); where text and picture share a section (ads, link posts), `media` takes the picture's own link (`a:has(> figure img)`) or the video's box at any depth, outside the text and comment lists. Don't key it on "any box with a picture": that makes every div on the page a `:has()` candidate. Earlier JS versions cost 300–600 ms per 8 scrolls with everything on. The rail globals look at an aside again only when its text length or the generation changed (`changed()`).
- LinkedIn scrolls an inner container, so `window.scrollY` stays 0; `page.mouse.wheel` still loads more posts.

What identifies things on live Instagram, in `src/sites/instagram.js` (verified October 2026, signed in, home feed only). Generated classes, no test ids, `aria-label`s in the reader's language:
- A post is an `article` (the unit): a header row, the media, then the action bar (the first `section`), the "Liked by" line (the second) and the caption.
- **Ads** are the only posts with no `time` element; they print "Ad" there instead. Most also link through `facebook.com/ads/ig_redirect/`. A post still loading has no time either, so the rule waits (`ctx.unsure()`) until the header has a profile link and the post has an image or video. Live: 2 ads hidden and none of 14 organic posts.
- The header row is the smallest box around the post's first icon button (the "…") that also holds the avatar, whose story ring is a `canvas`. Not the button's parent: it sits in its own wrapper. A **Follow** button there is text only (no `svg`, `canvas` or `img`).
- **Reels** posts link to `/reels/<id>/` (not `/reels/audio/`). The pack's `redirect` sends `/reel(s)/<id>` home when Reels is on. With every switch on the feed is empty, and Instagram stops loading rather than fetching forever (checked: no new requests in 20 idle seconds).
- The stories tray (a `ul` with `canvas` rings) and the right column (holds `/explore/people/`) sit beside the feed with no hooks; `api.blockOf(mark, 'article', main)` finds each.

What identifies things on live Twitch, in `src/sites/twitch.js` (verified October 2026, signed in). Styled-components classes are generated (`Layout-sc-1xcs6mc-0`, `cZjbEG`); Twitch's own hooks are `data-a-target`, `data-test-selector` and BEM classes (`chat-line__message`, `channel-root__right-column`):
- The front page's ad is `[data-a-target="frontpage-headliner"]` (aria-label "Advertisement") inside the featured carousel. During an ad break a display ad sits beside the player (`[data-test-selector="sda-wrapper"]`). Video ads are stitched into the stream (`video-ad-label`, `video-ad-countdown`); nothing on the page can hide them.
- Side nav sections are `role="group"`s, told apart by their entries: `a[data-test-selector="followed-channel"]`, `recommended-channel`, `similarity-channel`. Each entry is itself the channel's link.
- Stream cards in the directory and on the front page are `article`s; with the side nav entries they are the units, so word blocks match titles, games and tags.
- `community-points-summary` set its own `display: … !important`, which is why hide rules carry `BOOST`.

What identifies things on TikTok, in `src/sites/tiktok.js` (mapped **signed out**, October 2026). Hooks are `data-e2e` attributes:
- A For You video is `article[data-e2e="recommend-list-item-container"]` (the unit) with `feed-video`, `video-author-avatar`, `feed-follow`, `video-desc`, `video-music` and the side buttons' counts (`like-count`, `comment-count`, `favorite-count`, `share-count`). TikTok's own promotions: `capcut-tag`, `top-right-action-bar-get-coin`.
- Signed out, a login prompt (`login-modal`) stops the feed after a few videos and no ads came up, so there is no ad rule. Measure ads signed in before adding one; don't write one from TikTok's label alone.
- `noAutoplay` works here (checked live): For You's videos stay paused until clicked.

## Selector rules

Facebook's class names (`x1n2onr6`) and React ids (`:r7:`) change with every build. Never use them in presets or picker output. Use only `data-pagelet`, `data-visualcompletion`, `data-testid`, `role`, `aria-label`, and short `href` prefixes. The picker (`src/content/picker.js`) filters generated classes and ids with `GENERATED_CLASS`/`GENERATED_ID`. That includes Facebook's `html-div`/`html-h3` classes, which are on nearly every element. It never uses BlockFB's own `bfx-*` classes or `data-visualcompletion`, whose values are shared by hundreds of elements. Picking a whole post (`[aria-posinset]`) produces `authorOf()`: a "posts from this author" rule keyed on the first title link's href up to its query string. When an element has no stable attribute of its own, the picker anchors to the nearest ancestor that has one and adds an `nth-child` tail. `swallowsFeed()` keeps picks made outside the posts out of them: it rejects a selector that also matches a box holding posts (X's trends list and timeline are both `section[role="region"]`), or anything inside a post unless the selector is semantic (Instagram's stories tray and a post's photo carousel share a shape). A button with no hooks but one labelled icon is named by it (`div[role="button"]:has(svg[aria-label="Save"])`); image alt text is never used, since it is content such as someone's name. An `aria-label` longer than 40 characters or holding a time is content too (Twitch's "Sent at 16:53, sam: hello") and is skipped.

Chrome rejects `:has()` nested inside `:has()`, but jsdom accepts it. Only `npm run test:browser` catches that, which is why "smallest box containing both X and Y" rules (like `postActions`) are JS heuristics. Custom selectors pass `store.validSelector()` before they reach the stylesheet, because one that doesn't parse could close its rule and inject CSS.

Preset schema (in each `src/sites/<id>.js`): `{ id, group, label, desc, on?: true, css?: [selectors], style?: rawCss, shadow?: [{ host, css }], js?: { kind, ...params }, behavior?: true }`. A preset may also be implemented by a pack global with the same id. `on` marks a switch that is on by default. `behavior` marks a switch the engine implements directly by preset id (`noAutoplay` pauses videos started without a recent pointerdown or Enter/Space). Like effect-only presets, it has no count in `stats()`. Popup groups come from the order of `group` values. The README states each site's preset count and default-on count (Facebook 34 and 7, Reddit 23 and 6, X 24 and 5, LinkedIn 19 and 3, Instagram 13 and 3, Twitch 14 and 4, TikTok 7 and 1). Update those numbers when you add presets.

## Test harness quirks

- jsdom has no layout, so `getBoundingClientRect` is mocked: width comes from text length, and **height comes from the fixture's `data-h` attribute** (default 24). Size-dependent logic (`cardFor`'s 90px and 85%-viewport thresholds, the badge 40px cap) needs `data-h` set on fixture elements.
- jsdom's `:has()` support differs from Chrome's in both directions. The smoke test only *reports* selectors jsdom can't parse; the browser test asserts that Chrome parses all of them.
- `test/fixtures/feed.html` is the current Facebook structure, copied from the live site with made-up text. Both suites load it: the smoke test's last section via `boot()`, and the browser test as the page served at facebook.com. Boxes carry inline sizes for Chrome and `data-h` for jsdom. The smoke test's inline `PAGE` is the older markup (`role="feed"`, `data-pagelet`), kept so the legacy hooks stay working. `test/fixtures/snapshots/*.html` are the user's saved Facebook pages. They are gitignored, served with `<script>` tags stripped, and checked only for "ad rules don't hide most of the feed".
- `test/fixtures/reddit.html` uses declarative shadow roots (`<template shadowrootmode>`). Chrome attaches them at parse time; jsdom doesn't, so the smoke test's `withShadows()` attaches them by hand. The browser test serves this file at reddit.com.
- In the browser test, a page left behind other tabs (the popup and options checks) gets no animation frames, so the rAF-debounced scan never runs. Call `page.bringToFront()` before a section that waits on JS hiding.
- The smoke test does not load `main.js`, the popup, or the service worker. `chrome.*` is a minimal stub whose `onChanged` never fires, so tests call `BFX_ENGINE.apply()` directly and wait about one frame.

## Checking against live sites

`test/live/lib.js` has the helpers this needs: connect, open a work tab in a background window (`workTab`, so probes never steal focus from the person), restore a minimized window, evaluate in the content-script world, save and restore the person's settings, reload the extension, trusted scrolling, and per-site sign-in checks. Scripts beside it:
- `node test/live/status.js`: which sites the test window is signed into.
- `node test/live/check.js <site> [ads,switches,truth,pairs,flows,combos]`, with `ONLY=id,id` to limit the switch part: the full live check, driven by `test/live/probes/<site>.js` (where each switch's targets are, as function sources run in the page). Parts:
  - `switches`: each switch alone hides its targets and gives them back, and nothing else goes: no post (unless the probe marks the switch `posts: true` and the post holds one of its targets) and no `landmarks`. Only targets visible before the switch went on are judged, because sites keep some of their own elements hidden. A switch with nothing to act on is retried further down and on the probe's `retry` pages, then listed as untested, never silently passed. `noAutoplay` gets an autoplay probe: videos that start on their own (shadow roots included) and a video started from script without a click, paused only with the switch on.
  - `truth`: the probe's ad switches alone, with ads and ordinary posts classified independently of the extension (`truth.ads`, `truth.organic`): no ad left visible, no ordinary post hidden.
  - `pairs`: switches whose targets overlap or nest (`pairs` in the probe), on together, then off in either order; each must give back only its own part. Two switches hiding the very same element cover each other.
  - `flows`: a "show" bar clicked open stays open through scrolling and a settings change (`reveal.words`); clicking through the site (`nav`, selectors or function sources for links inside shadow roots); the picker opened and cancelled with Esc over everything-on; a picked rule over a switch (`custom`), including path scope; regex, broken and blank word blocks.
  - `combos`: everything on (one stylesheet, the page still usable via `alwaysThere`, extension script time from a CPU profile rather than the page's long tasks: Reddit spends about 300 ms rendering each batch of posts with every rule off), pause and resume, site off, rapid flips, page errors.
- The person's settings are kept on disk (`test/live/.saved-settings.json`, gitignored) while a check runs, by `guardSettings()`; a run that finds a copy left by one that died puts it back first. A watchdog stops a run that is stuck on one step for six minutes and names the step.
- `node test/live/x-following.js`: X's "Open Home on Following" (it clicks the tab, which X remembers, so the tab is put back) and verified replies down a scrolled thread.
- `node test/live/popup.js <site>`: the real popup against a live tab. Its `popup` probe should be something always on the page and off by default (Instagram's stories tray only exists while someone you follow has a story).
- Effect checks move the mouse to a corner first: blur lifts on the hovered post, which once made a working blur look broken.
- `[EACH=1] node test/live/inspect.js <url> <snippet file> [scrolls]`: run a read-only snippet in the page, after every scroll with `EACH=1` (feeds drop posts that scroll away).
- `node test/live/survey.js`: a structure survey of a page (custom elements, shadow hosts, test ids, aria labels, ad markers).
Put new probes beside them rather than in a temp folder, which can be wiped mid-session.

Fixtures only prove the code matches the fixtures. When rules "don't work", measure the real site before changing anything. Check that hidden things *stay* hidden while scrolling and hovering, not just that they get hidden: the class-wipe bypass only showed up over time. This is what worked:
- Launch Chrome for Testing headed with `--user-data-dir=<scratch dir> --remote-debugging-port=9333 --load-extension=<repo> --disable-extensions-except=<repo>`. The user logs in themselves; never handle credentials. Then drive it with `puppeteer.connect({ browserURL })`.
- Facebook ignores synthetic `window.scrollBy` for loading more posts; use `page.mouse.wheel`. A minimized window renders nothing and ignores input; restore it via `Browser.setWindowBounds`.
- Reload the unpacked extension from a `chrome://extensions` tab with `chrome.management.setEnabled(id, false)` then `true` (`reloadExtension()`). That re-reads scripts but **not `manifest.json`**: after a manifest change (a new site's matches, a new content script) close the test browser and relaunch it with the same `--user-data-dir`; sign-ins are persistent cookies and survive. `chrome.runtime.reload()` and `developerPrivate.reload` leave a command-line-loaded extension disabled (the latter also hung).
- To test the popup against a live tab, open `popup.html` with `chrome.tabs.create({ active: false })` in Facebook's window. Its `tabs.query({ active: true, currentWindow: true })` then returns the Facebook tab. `chrome.action.openPopup()` needs OS window focus, which Wayland refuses. The service worker sleeps and may not be there to evaluate in, so `popup.js` calls `chrome.tabs.create` from an extension page (options.html) instead. `Browser.getWindowForTarget`'s window id works as the `windowId`.
- To call `BFX_ENGINE`/`BFX_STORE` in the page, find the content script's execution context via CDP `Runtime.executionContextCreated` (name contains "BlockDistractXrn") and evaluate there (`contentWorld()`).
- `checkVisibility()` is false for `display: contents` elements (Reddit's `rpl-action-bar`) and for slotted children with no matching slot; probe the children instead.
- Classify posts independently of the engine (joiner slot/label → ad, button in first `h4` → suggested), then compare with `data-bfx-hidden-by`. For a visual ground truth, element-screenshot each visible post's header block (`h4` up to the block holding the "·" line). Page-coordinate clips are off by the scroll position.
- The test window may carry the user's own settings: save `BFX_STORE.get()` before a live test and `BFX_STORE.set()` it back afterwards, never reset to defaults.
- Probe pitfalls: below about 1100 px of window width Facebook hides the left sidebar itself. The grey/blur effects switch off while the mouse hovers a post. The story viewer ignored automated Next clicks and arrow keys, so story ads stay untested. Don't open chat windows (that marks messages seen), and don't keep personal data outside the scratch profile.

## Other notes

- Hostnames live in `src/common/sites.js` (`forHost`/`forUrl`, used by the engine, popup and service worker) and again in `manifest.json` (`host_permissions` and the content script's `matches`).
- Firefox support would only need `background.service_worker` changed to `background.scripts`.
