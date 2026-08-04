import { net, shell, dialog, BrowserWindow, BaseWindow } from 'electron'
import { app } from 'electron'

const GITHUB_REPO = 'harpar-ai/clean-surf'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

let notifiedVersion: string | null = null

async function fetchLatestVersion(): Promise<{ version: string; url: string } | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'GET',
      url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': `Clean-Surf-Browser/${app.getVersion()}` }
    })
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (data.tag_name) {
            resolve({ version: data.tag_name.replace(/^v/, ''), url: data.html_url })
          } else {
            resolve(null)
          }
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10))
  const [lMaj, lMin, lPat] = parse(latest)
  const [cMaj, cMin, cPat] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return (lPat ?? 0) > (cPat ?? 0)
}

// For manual "Check for Updates" — always gives feedback via a dialog
export async function checkForUpdatesManual(): Promise<void> {
  const current = app.getVersion()

  const result = await fetchLatestVersion()

  if (!result) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Update check failed',
      message: 'Could not reach GitHub to check for updates.',
      detail: "Make sure you're connected to the internet and try again.",
      buttons: ['OK']
    })
    return
  }

  const { version: latest, url } = result

  if (!isNewer(latest, current)) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Clean Surf is up to date',
      message: `You are on the latest version (${current}).`,
      buttons: ['OK']
    })
    return
  }

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update available',
    message: `Clean Surf ${latest} is available`,
    detail: `You are running ${current}. Would you like to download the update?`,
    buttons: ['Download', 'Later'],
    defaultId: 0
  })

  if (response === 0) {
    shell.openExternal(url)
  }

  notifiedVersion = latest
}

// For background checks — silent if up to date, notification if update found
export async function checkForUpdates(): Promise<void> {
  const current = app.getVersion()
  const result = await fetchLatestVersion()
  if (!result) return

  const { version: latest, url } = result
  if (!latest || !isNewer(latest, current)) return
  if (notifiedVersion === latest) return // already notified for this version

  notifiedVersion = latest

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update available',
    message: `Clean Surf ${latest} is available`,
    detail: `You are running ${current}. Download the update now?`,
    buttons: ['Download', 'Later'],
    defaultId: 0
  })

  if (response === 0) shell.openExternal(url)
}

export function startUpdateChecker(): void {
  setTimeout(() => checkForUpdates(), 30_000)
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS)
}
