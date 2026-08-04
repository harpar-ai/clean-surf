import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

interface Props {
  url: string
  isBookmarked: boolean
  onSubmit: (url: string) => void
  onToggleBookmark: () => void
}

export interface AddressBarHandle {
  focus: () => void
}

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="11" width="14" height="11" rx="2" fill="currentColor" opacity="0.9"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2"/>
  </svg>
)

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('cleanshell://')) return trimmed
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ')) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

function displayUrl(url: string): string {
  if (url.startsWith('cleanshell://')) return url
  try {
    const u = new URL(url)
    return u.host + (u.pathname !== '/' ? u.pathname : '') + u.search
  } catch { return url }
}

const AddressBar = forwardRef<AddressBarHandle, Props>(({ url, isBookmarked, onSubmit, onToggleBookmark }, ref) => {
  const [value, setValue] = useState(displayUrl(url))
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }))

  useEffect(() => {
    if (!isFocused) setValue(displayUrl(url))
  }, [url, isFocused])

  function handleFocus() {
    setIsFocused(true)
    setValue(url.startsWith('cleanshell://') ? url : url)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function handleBlur() {
    setIsFocused(false)
    setValue(displayUrl(url))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
      onSubmit(normalizeUrl(value))
    } else if (e.key === 'Escape') {
      setValue(displayUrl(url))
      inputRef.current?.blur()
    }
  }

  const isHttps = url.startsWith('https://')

  return (
    <div className="address-bar-wrap">
      <span className="security-icon" style={{ color: isHttps ? '#188038' : 'var(--icon)' }}>
        {isHttps ? <LockIcon /> : <SearchIcon />}
      </span>
      <input
        ref={inputRef}
        className="address-input"
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
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
    </div>
  )
})

AddressBar.displayName = 'AddressBar'
export { AddressBar }
