import React from 'react'

interface Props {
  count: number
}

const ShieldIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1l9 4v5c0 5.25-3.75 10.15-9 11.5C6.75 20.15 3 15.25 3 10V5l9-4z" />
  </svg>
)

export function PrivacyBadge({ count }: Props) {
  if (count === 0) return null
  return (
    <span className="privacy-badge has-blocks" title={`${count} tracker${count === 1 ? '' : 's'} blocked by Clean Surf`}>
      <ShieldIcon />
      <span>{count} blocked</span>
    </span>
  )
}
