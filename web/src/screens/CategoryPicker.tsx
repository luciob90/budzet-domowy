import { useMemo, useState } from 'react'
import type { CategoryGroup } from '../types'

interface Props {
  groups: CategoryGroup[]
  onPick: (group: string, category: string) => void
  onClose: () => void
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
}

export function CategoryPicker({ groups, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    if (!nq) return groups
    return groups
      .map(g => norm(g.name).includes(nq) ? g : { ...g, items: g.items.filter(i => norm(i).includes(nq)) })
      .filter(g => g.items.length > 0)
  }, [groups, q])

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Wybierz kategorię">
      <div className="sheet-head">
        <input
          className="input"
          type="search"
          placeholder="Szukaj kategorii…"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
        />
        <button className="btn ghost" onClick={onClose}>Zamknij</button>
      </div>
      <div className="sheet-body">
        {filtered.length === 0 && <p className="muted center">Nic nie znaleziono.</p>}
        {filtered.map(g => (
          <section key={g.name} className="pick-group">
            <h3>{g.name}</h3>
            <div className="chips">
              {g.items.map(item => (
                <button key={item} className="chip" onClick={() => onPick(g.name, item)}>{item}</button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
