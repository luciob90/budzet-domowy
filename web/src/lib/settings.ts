import type { Settings } from '../types'

const KEY = 'budzet.settings'
const DEFAULTS: Settings = { url: '', token: '', person: '', email: '' }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    // storage unavailable — fall through to defaults
  }
  return { ...DEFAULTS }
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
