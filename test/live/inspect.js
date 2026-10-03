/* Run a snippet against a page in the live window and print what it returns:
 *   [EACH=1] node test/live/inspect.js <url> <file with a function body returning JSON-able data> [scrolls]
 * The snippet runs in the page's main world. Read-only by convention. */
const fs = require('fs');
const { connect, workTab, ensureVisible, scroll, sleep } = require('./lib');
(async () => {
  const [url, file, steps] = process.argv.slice(2);
  const browser = await connect();
  const page = await workTab(browser, url);
  await ensureVisible(page, { focus: false });
  await sleep(4000);
  const body = fs.readFileSync(file, 'utf8');
  /* Sites drop posts that scroll away, so with EACH=1 the snippet runs after
   * every step (it can collect into window.__ globals between runs). */
  let out;
  for (let i = 0; i < (Number(steps) || 0); i++) {
    await scroll(page, 1, 800, 1200);
    if (process.env.EACH) out = await page.evaluate(new Function(body));
  }
  out = await page.evaluate(new Function(body));
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  if (!process.env.KEEP) await page.close();
  browser.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
