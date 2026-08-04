import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  visitedAt: number
}

const MAX_ENTRIES = 2000
const historyFile = path.join(app.getPath('userData'), 'history.json')

let entries: HistoryEntry[] = []

function load(): void {
  try {
    if (fs.existsSync(historyFile)) {
      entries = JSON.parse(fs.readFileSync(historyFile, 'utf-8'))
    }
  } catch {
    entries = []
  }
}

function save(): void {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(entries), 'utf-8')
  } catch {}
}

load()

export function addEntry(url: string, title: string): void {
  if (!url || url.startsWith('cleanshell://') || url === 'about:blank') return
  // Remove existing entry for same URL to avoid duplicates
  entries = entries.filter(e => e.url !== url)
  entries.unshift({ id: randomUUID(), url, title: title || url, visitedAt: Date.now() })
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES)
  save()
}

export function getAll(): HistoryEntry[] {
  return entries
}

export function deleteEntry(id: string): void {
  entries = entries.filter(e => e.id !== id)
  save()
}

export function clearAll(): void {
  entries = []
  save()
}

export function search(query: string): HistoryEntry[] {
  const q = query.toLowerCase()
  return entries.filter(e => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
}

// Update the title of the most recent entry for a URL (called after page-title-updated)
export function updateTitle(url: string, title: string): void {
  const entry = entries.find(e => e.url === url)
  if (entry && title) {
    entry.title = title
    save()
  }
}

export function generateHistoryPage(query = ''): string {
  const filtered = query ? search(query) : entries
  const grouped: Record<string, HistoryEntry[]> = {}

  for (const entry of filtered) {
    const date = new Date(entry.visitedAt)
    const key = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(entry)
  }

  const rows = Object.entries(grouped).map(([date, items]) => `
    <div class="date-group">
      <div class="date-header">${date}</div>
      ${items.map(item => `
        <div class="history-item" data-id="${esc(item.id)}">
          <div class="item-time">${new Date(item.visitedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="item-content">
            <a class="item-title" href="${esc(item.url)}" title="${esc(item.url)}">${esc(item.title)}</a>
            <div class="item-url">${esc(item.url)}</div>
          </div>
          <button class="delete-btn" data-id="${esc(item.id)}" title="Remove from history">✕</button>
        </div>
      `).join('')}
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>History — Clean Surf</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #202124; background: #fff; }
  .header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e8eaed; padding: 16px 24px; display: flex; align-items: center; gap: 16px; z-index: 1; }
  h1 { font-size: 22px; font-weight: 400; color: #202124; flex: 1; }
  .search-box { display: flex; align-items: center; border: 1px solid #dfe1e5; border-radius: 24px; padding: 8px 16px; gap: 8px; width: 320px; }
  .search-box input { border: none; outline: none; font-size: 14px; width: 100%; background: transparent; }
  .clear-btn { background: none; border: 1px solid #dadce0; border-radius: 4px; padding: 6px 12px; font-size: 13px; color: #1a73e8; cursor: pointer; white-space: nowrap; }
  .clear-btn:hover { background: #f1f3f4; }
  .content { max-width: 720px; margin: 0 auto; padding: 16px 24px; }
  .empty { text-align: center; padding: 64px 24px; color: #80868b; }
  .date-group { margin-bottom: 8px; }
  .date-header { font-size: 13px; font-weight: 500; color: #80868b; padding: 12px 0 4px; border-bottom: 1px solid #e8eaed; margin-bottom: 4px; }
  .history-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-radius: 8px; }
  .history-item:hover { background: #f8f9fa; }
  .item-time { font-size: 12px; color: #80868b; width: 52px; flex-shrink: 0; text-align: right; }
  .item-content { flex: 1; min-width: 0; }
  .item-title { display: block; color: #1a0dab; text-decoration: none; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-title:hover { text-decoration: underline; }
  .item-url { font-size: 12px; color: #188038; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
  .delete-btn { background: none; border: none; color: #80868b; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 4px; opacity: 0; flex-shrink: 0; }
  .history-item:hover .delete-btn { opacity: 1; }
  .delete-btn:hover { background: #e8eaed; color: #202124; }
</style>
</head>
<body>
<div class="header">
  <h1>History</h1>
  <form class="search-box" action="cleanshell://history" method="get">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#9aa0a6"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
    <input type="text" name="q" placeholder="Search history" value="${esc(query)}" autofocus>
  </form>
  <button class="clear-btn">Clear all history</button>
</div>
<div class="content">
  ${rows || '<div class="empty">No history yet</div>'}
</div>
<script>
// Use event delegation instead of inline onclick to avoid injection
document.addEventListener('click', e => {
  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (id && /^[0-9a-f-]{36}$/.test(id)) { // validate UUID format
      location.href = 'cleanshell://history/delete?id=' + encodeURIComponent(id);
    }
    return;
  }
  const clearBtn = e.target.closest('.clear-btn');
  if (clearBtn) {
    if (confirm('Clear all browsing history? This cannot be undone.')) {
      location.href = 'cleanshell://history/clear';
    }
    return;
  }
  // Handle link clicks — open in current tab
  const a = e.target.closest('a[href]');
  if (a && a.href && !a.href.startsWith('cleanshell://')) {
    e.preventDefault();
    location.href = a.href;
  }
});
</script>
</body>
</html>`
}
