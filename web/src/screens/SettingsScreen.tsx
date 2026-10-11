import { useEffect, useState } from 'react'
import type { PendingTx, Settings } from '../types'
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
    const s = { url: draft.url.trim(), token: draft.token.trim(), person: draft.person.trim() }
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

      <h2 className="section-title">Kolejka offline</h2>
      <p className="muted">
        {pending.length === 0 ? 'Wszystkie wpisy są wysłane.' : `Oczekuje: ${pending.length} (szczegóły w Historii).`}
      </p>
      {pending.length > 0 && <button className="btn" onClick={() => void flush()}>Wyślij teraz</button>}

      <h2 className="section-title">Instalacja</h2>
      <p className="muted small">
        Android (Chrome): menu ⋮ → „Zainstaluj aplikację". iPhone/iPad (Safari): Udostępnij → „Do ekranu początkowego".
      </p>
    </div>
  )
}
