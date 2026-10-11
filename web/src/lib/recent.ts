import type { TxType } from '../types'

const KEY = 'budzet.recent'
const LIMIT = 8

export interface RecentCat {
  type: TxType
  group: string
  category: string
}

export function loadRecent(): RecentCat[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function pushRecent(c: RecentCat): RecentCat[] {
  const list = [c, ...loadRecent().filter(r => !(r.type === c.type && r.group === c.group && r.category === c.category))]
    .slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
  return list
}
