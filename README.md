# BlockFB

A Chrome/Edge extension that makes Facebook's interface opt-in. Flip off the
parts you don't want — Stories, Reels, ads, the sidebars, the Like counts, the
red badges — or turn on the picker and click anything else to make it go away.

Nothing leaves your browser: no network requests, no analytics, no accounts.

## Install (unpacked)

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Open Facebook. Already-open tabs need one reload, because the content script
   is injected at page load.

`npm run zip` packs a `blockfb.zip` for the Web Store or for sharing.

## Using it

**Blocks tab** — 31 ready-made switches grouped by where they live (Ads, Feed,
Inside posts, Sidebars, Top bar, Chat, Effects). Seven are on by default: the
three ad rules, suggested posts, "people you may know", Reels, and the red
unread badges. Changes apply instantly in every open Facebook tab, no reload.

**Picked tab** — whatever you hid with the picker. Each rule can be switched
off, scoped to a single page, or deleted.

**Words tab** — hide any post containing a word. Plain words match anywhere in
the post; wrap in slashes for a regex: `/giveaway|sweepstake/i`.

**The picker** — click *Hide something by clicking it*, or press
`Alt+Shift+H` on a Facebook tab:

| key | what it does |
| --- | --- |
| move the mouse | highlight the element under the cursor |
| `↑` / `↓` | select the parent / go back to the child |
| `a` | switch between *all elements like this* and *only this one* |
| click or `Enter` | hide it, and remember the rule |
| `esc` | cancel |

`Alt+Shift+B` pauses and resumes every rule at once; the toolbar icon shows
**off** while paused.

## How it hides things

Facebook's class names are generated per build (`x1n2onr6`, `xdt5ytf`), so any
rule written against them dies within days. Every rule here keys off attributes
Facebook can't churn without breaking its own tooling and screen-reader
support: `data-pagelet`, `data-visualcompletion`, `role`, `aria-label`.

Two mechanisms do the work:

- **A single injected stylesheet** for anything expressible in CSS. Injected at
  `document_start`, so hidden elements never flash into view, and it costs
  nothing per frame. Each selector gets its own rule, so when Facebook breaks
  one, only that one stops working.
- **A debounced `MutationObserver`** for what CSS can't see: is this post an ad,
  does it contain a banned word, is that a badge. Each post is judged once and
  marked, and the observer only runs when a rule actually needs it.

## Ads

Four rules, and they work differently from each other on purpose — any single
signal can vanish in a Facebook deploy.

| rule | how it finds the ad |
| --- | --- |
| Sponsored posts in the feed | ad-only markup (`data-ad-preview`, `data-ad-rendering-role`), the "Why am I seeing this ad?" link, then the label itself |
| Sidebar ads | the Sponsored heading in the right column |
| Ads everywhere else | sweeps Stories, Reels, Marketplace, search, Watch and groups for a Sponsored label and hides that one card |
| Paid partnership posts | branded content from pages you follow (off by default) |

The first two signals are markup, so they fire in CSS before the page paints
and work in any language. The label is only the fallback, because Facebook
deliberately mangles it: the word is split across shuffled spans padded with
decoy letters that CSS hides, so the raw text reads like `SpqqOnsored`. A loose
fuzzy match finds candidates, then a visible-text reader — which skips anything
`display:none`, zero-sized or parked off-screen — decides.

The sweep's hard part is hiding *the ad card* rather than the Stories tray or
the whole Marketplace grid. It climbs from the label to the first ancestor that
is card-sized and sits among siblings, and bails out on anything that looks
like a whole surface (`role="feed"`, `role="main"`, taller than 85% of the
viewport, or containing more than one post).

Two things this cannot do: **in-stream video ads** can be hidden but not
skipped — the player still has to run them — and **network-level blocking is
useless here**, because Facebook serves ads from the same first-party domains
and CDNs as everything else. Blocking those breaks the site.

## Known limits

- **Facebook changes.** When a rule stops working, the picker is the repair
  tool: hide the thing again and the new selector is saved.
- **Picked rules inside the feed are fragile** by nature, since Facebook
  rebuilds the feed constantly. The picker warns you when you're about to make
  one and suggests a word block instead.
- **Tab-title counts** (`(3) Facebook`) are stripped live; turning the badges
  rule back off restores them on the next navigation, not instantly.
- **Firefox** would need the background section changed from `service_worker`
  to `scripts`; everything else is compatible.

## Layout

```
manifest.json
src/common/presets.js       the 31 built-in rules
src/common/storage.js       one key in chrome.storage.local, shared everywhere
src/content/engine.js       stylesheet builder + heuristics + observer
src/content/picker.js       overlay, and the selector generator
src/content/main.js         bootstrap, SPA route changes, messaging
src/background/            keyboard shortcuts and the toolbar badge
src/popup/                 the UI
test/smoke.js              runs the real content scripts against a mock DOM
```

`npm test` builds a fake Facebook page in jsdom, applies the engine to it, and
checks that ads/suggestions/keyword posts are hidden, ordinary posts are not,
switching a rule off brings things back, and the picker's selectors resolve to
the elements they were generated from.
