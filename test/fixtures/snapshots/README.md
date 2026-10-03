Saved Facebook pages for `npm run test:browser`. Each `.html` file here is
served at `https://www.facebook.com/` with BlockFB's default settings, and
the test fails if the ad rule hides most of the feed — the signature of a
signal Facebook has started rendering on ordinary posts.

To add one: open Facebook, let the feed load, then in DevTools run
`copy(document.documentElement.outerHTML)` and paste into a new file here,
e.g. `feed-2026-10.html`. Snapshots contain your feed, so they are ignored
by git; keep them local.
