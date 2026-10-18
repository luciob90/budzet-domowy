import type { AccountsData, Categories, LogEntry, MonthData, Reminder, Tx } from '../types'
import { loadSettings } from '../lib/settings'

/** Error reported by the Apps Script backend (as opposed to a network failure). */
export class ApiError extends Error {}

/** Network failure — the request may be retried later. */
export class NetworkError extends Error {}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: string
}

async function parse<T>(res: Response): Promise<T> {
  let body: Envelope<T>
  try {
    body = await res.json()
  } catch {
    throw new ApiError(`Nieoczekiwana odpowiedź serwera (HTTP ${res.status}). Sprawdź URL i wdrożenie skryptu.`)
  }
  if (!body.ok) throw new ApiError(body.error || 'Nieznany błąd')
  return body.data as T
}

async function request<T>(init: () => Promise<Response>): Promise<T> {
  let res: Response
  try {
    res = await init()
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e))
  }
  return parse<T>(res)
}

function get<T>(action: string, params: Record<string, string | number> = {}): Promise<T> {
  const s = loadSettings()
  return request<T>(() => {
    const url = new URL(s.url)
    url.searchParams.set('action', action)
    url.searchParams.set('token', s.token)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    return fetch(url, { redirect: 'follow' })
  })
}

function post<T>(action: string, body: object): Promise<T> {
  const s = loadSettings()
  // text/plain avoids the CORS preflight that Apps Script does not answer
  return request<T>(() => fetch(s.url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, action, token: s.token }),
  }))
}

export const api = {
  ping: () => get<{ year: number | null }>('ping'),
  categories: (m: number) => get<Categories>('categories', { m }),
  month: (m: number) => get<MonthData>('month', { m }),
  history: (m: number) => get<LogEntry[]>('history', { m }),
  accounts: (m: number) => get<AccountsData>('accounts', { m }),
  add: (tx: Tx) => post<{ duplicate: boolean; entry: LogEntry }>('add', tx),
  remove: (clientId: string) => post<{ entry: LogEntry }>('delete', { clientId }),
  setAccount: (m: number, section: 'assets' | 'debts', name: string, value: number | '') =>
    post<{ name: string; value: number | null }>('setAccount', { m, section, name, value }),
  reminder: (email: string) => get<Reminder>('reminder', { email }),
  setReminder: (r: Reminder) => post<Reminder>('setReminder', r),
}
