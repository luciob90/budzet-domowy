import { useState } from 'react'
import type { MonthData, MonthGroup } from '../types'
import { api } from '../api/client'
import { currentMonth, fmtMoney } from '../lib/format'
import { ErrorBox, MonthNav, Progress, useRemote } from '../components'

export function Month({ version }: { version: number }) {
  const [month, setMonth] = useState(currentMonth())
  const r = useRemote<MonthData>('month:' + month, () => api.month(month), [version])
  const d = r.data && r.data.month === month ? r.data : undefined

  return (
    <div className="screen">
      <MonthNav month={month} onChange={setMonth} />
      {r.stale && <p className="muted small center">Offline — dane z ostatniej synchronizacji.</p>}
      {r.error && <ErrorBox error={r.error} onRetry={r.reload} />}
      {!d && r.loading && <p className="muted center">Ładowanie…</p>}
      {d && <MonthBody d={d} isCurrent={month === currentMonth()} />}
    </div>
  )
}

function MonthBody({ d, isCurrent }: { d: MonthData; isCurrent: boolean }) {
  const s = d.summary
  const expenseGroups = d.expense.filter(g => g.actual !== 0 || g.plan !== 0)
  const incomeItems = d.income.flatMap(g => g.items).filter(i => i.actual !== 0 || i.plan !== 0)
  const maxGroup = Math.max(1, ...expenseGroups.map(g => Math.max(g.plan, g.actual)))
  const spentPct = s.income ? Math.round(((s.expense ?? 0) / s.income) * 100) : null

  return (
    <>
      <div className="stats">
        <Stat label="Przychody" value={fmtMoney(s.income)} />
        <Stat label="Wydatki" value={fmtMoney(s.expense)} sub={spentPct !== null ? `${spentPct}% przychodu` : undefined} />
        <Stat label="Zostało" value={fmtMoney(s.left)} tone={(s.left ?? 0) < 0 ? 'neg' : 'pos'} />
        {isCurrent && <Stat label="Średnio dziennie" value={fmtMoney(s.perDay)} sub={s.daysLeft !== null ? `${s.daysLeft} dni do końca` : undefined} />}
      </div>

      <h2 className="section-title">Wydatki według kategorii</h2>
      {expenseGroups.length === 0 && <p className="muted">Brak wydatków w tym miesiącu.</p>}
      <div className="card-list">
        {expenseGroups
          .slice()
          .sort((a, b) => b.actual - a.actual)
          .map(g => <GroupRow key={g.name} g={g} max={maxGroup} />)}
      </div>

      {incomeItems.length > 0 && (
        <>
          <h2 className="section-title">Przychody</h2>
          <div className="card-list">
            {incomeItems.map(i => (
              <div key={i.name} className="line">
                <span>{i.name}</span>
                <span className="num">{fmtMoney(i.actual)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={'stat-value ' + (tone ?? '')}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function GroupRow({ g, max }: { g: MonthGroup; max: number }) {
  const [open, setOpen] = useState(false)
  const items = g.items.filter(i => i.actual !== 0 || i.plan !== 0)
  return (
    <div className="group-row">
      <button className="group-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="group-name">{g.name}</span>
        <span className="num">
          {fmtMoney(g.actual)}
          {g.plan > 0 && <span className="muted small"> / {fmtMoney(g.plan)}</span>}
        </span>
      </button>
      <Progress value={g.actual} max={g.plan > 0 ? g.plan : max} />
      {open && (
        <div className="group-items">
          {items.map(i => (
            <div key={i.name} className="line small">
              <span>{i.name}</span>
              <span className="num">{fmtMoney(i.actual)}{i.plan > 0 && <span className="muted"> / {fmtMoney(i.plan)}</span>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
