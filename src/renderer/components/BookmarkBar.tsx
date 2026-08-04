import React from 'react'
import type { Bookmark } from '../App'

interface Props {
  bookmarks: Bookmark[]
  onOpen: (url: string) => void
  onRemove: (url: string) => void
}

export function BookmarkBar({ bookmarks, onOpen, onRemove }: Props) {
  return (
    <div className="bookmark-bar">
      {bookmarks.length === 0 && (
        <span className="bookmark-bar-hint">Bookmarks you save will appear here. Press ⌘D to bookmark a page.</span>
      )}
      {bookmarks.map(b => (
        <button
          key={b.id}
          className="bookmark-item"
          onClick={() => onOpen(b.url)}
          onContextMenu={(e) => { e.preventDefault(); onRemove(b.url) }}
          title={b.url}
        >
          {b.favicon
            ? <img src={b.favicon} alt="" className="bookmark-favicon" onError={e => (e.currentTarget.style.display = 'none')} />
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.5"><circle cx="12" cy="12" r="9"/></svg>
          }
          <span className="bookmark-title">{b.title}</span>
        </button>
      ))}
    </div>
  )
}
