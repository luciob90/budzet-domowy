import { useState } from 'react'
import type { Account, AccountsData } from '../types'
import { api } from '../api/client'
import { currentMonth, fmtMoney } from '../lib/format'
import { ErrorBox, MonthNav, useRemote } from '../components'

function sum(list: Account[]): number {
  return list.reduce((s, a) => s + (a.value ?? 0), 0)
}

export function Accounts() {
  const [month, setMonth] = useState(currentMonth())
  const r = useRemote<AccountsData>('accounts:' + month, () => api.accounts(month), [])
  const d = r.data && r.data.month === month ? r.data : undefined

  const assets = d ? sum(d.assets) : 0
  const debts = d ? sum(d.debts) : 0

  return (
    <div className="screen">
      <MonthNav month={month} onChange={setMonth} />
      {r.stale && <p className="muted small center">Offline — dane z ostatniej synchronizacji.</p>}
      {r.error && <ErrorBox error={r.error} onRetry={r.reload} />}
      {!d && r.loading && <p className="muted center">Ładowanie…</p>}
      {d && (
        <>
          <div className="stats">
            <div className="stat"><div className="stat-label">Majątek</div><div className="stat-value">{fmtMoney(assets)}</div></div>
            <div className="stat"><div className="stat-label">Długi</div><div className="stat-value neg">{fmtMoney(debts)}</div></div>
            <div className="stat"><div className="stat-label">Netto</div><div className={'stat-value ' + (assets - debts < 0 ? 'neg' : 'pos')}>{fmtMoney(assets - debts)}</div></div>
          </div>
          <h2 className="section-title">Konta i oszczędności</h2>
          <div className="card-list">
            {d.assets.map(a => <AccountRow key={a.name} a={a} month={month} section="assets" onSaved={r.reload} />)}
          </div>
          {d.debts.length > 0 && (
            <>
              <h2 className="section-title">Długi</h2>
              <div className="card-list">
                {d.debts.map(a => <AccountRow key={a.name} a={a} month={month} section="debts" onSaved={r.reload} />)}
              </div>
            </>
          )}
          <p className="muted small center">Stan na koniec miesiąca. Dotknij kwoty, żeby ją zmienić.</p>
        </>
      )}
    </div>
  )
}

function AccountRow({ a, month, section, onSaved }: {
  a: Account; month: number; section: 'assets' | 'debts'; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const delta = a.value !== null && a.prev !== null ? a.value - a.prev : null

  function start() {
    setText(a.value !== null ? String(a.value).replace('.', ',') : '')
    setError(null)
    setEditing(true)
  }

  async function save() {
    const clean = text.replace(/[\s ]/g, '').replace(',', '.')
    if (clean !== '' && !/^-?\d+(\.\d{0,2})?$/.test(clean)) { setError('Nieprawidłowa kwota'); return }
    setBusy(true)
    try {
      await api.setAccount(month, section, a.name, clean === '' ? '' : Number(clean))
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account">
      <div className="line">
        <span>{a.name}</span>
        {!editing && (
          <button className="num value-btn" onClick={start}>
            {a.value === null ? <span className="muted">uzupełnij</span> : fmtMoney(a.value)}
          </button>
        )}
      </div>
      {!editing && delta !== null && delta !== 0 && (
        <div className={'small ' + ((section === 'assets' ? delta > 0 : delta < 0) ? 'pos' : 'neg')}>
          {delta > 0 ? '+' : ''}{fmtMoney(delta)} vs poprzedni miesiąc
        </div>
      )}
      {editing && (
        <div className="row">
          <input className="input grow" inputMode="decimal" value={text} autoFocus onChange={e => setText(e.target.value)} />
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? '…' : 'Zapisz'}</button>
          <button className="btn ghost" disabled={busy} onClick={() => setEditing(false)}>Anuluj</button>
        </div>
      )}
      {error && <div className="tx-error">{error}</div>}
    </div>
  )
}
