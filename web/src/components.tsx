import { useCallback, useEffect, useState } from 'react'
import { MONTHS } from './lib/format'
import { cached, store } from './lib/cache'
import { NetworkError } from './api/client'

export function MonthNav({ month, onChange }: { month: number; onChange: (m: number) => void }) {
  return (
    <div className="month-nav">
      <button className="icon-btn" aria-label="Poprzedni miesiąc" disabled={month <= 1} onClick={() => onChange(month - 1)}>‹</button>
      <span>{MONTHS[month - 1]}</span>
      <button className="icon-btn" aria-label="Następny miesiąc" disabled={month >= 12} onClick={() => onChange(month + 1)}>›</button>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{error}</span>
      {onRetry && <button className="link-btn" onClick={onRetry}>Spróbuj ponownie</button>}
    </div>
  )
}

export interface Remote<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  /** true when showing cached data because the network failed */
  stale: boolean
  reload: () => void
}

/** Loads data from the API, falling back to the last cached copy when offline. */
export function useRemote<T>(cacheKey: string, load: () => Promise<T>, deps: unknown[]): Remote<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    cached<T>(cacheKey).then(c => { if (!cancelled && c !== undefined) setData(prev => prev ?? c) })
    load()
      .then(d => {
        if (cancelled) return
        setData(d)
        setStale(false)
        void store(cacheKey, d)
      })
      .catch(async e => {
        if (cancelled) return
        const c = await cached<T>(cacheKey)
        if (e instanceof NetworkError && c !== undefined) {
          setData(c)
          setStale(true)
        } else {
          setError(e instanceof NetworkError ? 'Brak połączenia z internetem.' : String(e.message || e))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, tick, ...deps])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, loading, error, stale, reload }
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const over = max > 0 && value > max
  return (
    <div className="progress" aria-hidden="true">
      <div className={over ? 'progress-bar over' : 'progress-bar'} style={{ width: pct + '%' }} />
    </div>
  )
}
