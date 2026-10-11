import type { Settings } from '../types'

const KEY = 'budzet.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { url: '', token: '', person: '', ...JSON.parse(raw) }
  } catch {
    // storage unavailable — fall through to defaults
  }
  return { url: '', token: '', person: '' }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore — settings just won't persist
  }
}

export function isConfigured(s: Settings): boolean {
  return Boolean(s.url && s.token)
}
