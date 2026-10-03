/* Which sites the live test window is signed into: node test/live/status.js */
const { connect, logins } = require('./lib');
(async () => {
  const browser = await connect();
  const s = await logins(browser);
  console.log(Object.entries(s).map(([k, v]) => k + ': ' + (v ? 'signed in' : 'not signed in')).join('\n'));
  browser.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
