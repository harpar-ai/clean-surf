import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { Session, BaseWindow, WebContents } from 'electron'
import type { TabManager } from './tab-manager'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'

const extensionsDir = path.join(app.getPath('userData'), 'extensions')

export class ExtensionManager {
  private ext: ElectronChromeExtensions
  private session: Session
  private win: BaseWindow

  constructor(ses: Session, win: BaseWindow, tabManager: TabManager) {
    this.session = ses
    this.win = win

    // Reuse existing instance if one already exists for this session (prevents
    // "Extensions instance already exists" error when opening a second window)
    const existing = ElectronChromeExtensions.fromSession(ses)
    if (existing) {
      this.ext = existing
    } else {
      this.ext = new ElectronChromeExtensions({
        license: 'GPL-3.0',
        session: ses,
        createTab: async (details) => {
          const tabId = tabManager.createTab(details.url ?? 'https://www.google.com')
          const tab = tabManager.getTabById(tabId)
          if (!tab) throw new Error('Tab creation failed')
          return [tab.view.webContents, win]
        },
        selectTab: (tab: WebContents, _window: BaseWindow) => {
          const state = tabManager.getTabsState()
          const found = state.find(t => tabManager.getTabById(t.id)?.view.webContents === tab)
          if (found) tabManager.switchTab(found.id)
        },
        removeTab: (tab: WebContents, _window: BaseWindow) => {
          const state = tabManager.getTabsState()
          const found = state.find(t => tabManager.getTabById(t.id)?.view.webContents === tab)
          if (found) tabManager.closeTab(found.id)
        },
        createWindow: async (details) => {
          if (details.url) {
            const urls = Array.isArray(details.url) ? details.url : [details.url]
            urls.forEach(u => tabManager.createTab(u))
          }
          return win
        }
      })
    }
  }

  // Call this after every tab creation
  notifyTabAdded(webContents: WebContents): void {
    this.ext.addTab(webContents, this.win)
  }

  // Call this when active tab changes
  notifyTabSelected(webContents: WebContents): void {
    this.ext.selectTab(webContents)
  }

  // Call this when a tab is closed
  notifyTabRemoved(webContents: WebContents): void {
    this.ext.removeTab(webContents)
  }

  async loadInstalledExtensions(): Promise<void> {
    if (!fs.existsSync(extensionsDir)) return
    const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(extensionsDir, d.name))

    for (const dir of dirs) {
      try {
        await this.session.loadExtension(dir, { allowFileAccess: true })
      } catch (err) {
        console.error('[Extensions] Failed to load:', dir, err)
      }
    }
  }

  async installCrx(crxPath: string): Promise<string> {
    if (!fs.existsSync(extensionsDir)) {
      fs.mkdirSync(extensionsDir, { recursive: true })
    }
    const name = path.basename(crxPath, '.crx')
    const destDir = path.join(extensionsDir, name)

    const data = fs.readFileSync(crxPath)
    const magic = data.readUInt32LE(0)
    if (magic !== 0x34326663) {
      throw new Error('Not a valid CRX3 file')
    }
    const headerLength = data.readUInt32LE(8)
    const zipData = data.subarray(12 + headerLength)

    const tmpZip = path.join(os.tmpdir(), `${name}.zip`)
    fs.writeFileSync(tmpZip, zipData)

    fs.mkdirSync(destDir, { recursive: true })
    const { execSync } = await import('child_process')
    execSync(`unzip -o "${tmpZip}" -d "${destDir}"`)
    fs.unlinkSync(tmpZip)

    await this.session.loadExtension(destDir, { allowFileAccess: true })
    return destDir
  }

  getExtensions() {
    return this.session.getAllExtensions()
  }
}
