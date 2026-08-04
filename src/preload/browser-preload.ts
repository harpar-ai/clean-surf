import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cleanShell', {
  // Tabs
  createTab: (url?: string) => ipcRenderer.invoke('tabs:create', url),
  closeTab: (tabId: number) => ipcRenderer.invoke('tabs:close', tabId),
  switchTab: (tabId: number) => ipcRenderer.invoke('tabs:switch', tabId),
  getTabsState: () => ipcRenderer.invoke('tabs:get-state'),

  // Navigation
  loadUrl: (url: string) => ipcRenderer.invoke('nav:load-url', url),
  goBack: () => ipcRenderer.invoke('nav:go-back'),
  goForward: () => ipcRenderer.invoke('nav:go-forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),

  // History autocomplete
  searchHistory: (query: string) => ipcRenderer.invoke('history:search', query),
  openOmnibox: () => ipcRenderer.invoke('ui:omnibox-open'),
  closeOmnibox: () => ipcRenderer.invoke('ui:omnibox-close'),

  // Toolbar layout
  setToolbarHeight: (showBar: boolean) => ipcRenderer.invoke('ui:set-toolbar-height', showBar),
  notifyBookmarkBarState: (visible: boolean) => ipcRenderer.invoke('ui:bookmark-bar-state', visible),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  clearBookmarks: () => ipcRenderer.invoke('bookmarks:clear'),
  isBookmarked: (url: string) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),
  toggleBookmark: (url: string, title: string, favicon: string) =>
    ipcRenderer.invoke('bookmarks:toggle', url, title, favicon),
  removeBookmark: (url: string) => ipcRenderer.invoke('bookmarks:remove', url),

  // Extensions — installation is menu/dialog only, NOT exposed to web content

  // Event listeners
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const validChannels = [
      'tabs:state', 'page:title-update', 'page:favicon-update',
      'page:loading-state', 'page:url-change', 'page:security-state',
      'page:tracker-count', 'page:active-tab', 'window:init',
      'bookmarks:changed', 'toggle-bookmark', 'toggle-bookmark-bar',
      'focus-address-bar'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => listener(...args))
    }
  },
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener as any)
  }
})
