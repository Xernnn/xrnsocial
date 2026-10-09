# xrnsocial

A browser extension that hides the distracting parts of social sites: ads,
suggested posts, Reels, sidebars, counts and red badges. Switch off what you
don't want, or click anything else on the page to hide it too.

It works on **Facebook, Reddit, X, LinkedIn, Instagram, Twitch and TikTok**,
in Chrome, Edge, Brave, Firefox and other Chromium or Firefox browsers.

Nothing leaves your browser: no network requests, no analytics, no accounts.

## Features

- **Switches for each site.** Ready-made rules grouped by where things are
  (Ads, Feed, Inside posts, Sidebars, Top bar…). Changes apply at once to
  every open tab, with no reload.
- **Picker.** Press `Alt+Shift+H` (or use the popup) and click anything to
  hide it. Picking a whole post hides posts from that author, page or
  community.
- **Word blocks.** Hide posts containing a word, or a `/regex/i`.
- **"Show" bars.** If you like, a hidden post can leave a one-line bar that
  you click to bring the post back.
- **Pause.** `Alt+Shift+B` pauses and resumes every rule.
- **Match counts.** The popup shows how many things each switch is hiding
  on the current page, and flags picked rules that no longer match.
- **Backup and restore.** All settings go into one file and come back from
  it.

## Supported sites

| Site | Switches | On by default | Status |
| --- | --- | --- | --- |
| Facebook | 34 | 7 | Checked on the live site, October 2026 |
| Reddit | 23 | 6 | Checked on the live site, October 2026 |
| X | 24 | 5 | Checked on the live site, October 2026 |
| LinkedIn | 19 | 3 | Checked on the live site, October 2026 |
| Instagram | 13 | 3 | Checked on the live site, October 2026 |
| Twitch | 14 | 4 | Checked on the live site, October 2026 |
| TikTok | 7 | 1 | Partial: mapped while signed out, no ad switch yet |

Out of the box, every site hides its ads and red unread badges. Facebook also
hides Reels, suggested posts and "people you may know". Reddit hides
recommended posts and community suggestions, X hides "who to follow" and
Premium upsells, and Instagram hides recommended Reels. Every other switch
starts off.

## Install

### Chrome, Edge, Brave and other Chromium browsers

1. Get the code: `git clone https://github.com/Xernnn/xrnsocial.git`, or on
   GitHub choose **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` (`edge://extensions` in Edge) and turn on
   **Developer mode**.
3. Click **Load unpacked** and choose the folder that holds `manifest.json`.
4. Reload any tabs of supported sites that were already open.

### Firefox, Zen, LibreWolf and other Firefox browsers (128 or newer)

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
   and choose `manifest.json`, or a `xrnsocial.zip` built as shown below.
2. Reload any tabs of supported sites that were already open. If nothing is
   hidden, open `about:addons` → xrnsocial → **Permissions** and allow it
   on the sites.

Firefox removes a temporary add-on when it closes. To keep the add-on, sign
it for free with an unlisted upload to addons.mozilla.org. In builds that
allow unsigned add-ons (Developer Edition, Nightly, some forks), you can
instead set `xpinstall.signatures.required` to `false` in `about:config` and
install the zip.

## Build

There is no compile step: the folder is the extension. Building packs
`manifest.json`, `icons/` and `src/` into **`xrnsocial.zip`**, the file the
Chrome Web Store and addons.mozilla.org take. It needs
[Node.js](https://nodejs.org) and nothing else: no zip tool, and no
`npm install`.

### Linux

```sh
# Install Node.js from your package manager or nodejs.org, then:
git clone https://github.com/Xernnn/xrnsocial.git
cd xrnsocial
npm run zip
```

### Windows (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS   # if Node.js isn't installed yet; open a new terminal afterwards
git clone https://github.com/Xernnn/xrnsocial.git   # or Download ZIP and extract it
cd xrnsocial
npm run zip
```

If PowerShell refuses to run `npm` ("running scripts is disabled on this
system"), run `node scripts/zip.js` instead, which does the same thing.

## Tests

The tests need Node.js 22.12 or newer.

```sh
npm install
npm test               # fast checks against mock pages (jsdom)
npm run test:browser   # the extension in a real, headless Chrome for Testing
npm run test:firefox   # the extension in a real Firefox
```

The browser tests need their own browsers, because branded Chrome won't load
an unpacked extension from the command line.

**Linux:** install them where the tests look for them.

```sh
npx @puppeteer/browsers install chrome@stable --path ~/.cache/puppeteer
npx @puppeteer/browsers install firefox@stable --path ~/.cache/bfx-firefox
```

**Windows:** install them, then point the tests at the `.exe` path that each
install command prints.

```powershell
npx @puppeteer/browsers install chrome@stable
npx @puppeteer/browsers install firefox@stable
$env:CHROME_PATH  = "C:\...\chrome.exe"    # the path printed above
$env:FIREFOX_PATH = "C:\...\firefox.exe"
npm run test:browser
npm run test:firefox
```

`test/live/` holds scripts that check the extension against the real,
signed-in sites in a browser you sign in to yourself. [CLAUDE.md](CLAUDE.md)
explains them, along with the code's architecture.

## How it works

- **One stylesheet**, injected before the page draws, hides everything CSS
  can express. Hidden things never flash into view, and it costs nothing per
  frame.
- **A debounced `MutationObserver`** handles what CSS can't see, such as
  whether a post is an ad or contains a blocked word. Posts are judged again
  whenever their content changes.
- **Hidden elements are marked with an attribute, never a class.** React
  rewrites class names when it re-renders, which used to let hidden ads
  reappear.
- **Rules never use generated class names**, which change with every site
  deploy. They key on roles, labels, test ids and link shapes, measured on
  the live sites.

Each site's rules live in `src/sites/<site>.js`. The engine
(`src/content/engine.js`), the picker, the popup and storage are shared by
all of them.

## Known limits

- **Sites change.** When something reappears, hide it again with the picker,
  and the new rule is saved.
- **Video ads inside a stream can't be skipped.** That covers Facebook
  in-stream ads and Twitch ads stitched into the stream; the player still has
  to run them.
- **TikTok has no ad switch yet.** Its ads haven't been measured on a
  signed-in feed. Hide them with the picker for now.
- **Some switches depend on words in the page.** A few Facebook switches
  outside the feed (Marketplace, Notifications, chat) read English labels.
  LinkedIn ads are found by their "Promoted" label, matched in 14 languages.
- **Instagram:** only the home feed is mapped, so ads in Stories, Explore and
  the Reels tab aren't covered.
- **Reddit:** the picker can't reach inside Reddit's own components (votes,
  counts, share). Use the switches for those.
- **Facebook Story ads** are untested: the story viewer couldn't be stepped
  through automatically.

## Project layout

```
manifest.json
src/common/      site list and settings storage, shared by every page
src/sites/       one rule pack per site
src/content/     engine, picker, and the bootstrap that runs on each site
src/background/  keyboard shortcuts and the toolbar badge
src/popup/       the popup
src/options/     backup and restore
scripts/zip.js   packs the extension (npm run zip)
test/            jsdom, Chrome and Firefox tests, with fixture pages
```

## History

xrnsocial started as BlockFB, for Facebook only, and was then called
BlockDistractXrn. Backups saved under either name still restore.

## License

[MIT](LICENSE)
