import { BaseWindow, WebContentsView, IpcMainInvokeEvent, shell } from 'electron'
import path from 'path'
import { TabManager } from './tab-manager'
import { ExtensionManager } from './extension-manager'
import { applyAdBlocker, onRequestBlocked } from './ad-blocker'
import { TOOLBAR_HEIGHT } from './constants'
import type { Session } from 'electron'

let currentToolbarHeight = TOOLBAR_HEIGHT
const OMNIBOX_EXTRA = 360 // px added when address bar is open to expose dropdown
const WINDOW_WIDTH = 1280
const WINDOW_HEIGHT = 800

export interface BrowserWindowRegistry {
  getTabManagerForEvent(event: IpcMainInvokeEvent): TabManager | null
  getExtensionManagerForEvent(event: IpcMainInvokeEvent): ExtensionManager | null
}

export class CleanShellWindow {
  win: BaseWindow
  uiView: WebContentsView
  tabManager: TabManager
  extensionManager: ExtensionManager
  isPrivate: boolean

  constructor(ses: Session, isPrivate = false) {
    this.isPrivate = isPrivate
    applyAdBlocker(ses)

    this.win = new BaseWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 16 },
      backgroundColor: isPrivate ? '#1a1a2e' : '#f0f0f0',
      show: false
    })

    this.uiView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../preload/browser-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.win.contentView.addChildView(this.uiView)
    this.layoutUI()

    this.tabManager = new TabManager(this.win, this.uiView, ses, isPrivate)
    this.extensionManager = new ExtensionManager(ses, this.win, this.tabManager)
    this.tabManager.setExtensionManager(this.extensionManager)

    onRequestBlocked((wcId) => {
      const tab = this.tabManager.getTabByWebContentsId(wcId)
      if (tab) this.tabManager.incrementTrackerCount(tab.id)
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.uiView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.uiView.webContents.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    this.uiView.webContents.once('did-finish-load', () => {
      this.uiView.webContents.send('window:init', { isPrivate })
      this.tabManager.createTab()
      this.win.show()
    })

    this.win.on('resize', () => {
      this.layoutUI()
      this.tabManager.layoutViews()
    })

    this.win.on('closed', () => {
      this.tabManager.destroyAll()
    })

    this.uiView.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  private layoutUI(toolbarHeight = currentToolbarHeight): void {
    const { width } = this.win.getBounds()
    this.uiView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  }

  setToolbarHeight(height: number): void {
    currentToolbarHeight = height
    this.layoutUI(height)
    this.tabManager.setToolbarHeight(height)
  }

  // Expand toolbar to reveal omnibox dropdown (separate WebContentsView workaround).
  // The expanded area is made transparent so only the dropdown box is visible.
  openOmnibox(): void {
    const expanded = currentToolbarHeight + OMNIBOX_EXTRA
    this.uiView.setBackgroundColor('#00000000') // transparent
    this.layoutUI(expanded)
    this.tabManager.setToolbarHeight(expanded)
  }

  closeOmnibox(): void {
    this.layoutUI(currentToolbarHeight)
    this.tabManager.setToolbarHeight(currentToolbarHeight)
    // Restore solid background after layout settles
    setTimeout(() => {
      if (!this.win.isDestroyed()) {
        this.uiView.setBackgroundColor(this.isPrivate ? '#1a1a2e' : '#dee1e6')
      }
    }, 50)
  }
}

export class WindowRegistry implements BrowserWindowRegistry {
  private windows = new Map<number, CleanShellWindow>()

  register(csWin: CleanShellWindow): void {
    this.windows.set(csWin.uiView.webContents.id, csWin)
  }

  unregister(csWin: CleanShellWindow): void {
    this.windows.delete(csWin.uiView.webContents.id)
  }

  getTabManagerForEvent(event: IpcMainInvokeEvent): TabManager | null {
    return this.windows.get(event.sender.id)?.tabManager ?? null
  }

  getExtensionManagerForEvent(event: IpcMainInvokeEvent): ExtensionManager | null {
    return this.windows.get(event.sender.id)?.extensionManager ?? null
  }

  getTabManagerForWindow(win: BaseWindow): TabManager | null {
    for (const csWin of this.windows.values()) {
      if (csWin.win === win) return csWin.tabManager
    }
    return null
  }

  getWindowForEvent(event: IpcMainInvokeEvent): CleanShellWindow | null {
    return this.windows.get(event.sender.id) ?? null
  }
}
