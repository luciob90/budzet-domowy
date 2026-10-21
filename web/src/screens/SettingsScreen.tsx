import { useEffect, useState } from 'react'
import type { PendingTx, Reminder, Settings } from '../types'
import { api } from '../api/client'
import { flush, onQueueChange, pendingItems } from '../lib/queue'
import { saveSettings } from '../lib/settings'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
}

export function SettingsScreen({ settings, onChange }: Props) {
  const [draft, setDraft] = useState(settings)
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState(false)
  const [pending, setPending] = useState<PendingTx[]>([])

  useEffect(() => {
    void pendingItems().then(setPending)
    return onQueueChange(setPending)
  }, [])

  const dirty = draft.url !== settings.url || draft.token !== settings.token || draft.person !== settings.person

  async function saveAndTest() {
    const s = { ...settings, url: draft.url.trim(), token: draft.token.trim(), person: draft.person.trim() }
    saveSettings(s)
    onChange(s)
    setTesting(true)
    setStatus(null)
    try {
      const r = await api.ping()
      setStatus({ text: `Połączono z arkuszem${r.year ? ' (rok ' + r.year + ')' : ''}.`, ok: true })
      void flush()
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="screen">
      <h2 className="section-title">Połączenie z arkuszem</h2>
      <div className="field">
        <label className="field-label" htmlFor="url">Adres aplikacji Apps Script</label>
        <input id="url" className="input" type="url" placeholder="https://script.google.com/macros/s/…/exec"
          value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="token">Token domowy</label>
        <input id="token" className="input" type="password" autoComplete="off"
          value={draft.token} onChange={e => setDraft({ ...draft, token: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="person">Kim jesteś na tym urządzeniu?</label>
        <input id="person" className="input" list="people" placeholder="np. Lucek"
          value={draft.person} onChange={e => setDraft({ ...draft, person: e.target.value })} />
        <datalist id="people"><option value="Lucek" /><option value="Madzia" /></datalist>
      </div>
      <button className="btn primary big" disabled={testing || !draft.url || !draft.token} onClick={saveAndTest}>
        {testing ? 'Sprawdzanie…' : dirty ? 'Zapisz i sprawdź połączenie' : 'Sprawdź połączenie'}
      </button>
      {status && <p className={'center ' + (status.ok ? 'pos' : 'neg')} role="status">{status.text}</p>}

      <ReminderSection settings={settings} onChange={onChange} />

      <h2 className="section-title">Kolejka offline</h2>
      <p className="muted">
        {pending.length === 0 ? 'Wszystkie wpisy są wysłane.' : `Oczekuje: ${pending.length} (szczegóły w Historii).`}
      </p>
      {pending.length > 0 && <button className="btn" onClick={() => void flush()}>Wyślij teraz</button>}

      <h2 className="section-title">Instalacja</h2>
      <p className="muted small">
        Android (Chrome): menu ⋮ → „Zainstaluj aplikację". iPhone/iPad (Safari): Udostępnij → „Do ekranu początkowego".
      </p>
      <p className="muted small">Wersja z {__BUILD_TIME__}</p>
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Per-person daily e-mail reminder: address, on/off and hour, stored by the Apps Script. */
function ReminderSection({ settings, onChange }: Props) {
  const [email, setEmail] = useState(settings.email)
  const [reminder, setReminder] = useState<Reminder | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!settings.email || !settings.url || !settings.token) return
    let cancelled = false
    api.reminder(settings.email)
      .then(r => { if (!cancelled) setReminder(r) })
      .catch(e => { if (!cancelled) setStatus({ text: e instanceof Error ? e.message : String(e), ok: false }) })
    return () => { cancelled = true }
  }, [settings.email, settings.url, settings.token])

  async function save(next: Reminder) {
    setBusy(true)
    setStatus(null)
    try {
      const r = await api.setReminder(next)
      setReminder(r)
      if (r.email !== settings.email) {
        const s = { ...settings, email: r.email }
        saveSettings(s)
        onChange(s)
      }
      setStatus({ text: r.enabled ? `Przypomnienie codziennie ok. ${r.hour}:00 na ${r.email}.` : 'Przypomnienie wyłączone.', ok: true })
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setBusy(false)
    }
  }

  const current = reminder && reminder.email === email.trim().toLowerCase() ? reminder : null
  const hour = current?.hour ?? 22
  const enabled = current?.enabled ?? false

  return (
    <>
      <h2 className="section-title">Przypomnienie e-mail</h2>
      <div className="field">
        <label className="field-label" htmlFor="remail">Twój e-mail</label>
        <input id="remail" className="input" type="email" autoComplete="email" placeholder="np. lucek@gmail.com"
          value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="row">
        <label className="check grow">
          <input type="checkbox" checked={enabled} disabled={busy || !email.trim()}
            onChange={e => void save({ email, enabled: e.target.checked, hour })} />
          Codzienne przypomnienie
        </label>
        <select className="input hour-select" aria-label="Godzina przypomnienia" value={hour}
          disabled={busy || !email.trim()}
          onChange={e => void save({ email, enabled: enabled || !current, hour: Number(e.target.value) })}>
          {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </div>
      {status && <p className={'small ' + (status.ok ? 'pos' : 'neg')} role="status">{status.text}</p>}
      <p className="muted small">E-mail przychodzi w ciągu godziny od wybranej pory, z podsumowaniem dnia i miesiąca.</p>
    </>
  )
}
