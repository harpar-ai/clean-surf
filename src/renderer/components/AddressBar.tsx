import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'

interface Suggestion {
  type: 'history' | 'bookmark' | 'search'
  url: string
  title: string
}

interface Props {
  url: string
  isBookmarked: boolean
  bookmarks: { url: string; title: string }[]
  onSubmit: (url: string) => void
  onToggleBookmark: () => void
}

export interface AddressBarHandle {
  focus: () => void
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="11" width="14" height="11" rx="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2"/>
  </svg>
)
const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const StarFilledIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
)
const StarEmptyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
)
const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const BookmarkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
)
const MagnifierIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeUrl(input: string): string {
  const t = input.trim()
  if (/^https?:\/\//i.test(t) || t.startsWith('cleanshell://')) return t
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(t) && !t.includes(' ')) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

function displayUrl(url: string): string {
  if (url.startsWith('cleanshell://')) return url
  try {
    const u = new URL(url)
    return u.host + (u.pathname !== '/' ? u.pathname : '') + u.search
  } catch { return url }
}

function isSearchQuery(val: string): boolean {
  const t = val.trim()
  if (!t) return false
  if (/^https?:\/\//i.test(t) || t.startsWith('cleanshell://')) return false
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(t) && !t.includes(' ')) return false
  return true
}

// ─── Component ───────────────────────────────────────────────────────────────

const AddressBar = forwardRef<AddressBarHandle, Props>(
  ({ url, isBookmarked, bookmarks, onSubmit, onToggleBookmark }, ref) => {
    const [value, setValue] = useState(displayUrl(url))
    const [isFocused, setIsFocused] = useState(false)
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [selectedIdx, setSelectedIdx] = useState(-1)
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }))

    // Sync display value when URL changes externally
    useEffect(() => {
      if (!isFocused) setValue(displayUrl(url))
    }, [url, isFocused])

    const buildSuggestions = useCallback(async (query: string): Promise<Suggestion[]> => {
      const q = query.toLowerCase()
      const result: Suggestion[] = []

      // Bookmark matches first
      const bookmarkMatches = bookmarks
        .filter(b => b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q))
        .slice(0, 3)
        .map(b => ({ type: 'bookmark' as const, url: b.url, title: b.title }))
      result.push(...bookmarkMatches)

      // History matches (via IPC)
      try {
        const historyMatches: { url: string; title: string }[] =
          await window.cleanShell.searchHistory(query)
        const seen = new Set(result.map(s => s.url))
        for (const h of historyMatches) {
          if (!seen.has(h.url) && result.length < 7) {
            result.push({ type: 'history', url: h.url, title: h.title })
            seen.add(h.url)
          }
        }
      } catch {}

      // Search suggestion at the bottom if looks like a query
      if (isSearchQuery(query) && result.length < 8) {
        result.push({
          type: 'search',
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          title: `Search Google for "${query}"`
        })
      }

      return result
    }, [bookmarks])

    const handleFocus = () => {
      setIsFocused(true)
      setValue(url.startsWith('cleanshell://') ? url : url)
      setTimeout(() => inputRef.current?.select(), 0)
    }

    const handleBlur = (e: React.FocusEvent) => {
      // Don't blur if clicking inside the dropdown
      if (dropdownRef.current?.contains(e.relatedTarget as Node)) return
      setIsFocused(false)
      setSuggestions([])
      setSelectedIdx(-1)
      setValue(displayUrl(url))
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setValue(val)
      setSelectedIdx(-1)
      clearTimeout(debounceRef.current)
      if (!val.trim()) { setSuggestions([]); return }
      debounceRef.current = setTimeout(async () => {
        const s = await buildSuggestions(val)
        setSuggestions(s)
      }, 120)
    }

    const commitValue = (val: string) => {
      setSuggestions([])
      setSelectedIdx(-1)
      inputRef.current?.blur()
      onSubmit(normalizeUrl(val))
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, -1))
      } else if (e.key === 'Enter') {
        if (selectedIdx >= 0 && suggestions[selectedIdx]) {
          commitValue(suggestions[selectedIdx].url)
        } else {
          commitValue(value)
        }
      } else if (e.key === 'Escape') {
        setSuggestions([])
        setSelectedIdx(-1)
        setValue(displayUrl(url))
        inputRef.current?.blur()
      }
    }

    const isHttps = url.startsWith('https://')
    const showDropdown = isFocused && suggestions.length > 0

    return (
      <div className="address-bar-wrap" style={{ position: 'relative' }}>
        <span className="security-icon" style={{ color: isHttps ? '#188038' : 'var(--icon)' }}>
          {isHttps ? <LockIcon /> : <SearchIcon />}
        </span>
        <input
          ref={inputRef}
          className="address-input"
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          placeholder="Search or enter address"
        />
        <button
          className="star-btn"
          onClick={onToggleBookmark}
          title={isBookmarked ? 'Remove bookmark (⌘D)' : 'Bookmark this page (⌘D)'}
        >
          {isBookmarked ? <StarFilledIcon /> : <StarEmptyIcon />}
        </button>

        {showDropdown && (
          <div className="omnibox-dropdown" ref={dropdownRef}>
            {suggestions.map((s, i) => (
              <div
                key={s.url}
                className={`omnibox-item${i === selectedIdx ? ' selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); commitValue(s.url) }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="omnibox-icon">
                  {s.type === 'bookmark' ? <BookmarkIcon /> :
                   s.type === 'search'   ? <MagnifierIcon /> :
                   <HistoryIcon />}
                </span>
                <span className="omnibox-text">
                  <span className="omnibox-title">{s.title || s.url}</span>
                  {s.type !== 'search' && (
                    <span className="omnibox-url">{displayUrl(s.url)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
)

AddressBar.displayName = 'AddressBar'
export { AddressBar }
