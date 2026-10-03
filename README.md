# BlockDistractXrn

A Chrome/Edge extension that makes the distracting parts of social sites
opt-in. Flip off what you don't want — ads, suggested posts, Reels, sidebars,
counts, red badges — or turn on the picker and click anything else to make it
go away. (It started life as BlockFB, for Facebook only.)

Nothing leaves your browser: no network requests, no analytics, no accounts.

## Sites

| site | status |
| --- | --- |
| Facebook | done — checked against the live site, October 2026 |
| Reddit | done — checked against the live site, October 2026 |
| X | done — checked against the live site, October 2026 |
| LinkedIn | done — checked against the live site, October 2026 |
| Instagram | done — checked against the live site, October 2026 |
| TikTok, Twitch | being added, one at a time |

Each site has its own switches and picked rules, and can be switched off on
its own from the popup. The pause switch, the word list and the "show" bars
are shared by every site.

## Install (unpacked)

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Open a supported site. Already-open tabs need one reload, because the
   content script is injected at page load.

`npm run zip` packs a `blockdistractxrn.zip` for the Web Store or for sharing.

## Using it

The popup opens on the site of the tab you are on (a green dot marks it);
the row of site buttons switches between sites' settings.

**Blocks tab** — on Facebook, 34 ready-made switches grouped by where they live (Ads, Feed,
Inside posts, Sidebars, Top bar, Chat, Effects). Seven are on by default: the
three ad rules, suggested posts, "people you may know", Reels, and the red
unread badges. Changes apply instantly in every open Facebook tab, no reload.

On Reddit, 23 switches in the same groups. Six are on by default: promoted
posts, sidebar ads, ads in comment threads, recommended posts on your home
feed, community suggestions, and the red unread badges. Vote and comment
counts and the vote bar are drawn inside Reddit's own components, out of reach
of an ordinary stylesheet; those switches put a small style into each one.
**Recommended posts** only acts on Home, and only signed in: a post there
from a community you haven't joined is one Reddit chose for you.

On X, 24 switches. Five are on by default: promoted posts, promoted trends,
Premium upsells, who to follow, and the unread badges. **Open Home on
"Following"** switches Home away from the "For you" picks each time you
arrive (click "For you" to stay there for that visit); **Replies from verified
accounts** clears the paid-checkmark replies under a post you open, leaving
the post and the thread above it.

On LinkedIn, 19 switches. Three are on by default: promoted posts, Premium
upsells, and the red badges. **Posts from people you don't follow** and
**Posts shown because of someone you know** ("X likes this", "X commented")
are off by default — on a typical feed they are most of it.

On Instagram, 13 switches. Three are on by default: sponsored posts, Reels
(in the feed and the menu; opening a reel sends you to the feed, as on
Facebook), and the red badges. Ads are recognised without reading any
language: they are the only posts that don't say when they were posted.
**Posts from accounts you don't follow** is off by default — once you have
seen your follows, Instagram fills the feed with them.

With a supported site's tab open, each active rule shows how much it matched on that
page: **3 here**, or **none here** when nothing matched. Only things you would
have seen count — not the empty slots a site keeps on every post for content
it might load later. "None here" is often
just a page without that thing on it — but if you can still see it, the site
has changed and the rule needs repairing with the picker. A selector Chrome
rejects outright is marked **broken**.

The Reels rule also blocks reel pages: opening a reel from a link, a
notification or the address bar lands you back on the feed. **All video
posts** goes further and hides every post with a video in it — the whole
post, shared videos and reels included — rather than just the player.

**Black & white** greys the whole page and keeps it grey; it combines with
**Blur posts until hovered**, where hovering lifts only the blur.

**Picked tab** — whatever you hid with the picker. Each rule can be switched
off, scoped to a single page, or deleted, and shows the same match count.

**Words tab** — hide any post containing a word. Plain words match anywhere in
the text you can see in the post — not the text Facebook hides in every post
for screen readers and anti-blocking, so "public" or "Facebook" only catch
posts that actually say it. Wrap in slashes for a regex:
`/giveaway|sweepstake/i`. Turn on
*Leave a "show" bar* to see where posts were hidden — by your words or by the
feed's text rules — and click one to bring that post back. Ads never leave one.

**Back up / restore** (popup footer) — downloads every setting to a file, or
restores one. Restoring checks the file first and skips anything malformed.

**The picker** — click *Hide something by clicking it*, or press
`Alt+Shift+H` on a supported site's tab:

| key | what it does |
| --- | --- |
| move the mouse | highlight the element under the cursor |
| `↑` / `↓` | select the parent / go back to the child |
| `a` | switch between *all elements like this* and *only this one* |
| click or `Enter` | hide it, and remember the rule |
| `esc` | cancel |

Pick a whole post (press `↑` until the box covers it) and the rule becomes
**posts from that page, person or group**, keyed on the author link in the
post's title. A post itself can't be picked any other way: Facebook rebuilds
and renumbers the feed as you scroll. On Reddit, a whole post means **posts
from that community**, and a part of a post (its title, picture, the line
with the community name) means that part of every post. On X it means
**posts from that account** — quotes of that account's posts stay. On
LinkedIn it means **posts from that person or page**, keyed on the author's
picture in the header, never on whoever reacted. On Instagram it means
**posts from that account** — posts that merely mention it stay.

`Alt+Shift+B` pauses and resumes every rule at once; the toolbar icon shows
**off** while paused.

## How it hides things (Facebook)

Facebook's class names are generated per build (`x1n2onr6`, `xdt5ytf`), so any
rule written against them dies within days. Every rule here keys off attributes
Facebook can't churn without breaking its own tooling and screen-reader
support. As checked against the live site in October 2026, that means:

- each feed post is a `div[aria-posinset]` — there is no `role="feed"`, no
  `data-pagelet` anywhere, and `role="article"` now marks comments
- parts of every post carry `data-ad-rendering-role` (`like_button`,
  `comment_button`, `image`…) — on ordinary posts too, so it is structure,
  never an ad signal
- `aria-label`s on the top bar and buttons, `data-focus-target`,
  `data-video-id`, `data-imgperflogname`

Two mechanisms do the work:

- **A single injected stylesheet** for anything expressible in CSS. Injected at
  `document_start`, so hidden elements never flash into view, and it costs
  nothing per frame. Each selector gets its own rule, so when Facebook breaks
  one, only that one stops working.
- **A debounced `MutationObserver`** for what CSS can't see: is this post an ad,
  is it from a page you don't follow, does it contain a banned word. Facebook
  renders posts in pieces and empties the ones that scroll away, so a post is
  judged once it has content and judged again whenever that content changes.

Everything hidden is marked with an attribute (`data-bfx-hidden-by`), never a
class: Facebook's React rewrites class names whenever it re-renders something,
which used to let hidden ads quietly reappear. Anything that loses its marker
anyway is re-hidden on the next pass, and the stylesheet is put back if the
page ever drops it.

## Ads (Facebook)

Four rules, and they work differently from each other on purpose — any single
signal can vanish in a Facebook deploy.

| rule | how it finds the ad |
| --- | --- |
| Sponsored posts in the feed | the header link of an ad starts with an invisible word joiner; its label, once attached, reads "Ad"; issue ads still say "Sponsored" |
| Sidebar ads | the Sponsored heading in the right column |
| Ads everywhere else | sweeps Marketplace, Stories, search and groups for an "Ad" or "Sponsored" label and hides that one card |
| Paid partnership posts | branded content from pages you follow (off by default) |

Facebook no longer writes "Sponsored" into feed ads. Where an ordinary post's
header links to "2 hours ago", an ad's header link holds an empty span whose
`aria-labelledby` points at a detached element reading **Ad** — and that
reference is only attached once the ad scrolls into view. Before then, the
same link already gives the ad away: its text starts with a word joiner
(U+2060). On the live feed that character was on every ad and on nothing else,
so ads are hidden before they are drawn, with the label as a second check.

What it deliberately does not use is `data-ad-preview` or
`data-ad-rendering-role`: the names suggest ads, but Facebook renders ordinary
posts through the same template, so keying off them hides the whole feed.

Where the label is real text, Facebook mangles it: the word is split across
shuffled spans padded with decoy letters that CSS hides. A loose fuzzy match
finds candidates, then a visible-text reader — which skips anything
`display:none`, zero-sized or parked off-screen — decides.

The sweep's hard part is hiding *the ad card* rather than the Stories tray or
the whole Marketplace grid. It climbs from the label to the first ancestor that
is card-sized and sits among siblings, and bails out on anything that looks
like a whole surface (`role="main"`, taller than 85% of the viewport, or
containing more than one post).

Two things this cannot do: **in-stream video ads** can be hidden but not
skipped — the player still has to run them — and **network-level blocking is
useless here**, because Facebook serves ads from the same first-party domains
and CDNs as everything else. Blocking those breaks the site.

## Suggestions (Facebook)

Facebook dropped the "Suggested for you" line too. A post from a page, person
or group you don't follow now has a **Follow** (or **Join**) button inside its
title; the suggested-posts rule keys on that button, so it needs no language.
"People you may know", group suggestions and similar boxes are carousels, not
posts: no author title, and the same button ("Add friend", "Join group") on
every card. The people-you-may-know rule counts that repetition, also without
reading the language.

## Languages (Facebook)

Phrases are only a fallback now (paid partnerships and friend activity rely
on them). English comes from Facebook itself; Vietnamese, Spanish, Portuguese,
French, German, Italian and Indonesian are best-effort translations, all tried
at once and only against a post's header — never its body — so a phrase cannot
misfire on what someone wrote. Corrections go in `src/sites/facebook.js`.

## Known limits

- **Facebook changes.** When a rule stops working, the picker is the repair
  tool: hide the thing again and the new selector is saved.
- **Picked rules for parts of a post are fragile** by nature, since Facebook
  rebuilds the feed constantly. The picker warns you when you're about to make
  one; picking the whole post (posts from that author) or a word block lasts.
- **Tab-title counts** (`(3) Facebook`) are stripped live; turning the badges
  rule back off restores them on the next navigation, not instantly.
- **Some switches outside the feed key off English `aria-label`s**
  (Marketplace, Notifications, Messenger, the chat heads). On Facebook in
  another language, use the picker for those.
- **Story ads** are untested: the story viewer could not be stepped through
  automatically. Feed, Video, Marketplace, search and sidebar ads were checked
  live, including that they stay hidden while you scroll and hover.
- **Centre the feed** currently has nothing to do: Facebook already centres the
  feed once both sidebars are hidden.
- **Not yet seen on the live site**, so unverified: open chat windows (the
  chat heads are covered), "X commented on this" and paid-partnership posts
  (none turned up in 150 posts; "X was tagged" is covered), and ads inside
  Stories.
- **Stop videos playing by themselves** pauses any feed video that starts
  without a click or Enter/Space just before. Checked by starting a real feed
  video from script; on the account it was tested with, Facebook's own
  autoplay was already off.
- **Reels opened inside Facebook** (not by loading a URL) are redirected within
  a second, so the first moment may play.
- **Reddit: the picker can't reach inside Reddit's components.** The vote
  buttons, counts and share button live inside each post's shadow root;
  pointing at them picks the whole post. Use the switches for those.
- **Reddit: recommended posts were not seen live.** On the account it was
  tested with, every post on Home came from a joined community, so the rule
  had nothing to hide; it is checked against the fixture. Ads in feeds,
  sidebars and comment threads were checked live, including that they stay
  hidden while you scroll and hover.
- **X: some switches were only seen working against the fixture.** There were
  no unread items during testing, so the badge rule was never seen hiding a
  real badge, and no who-to-follow rows came up in the Home timeline (the
  right column's were checked live). Ads in the timeline and in replies,
  promoted trends, the Premium card, reposts, verified replies and every
  other switch were checked live, including that hidden ads leave no gap and
  stay hidden while you scroll and hover.
- **X: reposts and promoted trends key on the icons X draws beside them**
  (the repost arrow, the promoted box), so they work in every language — but
  if X redraws those icons, the switch shows **none here** until it's updated.
- **X: Replies from verified accounts** needs to have seen the opened post: it
  works when the switch is on as you open a thread. Turned on halfway down a
  long thread, it starts working once you scroll back up past the post.
- **X: Open Home on "Following"** clicks the tab for you, and X remembers the
  last tab you used, so after turning it off Home stays on Following until you
  click "For you" once.
- **LinkedIn ads are found by their "Promoted" label.** No language-free
  marker was found on them, so the label is matched in the languages LinkedIn
  ships most (English, Spanish, Portuguese, Italian, German, French, Dutch,
  Polish, Vietnamese, Turkish, Russian, Japanese, Chinese, Korean). In other
  languages only ads whose links carry LinkedIn's ad-tracking id are caught;
  pick the rest, or tell us the word.
- **LinkedIn: not seen live**, so checked against the fixture only: the jobs
  carousel (it came up once while mapping the site, not while testing) and
  promoted cards in the right column. Feed ads, Premium offers, suggested and
  activity posts, every post part and both columns were checked live.
- **LinkedIn's post parts key on icon ids** (the Like, Comment and Repost
  buttons, the Follow "+", the post's "…" menu). If LinkedIn renumbers its
  icons, those switches show **none here** until they're updated.
- **Instagram: only the home feed was mapped.** Ads in Stories, Explore and
  the Reels tab are not covered, and there were no unread messages during
  testing, so the badge rule was checked against the fixture only.
- **Instagram's button row and counts** key on their position (the first and
  second `section` of a post). If Instagram reorders them, those two switches
  will hide the wrong row; the popup's count will look off.
- **Firefox** would need the background section changed from `service_worker`
  to `scripts`; everything else is compatible.

## Layout

```
manifest.json
src/common/sites.js         the site list, and the registry rule packs join
src/sites/facebook.js       Facebook's switches and detection (one file per site)
src/sites/reddit.js         Reddit's
src/sites/x.js              X's
src/sites/linkedin.js       LinkedIn's
src/sites/instagram.js      Instagram's
src/common/storage.js       one key in chrome.storage.local, shared everywhere
src/content/engine.js       stylesheet builder + observer, driven by the site's pack
src/content/picker.js       overlay, and the selector generator
src/content/main.js         bootstrap, SPA route changes, messaging
src/background/            keyboard shortcuts and the toolbar badge
src/popup/                 the UI
src/options/               backup and restore
test/smoke.js              runs the real content scripts against a mock DOM
test/browser.js            loads the extension into real Chrome
test/fixtures/             pages for the browser test, and your own snapshots
test/live/                 checks against the signed-in sites (see CLAUDE.md)
```

`npm test` builds a fake Facebook page in jsdom, applies the engine to it, and
checks that ads/suggestions/keyword posts are hidden, ordinary posts are not,
switching a rule off brings things back, and the picker's selectors resolve to
the elements they were generated from.

`npm run test:browser` loads the unpacked extension into Chrome for Testing
and serves fixture pages at `https://www.facebook.com/`,
`https://www.reddit.com/`, `https://x.com/`, `https://www.linkedin.com/` and
`https://www.instagram.com/`, so the content scripts
run exactly as they do on the real site. It checks what jsdom cannot: that
Chrome accepts every selector (jsdom is more lenient about `:has()`), the real
CSS cascade, settings reaching open tabs, reel redirects, the popup, and
backup/restore. It needs Chrome for Testing or Chromium — branded Chrome
ignores unpacked extensions from the command line — found via `CHROME_PATH`
or the Playwright/Puppeteer cache (`npx @puppeteer/browsers install
chrome@stable` gets one).

Save real Facebook pages into `test/fixtures/snapshots/` (instructions in the
README there) and the browser test also checks that the ad rules never hide
most of a real feed.
