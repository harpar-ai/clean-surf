import { autoUpdater } from 'electron-updater'
import { dialog, shell } from 'electron'
import { app } from 'electron'

const GITHUB_RELEASE_URL = 'https://github.com/harpar-ai/clean-surf/releases/latest'

// Don't download automatically — always ask first
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// Suppress electron-updater's own dialogs; we handle UX ourselves
autoUpdater.logger = null

let manualCheck = false
let downloadInProgress = false

// ─── Events ────────────────────────────────────────────────────────────────

autoUpdater.on('update-available', async (info) => {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update available',
    message: `Clean Surf ${info.version} is available`,
    detail: `You are running ${app.getVersion()}. Download the update in the background?`,
    buttons: ['Download', 'Later'],
    defaultId: 0
  })
  if (response === 0) {
    downloadInProgress = true
    autoUpdater.downloadUpdate()
  }
})

autoUpdater.on('update-not-available', () => {
  if (!manualCheck) return
  manualCheck = false
  dialog.showMessageBox({
    type: 'info',
    title: 'Clean Surf is up to date',
    message: `You are on the latest version (${app.getVersion()}).`,
    buttons: ['OK']
  })
})

autoUpdater.on('download-progress', (progress) => {
  // Could surface progress in the toolbar in future; for now just let it run silently
  console.log(`[Updater] Download ${Math.round(progress.percent)}%`)
})

autoUpdater.on('update-downloaded', async () => {
  downloadInProgress = false
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update ready to install',
    message: 'Clean Surf has been updated.',
    detail: 'Restart now to apply the update, or it will be installed the next time you quit.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0
  })
  if (response === 0) {
    autoUpdater.quitAndInstall()
  }
})

autoUpdater.on('error', async (err) => {
  downloadInProgress = false
  console.error('[Updater] Error:', err.message)
  if (manualCheck) {
    manualCheck = false
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Update check failed',
      message: 'Could not check for updates automatically.',
      detail: 'Open the releases page to download manually?',
      buttons: ['Open Releases Page', 'Cancel'],
      defaultId: 0
    })
    if (response === 0) shell.openExternal(GITHUB_RELEASE_URL)
  }
})

// ─── Public API ────────────────────────────────────────────────────────────

// Manual "Check for Updates…" from menu — always shows feedback
export async function checkForUpdatesManual(): Promise<void> {
  if (downloadInProgress) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Downloading update',
      message: 'An update is already downloading in the background.',
      buttons: ['OK']
    })
    return
  }
  manualCheck = true
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // error handler fires the dialog
  }
}

// Background check on startup / timer
export function startUpdateChecker(): void {
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}
