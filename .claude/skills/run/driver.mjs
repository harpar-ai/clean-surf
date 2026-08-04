// Clean Shell browser driver — Playwright _electron REPL
// Usage: node .claude/skills/run/driver.mjs
// On macOS, run directly (no xvfb needed).
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Clean Surf.app/Contents/MacOS/Electron');

let app = null;
let page = null; // The toolbar/UI WebContentsView

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    app = await electron.launch({
      executablePath: electronBin,
      args: [path.join(APP_DIR, 'out/main/index.js')],
      env: { ...process.env },
      timeout: 30_000,
    });
    // Wait for app to initialize and create the first tab
    await new Promise(r => setTimeout(r, 6_000));
    // The toolbar UI is the window loaded from the renderer index.html
    // Web page tabs are separate WebContentsViews
    const wins = app.windows();
    page = wins.find(w => w.url().includes('index.html') || w.url().includes('localhost'))
        ?? wins[0]
        ?? await app.firstWindow();
    console.log('launched.', wins.length, 'window(s):');
    for (const w of wins) console.log(' ', w.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  // Navigate the active tab to a URL by typing in the address bar
  async goto(url) {
    if (!page) return console.log('ERROR: launch first');
    // Click address bar input and type the URL
    await page.evaluate(() => {
      const input = document.querySelector('.address-input');
      if (input) { input.focus(); input.select(); }
    });
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.type(url, { delay: 20 });
    await page.keyboard.press('Enter');
    console.log('navigated to:', url);
  },

  async 'new-tab'() {
    if (!page) return console.log('ERROR: launch first');
    await page.evaluate(() => {
      const btn = document.querySelector('.new-tab-btn');
      if (btn) btn.click();
    });
    console.log('new tab created');
  },

  async tabs() {
    if (!page) return console.log('ERROR: launch first');
    const tabs = await page.evaluate(() => {
      return [...document.querySelectorAll('.tab')].map(t => ({
        active: t.classList.contains('active'),
        title: t.querySelector('.tab-title')?.textContent?.trim()
      }));
    });
    console.log(JSON.stringify(tabs, null, 2));
  },

  async url() {
    if (!page) return console.log('ERROR: launch first');
    const u = await page.evaluate(() => document.querySelector('.address-input')?.value ?? '');
    console.log('address bar:', u);
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
    const wcs = await app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() })));
    console.log('webContents:');
    for (const w of wcs) console.log(` [${w.id}] ${w.type}: ${w.url}`);
  },

  async quit() { if (app) await app.close().catch(()=>{}); app = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async line => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '— try: help'); return rl.prompt(); }
  try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('Clean Shell driver — "help" for commands, "launch" to start');
rl.prompt();
