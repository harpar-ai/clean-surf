import { net, shell, Notification } from 'electron'
import { app } from 'electron'

// Set this to your GitHub username/repo
const GITHUB_REPO = 'harpar-ai/clean-surf'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // check every 6 hours

let notifiedVersion: string | null = null

async function fetchLatestVersion(): Promise<{ version: string; url: string } | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'GET',
      url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'Clean-Surf-Browser' }
    })

    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          resolve({ version: data.tag_name?.replace(/^v/, '') ?? '', url: data.html_url })
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [lMaj, lMin, lPat] = parse(latest)
  const [cMaj, cMin, cPat] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

export async function checkForUpdates(silent = true): Promise<void> {
  const current = app.getVersion()
  const result = await fetchLatestVersion()
  if (!result) return

  const { version: latest, url } = result
  if (!latest || !isNewer(latest, current)) return
  if (notifiedVersion === latest) return // don't spam the same version

  notifiedVersion = latest

  // Show macOS system notification
  const notif = new Notification({
    title: 'Clean Surf update available',
    body: `Version ${latest} is ready. Click to download.`,
    silent: false
  })
  notif.on('click', () => shell.openExternal(url))
  notif.show()
}

export function startUpdateChecker(): void {
  // First check after 30 seconds, then every 6 hours
  setTimeout(() => checkForUpdates(true), 30_000)
  setInterval(() => checkForUpdates(true), CHECK_INTERVAL_MS)
}
