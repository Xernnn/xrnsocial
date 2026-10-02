# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BlockFB is a Manifest V3 Chrome/Edge extension that hides parts of Facebook (presets, a point-and-click picker, keyword blocks). There is no build step, no bundler, and no runtime dependencies. `jsdom` is only used by the test.

## Commands

- `npm test`: runs `test/smoke.js`, the only test file. It has no runner or filtering. Each check prints ✓/✗ and the process exits 1 on any failure. To focus on one area, temporarily comment out sections of `main()` in `test/smoke.js`.
- `npm run zip`: builds `blockfb.zip` (manifest, icons, src) for the Web Store.
- Manual testing: `chrome://extensions` → Developer mode → **Load unpacked** → this folder. After editing content scripts, reload the extension and then reload the Facebook tab, because content scripts are injected only at page load.

## Module system (no imports)

Every file in `src/` is an ES5 IIFE that attaches a global to `self`: `BFX_PRESETS`/`BFX_GROUPS` (presets.js), `BFX_STORE` (storage.js), `BFX_ENGINE` (engine.js), `BFX_PICKER` (picker.js). Later files read earlier globals, so **load order matters**, and it is declared in four places that must stay in sync when you add or rename a file:

1. `manifest.json` → `content_scripts[0].js`
2. `src/popup/popup.html` `<script>` tags (presets + storage only)
3. `src/background/service-worker.js` `importScripts` (storage only)
4. `test/smoke.js` eval list (all content scripts except `main.js`)

Match the existing style in `src/`: `var`, function expressions, `'use strict'`, no arrow functions, and comments that explain *why*.

## State and data flow

- All settings live under **one key, `bfx`, in `chrome.storage.local`** (`src/common/storage.js`). Shape: `{ enabled, presets: {id: bool}, custom: [rule], keywords: { enabled, terms } }`.
- `merge()` layers `DEFAULTS` under stored values. As a result, turning off a default-on preset must be stored as an explicit `false`. Default-on presets are listed in `storage.js` `DEFAULTS.presets`, not in `presets.js`.
- Settings changes do **not** use messaging. The popup or service worker writes to storage, and `storage.onChanged` → `engine.apply(state)` in every open tab. Runtime messages (`bfx:pick`, `bfx:stopPick`, `bfx:status`, `bfx:rescan`, handled in `src/content/main.js`) are only for actions and querying tab status.
- Facebook is an SPA. `main.js` polls `location.pathname` once a second and calls `engine.refresh()` so path-scoped custom rules update. Patching `history.pushState` would not work because content scripts run in an isolated world.

## Engine (`src/content/engine.js`)

Elements are hidden in two ways:

1. **One `<style id="bfx-style">`** built from preset `css` selectors, preset `style` blocks, and custom-rule selectors. Each selector is emitted as its own rule, so one invalid selector cannot break the rest of the sheet. The sheet is injected at `document_start` to prevent a flash of hidden content.
2. **A rAF-debounced `MutationObserver`** for heuristics that CSS can't express. It only runs when `needsObserver()` says a rule requires it.

How `apply()` works:
- It bumps `generation`, rebuilds the sheet, and calls `unhideAll()`, so turning a rule off takes effect immediately.
- Elements hidden by JS get class `bfx-hidden` plus `data-bfx-hidden-by="<ruleId|keyword>"`. The tests assert on that attribute.
- Each element is judged at most once per generation, using the `__bfxGen` / `__bfxAdGen` expando properties.

Heuristics come in two kinds, wired differently:
- **Per-feed-unit**: the preset's `js.kind` must be a key in `HEURISTICS` (`sponsored`, `feedText`). Presets whose kind isn't in `HEURISTICS` are silently filtered out of `jsRules`.
- **Global**: `badges`, `rightAds`, `adSweep`. These are keyed by **preset id**, not by kind. A new global heuristic must be added to both `GLOBAL_JS` and `runGlobalHeuristics()`.

Ad detection deliberately layers independent signals: ad-only markup, then ad-explainer links, then the "Sponsored" label. Facebook obfuscates the label with shuffled spans and hidden decoy letters, so `FUZZY` is a loose prefilter and `visibleText()`/`isVisible()` make the final call. `cardFor()` climbs from a label to the card-sized ancestor and must never hide a whole surface (feed, main, Stories tray, Marketplace grid).

## Selector rules

Facebook's class names (`x1n2onr6`) and React ids (`:r7:`) change with every build. Never use them in presets or picker output. Use only `data-pagelet`, `data-visualcompletion`, `data-testid`, `role`, `aria-label`, and short `href` prefixes. The picker (`src/content/picker.js`) filters generated classes and ids with `GENERATED_CLASS`/`GENERATED_ID`. When an element has no stable attribute of its own, the picker anchors to the nearest ancestor that has one and adds an `nth-child` tail.

Preset schema (`src/common/presets.js`): `{ id, group, label, desc, css?: [selectors], style?: rawCss, js?: { kind, ...params } }`. Popup groups come from the order of `group` values. The README states the preset count (31) and the default-on count (7). Update those numbers when you add presets.

## Test harness quirks (`test/smoke.js`)

- jsdom has no layout, so `getBoundingClientRect` is mocked: width comes from text length, and **height comes from the fixture's `data-h` attribute** (default 24). Size-dependent logic (`cardFor`'s 90px and 85%-viewport thresholds, the badge 40px cap) needs `data-h` set on fixture elements.
- jsdom's `:has()` support is partial, so preset selectors that fail to parse are *reported*, not counted as failures. Check those in Chrome.
- The test does not load `main.js`, the popup, or the service worker. `chrome.*` is a minimal stub whose `onChanged` never fires, so tests call `BFX_ENGINE.apply()` directly and wait about one frame.

## Other notes

- The facebook/messenger tab-URL regex is duplicated in `service-worker.js` and `popup.js`. The host patterns are also in `manifest.json`.
- Firefox support would only need `background.service_worker` changed to `background.scripts`.
