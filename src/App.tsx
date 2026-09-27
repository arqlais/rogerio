import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CLOUD, supabase } from './cloud'
import { ARTIFACT } from './env'
import { StoreProvider, useStore } from './store'
import { go, useRoute } from './router'
import { TxForm } from './components/TxForm'
import { EntityMark } from './components/ui'
import { Icon } from './components/Icon'
import type { Tx } from './types'
import { Dashboard } from './pages/Dashboard'
import { Finance } from './pages/Finance'
import { Projects, ProjectDetail } from './pages/Projects'
import { Team } from './pages/Team'
import { Registry } from './pages/Registry'
import { SettingsPage } from './pages/Settings'
import { PersonDetail } from './pages/PersonDetail'
import { EntityProfile, OwnerProfile } from './pages/Profiles'
import { Quotes } from './pages/Quotes'
import { Agenda } from './pages/Agenda'

const NAV: [string, string, string][] = [
  ['', 'Início', 'home'],
  ['agenda', 'Agenda', 'calendar'],
  ['financeiro', 'Financeiro', 'wallet'],
  ['obras', 'Obras', 'building'],
  ['orcamentos', 'Orçamentos', 'file'],
  ['equipe', 'Equipe', 'users'],
  ['cadastros', 'Empresas', 'briefcase'],
  ['config', 'Ajustes', 'settings'],
]
// no celular: 4 atalhos + "Mais"
const MOBILE = ['', 'financeiro', 'obras', 'equipe']

export default function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  )
}

function Shell() {
  const route = useRoute()
  const { data, setSettings, sync } = useStore()
  const [tx, setTx] = useState<Partial<Tx> | null>(null)
  const [menu, setMenu] = useState(false)
  const [more, setMore] = useState(false)
  const scope = data.settings.scope
  const validScope = scope === 'all' || data.entities.some((e) => e.id === scope)
  useEffect(() => { if (!validScope) setSettings({ scope: 'all' }) }, [validScope, setSettings])

  const page = route[0] ?? ''
  let content: ReactNode
  if (page === 'financeiro') content = <Finance />
  else if (page === 'obras' && route[1]) content = <ProjectDetail id={route[1]} />
  else if (page === 'obras') content = <Projects />
  else if (page === 'equipe') content = <Team tab={route[1]} />
  else if (page === 'pessoa' && route[1]) content = <PersonDetail id={route[1]} />
  else if (page === 'cadastros') content = <Registry tab={route[1]} />
  else if (page === 'config') content = <SettingsPage />
  else if (page === 'empresa' && route[1]) content = <EntityProfile id={route[1]} />
  else if (page === 'perfil') content = <OwnerProfile />
  else if (page === 'orcamentos') content = <Quotes id={route[1]} />
  else if (page === 'agenda') content = <Agenda />
  else content = <Dashboard onNewTx={setTx} />

  const newTx = (kind: Tx['kind']) => { setMenu(false); setTx({ kind }) }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{initials(data.settings.profile?.fullName || data.settings.owner || 'RV')}</span>
          <div>
            <strong>{shortName(data.settings.profile?.fullName) || data.settings.owner || 'Gestão'}</strong>
            <small>{data.settings.profile?.profession || 'Engenharia'} · gestão</small>
          </div>
        </div>
        <nav>
          {NAV.map(([k, l, i]) => (
            <a key={k} href={`#/${k}`} className={page === k || (k === 'equipe' && page === 'pessoa') || (k === 'cadastros' && page === 'empresa') || (k === 'config' && page === 'perfil') ? 'on' : ''}>
              <span className="nav-i"><Icon name={i} /></span>
              {l}
            </a>
          ))}
        </nav>
        <a className="me" href="#/perfil">
          {data.settings.profile?.photo ? <img src={data.settings.profile.photo} alt="" /> : <span className="avatar">{(data.settings.profile?.fullName || data.settings.owner || 'R').slice(0, 1)}</span>}
          <span>{data.settings.profile?.fullName || data.settings.owner}<small>{data.settings.profile?.profession || 'meu perfil'}</small></span>
        </a>
        <div className="sync">{sync === 'local' ? 'Salvo neste aparelho' : sync === 'salvando' ? 'Salvando…' : sync === 'erro' ? '⚠ Erro ao salvar na nuvem' : '✓ Salvo na nuvem'}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="scope" role="radiogroup" aria-label="Ver finanças de">
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setSettings({ scope: 'all' })}>Tudo</button>
            {data.entities.filter((e) => e.favorite || e.id === scope).map((e) => (
              <button key={e.id} className={scope === e.id ? 'on' : ''} onClick={() => setSettings({ scope: e.id })} style={{ ['--c' as string]: e.color }}>
                {e.kind === 'pessoal' ? <span className="dot" style={{ background: e.color }} /> : <EntityMark e={e} size={20} />}
                {e.name}
              </button>
            ))}
            {data.entities.some((e) => !e.favorite && e.id !== scope) && (
              <select className="scope-more" value="" onChange={(e) => e.target.value && setSettings({ scope: e.target.value })} aria-label="Outras empresas">
                <option value="">Outras…</option>
                {data.entities.filter((e) => !e.favorite && e.id !== scope).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
          <div className="new-wrap">
            <button className="btn primary" onClick={() => setMenu((m) => !m)} aria-haspopup="menu"><Icon name="plus" size={18} /> Lançar</button>
            {menu && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(false)} />
                <div className="menu" role="menu">
                  <button onClick={() => newTx('out')}><span className="mi out"><Icon name="arrowDown" size={18} /></span>Saída / conta a pagar</button>
                  <button onClick={() => newTx('in')}><span className="mi in"><Icon name="arrowUp" size={18} /></span>Entrada / a receber</button>
                  <button onClick={() => newTx('transfer')}><span className="mi"><Icon name="swap" size={18} /></span>Transferência / pró-labore</button>
                  <button onClick={() => { setMenu(false); go('/equipe/diarias') }}><span className="mi"><Icon name="hardhat" size={18} /></span>Apontar diárias</button>
                  <button onClick={() => { setMenu(false); go('/agenda') }}><span className="mi"><Icon name="calendar" size={18} /></span>Compromisso na agenda</button>
                  <button onClick={() => { setMenu(false); go('/orcamentos') }}><span className="mi"><Icon name="file" size={18} /></span>Orçamento</button>
                </div>
              </>
            )}
          </div>
        </header>
        {ARTIFACT && <div className="preview-bar">Prévia com dados de exemplo — mexa à vontade: o que você muda fica só neste navegador. Para começar do zero, vá em Ajustes.</div>}
        <main className="content">{content}</main>
      </div>

      <nav className="bottomnav">
        {NAV.filter(([k]) => MOBILE.includes(k)).map(([k, l, i]) => (
          <a key={k} href={`#/${k}`} className={page === k || (k === 'equipe' && page === 'pessoa') ? 'on' : ''} onClick={() => setMore(false)}>
            <span className="nav-i"><Icon name={i} /></span>
            <small>{l}</small>
          </a>
        ))}
        <button className={!MOBILE.includes(page) && page !== 'pessoa' ? 'on' : ''} onClick={() => setMore((m) => !m)}>
          <span className="nav-i"><Icon name="more" /></span>
          <small>Mais</small>
        </button>
      </nav>
      {more && (
        <>
          <div className="menu-backdrop" onClick={() => setMore(false)} />
          <div className="sheet">
            {NAV.filter(([k]) => !MOBILE.includes(k)).map(([k, l, i]) => (
              <a key={k} href={`#/${k}`} onClick={() => setMore(false)}><span className="nav-i"><Icon name={i} /></span>{l}</a>
            ))}
          </div>
        </>
      )}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </div>
  )
}

// ---------- login (só quando a nuvem está ligada) ----------
function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(CLOUD ? undefined : null)
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!CLOUD) return <StoreProvider>{children}</StoreProvider>
  if (session === undefined) return <div className="center-screen"><div className="spinner" /></div>
  if (!session) return <Login />
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />
  return (
    <StoreProvider key={session.user.id} userId={session.user.id} userEmail={session.user.email ?? ''}>
      {children}
    </StoreProvider>
  )
}

export const signOut = () => supabase?.auth.signOut()

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : error.message)
  }
  const forgot = async () => {
    if (!email.trim()) return setError('Digite seu e-mail primeiro.')
    await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
    setInfo('Enviamos um link para redefinir a senha no seu e-mail.')
  }
  return (
    <div className="center-screen login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand big"><span className="brand-mark">RV</span><div><strong>Rogério Vieira</strong><small>obras, equipe e finanças</small></div></div>
        <label className="field"><span className="field-label">E-mail</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span className="field-label">Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={forgot}>Esqueci minha senha</button>
      </form>
    </div>
  )
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setError('Use pelo menos 6 caracteres.')
    const { error } = await supabase!.auth.updateUser({ password })
    if (error) return setError(error.message)
    onDone()
  }
  return (
    <div className="center-screen login">
      <form className="card login-card" onSubmit={submit}>
        <h2>Criar nova senha</h2>
        <label className="field"><span className="field-label">Nova senha</span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block">Salvar senha</button>
      </form>
    </div>
  )
}

const initials = (n: string) => { const w = n.trim().split(/\s+/); return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() }
const shortName = (n?: string) => { if (!n) return ''; const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0] }
