import React from 'react'
import type { TabState } from '../App'

interface Props {
  tabs: TabState[]
  onSwitch: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
}

function FaviconOrSpinner({ tab }: { tab: TabState }) {
  if (tab.isLoading) {
    return <span className="tab-loading-spinner" />
  }
  if (tab.favicon) {
    return <img className="tab-favicon" src={tab.favicon} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
  }
  return (
    <svg className="tab-favicon" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="6" fill="var(--icon)" opacity="0.4" />
    </svg>
  )
}

export function TabBar({ tabs, onSwitch, onClose, onNew }: Props) {
  return (
    <div className="tab-strip">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab${tab.isActive ? ' active' : ''}`}
          onClick={() => onSwitch(tab.id)}
          title={tab.title}
        >
          <FaviconOrSpinner tab={tab} />
          <span className="tab-title">{tab.title || 'New Tab'}</span>
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
            title="Close tab"
          >
            ✕
          </button>
        </div>
      ))}
      <button className="new-tab-btn" onClick={onNew} title="New Tab (⌘T)">
        +
      </button>
    </div>
  )
}
