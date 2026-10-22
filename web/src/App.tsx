import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [tab, setTabState] = useState<Tab>(configured ? 'add' : 'settings')
  const [exitHint, setExitHint] = useState(false)
  const showExitHint = useCallback(() => {
    setExitHint(true)
    window.setTimeout(() => setExitHint(false), 2500)
  }, [])
  const setTab = useBackNavigation(tab, setTabState, showExitHint)
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

      {exitHint && <div className="toast warn" role="status">Naciśnij „Wstecz” jeszcze raz, aby wyjść</div>}    </div>
  )
}

/**
 * Keeps the phone's Back button inside the app. History stack: root → home → (other tab).
 * Back from another tab returns to the start tab; Back on the start tab lands on the root
 * entry and only shows a hint, so leaving the app needs a second Back.
 * Entries are pushed only during user interaction — Chrome skips entries pushed without it.
 */
function useBackNavigation(tab: Tab, setTabState: (t: Tab) => void, onExitHint: () => void): (t: Tab) => void {
  const tabRef = useRef(tab)
  tabRef.current = tab
  const homeRef = useRef(tab)
  const levelRef = useRef<'root' | 'home' | 'tab'>('root')
  const hintRef = useRef(onExitHint)
  hintRef.current = onExitHint

  useEffect(() => {
    history.replaceState({ tab: homeRef.current, root: true }, '')
    levelRef.current = 'root'
    // re-arm the guard entry on the next tap or key press; pointerdown does not count as
    // user activation on touch screens, so only events that do are used
    const ARM_EVENTS = ['click', 'touchend', 'keydown']
    const arm = () => {
      if (levelRef.current !== 'root') return
      history.pushState({ tab: homeRef.current }, '')
      levelRef.current = 'home'
    }
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { tab?: Tab; root?: boolean } | null
      const t = state?.tab ?? homeRef.current
      levelRef.current = state?.root || !state ? 'root' : t === homeRef.current ? 'home' : 'tab'
      if (levelRef.current === 'root') hintRef.current()
      setTabState(t)
    }
    ARM_EVENTS.forEach(ev => window.addEventListener(ev, arm, true))
    window.addEventListener('popstate', onPop)
    return () => {
      ARM_EVENTS.forEach(ev => window.removeEventListener(ev, arm, true))
      window.removeEventListener('popstate', onPop)
    }
  }, [setTabState])

  return useCallback((t: Tab) => {
    if (t === tabRef.current) return
    if (t === homeRef.current && levelRef.current === 'tab') {
      history.back() // popstate switches the tab
      return
    }
    if (levelRef.current === 'tab') history.replaceState({ tab: t }, '')
    else history.pushState({ tab: t }, '')
    levelRef.current = t === homeRef.current ? 'home' : 'tab'
    setTabState(t)
  }, [setTabState])
}
