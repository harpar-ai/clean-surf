import React from 'react'

interface Props {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)

const ForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

const ReloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4v6h6M23 20v-6h-6" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export function NavigationButtons({ canGoBack, canGoForward, isLoading, onBack, onForward, onReload }: Props) {
  return (
    <>
      <button className="nav-btn" onClick={onBack} disabled={!canGoBack} title="Go Back (⌘[)">
        <BackIcon />
      </button>
      <button className="nav-btn" onClick={onForward} disabled={!canGoForward} title="Go Forward (⌘])">
        <ForwardIcon />
      </button>
      <button className="nav-btn" onClick={onReload} title={isLoading ? 'Stop loading (Esc)' : 'Reload (⌘R)'}>
        {isLoading ? <StopIcon /> : <ReloadIcon />}
      </button>
    </>
  )
}
