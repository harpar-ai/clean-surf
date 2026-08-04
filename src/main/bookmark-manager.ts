import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

export interface Bookmark {
  id: string
  url: string
  title: string
  favicon: string
  addedAt: number
}

const bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json')
let bookmarks: Bookmark[] = []

function load(): void {
  try {
    if (fs.existsSync(bookmarksFile)) {
      bookmarks = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))
    }
  } catch {
    bookmarks = []
  }
}

function save(): void {
  try {
    fs.writeFileSync(bookmarksFile, JSON.stringify(bookmarks), 'utf-8')
  } catch {}
}

load()

export function getAll(): Bookmark[] {
  return bookmarks
}

export function add(url: string, title: string, favicon = ''): Bookmark {
  const existing = bookmarks.find(b => b.url === url)
  if (existing) return existing
  const bookmark: Bookmark = { id: randomUUID(), url, title: title || url, favicon, addedAt: Date.now() }
  bookmarks.push(bookmark)
  save()
  return bookmark
}

export function remove(url: string): void {
  bookmarks = bookmarks.filter(b => b.url !== url)
  save()
}

export function isBookmarked(url: string): boolean {
  return bookmarks.some(b => b.url === url)
}

export function toggle(url: string, title: string, favicon = ''): boolean {
  if (isBookmarked(url)) {
    remove(url)
    return false
  } else {
    add(url, title, favicon)
    return true
  }
}
