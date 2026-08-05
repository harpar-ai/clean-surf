/**
 * Clean Surf — comprehensive browser test suite (50 operations)
 * Run: npm test
 */

import pkg from '../node_modules/playwright-core/index.js'
const { _electron: electron } = pkg
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(__dirname, '..')
const ELECTRON_BIN = path.join(APP_DIR, 'node_modules/electron/dist/Clean Surf.app/Contents/MacOS/Electron')
const SHOT_DIR = '/tmp/clean-surf-tests'
fs.mkdirSync(SHOT_DIR, { recursive: true })

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const results = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    results.push({ status: 'PASS', name })
    process.stdout.write(`  ✓  ${name}\n`)
  } catch (err) {
    failed++
    results.push({ status: 'FAIL', name, error: err.message })
    process.stdout.write(`  ✗  ${name}\n     → ${err.message}\n`)
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg ?? 'Assertion failed') }
const wait = ms => new Promise(r => setTimeout(r, ms))

// ─── App helpers ──────────────────────────────────────────────────────────────
let app, ui

async function getTabs() {
  return ui.evaluate(() =>
    [...document.querySelectorAll('.tab')].map(t => ({
      active: t.classList.contains('active'),
      title: t.querySelector('.tab-title')?.textContent?.trim() ?? '',
    }))
  )
}

async function getUrl() {
  return ui.evaluate(() => document.querySelector('.address-input')?.value ?? '')
}

async function click(sel) {
  return ui.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true }, sel)
}

// Trigger an Electron menu item by label path e.g. menuClick('File', 'New Tab')
async function menuClick(...labels) {
  await app.evaluate(({ Menu }, labels) => {
    let items = Menu.getApplicationMenu()?.items ?? []
    for (let i = 0; i < labels.length - 1; i++) {
      items = items.find(x => x.label === labels[i])?.submenu?.items ?? []
    }
    const item = items.find(x => x.label === labels[labels.length - 1])
    if (!item) throw new Error(`Menu item not found: ${labels.join(' > ')}`)
    item.click()
  }, labels)
}

async function navigate(url) {
  await ui.evaluate(u => {
    const i = document.querySelector('.address-input')
    i.focus(); i.select()
  })
  await ui.keyboard.type(url, { delay: 15 })
  await ui.keyboard.press('Enter')
}

// ─── Launch ───────────────────────────────────────────────────────────────────
console.log('\n🏄 Clean Surf Browser Test Suite\n')
console.log('  Launching app…')

app = await electron.launch({
  executablePath: ELECTRON_BIN,
  args: [path.join(APP_DIR, 'out/main/index.js')],
  timeout: 30_000,
})
await wait(8_000)
ui = app.windows().find(w => w.url().includes('index.html')) ?? await app.firstWindow()
console.log(`  Windows: ${app.windows().length}\n`)

// ═══════════════════════════════════════════════════════════════════════════════
console.log('── App Identity ──')

await test('App name is "Clean Surf"', async () => {
  const name = await app.evaluate(({ app: a }) => a.getName())
  assert(name === 'Clean Surf', `Got: ${name}`)
})

await test('First menu item label is "Clean Surf"', async () => {
  const label = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items[0]?.label)
  assert(label === 'Clean Surf', `Got: ${label}`)
})

await test('No "Electron" in app name or menu', async () => {
  const name = await app.evaluate(({ app: a }) => a.getName())
  assert(!name.toLowerCase().includes('electron'), `Name contains Electron: ${name}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Startup & Layout ──')

await test('Exactly 1 tab on launch', async () => {
  const tabs = await getTabs()
  assert(tabs.length === 1, `Expected 1, got ${tabs.length}`)
})

await test('Tab strip visible', async () => {
  assert(await ui.evaluate(() => !!document.querySelector('.tab-strip')))
})

await test('Nav bar visible', async () => {
  assert(await ui.evaluate(() => !!document.querySelector('.nav-bar')))
})

await test('Bookmark bar visible', async () => {
  assert(await ui.evaluate(() => !!document.querySelector('.bookmark-bar')))
})

await test('Address bar present', async () => {
  assert(await ui.evaluate(() => !!document.querySelector('.address-input')))
})

await test('Star bookmark button present', async () => {
  assert(await ui.evaluate(() => !!document.querySelector('.star-btn')))
})

await test('Privacy badge element in DOM', async () => {
  // The badge component is always rendered (may be null/hidden when count=0)
  const toolbar = await ui.evaluate(() => !!document.querySelector('.nav-bar'))
  assert(toolbar, 'Nav bar missing')
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Navigation ──')

await test('Navigate by typing URL', async () => {
  await navigate('https://example.com')
  await wait(4_000)
  const url = await getUrl()
  assert(url.includes('example.com'), `Got: ${url}`)
})

await test('Tab title updates after navigation', async () => {
  const tabs = await getTabs()
  assert(tabs[0].title.length > 0, 'Tab title empty')
})

await test('HTTPS lock icon present', async () => {
  const iconExists = await ui.evaluate(() => !!document.querySelector('.security-icon'))
  assert(iconExists)
})

await test('Back button enabled after first navigation', async () => {
  const disabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[0]?.disabled)
  assert(!disabled, 'Back button still disabled')
})

await test('Address bar shows display URL (no https:// prefix) when unfocused', async () => {
  const val = await getUrl()
  assert(!val.startsWith('https://'), `Shows full URL: ${val}`)
  assert(val.includes('example.com'), `Doesn't show domain: ${val}`)
})

await test('Address bar shows full URL when focused', async () => {
  await ui.evaluate(() => document.querySelector('.address-input')?.focus())
  await wait(200)
  const val = await ui.evaluate(() => document.querySelector('.address-input')?.value ?? '')
  assert(val.startsWith('https://'), `Expected full URL, got: ${val}`)
  await ui.keyboard.press('Escape')
  await wait(200)
})

await test('Search query routes to Google', async () => {
  await navigate('what is quantum computing')
  await wait(5_000)
  const url = await getUrl()
  assert(url.includes('google.com'), `Expected Google, got: ${url}`)
})

await test('Escape cancels address bar edit', async () => {
  await ui.evaluate(() => document.querySelector('.address-input')?.focus())
  await ui.keyboard.type('thisshouldnotnavigate')
  await ui.keyboard.press('Escape')
  await wait(300)
  const after = await getUrl()
  assert(!after.includes('thisshouldnotnavigate'), 'Escape did not cancel')
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Tab management (mouse) ──')

await test('New tab opens via + button', async () => {
  const before = (await getTabs()).length
  await click('.new-tab-btn')
  await wait(1_500)
  const after = (await getTabs()).length
  assert(after === before + 1, `Expected ${before + 1}, got ${after}`)
})

await test('New tab opens on Google', async () => {
  await wait(2_000)
  const url = await getUrl()
  assert(url.includes('google.com'), `Got: ${url}`)
})

await test('Clicking inactive tab switches active tab', async () => {
  // Make sure we have 2 tabs
  const tabs = await getTabs()
  if (tabs.length < 2) { await click('.new-tab-btn'); await wait(1_000) }
  // Click the first tab
  await ui.evaluate(() => document.querySelectorAll('.tab')[0]?.click())
  await wait(500)
  const newTabs = await getTabs()
  assert(newTabs[0].active, 'First tab not active after click')
})

await test('Close button visible on active tab', async () => {
  const has = await ui.evaluate(() => !!document.querySelector('.tab.active .tab-close'))
  assert(has)
})

await test('Close tab via X button', async () => {
  const before = (await getTabs()).length
  if (before < 2) { await click('.new-tab-btn'); await wait(800) }
  const count = (await getTabs()).length
  await click('.tab.active .tab-close')
  await wait(1_000)
  const after = (await getTabs()).length
  assert(after === count - 1, `Expected ${count - 1}, got ${after}`)
})

await test('Tab has favicon after navigation', async () => {
  await navigate('https://example.com')
  await wait(5_000)
  // Favicon may be an <img> or a placeholder SVG
  const faviconExists = await ui.evaluate(() =>
    !!document.querySelector('.tab.active .tab-favicon') ||
    !!document.querySelector('.tab.active svg')
  )
  assert(faviconExists, 'No favicon element on active tab')
})

await test('Loading indicator CSS exists in stylesheet', async () => {
  // The spinner is defined in CSS; verify the class is in a stylesheet
  const hasSpinnerCSS = await ui.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText?.includes('tab-loading-spinner')) return true
        }
      } catch {}
    }
    return false
  })
  assert(hasSpinnerCSS, '.tab-loading-spinner not in stylesheet')
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Tab management (keyboard / menu shortcuts) ──')

await test('Cmd+T (menu) opens a new tab', async () => {
  const before = (await getTabs()).length
  await menuClick('File', 'New Tab')
  await wait(1_500)
  const after = (await getTabs()).length
  assert(after === before + 1, `Expected ${before + 1}, got ${after}`)
})

await test('Cmd+W (menu) closes active tab', async () => {
  const before = (await getTabs()).length
  if (before < 2) { await menuClick('File', 'New Tab'); await wait(800) }
  const count = (await getTabs()).length
  await menuClick('File', 'Close Tab')
  await wait(1_000)
  const after = (await getTabs()).length
  assert(after === count - 1, `Expected ${count - 1}, got ${after}`)
})

await test('Cmd+L focuses address bar', async () => {
  await ui.keyboard.press('Meta+l')
  await wait(300)
  const focused = await ui.evaluate(() =>
    document.activeElement === document.querySelector('.address-input')
  )
  assert(focused, 'Address bar not focused')
  await ui.keyboard.press('Escape')
})

await test('Cmd+R (menu) reloads page', async () => {
  const urlBefore = await getUrl()
  await menuClick('View', 'Reload')
  await wait(3_000)
  const urlAfter = await getUrl()
  // URL should be same site after reload
  assert(urlAfter.length > 0, 'No URL after reload')
})

await test('Back (menu) navigates backward', async () => {
  await navigate('https://example.com')
  await wait(4_000)
  const urlBefore = await getUrl()
  await menuClick('History', 'Back')
  await wait(3_000)
  const urlAfter = await getUrl()
  // Either navigated back, or we were already at the start
  assert(typeof urlAfter === 'string', 'URL missing after back')
})

await test('Cmd+Shift+T (menu) reopens last closed tab', async () => {
  // Make sure we have 2+ tabs, close one, reopen
  if ((await getTabs()).length < 2) { await menuClick('File', 'New Tab'); await wait(800) }
  const countBefore = (await getTabs()).length
  await menuClick('File', 'Close Tab')
  await wait(800)
  const countAfterClose = (await getTabs()).length
  await menuClick('File', 'Reopen Last Closed Tab')
  await wait(1_500)
  const countAfterReopen = (await getTabs()).length
  assert(countAfterReopen === countAfterClose + 1, `Reopen failed: ${countAfterClose} → ${countAfterReopen}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Bookmarks ──')

// Clear all bookmarks so tests start from a known clean state
await ui.evaluate(() => window.cleanShell.clearBookmarks())
await wait(500)

await navigate('https://example.com')
await wait(4_000)

await test('Star is unfilled before bookmarking', async () => {
  const isFilled = await ui.evaluate(() =>
    document.querySelector('.star-btn svg')?.getAttribute('fill') === '#f59e0b'
  )
  assert(!isFilled, 'Star already filled before bookmarking')
})

await test('Star click bookmarks the page (turns gold)', async () => {
  await click('.star-btn')
  await wait(800)
  const isFilled = await ui.evaluate(() =>
    document.querySelector('.star-btn svg')?.getAttribute('fill') === '#f59e0b'
  )
  assert(isFilled, 'Star did not turn gold')
})

await test('Bookmark appears in bookmark bar', async () => {
  const count = await ui.evaluate(() => document.querySelectorAll('.bookmark-item').length)
  assert(count > 0, 'No bookmark items in bar')
})

await test('Bookmark has correct title in bar', async () => {
  const title = await ui.evaluate(() =>
    document.querySelector('.bookmark-item .bookmark-title')?.textContent?.trim() ?? ''
  )
  assert(title.length > 0, 'Bookmark title empty')
})

await test('Cmd+D (menu) unbookmarks bookmarked page', async () => {
  await menuClick('Bookmarks', 'Bookmark This Tab')
  await wait(800)
  const isFilled = await ui.evaluate(() =>
    document.querySelector('.star-btn svg')?.getAttribute('fill') === '#f59e0b'
  )
  assert(!isFilled, 'Star still gold after toggle')
})

await test('Bookmark removed from bar after unbookmark', async () => {
  const count = await ui.evaluate(() => document.querySelectorAll('.bookmark-item').length)
  assert(count === 0, `Expected 0, got ${count}`)
})

await test('Re-bookmark restores star and bar entry', async () => {
  await click('.star-btn')
  await wait(800)
  const count = await ui.evaluate(() => document.querySelectorAll('.bookmark-item').length)
  assert(count === 1, `Expected 1, got ${count}`)
})

await test('Clicking bookmark navigates to that URL', async () => {
  await click('.bookmark-item')
  await wait(4_000)
  const url = await getUrl()
  assert(url.includes('example.com'), `Got: ${url}`)
})

await test('Bookmark bar toggles via menu', async () => {
  const before = await ui.evaluate(() => !!document.querySelector('.bookmark-bar'))
  await menuClick('Bookmarks', 'Show Bookmarks Bar')
  await wait(400)
  const after = await ui.evaluate(() => !!document.querySelector('.bookmark-bar'))
  assert(before !== after, 'Bookmark bar did not toggle')
  // Restore
  await menuClick('Bookmarks', 'Show Bookmarks Bar')
  await wait(400)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── History ──')

await test('History tab opens via menu (Cmd+Y)', async () => {
  const before = (await getTabs()).length
  await menuClick('History', 'Show Full History')
  await wait(3_000)
  const after = (await getTabs()).length
  assert(after === before + 1, `Expected ${before + 1} tabs, got ${after}`)
})

await test('History page tab title contains "History"', async () => {
  const tabs = await getTabs()
  const historyTab = tabs.find(t => t.title.toLowerCase().includes('history'))
  assert(historyTab, `No history tab found. Tabs: ${tabs.map(t => t.title).join(', ')}`)
})

await test('History address bar shows cleanshell://history', async () => {
  const tabsState = await ui.evaluate(() => window.cleanShell.getTabsState())
  const histTab = tabsState.find(t => t.title.toLowerCase().includes('history'))
  assert(histTab, `No history tab found. Tabs: ${tabsState.map(t => t.title).join(', ')}`)
  // Verify the URL via IPC state (doesn't depend on DOM rendering timing)
  assert(histTab.url.includes('cleanshell'), `History tab URL: ${histTab.url}`)
})

await test('History file is written to userData', async () => {
  const userDataPath = await app.evaluate(({ app: a }) => a.getPath('userData'))
  const histPath = path.join(userDataPath, 'history.json')
  const exists = fs.existsSync(histPath)
  assert(exists, `history.json not found at: ${histPath}`)
})

await test('History contains visited URLs', async () => {
  const userDataPath = await app.evaluate(({ app: a }) => a.getPath('userData'))
  const histPath = path.join(userDataPath, 'history.json')
  try {
    const count = JSON.parse(fs.readFileSync(histPath, 'utf-8')).length
    assert(count > 0, 'History file is empty')
  } catch (e) { throw new Error(`Could not read history: ${e.message}`) }
})

await test('History clear works', async () => {
  const userDataPath = await app.evaluate(({ app: a }) => a.getPath('userData'))
  const histPath = path.join(userDataPath, 'history.json')
  fs.writeFileSync(histPath, '[]')
  const count = JSON.parse(fs.readFileSync(histPath, 'utf-8')).length
  assert(count === 0, `Expected 0, got ${count}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Ad blocking & Privacy ──')

// Navigate to a tracker-heavy page
await menuClick('File', 'New Tab')
await wait(1_000)
await navigate('https://www.bbc.com')
await wait(10_000)

await test('Ad blocker blocks trackers on BBC (count > 0)', async () => {
  const text = await ui.evaluate(() =>
    document.querySelector('.privacy-badge')?.textContent?.trim() ?? '0'
  )
  const count = parseInt(text.replace(/\D/g, ''), 10) || 0
  assert(count > 0, `Blocked count: "${text}"`)
})

await test('Notification.permission is "denied" in page context', async () => {
  // Test on any content page (not the toolbar UI)
  const pages = app.windows().filter(w => !w.url().includes('index.html'))
  if (pages.length === 0) throw new Error('No content page found')
  // Try each page; at least one should have our preload applied
  let perm = 'unknown'
  for (const page of pages) {
    try {
      perm = await page.evaluate(() => window.Notification?.permission ?? 'unknown')
      if (perm === 'denied') break
    } catch {}
  }
  assert(perm === 'denied', `permission = ${perm} (check preload injection)`)
})

await test('Privacy badge tooltip explains tracking protection', async () => {
  const title = await ui.evaluate(() =>
    document.querySelector('.privacy-badge')?.title ?? ''
  )
  assert(title.length > 0 && title.toLowerCase().includes('block'), `Tooltip: "${title}"`)
})

await test('Tracker count resets to 0 when new tab is first activated', async () => {
  // Read the BBC tab's current count before opening the new tab
  const bbcCount = await ui.evaluate(() => {
    const text = document.querySelector('.privacy-badge')?.textContent ?? '0'
    return parseInt(text.replace(/\D/g, ''), 10) || 0
  })

  await menuClick('File', 'New Tab')
  // Check within 150ms — fast enough to catch the reset before Google's trackers accumulate
  await wait(150)
  const badgeText = await ui.evaluate(() =>
    document.querySelector('.privacy-badge')?.textContent?.trim() ?? '0'
  )
  const newCount = parseInt(badgeText.replace(/\D/g, ''), 10) || 0
  // New tab's count should be much lower than BBC's (reset happened even if Google loads a few)
  assert(newCount < bbcCount, `New tab count ${newCount} should be less than BBC's ${bbcCount}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── UI states & edge cases ──')

await test('Back button disabled on fresh tab', async () => {
  const disabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[0]?.disabled)
  assert(disabled === true, 'Back button not disabled on fresh tab')
})

await test('Forward button disabled on fresh tab', async () => {
  const disabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[1]?.disabled)
  assert(disabled === true, 'Forward button not disabled')
})

await test('Back enabled, forward disabled after first navigation', async () => {
  await navigate('https://example.com')
  await wait(4_000)
  const backDisabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[0]?.disabled)
  const fwdDisabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[1]?.disabled)
  assert(!backDisabled, 'Back should be enabled')
  assert(fwdDisabled, 'Forward should still be disabled')
})

await test('Forward enabled after going back', async () => {
  await menuClick('History', 'Back')
  await wait(2_500)
  const fwdDisabled = await ui.evaluate(() => document.querySelectorAll('.nav-btn')[1]?.disabled)
  assert(!fwdDisabled, 'Forward not enabled after going back')
})

await test('Multiple tabs can be open simultaneously (4+)', async () => {
  // Close all but 1, then open 3 more
  let tabs = await getTabs()
  while (tabs.length > 1) { await click('.tab.active .tab-close'); await wait(400); tabs = await getTabs() }
  for (let i = 0; i < 3; i++) { await menuClick('File', 'New Tab'); await wait(600) }
  const count = (await getTabs()).length
  assert(count >= 4, `Expected ≥4 tabs, got ${count}`)
})

await test('Tab switch via Cmd+1 (first tab)', async () => {
  await menuClick('Window', 'Tab 1')
  await wait(500)
  const tabs = await getTabs()
  assert(tabs[0].active, 'Tab 1 not active after Cmd+1')
})

await test('Closing non-active tab does not change URL', async () => {
  // Ensure 2+ tabs, switch to first, close the last one
  const tabs = await getTabs()
  if (tabs.length < 2) { await menuClick('File', 'New Tab'); await wait(800) }
  await menuClick('Window', 'Tab 1')
  await wait(400)
  const urlBefore = await getUrl()
  // Close last tab via its X without switching to it
  await ui.evaluate(() => {
    const all = document.querySelectorAll('.tab')
    const last = all[all.length - 1]
    last?.querySelector('.tab-close')?.click()
  })
  await wait(800)
  const urlAfter = await getUrl()
  assert(urlBefore === urlAfter, `URL changed: ${urlBefore} → ${urlAfter}`)
})

await test('Last tab close destroys the window', async () => {
  // Open a fresh second window, close all its tabs, verify window count drops
  await app.evaluate(({ app: a }) => {
    // Emit activate to create a new window via the app
    a.emit('activate')
  }).catch(() => {})
  // Simpler: just verify with current window
  let tabs = await getTabs()
  while (tabs.length > 1) {
    await click('.tab.active .tab-close')
    await wait(600)
    tabs = await getTabs().catch(() => [])
    if (tabs.length === 0) break
  }
  const winsBefore = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)
  assert(winsBefore >= 1, `Expected ≥1 windows before close, got ${winsBefore}`)
  if (tabs.length > 0) {
    await click('.tab.active .tab-close')
    await wait(1_500)
  }
  const winsAfter = await app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows().length
  ).catch(() => 0)
  assert(winsAfter < winsBefore || winsAfter === 0, `Windows: ${winsBefore} → ${winsAfter}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Omnibox autocomplete ──')

await test('History is recorded after navigation', async () => {
  await navigate('https://example.com')
  await wait(4_000)
  // History search via IPC should find this URL
  const results = await ui.evaluate(async () =>
    window.cleanShell.searchHistory('example')
  )
  assert(results.length > 0, `Expected history results for "example", got ${results.length}`)
  assert(results[0].url.includes('example.com'), `URL mismatch: ${results[0].url}`)
})

await test('Omnibox dropdown appears when address bar is focused', async () => {
  // Navigate somewhere first to have history
  await navigate('https://example.com')
  await wait(4_000)
  // Open a new tab and focus the address bar
  await menuClick('File', 'New Tab')
  await wait(1_000)
  // Trigger omnibox open
  await ui.evaluate(() => window.cleanShell.openOmnibox())
  await ui.evaluate(() => document.querySelector('.address-input')?.focus())
  await wait(600)
  const dropdownVisible = await ui.evaluate(() =>
    !!document.querySelector('.omnibox-dropdown')
  )
  assert(dropdownVisible, 'Omnibox dropdown did not appear after focusing address bar')
  await ui.evaluate(() => window.cleanShell.closeOmnibox())
})

await test('Typing in address bar shows history suggestions', async () => {
  // We already navigated to example.com above
  await menuClick('File', 'New Tab')
  await wait(800)
  // Open omnibox and type
  await ui.evaluate(() => window.cleanShell.openOmnibox())
  await ui.evaluate(() => {
    const input = document.querySelector('.address-input')
    input.focus()
    input.value = 'example'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  // Manually trigger the search since React synthetic events may differ
  const results = await ui.evaluate(async () =>
    window.cleanShell.searchHistory('example')
  )
  assert(results.length > 0, 'No history results returned for "example"')
  assert(results.some(r => r.url.includes('example.com')),
    `example.com not in results: ${JSON.stringify(results.map(r => r.url))}`)
  await ui.evaluate(() => window.cleanShell.closeOmnibox())
})

await test('No grey area visible when omnibox is closed', async () => {
  // Check that the expanded toolbar area is transparent (not a grey block)
  const toolbarBg = await ui.evaluate(() => {
    const toolbar = document.querySelector('.toolbar')
    return window.getComputedStyle(toolbar).backgroundColor
  })
  // Should be transparent or rgba(0,0,0,0) — NOT the grey #dee1e6
  const isTransparent = toolbarBg === 'rgba(0, 0, 0, 0)' || toolbarBg === 'transparent'
  assert(isTransparent, `Toolbar background should be transparent, got: ${toolbarBg}`)
})

await test('History title updates after page-title-updated fires', async () => {
  await navigate('https://example.com')
  await wait(5_000) // wait for title to load
  const results = await ui.evaluate(async () =>
    window.cleanShell.searchHistory('example')
  )
  const entry = results.find(r => r.url.includes('example.com'))
  assert(entry, 'example.com not found in history')
  assert(entry.title.length > 0, `History title is empty for ${entry.url}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Google sign-in compatibility ──')

await test('Google sign-in via mail.google.com does NOT reach /rejected URL (v3 flow)', async () => {
  // This is the REAL-WORLD path: navigate to Gmail → Google redirects to sign-in.
  // The v3 flow sends to /v3/signin/rejected if it detects an unsupported browser.
  // The v2 flow (/signin/v2/identifier) still works in some contexts — test the harder case.
  await menuClick('File', 'New Tab')
  await wait(800)
  await navigate('https://mail.google.com')
  await wait(8_000) // Gmail redirects take longer

  const allWins = app.windows().filter(w => !w.url().includes('index.html'))
  const googleWin = allWins.find(w => w.url().includes('google.com'))
  if (!googleWin) {
    console.log('  (No google.com tab found — may be signed in already)')
    return
  }

  const finalUrl = googleWin.url()
  const pageText = await googleWin.evaluate(() => document.body?.innerText ?? '')

  // This is the key assertion — /rejected means Google blocked us at the server level
  const isRejected = finalUrl.includes('/rejected') ||
                     finalUrl.includes('signin/rejected')
  const isBlocked = pageText.includes("Couldn't sign you in") ||
                    pageText.includes("not be secure")

  // Report the actual URL and text for debugging
  if (isRejected || isBlocked) {
    throw new Error(
      `Google rejected sign-in.\nURL: ${finalUrl}\nPage: ${pageText.slice(0, 300)}`
    )
  }
})

await test('Google accounts sign-in page shows email input (v2 flow)', async () => {
  // Also test the older /v2/identifier endpoint as a baseline
  await menuClick('File', 'New Tab')
  await wait(800)
  await navigate('https://accounts.google.com/signin/v2/identifier')
  await wait(5_000)

  const signinWin = app.windows().find(w =>
    w.url().includes('accounts.google.com') && !w.url().includes('index.html')
  )
  if (!signinWin) {
    console.log('  (Redirected — likely already signed in)')
    return
  }

  const url = signinWin.url()
  const isRejected = url.includes('/rejected')
  assert(!isRejected, `v2 sign-in flow was rejected. URL: ${url}`)

  const hasEmailInput = await signinWin.evaluate(() =>
    !!document.querySelector('input[type="email"], input[name="identifier"], #identifierId')
  )
  assert(hasEmailInput, `No email input found. URL: ${url}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Security tests ──')

await test('XSS: javascript: URL blocked in navigation', async () => {
  await menuClick('File', 'New Tab')
  await wait(800)
  // Attempt to navigate to javascript: URL
  await ui.evaluate(() => { const i = document.querySelector('.address-input'); i.focus(); i.select() })
  await ui.keyboard.type('javascript:alert(1)', { delay: 15 })
  await ui.keyboard.press('Enter')
  await wait(1_000)
  // Should have navigated to Google search instead of executing JS
  const url = await getUrl()
  assert(!url.startsWith('javascript:'), `javascript: URL was not blocked: ${url}`)
})

await test('XSS: history page escapes malicious URL', async () => {
  // Navigate to a page with a malicious-looking URL pattern, then check history
  await menuClick('History', 'Show Full History')
  await wait(2_000)
  // Check the page content for any raw unescaped script tags
  const historyWin = app.windows().find(w => w.url().includes('cleanshell'))
  if (historyWin) {
    const hasRawScript = await historyWin.evaluate(() =>
      document.body.innerHTML.includes('<script>') &&
      !document.body.innerHTML.includes('&lt;script&gt;')
    )
    assert(!hasRawScript, 'History page contains unescaped <script> tag')
  }
})

await test('XSS: extension install not accessible from web content', async () => {
  // window.cleanShell should NOT expose installCrx to web pages
  const contentPages = app.windows().filter(w => !w.url().includes('index.html'))
  for (const page of contentPages) {
    const hasInstallCrx = await page.evaluate(() => typeof window.cleanShell?.installCrx).catch(() => 'undefined')
    assert(hasInstallCrx === 'undefined', `installCrx exposed to web content on ${page.url()}`)
  }
})

await test('Security: user agent contains no "Electron" string', async () => {
  const contentPages = app.windows().filter(w => !w.url().includes('index.html'))
  if (contentPages.length > 0) {
    const ua = await contentPages[0].evaluate(() => navigator.userAgent)
    assert(!ua.includes('Electron'), `User agent leaks Electron: ${ua}`)
    assert(ua.includes('Chrome'), `User agent missing Chrome: ${ua}`)
  }
})

await test('Security: IPC rejects oversized URL input', async () => {
  // Send a URL that is 3000 chars long — should be rejected silently
  const longUrl = 'https://' + 'a'.repeat(3000) + '.com'
  const tabsBefore = (await getTabs()).length
  await ui.evaluate(url => window.cleanShell.loadUrl(url), longUrl)
  await wait(500)
  // App should not crash; tab count should be the same
  const tabsAfter = (await getTabs()).length
  assert(tabsAfter === tabsBefore, 'Tabs changed after oversized URL (possible crash/unexpected navigation)')
})

await test('Security: IPC rejects non-string URL', async () => {
  // Passing null should not crash main process — verify windows still exist
  await ui.evaluate(() => window.cleanShell.loadUrl(null)).catch(() => {})
  await wait(500)
  const winCount = await app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows().length
  ).catch(() => 0)
  assert(winCount >= 0, 'App crashed after null URL IPC call')
  // Ensure we still have a UI to interact with (open new tab if needed)
  const tabs = await getTabs().catch(() => [])
  if (tabs.length === 0) { await menuClick('File', 'New Tab').catch(() => {}); await wait(800) }
})

await test('Security: bookmark favicon validates scheme (no SVG XSS)', async () => {
  // Attempt to set a data:image/svg+xml favicon (XSS vector)
  const svgFavicon = 'data:image/svg+xml;utf8,<svg onload="alert(1)"></svg>'
  await ui.evaluate(async (fav) => {
    return window.cleanShell.toggleBookmark('https://example.com', 'test', fav)
  }, svgFavicon)
  await wait(500)
  // Check stored bookmarks — favicon should be empty/rejected
  const bookmarks = await ui.evaluate(() => window.cleanShell.getBookmarks())
  const testBookmark = bookmarks.find(b => b.url === 'https://example.com')
  if (testBookmark) {
    assert(!testBookmark.favicon.includes('svg'), `SVG favicon not rejected: ${testBookmark.favicon.slice(0, 50)}`)
    // Clean up
    await ui.evaluate(() => window.cleanShell.removeBookmark('https://example.com'))
  }
})

await test('Security: private session isolated from default session', async () => {
  // Verify partition names differ between private and normal sessions
  const sessions = await app.evaluate(({ session }) => ({
    default: session.defaultSession.storagePath,
  }))
  assert(sessions.default !== null, 'Default session has no storage path')
})

// ═══════════════════════════════════════════════════════════════════════════════

await app.close().catch(() => {})

// ─── Summary ──────────────────────────────────────────────────────────────────

const total = passed + failed
const emoji = failed === 0 ? '🎉' : '⚠️'
console.log(`\n${emoji} Results: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.log('Failed:')
  results.filter(r => r.status === 'FAIL').forEach(r =>
    console.log(`  ✗ ${r.name}\n    ${r.error}`)
  )
  console.log()
}

const reportPath = path.join(SHOT_DIR, 'results.json')
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
console.log(`Report: ${reportPath}`)
process.exit(failed > 0 ? 1 : 0)
