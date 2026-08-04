import { WebContentsView } from 'electron'
import type { BaseWindow, Session } from 'electron'
import type { ExtensionManager } from './extension-manager'
import { applyAdBlocker } from './ad-blocker'
import { addEntry } from './history-manager'
import { TOOLBAR_HEIGHT } from './constants'
import path from 'path'

let toolbarHeight = TOOLBAR_HEIGHT

export interface Tab {
  id: number
  view: WebContentsView
  title: string
  url: string
  favicon: string
  isLoading: boolean
  trackerCount: number
  canGoBack: boolean
  canGoForward: boolean
}

let nextTabId = 1

export class TabManager {
  private win: BaseWindow
  private uiView: WebContentsView
  private tabs = new Map<number, Tab>()
  private activeTabId: number | null = null
  private session: Session
  private isPrivate: boolean
  private extensionManager: ExtensionManager | null = null
  private lastClosedUrl: string | null = null

  constructor(win: BaseWindow, uiView: WebContentsView, ses: Session, isPrivate = false) {
    this.win = win
    this.uiView = uiView
    this.session = ses
    this.isPrivate = isPrivate
  }

  setExtensionManager(mgr: ExtensionManager): void {
    this.extensionManager = mgr
  }

  getTabById(id: number): Tab | undefined {
    return this.tabs.get(id)
  }

  getTabByWebContentsId(wcId: number): Tab | undefined {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === wcId) return tab
    }
    return undefined
  }

  switchToTabByIndex(index: number): void {
    const ids = [...this.tabs.keys()]
    if (index < ids.length) this.switchTab(ids[index])
  }

  switchToLastTab(): void {
    const ids = [...this.tabs.keys()]
    if (ids.length > 0) this.switchTab(ids[ids.length - 1])
  }

  reopenLastClosed(): void {
    if (this.lastClosedUrl) this.createTab(this.lastClosedUrl)
  }

  sendToUIPublic(channel: string, data: unknown): void {
    this.sendToUI(channel, data)
  }

  setToolbarHeight(height: number): void {
    toolbarHeight = height
    this.layoutViews()
  }

  createTab(url = 'https://www.google.com'): number {
    const id = nextTabId++
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        preload: path.join(__dirname, '../preload/page-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // Pass session seed for fingerprint spoofing
        additionalArguments: [`--fp-seed=${this.isPrivate ? Math.random() : 0}`]
      }
    })

    applyAdBlocker(this.session)

    // Intercept unexpected downloads
    view.webContents.session.on('will-download', (_event, item, _contents) => {
      const initiator = (view.webContents as any)._userInitiatedDownload
      if (!initiator) {
        item.cancel()
        return
      }
      ;(view.webContents as any)._userInitiatedDownload = false
    })

    // Track user-initiated link clicks to allow legitimate downloads
    view.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'mouseDown') {
        ;(view.webContents as any)._userInitiatedDownload = true
      }
    })

    const tab: Tab = {
      id,
      view,
      title: 'New Tab',
      url,
      favicon: '',
      isLoading: false,
      trackerCount: 0,
      canGoBack: false,
      canGoForward: false
    }

    this.tabs.set(id, tab)
    this.win.contentView.addChildView(view)

    this.wireEvents(tab)
    this.layoutView(view)
    view.webContents.loadURL(url)

    // Notify extension system of new tab
    this.extensionManager?.notifyTabAdded(view.webContents)

    this.switchTab(id)
    this.notifyTabsChanged()
    return id
  }

  private wireEvents(tab: Tab): void {
    const wc = tab.view.webContents

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      this.notifyTabsChanged()
      this.sendToUI('page:title-update', { tabId: tab.id, title })
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? ''
      this.notifyTabsChanged()
      this.sendToUI('page:favicon-update', { tabId: tab.id, favicon: tab.favicon })
    })

    wc.on('did-start-loading', () => {
      tab.isLoading = true
      tab.trackerCount = 0
      this.notifyTabsChanged()
      this.sendToUI('page:loading-state', { tabId: tab.id, isLoading: true })
    })

    wc.on('did-stop-loading', () => {
      tab.isLoading = false
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
      this.notifyTabsChanged()
      this.sendToUI('page:loading-state', { tabId: tab.id, isLoading: false })
    })

    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
      this.notifyTabsChanged()
      this.sendToUI('page:url-change', { tabId: tab.id, url })
      // Track in history (not for private mode or internal pages)
      if (!this.isPrivate) addEntry(url, tab.title)
    })

    wc.on('did-navigate-in-page', (_e, url) => {
      tab.url = url
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
      this.notifyTabsChanged()
      this.sendToUI('page:url-change', { tabId: tab.id, url })
    })

    // Open new-window requests as new tabs instead of popup windows
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url)
      return { action: 'deny' }
    })
  }

  switchTab(id: number): void {
    if (this.activeTabId !== null) {
      const prev = this.tabs.get(this.activeTabId)
      if (prev) prev.view.setVisible(false)
    }
    const tab = this.tabs.get(id)
    if (!tab) return
    this.activeTabId = id
    tab.view.setVisible(true)
    this.extensionManager?.notifyTabSelected(tab.view.webContents)
    this.sendToUI('page:active-tab', { tabId: id })
    this.notifyTabsChanged()
  }

  closeTab(id: number): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (tab.url && !tab.url.startsWith('cleanshell://')) {
      this.lastClosedUrl = tab.url
    }
    this.extensionManager?.notifyTabRemoved(tab.view.webContents)
    this.win.contentView.removeChildView(tab.view)
    tab.view.webContents.destroy()
    this.tabs.delete(id)

    if (this.activeTabId === id) {
      this.activeTabId = null
      const remaining = [...this.tabs.keys()]
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1])
      } else {
        // Defer window destroy to next tick so the IPC reply from uiView completes first
        const win = this.win
        setImmediate(() => { if (!win.isDestroyed()) win.destroy() })
        return
      }
    }
    this.notifyTabsChanged()
  }

  navigateTo(tabId: number, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    let normalized: string
    if (url.startsWith('cleanshell://') || url.startsWith('http') || url.startsWith('file://') || url.startsWith('about:')) {
      normalized = url
    } else if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(url) && !url.includes(' ')) {
      normalized = `https://${url}`
    } else {
      normalized = `https://www.google.com/search?q=${encodeURIComponent(url)}`
    }
    tab.view.webContents.loadURL(normalized)
  }

  goBack(tabId: number): void {
    const wc = this.tabs.get(tabId)?.view.webContents
    wc?.navigationHistory.goBack()
  }

  goForward(tabId: number): void {
    const wc = this.tabs.get(tabId)?.view.webContents
    wc?.navigationHistory.goForward()
  }

  reload(tabId: number): void {
    this.tabs.get(tabId)?.view.webContents.reload()
  }

  getActiveTabId(): number | null {
    return this.activeTabId
  }

  getActiveTab(): Tab | null {
    if (this.activeTabId === null) return null
    return this.tabs.get(this.activeTabId) ?? null
  }

  getTabsState() {
    return [...this.tabs.values()].map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      isLoading: t.isLoading,
      trackerCount: t.trackerCount,
      canGoBack: t.canGoBack,
      canGoForward: t.canGoForward,
      isActive: t.id === this.activeTabId
    }))
  }

  layoutViews(): void {
    const bounds = this.win.getBounds()
    for (const tab of this.tabs.values()) {
      this.layoutView(tab.view, bounds.width, bounds.height)
    }
  }

  private layoutView(
    view: WebContentsView,
    width?: number,
    height?: number
  ): void {
    const b = this.win.getBounds()
    const w = width ?? b.width
    const h = height ?? b.height
    view.setBounds({ x: 0, y: toolbarHeight, width: w, height: h - toolbarHeight })
  }

  private sendToUI(channel: string, data: unknown): void {
    if (!this.uiView.webContents.isDestroyed()) {
      this.uiView.webContents.send(channel, data)
    }
  }

  private notifyTabsChanged(): void {
    this.sendToUI('tabs:state', this.getTabsState())
  }

  incrementTrackerCount(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (tab) {
      tab.trackerCount++
      this.sendToUI('page:tracker-count', { tabId, count: tab.trackerCount })
    }
  }

  destroyAll(): void {
    for (const tab of this.tabs.values()) {
      tab.view.webContents.destroy()
    }
    this.tabs.clear()
    this.activeTabId = null
  }
}
