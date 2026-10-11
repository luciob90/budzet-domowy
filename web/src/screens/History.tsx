import { useEffect, useState } from 'react'
import type { LogEntry, PendingTx } from '../types'
import { api } from '../api/client'
import { currentMonth, fmtMoney, shortDate } from '../lib/format'
import { discard, flush, onQueueChange, pendingItems, resetErrors } from '../lib/queue'
import { ErrorBox, MonthNav, useRemote } from '../components'

export function History({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [month, setMonth] = useState(currentMonth())
  const [person, setPerson] = useState<string>('')
  const [pending, setPending] = useState<PendingTx[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const r = useRemote<LogEntry[]>('history:' + month, () => api.history(month), [version])

  useEffect(() => {
    void pendingItems().then(setPending)
    return onQueueChange(setPending)
  }, [])

  const entries = (r.data ?? []).filter(e => !person || e.person === person)
  const people = Array.from(new Set((r.data ?? []).map(e => e.person).filter(Boolean)))
  const pendingHere = pending.filter(p => Number(p.date.slice(5, 7)) === month)

  async function revert(e: LogEntry) {
    if (!window.confirm(`Cofnąć ${fmtMoney(e.amount)} – ${e.category} (${shortDate(e.date)})?`)) return
    setBusyId(e.clientId)
    setActionError(null)
    try {
      await api.remove(e.clientId)
      r.reload()
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  async function retry() {
    await resetErrors()
    await flush()
    onChanged()
  }

  return (
    <div className="screen">
      <MonthNav month={month} onChange={setMonth} />

      {pendingHere.length > 0 && (
        <>
          <h2 className="section-title">Oczekujące na wysłanie</h2>
          <div className="card-list">
            {pendingHere.map(p => (
              <div key={p.clientId} className={'tx pending' + (p.error ? ' failed' : '')}>
                <div className="tx-main">
                  <span className="tx-cat">{p.category}</span>
                  <span className={'num ' + (p.type === 'income' ? 'pos' : '')}>{fmtMoney(p.amount)}</span>
                </div>
                <div className="tx-meta">
                  {shortDate(p.date)} · {p.group}{p.note && ' · ' + p.note}
                </div>
                {p.error && <div className="tx-error">{p.error}</div>}
                <div className="tx-actions">
                  {p.error && <button className="link-btn" onClick={retry}>Ponów</button>}
                  <button className="link-btn danger" onClick={() => { if (window.confirm('Usunąć ten wpis z kolejki?')) void discard(p.clientId) }}>Usuń</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {people.length > 1 && (
        <div className="chips">
          <button className={person === '' ? 'chip on' : 'chip'} onClick={() => setPerson('')}>Wszyscy</button>
          {people.map(p => <button key={p} className={person === p ? 'chip on' : 'chip'} onClick={() => setPerson(p)}>{p}</button>)}
        </div>
      )}

      {r.stale && <p className="muted small center">Offline — dane z ostatniej synchronizacji.</p>}
      {r.error && <ErrorBox error={r.error} onRetry={r.reload} />}
      {actionError && <ErrorBox error={actionError} />}
      {!r.data && r.loading && <p className="muted center">Ładowanie…</p>}
      {r.data && entries.length === 0 && <p className="muted center">Brak wpisów z aplikacji w tym miesiącu.</p>}

      <div className="card-list">
        {entries.map(e => {
          const reverted = e.status !== 'OK'
          return (
            <div key={e.clientId} className={'tx' + (reverted ? ' reverted' : '')}>
              <div className="tx-main">
                <span className="tx-cat">{e.category}</span>
                <span className={'num ' + (e.type === 'income' ? 'pos' : '')}>{fmtMoney(e.amount)}</span>
              </div>
              <div className="tx-meta">
                {shortDate(e.date)} · {e.group}{e.person && ' · ' + e.person}{e.note && ' · ' + e.note}
                {reverted && ' · cofnięto'}
              </div>
              {!reverted && (
                <div className="tx-actions">
                  <button className="link-btn danger" disabled={busyId === e.clientId} onClick={() => revert(e)}>
                    {busyId === e.clientId ? 'Cofanie…' : 'Cofnij'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted small center">Historia pokazuje wpisy dodane z aplikacji. Wpisy wprowadzone ręcznie w arkuszu są widoczne tylko w podsumowaniu miesiąca.</p>
    </div>
  )
}
