import { ElectronBlocker } from '@ghostery/adblocker-electron'
import fetch from 'cross-fetch'
import type { Session } from 'electron'

let blocker: ElectronBlocker | null = null

export async function initAdBlocker(): Promise<void> {
  try {
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    console.log('[AdBlocker] Initialized from prebuilt lists')
  } catch (err) {
    console.error('[AdBlocker] Failed to load prebuilt lists, falling back to empty:', err)
    blocker = ElectronBlocker.parse('')
  }
}

export function applyAdBlocker(ses: Session): void {
  if (!blocker) return
  blocker.enableBlockingInSession(ses)
}

export function getBlocker(): ElectronBlocker | null {
  return blocker
}

// Subscribe to blocked request events; callback receives the webContentsId of the tab
export function onRequestBlocked(cb: (webContentsId: number) => void): void {
  if (!blocker) return
  blocker.on('request-blocked', (request) => {
    if (request.tabId !== undefined && request.tabId !== -1) cb(request.tabId)
  })
}
