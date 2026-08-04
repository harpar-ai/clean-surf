import { ipcMain, dialog } from 'electron'
import type { BrowserWindowRegistry } from './browser-window'
import * as bookmarkManager from './bookmark-manager'
import { TOOLBAR_HEIGHT_NO_BAR, TOOLBAR_HEIGHT_WITH_BAR } from './constants'

export function registerIpcHandlers(registry: BrowserWindowRegistry): void {
  // Tab operations
  ipcMain.handle('tabs:create', (_event, url?: string) => {
    return registry.getTabManagerForEvent(_event)?.createTab(url)
  })
  ipcMain.handle('tabs:close', (_event, tabId: number) => {
    registry.getTabManagerForEvent(_event)?.closeTab(tabId)
  })
  ipcMain.handle('tabs:switch', (_event, tabId: number) => {
    registry.getTabManagerForEvent(_event)?.switchTab(tabId)
  })
  ipcMain.handle('tabs:get-state', (_event) => {
    return registry.getTabManagerForEvent(_event)?.getTabsState() ?? []
  })

  // Navigation
  ipcMain.handle('nav:load-url', (_event, url: string) => {
    const mgr = registry.getTabManagerForEvent(_event)
    const id = mgr?.getActiveTabId()
    if (mgr && id !== null && id !== undefined) mgr.navigateTo(id, url)
  })
  ipcMain.handle('nav:go-back', (_event) => {
    const mgr = registry.getTabManagerForEvent(_event)
    const id = mgr?.getActiveTabId()
    if (mgr && id !== null && id !== undefined) mgr.goBack(id)
  })
  ipcMain.handle('nav:go-forward', (_event) => {
    const mgr = registry.getTabManagerForEvent(_event)
    const id = mgr?.getActiveTabId()
    if (mgr && id !== null && id !== undefined) mgr.goForward(id)
  })
  ipcMain.handle('nav:reload', (_event) => {
    const mgr = registry.getTabManagerForEvent(_event)
    const id = mgr?.getActiveTabId()
    if (mgr && id !== null && id !== undefined) mgr.reload(id)
  })

  // Toolbar height (updated when bookmark bar shows/hides)
  ipcMain.handle('ui:set-toolbar-height', (_event, showBar: boolean) => {
    const height = showBar ? TOOLBAR_HEIGHT_WITH_BAR : TOOLBAR_HEIGHT_NO_BAR
    const csWin = (registry as any).getWindowForEvent?.(_event)
    csWin?.setToolbarHeight(height)
  })

  // Bookmarks
  ipcMain.handle('bookmarks:get', () => bookmarkManager.getAll())
  ipcMain.handle('bookmarks:clear', (_event) => {
    const all = bookmarkManager.getAll()
    all.forEach(b => bookmarkManager.remove(b.url))
    // Notify renderer so React state updates immediately
    registry.getTabManagerForEvent(_event)?.sendToUIPublic('bookmarks:changed', [])
  })
  ipcMain.handle('bookmarks:is-bookmarked', (_event, url: string) => bookmarkManager.isBookmarked(url))
  ipcMain.handle('bookmarks:toggle', (_event, url: string, title: string, favicon: string) => {
    const nowBookmarked = bookmarkManager.toggle(url, title, favicon)
    // Broadcast change to all renderers
    const mgr = registry.getTabManagerForEvent(_event)
    mgr?.sendToUIPublic('bookmarks:changed', bookmarkManager.getAll())
    return nowBookmarked
  })
  ipcMain.handle('bookmarks:remove', (_event, url: string) => {
    bookmarkManager.remove(url)
    registry.getTabManagerForEvent(_event)?.sendToUIPublic('bookmarks:changed', bookmarkManager.getAll())
  })

  // Extensions
  ipcMain.handle('extensions:install-crx', async (_event, crxPath: string) => {
    return registry.getExtensionManagerForEvent(_event)?.installCrx(crxPath)
  })
  ipcMain.handle('extensions:list', (_event) => {
    const extMgr = registry.getExtensionManagerForEvent(_event)
    if (!extMgr) return []
    return Object.values(extMgr.getExtensions()).map(ext => ({
      id: ext.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      description: ext.manifest.description ?? ''
    }))
  })
  ipcMain.handle('extensions:open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Chrome Extension', extensions: ['crx'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
