import React, { useEffect, useState, useCallback, useRef } from 'react'
import { TabBar } from './components/TabBar'
import { AddressBar, AddressBarHandle } from './components/AddressBar'
import { NavigationButtons } from './components/NavigationButtons'
import { PrivacyBadge } from './components/PrivacyBadge'
import { BookmarkBar } from './components/BookmarkBar'

declare global {
  interface Window {
    cleanShell: {
      createTab: (url?: string) => Promise<number>
      closeTab: (tabId: number) => Promise<void>
      switchTab: (tabId: number) => Promise<void>
      getTabsState: () => Promise<TabState[]>
      loadUrl: (url: string) => Promise<void>
      goBack: () => Promise<void>
      goForward: () => Promise<void>
      reload: () => Promise<void>
      setToolbarHeight: (showBar: boolean) => Promise<void>
      notifyBookmarkBarState: (visible: boolean) => Promise<void>
      getBookmarks: () => Promise<Bookmark[]>
      isBookmarked: (url: string) => Promise<boolean>
      toggleBookmark: (url: string, title: string, favicon: string) => Promise<boolean>
      removeBookmark: (url: string) => Promise<void>
      listExtensions: () => Promise<ExtensionInfo[]>
      installCrx: (crxPath: string) => Promise<string>
      openCrxFileDialog: () => Promise<string | null>
      on: (channel: string, listener: (...args: unknown[]) => void) => void
      off: (channel: string, listener: (...args: unknown[]) => void) => void
    }
  }
}

export interface TabState {
  id: number
  title: string
  url: string
  favicon: string
  isLoading: boolean
  trackerCount: number
  canGoBack: boolean
  canGoForward: boolean
  isActive: boolean
}

export interface Bookmark {
  id: string
  url: string
  title: string
  favicon: string
  addedAt: number
}

export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string
}

export default function App() {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [isPrivate, setIsPrivate] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  // Chrome behavior: bar is HIDDEN by default, user must explicitly enable it (Cmd+Shift+B)
  const [showBookmarkBar, setShowBookmarkBar] = useState(
    () => localStorage.getItem('bookmarkBarVisible') === 'true'
  )
  const addressBarRef = useRef<AddressBarHandle>(null)

  const activeTab = tabs.find(t => t.isActive) ?? null
  const currentUrl = activeTab?.url ?? ''
  const isBookmarked = bookmarks.some(b => b.url === currentUrl)

  // Keep a ref so IPC event listeners always see the current activeTab
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Chrome behavior: bar visible when user has it on, regardless of bookmark count
  // (shows empty bar with hint text when no bookmarks, like Chrome)
  const bookmarkBarVisible = showBookmarkBar

  // Tell main process to resize the WebContentsViews when bar visibility changes
  useEffect(() => {
    window.cleanShell.setToolbarHeight(bookmarkBarVisible)
  }, [bookmarkBarVisible])

  useEffect(() => {
    const cs = window.cleanShell

    const onTabsState = (newTabs: unknown) => setTabs(newTabs as TabState[])
    const onWindowInit = (data: unknown) => {
      const { isPrivate: priv } = data as { isPrivate: boolean }
      setIsPrivate(priv)
      if (priv) document.body.classList.add('private-mode')
    }
    const onTrackerCount = (data: unknown) => {
      const { tabId, count } = data as { tabId: number; count: number }
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, trackerCount: count } : t))
    }
    const onBookmarksChanged = (data: unknown) => setBookmarks(data as Bookmark[])
    const onToggleBookmark = () => {
      const tab = activeTabRef.current
      if (!tab) return
      window.cleanShell.toggleBookmark(tab.url, tab.title, tab.favicon)
    }
    const onToggleBookmarkBar = () => setShowBookmarkBar(v => {
      const next = !v
      localStorage.setItem('bookmarkBarVisible', String(next))
      window.cleanShell.notifyBookmarkBarState(next)
      return next
    })
    const onFocusAddressBar = () => addressBarRef.current?.focus()

    cs.on('tabs:state', onTabsState)
    cs.on('window:init', onWindowInit)
    cs.on('page:tracker-count', onTrackerCount)
    cs.on('bookmarks:changed', onBookmarksChanged)
    cs.on('toggle-bookmark', onToggleBookmark)
    cs.on('toggle-bookmark-bar', onToggleBookmarkBar)
    cs.on('focus-address-bar', onFocusAddressBar)

    cs.getTabsState().then(setTabs)
    cs.getBookmarks().then(setBookmarks)

    return () => {
      cs.off('tabs:state', onTabsState)
      cs.off('window:init', onWindowInit)
      cs.off('page:tracker-count', onTrackerCount)
      cs.off('bookmarks:changed', onBookmarksChanged)
      cs.off('toggle-bookmark', onToggleBookmark)
      cs.off('toggle-bookmark-bar', onToggleBookmarkBar)
      cs.off('focus-address-bar', onFocusAddressBar)
    }
  }, [])

  // Keyboard shortcuts handled in the renderer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'l') { e.preventDefault(); addressBarRef.current?.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleToggleBookmark = useCallback(async () => {
    if (!activeTab) return
    await window.cleanShell.toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon)
  }, [activeTab])

  const handleLoadUrl = useCallback((url: string) => {
    window.cleanShell.loadUrl(url)
  }, [])

  return (
    <div className={`toolbar${isPrivate ? ' private-mode' : ''}`}>
      <TabBar
        tabs={tabs}
        onSwitch={id => window.cleanShell.switchTab(id)}
        onClose={id => window.cleanShell.closeTab(id)}
        onNew={() => window.cleanShell.createTab()}
      />
      <div className="nav-bar">
        <NavigationButtons
          canGoBack={activeTab?.canGoBack ?? false}
          canGoForward={activeTab?.canGoForward ?? false}
          isLoading={activeTab?.isLoading ?? false}
          onBack={() => window.cleanShell.goBack()}
          onForward={() => window.cleanShell.goForward()}
          onReload={() => window.cleanShell.reload()}
        />
        <AddressBar
          ref={addressBarRef}
          url={currentUrl}
          isBookmarked={isBookmarked}
          onSubmit={handleLoadUrl}
          onToggleBookmark={handleToggleBookmark}
        />
        <PrivacyBadge count={activeTab?.trackerCount ?? 0} />
        {isPrivate && <span className="private-indicator">Private</span>}
      </div>
      {bookmarkBarVisible && (
        <BookmarkBar
          bookmarks={bookmarks}
          onOpen={url => window.cleanShell.loadUrl(url)}
          onRemove={url => window.cleanShell.removeBookmark(url)}
        />
      )}
    </div>
  )
}
