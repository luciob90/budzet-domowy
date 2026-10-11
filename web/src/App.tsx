import { useCallback, useEffect, useState } from 'react'
import type { Categories, PendingTx, Settings } from './types'
import { api } from './api/client'
import { currentMonth } from './lib/format'
import { isConfigured, loadSettings } from './lib/settings'
import { flush, onQueueChange, pendingItems } from './lib/queue'
import { useRemote } from './components'
import { Add } from './screens/Add'
import { Month } from './screens/Month'
import { History } from './screens/History'
import { Accounts } from './screens/Accounts'
import { SettingsScreen } from './screens/SettingsScreen'

type Tab = 'add' | 'month' | 'history' | 'accounts' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'add', label: 'Dodaj', icon: '＋' },
  { id: 'month', label: 'Miesiąc', icon: '▤' },
  { id: 'history', label: 'Historia', icon: '☰' },
  { id: 'accounts', label: 'Konta', icon: '◎' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙' },
]

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const configured = isConfigured(settings)
  const [tab, setTab] = useState<Tab>(configured ? 'add' : 'settings')
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState<PendingTx[]>([])
  const bump = useCallback(() => setVersion(v => v + 1), [])

  const cats = useRemote<Categories>(
    'categories',
    () => configured ? api.categories(currentMonth()) : Promise.reject(new Error('Skonfiguruj połączenie w Ustawieniach.')),
    [settings.url, settings.token],
  )

  useEffect(() => {
    void pendingItems().then(setPending)
    const off = onQueueChange(setPending)
    const sync = () => { if (navigator.onLine) void flush().then(r => { if (r.sent) bump() }) }
    sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      off()
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [bump])

  const waiting = pending.filter(p => !p.error).length
  const failed = pending.length - waiting

  const addScreen = (
    <Add categories={cats.data} categoriesError={cats.error} person={settings.person} onSaved={bump} />
  )

  return (
    <div className="app">
      <header className="topbar">
        <h1>Budżet{cats.data?.year ? ' ' + cats.data.year : ''}</h1>
        <div className="badges">
          {waiting > 0 && <span className="badge warn" title="Wpisy czekające na wysłanie">⇡ {waiting}</span>}
          {failed > 0 && <button className="badge err" onClick={() => setTab('history')}>! {failed}</button>}
        </div>
      </header>

      <main className={'content tab-' + tab}>
        {tab === 'add' && (
          <div className="split">
            {addScreen}
            <div className="split-side"><Month version={version} /></div>
          </div>
        )}
        {tab === 'month' && <Month version={version} />}
        {tab === 'history' && <History version={version} onChanged={bump} />}
        {tab === 'accounts' && <Accounts />}
        {tab === 'settings' && <SettingsScreen settings={settings} onChange={s => { setSettings(s); bump() }} />}
      </main>

      <nav className="tabbar" aria-label="Nawigacja">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}>
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
