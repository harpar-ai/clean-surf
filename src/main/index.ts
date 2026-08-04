import { app, Menu, protocol, nativeImage } from 'electron'
import path from 'path'
import { startUpdateChecker } from './update-checker'
import { CleanShellWindow, WindowRegistry } from './browser-window'
import { initAdBlocker } from './ad-blocker'
import { registerIpcHandlers } from './ipc-handlers'
import { getDefaultSession, createPrivateSession } from './session-manager'
import * as historyManager from './history-manager'

app.name = 'Clean Surf'

// Set custom dock icon — overrides the Electron atom logo at runtime
app.whenReady().then(() => {
  const iconPath = path.join(__dirname, '../../assets/CleanSurf.icns')
  try {
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  } catch {}
})

// Register cleanshell:// as a privileged scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'cleanshell', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

const registry = new WindowRegistry()

async function createWindow(isPrivate = false): Promise<CleanShellWindow> {
  const ses = isPrivate ? createPrivateSession() : getDefaultSession()
  const csWin = new CleanShellWindow(ses, isPrivate)
  registry.register(csWin)
  csWin.win.on('closed', () => registry.unregister(csWin))
  await csWin.extensionManager.loadInstalledExtensions()
  return csWin
}

function getActiveTabManager() {
  const { BaseWindow } = require('electron') as typeof import('electron')
  // getFocusedWindow() returns null in automation; fall back to most recent window
  const win = BaseWindow.getFocusedWindow() ?? BaseWindow.getAllWindows().at(-1) ?? null
  if (!win) return null
  return registry.getTabManagerForWindow(win)
}

async function main(): Promise<void> {
  await app.whenReady()
  await initAdBlocker()

  // Handle cleanshell:// internal pages
  protocol.handle('cleanshell', (request) => {
    const url = new URL(request.url)
    const host = url.hostname
    const pathname = url.pathname

    if (host === 'history') {
      if (pathname === '/clear') {
        historyManager.clearAll()
        return Response.redirect('cleanshell://history', 302)
      }
      if (pathname === '/delete') {
        const id = url.searchParams.get('id')
        if (id) historyManager.deleteEntry(id)
        return Response.redirect('cleanshell://history', 302)
      }
      const query = url.searchParams.get('q') ?? ''
      return new Response(historyManager.generateHistoryPage(query), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    return new Response('Not found', { status: 404 })
  })

  registerIpcHandlers(registry)
  buildAppMenu()
  await createWindow()
  startUpdateChecker()

  app.on('activate', async () => {
    const { BaseWindow } = await import('electron')
    if (BaseWindow.getAllWindows().length === 0) await createWindow()
  })
}

function buildAppMenu(): void {
  const tabAction = (fn: (mgr: ReturnType<typeof getActiveTabManager>) => void) =>
    () => fn(getActiveTabManager())

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Clean Surf',
      submenu: [
        { role: 'about', label: 'About Clean Surf' },
        {
          label: 'Check for Updates…',
          click: async () => {
            const { checkForUpdates } = await import('./update-checker')
            await checkForUpdates(false)
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: tabAction(mgr => mgr?.createTab())
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: async () => { await createWindow() }
        },
        {
          label: 'New Private Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: async () => { await createWindow(true) }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) mgr.closeTab(id)
          })
        },
        {
          label: 'Reopen Last Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: tabAction(mgr => mgr?.reopenLastClosed())
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find...',
          accelerator: 'CmdOrCtrl+F',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) {
              mgr.getTabById(id)?.view.webContents.findInPage('')
            }
          })
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) mgr.reload(id)
          })
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) mgr.getTabById(id)?.view.webContents.reloadIgnoringCache()
          })
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Bookmarks Bar',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: tabAction(mgr => mgr?.sendToUIPublic('toggle-bookmark-bar', {}))
        }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Show Full History',
          accelerator: 'CmdOrCtrl+Y',
          click: tabAction(mgr => mgr?.createTab('cleanshell://history'))
        },
        { type: 'separator' },
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) mgr.goBack(id)
          })
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: tabAction(mgr => {
            const id = mgr?.getActiveTabId()
            if (mgr && id !== null && id !== undefined) mgr.goForward(id)
          })
        },
        { type: 'separator' },
        {
          label: 'Clear History...',
          click: () => {
            historyManager.clearAll()
          }
        }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Bookmark This Tab',
          accelerator: 'CmdOrCtrl+D',
          click: tabAction(mgr => mgr?.sendToUIPublic('toggle-bookmark', {}))
        },
        {
          label: 'Bookmarks Bar',
          accelerator: 'CmdOrCtrl+Shift+B',
          // Label is static in menu; the renderer handles the toggle and persists state
          click: tabAction(mgr => mgr?.sendToUIPublic('toggle-bookmark-bar', {}))
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
          label: `Tab ${n}`,
          accelerator: `CmdOrCtrl+${n}`,
          click: tabAction(mgr => mgr?.switchToTabByIndex(n - 1))
        })),
        {
          label: 'Last Tab',
          accelerator: 'CmdOrCtrl+9',
          click: tabAction(mgr => mgr?.switchToLastTab())
        },
        { type: 'separator' as const },
        { role: 'front' as const }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

main().catch(console.error)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
