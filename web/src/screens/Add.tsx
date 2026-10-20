import { useEffect, useState } from 'react'
import type { Categories, TxType } from '../types'
import { fmtMoney, today, yesterday } from '../lib/format'
import { evaluate, pressKey, pretty, sanitize } from '../lib/calc'
import { loadRecent, pushRecent, type RecentCat } from '../lib/recent'
import { enqueue, flush } from '../lib/queue'
import { CategoryPicker } from './CategoryPicker'
import { ErrorBox } from '../components'

interface Props {
  categories: Categories | undefined
  categoriesError: string | null
  person: string
  onSaved: () => void
}

export function Add({ categories, categoriesError, person, onSaved }: Props) {
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [refund, setRefund] = useState(false)
  const [sel, setSel] = useState<{ group: string; category: string } | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState(false)
  const [recent, setRecent] = useState<RecentCat[]>(loadRecent)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'warn' | 'err' } | null>(null)
  const [busy, setBusy] = useState(false)

  const groups = categories ? categories[type] : []
  const recentForType = recent.filter(r => r.type === type &&
    groups.some(g => g.name === r.group && g.items.includes(r.category)))
  const calc = evaluate(amount)
  const value = calc.value
  const valid = value > 0 && sel !== null && Boolean(date)

  // the category picker is a history entry, so the phone's Back button closes it
  useEffect(() => {
    if (!picker) return
    const onPop = () => setPicker(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [picker])

  function openPicker() {
    history.pushState({ ...history.state, picker: true, root: false }, '')
    setPicker(true)
  }

  function closePicker() {
    history.back() // popstate closes the picker
  }

  function switchType(t: TxType) {
    setType(t)
    setSel(null)
    setRefund(false)
  }

  function showToast(text: string, kind: 'ok' | 'warn' | 'err') {
    setToast({ text, kind })
    window.setTimeout(() => setToast(null), 3500)
  }

  async function save() {
    if (!valid || !sel) return
    setBusy(true)
    const signed = refund ? -value : value
    try {
      await enqueue({
        clientId: crypto.randomUUID(),
        type,
        group: sel.group,
        category: sel.category,
        amount: signed,
        date,
        // keep the breakdown of a multi-item entry in the note
        note: calc.terms > 1 ? [note.trim(), `(${pretty(amount)})`].filter(Boolean).join(' ') : note.trim(),
        person,
      })
      setRecent(pushRecent({ type, group: sel.group, category: sel.category }))
      setAmount('')
      setNote('')
      setRefund(false)
      setSel(null)
      const r = await flush()
      if (r.failed > 0) showToast('Serwer odrzucił wpis — zobacz Historię.', 'err')
      else if (r.offline) showToast(`Brak sieci — ${fmtMoney(signed)} zapisane w kolejce.`, 'warn')
      else showToast(`Zapisano ${fmtMoney(signed)} · ${sel.category}`, 'ok')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen add">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={type === 'expense'} className={type === 'expense' ? 'on' : ''} onClick={() => switchType('expense')}>Wydatek</button>
        <button role="tab" aria-selected={type === 'income'} className={type === 'income' ? 'on' : ''} onClick={() => switchType('income')}>Przychód</button>
      </div>

      <div className="amount-box">
        <label className="amount-field">
          <span className="sr-only">Kwota</span>
          {refund && <span className="amount-sign">−</span>}
          <input
            className={amount.length > 9 ? 'long' : ''}
            inputMode="none"
            placeholder="0,00"
            value={pretty(amount)}
            onChange={e => setAmount(sanitize(e.target.value))}
            aria-invalid={amount !== '' && !(value > 0)}
          />
          <span className="amount-cur">zł</span>
        </label>
        {calc.terms > 1 && (
          <div className={'amount-total' + (value > 0 ? '' : ' neg')}>
            {Number.isNaN(value) ? '…' : '= ' + fmtMoney(refund ? -value : value)}
          </div>
        )}
        <div className="keypad">
          {['7', '8', '9', '⌫', '4', '5', '6', '-', '1', '2', '3', '+', 'C', '0', ','].map(k => (
            <button key={k} type="button"
              className={'key' + ('+-'.includes(k) ? ' op' : '') + (k === 'C' || k === '⌫' ? ' fn' : '')}
              aria-label={k === '⌫' ? 'Usuń znak' : k === 'C' ? 'Wyczyść' : k === '-' ? 'Minus' : k === '+' ? 'Plus' : undefined}
              onClick={() => setAmount(a => pressKey(a, k))}>
              {k === '-' ? '−' : k}
            </button>
          ))}
        </div>
      </div>
      {type === 'expense' && (
        <label className="check">
          <input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} />
          Zwrot / korekta (odejmij)
        </label>
      )}

      <div className="field">
        <div className="field-label">Kategoria</div>
        {categoriesError && !categories && <ErrorBox error={categoriesError} />}
        {recentForType.length > 0 && (
          <div className="chips">
            {recentForType.map(r => {
              const on = sel?.group === r.group && sel.category === r.category
              return (
                <button key={r.group + '|' + r.category} className={on ? 'chip on' : 'chip'}
                  onClick={() => setSel({ group: r.group, category: r.category })}>
                  {r.category}
                </button>
              )
            })}
          </div>
        )}
        <button className="select-btn" disabled={!categories} onClick={openPicker}>
          {sel ? <><span className="muted">{sel.group} ›</span> {sel.category}</> : 'Wybierz kategorię…'}
        </button>
      </div>

      <div className="field">
        <div className="field-label">Data</div>
        <div className="row">
          <button className={date === today() ? 'chip on' : 'chip'} onClick={() => setDate(today())}>Dziś</button>
          <button className={date === yesterday() ? 'chip on' : 'chip'} onClick={() => setDate(yesterday())}>Wczoraj</button>
          <input className="input grow" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="note">Opis (opcjonalnie)</label>
        <input id="note" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="np. Biedronka" />
      </div>

      <button className="btn primary big" disabled={!valid || busy} onClick={save}>
        {busy ? 'Zapisywanie…' : 'Zapisz'}
      </button>
      {!person && <p className="muted small center">Ustaw swoje imię w Ustawieniach, żeby było wiadomo, kto dodał wpis.</p>}

      {toast && <div className={'toast ' + toast.kind} role="status">{toast.text}</div>}

      {picker && (
        <CategoryPicker
          groups={groups}
          onClose={closePicker}
          onPick={(group, category) => { setSel({ group, category }); closePicker() }}
        />
      )}
    </div>
  )
}
