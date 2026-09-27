import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CLOUD, supabase } from './cloud'
import { ARTIFACT } from './env'
import { confirmDialog, toast } from './components/ui'
import { StoreProvider, useStore } from './store'
import { go, useRoute } from './router'
import { TxForm } from './components/TxForm'
import { Icon } from './components/Icon'
import { LayoutCtx, type Layout } from './layout'
import { BRAND_ASSETS } from './brandAssets'
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
import { Clients } from './pages/Clients'

const NAV: [string, string, string][] = [
  ['', 'Início', 'home'],
  ['agenda', 'Agenda', 'calendar'],
  ['financeiro', 'Financeiro', 'wallet'],
  ['obras', 'Obras', 'building'],
  ['orcamentos', 'Orçamentos', 'file'],
  ['equipe', 'Equipe', 'users'],
  ['clientes', 'Clientes', 'school'],
  ['cadastros', 'Empresas', 'briefcase'],
  ['config', 'Ajustes', 'settings'],
]
const GROUPS: [string, string[]][] = [
  ['hoje', ['', 'agenda']],
  ['dinheiro', ['financeiro', 'orcamentos']],
  ['obras e pessoas', ['obras', 'equipe', 'clientes']],
  ['cadastros', ['cadastros', 'config']],
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
  const { data, setSettings, sync, savedAt, userEmail, demo, setDemo } = useStore()
  const [theme, setTheme] = useTheme()
  const [tx, setTx] = useState<Partial<Tx> | null>(null)
  const [menu, setMenu] = useState<false | 'side' | 'top'>(false)
  const [more, setMore] = useState(false)
  const layout: Layout = 'classico'
  const setLayout = () => {}
  const scope = data.settings.scope
  // as empresas ficam sempre juntas: um CNPJ sozinho no topo volta para "Empresa"
  const companyScope = data.entities.some((e) => e.id === scope && e.kind === 'empresa')
  const validScope = scope === 'all' || scope === 'empresa' || data.entities.some((e) => e.id === scope)
  useEffect(() => { if (!validScope || companyScope) setSettings({ scope: 'empresa' }) }, [validScope, companyScope, setSettings])
  const pessoal = data.entities.find((e) => e.kind === 'pessoal')
  const inEmpresa = scope === 'empresa' || companyScope
  const toggleDemo = () => { setDemo(!demo); toast(demo ? 'Voltou para os seus dados' : 'Mostrando o exemplo preenchido — seus dados continuam guardados') }
  const tools = (
    <div className="side-tools">
      <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
      <button className={`icon-btn ${demo ? 'on' : ''}`} onClick={toggleDemo} title={demo ? 'Esconder o exemplo (voltar aos meus dados)' : 'Ver exemplo preenchido'} aria-label="Exemplo preenchido"><Icon name={demo ? 'eye' : 'eyeOff'} /></button>
      <span style={{ flex: 1 }} />
      {CLOUD && <button className="icon-btn" onClick={async () => { if (await confirmDialog('Sair da conta neste aparelho?', 'Sair', false)) signOut() }} title="Sair" aria-label="Sair"><Icon name="logout" /></button>}
    </div>
  )

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
  else if (page === 'clientes') content = <Clients />
  else content = <Dashboard onNewTx={setTx} />

  const newTx = (kind: Tx['kind']) => { setMenu(false); setTx({ kind }) }

  const isOn = (k: string) => page === k || (k === 'equipe' && page === 'pessoa') || (k === 'cadastros' && page === 'empresa') || (k === 'config' && page === 'perfil')
  const syncText = sync === 'local' ? 'salvo neste aparelho' : sync === 'salvando' ? 'salvando…' : sync === 'erro' ? 'erro ao salvar na nuvem' : `salvo na nuvem${savedAt ? ` · ${savedAt}` : ''}`
  const scopeSeg = (
    <div className="scope" role="radiogroup" aria-label="Ver finanças de">
      <div className="scope-seg">
        <button className={inEmpresa ? 'on' : ''} onClick={() => setSettings({ scope: 'empresa' })}>Empresa</button>
        {pessoal && <button className={scope === pessoal.id ? 'on' : ''} onClick={() => setSettings({ scope: pessoal.id })}>Pessoal</button>}
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setSettings({ scope: 'all' })}>Tudo</button>
      </div>
    </div>
  )
  const launcher = (where: 'side' | 'top') => (
    <div className="new-wrap">
      <button className="btn primary" onClick={() => setMenu((m) => (m === where ? false : where))} aria-haspopup="menu"><Icon name="plus" size={18} /> Lançar</button>
      {menu === where && (
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
  )
  const bars = (
    <>
      {ARTIFACT && !demo && <div className="demo-bar">Prévia · versão vazia, para preencher. O que você muda fica só neste navegador. <button className="link" onClick={toggleDemo}>ver exemplo preenchido</button></div>}
      {demo && <div className="demo-bar"><Icon name="eye" size={16} /> Você está vendo um <b>exemplo preenchido</b>. Seus dados continuam guardados. <button className="link" onClick={toggleDemo}>voltar para os meus dados</button></div>}
    </>
  )
  const mobile = (
    <>
      <nav className="bottomnav">
        {NAV.filter(([k]) => MOBILE.includes(k)).map(([k, l, i]) => (
          <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''} onClick={() => setMore(false)}>
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
            {tools}
          </div>
        </>
      )}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </>
  )
  const name = shortName(data.settings.profile?.fullName) || data.settings.owner || 'Gestão'
  const ini = initials(data.settings.profile?.fullName || data.settings.owner || 'RV')

  return (
    <LayoutCtx.Provider value={{ layout, setLayout }}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{ini}</span>
          <div>
            <strong>{name}</strong>
            <small>{data.settings.profile?.profession || 'Engenharia'} · gestão</small>
          </div>
        </div>
        <div className="side-actions">
          {launcher('side')}
          {scopeSeg}
        </div>
        <nav>
          {GROUPS.map(([g, keys]) => (
            <div key={g} className="nav-group">
              <span className="nav-label">{g}</span>
              {NAV.filter(([k]) => keys.includes(k)).map(([k, l, i]) => (
                <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''}>
                  <span className="nav-i"><Icon name={i} /></span>
                  {l}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <a className="me" href="#/perfil">
            {data.settings.profile?.photo ? <img src={data.settings.profile.photo} alt="" /> : <span className="avatar"><Icon name="user" size={18} /></span>}
            <span>{name.toLowerCase()}<small>{userEmail || data.settings.profile?.email || 'meu perfil'}</small></span>
          </a>
          <div className="sync"><span className={`sync-dot ${sync}`} />{syncText}</div>
          {tools}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {scopeSeg}
          {launcher('top')}
        </header>
        {bars}
        <main className="content">{content}</main>
      </div>
      {mobile}
    </div>
    </LayoutCtx.Provider>
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
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message.includes('Invalid') ? 'E-mail ou senha incorretos. Confira e tente de novo.' : error.message)
  }
  const forgot = async () => {
    if (!email.trim()) return setError('Digite seu e-mail acima e toque de novo em "esqueci minha senha".')
    await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
    setInfo('Pronto! Enviamos um link para criar uma senha nova no seu e-mail.')
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <span className="auth-eyebrow">acesso restrito</span>
        <h1 className="auth-title"><span>bem-vindo</span> de volta</h1>
        <p className="auth-lead">Entre para ver obras, equipe, orçamentos e o caixa de todas as empresas.</p>
        <label className="auth-field">
          <span>E-mail</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus />
        </label>
        <label className="auth-field">
          <span>Senha</span>
          <div className="auth-pass">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}><Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>
          </div>
        </label>
        {error && <p className="auth-msg err">{error}</p>}
        {info && <p className="auth-msg ok">{info}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Entrando…' : <>Entrar <Icon name="chevron" size={18} /></>}</button>
        <button type="button" className="auth-link" onClick={forgot}>esqueci minha senha</button>
      </form>
    </AuthLayout>
  )
}

/** Tela de entrada: prancha de engenharia com o prédio sendo desenhado + formulário. */
function AuthLayout({ children }: { children: ReactNode }) {
  const logos = [BRAND_ASSETS.quira?.logo, BRAND_ASSETS.rdl?.logo, BRAND_ASSETS.engforte?.logo].filter(Boolean)
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-art-top"><span className="brand-mark">RV</span><span><b>Rogério Vieira</b><small>Engenharia · gestão de obras</small></span></div>
        <BuildingDrawing />
        <div className="auth-art-bottom">
          <p className="auth-quote">cada obra, cada diária,<br /><em>cada centavo no lugar.</em></p>
          <div className="auth-logos">{logos.map((l, i) => <img key={i} src={l} alt="" />)}</div>
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  )
}

/** Desenho técnico animado: fachada de 3 pavimentos × 3 apartamentos, com cotas. */
function BuildingDrawing() {
  const W = 300, floorH = 70, x0 = 60, y0 = 60
  const floors = [0, 1, 2]
  return (
    <svg className="blueprint" viewBox="0 0 420 360">
      <g className="bp-grid">
        {Array.from({ length: 22 }, (_, i) => <line key={'v' + i} x1={i * 20} y1="0" x2={i * 20} y2="360" />)}
        {Array.from({ length: 19 }, (_, i) => <line key={'h' + i} x1="0" y1={i * 20} x2="420" y2={i * 20} />)}
      </g>
      <g className="bp-draw">
        {/* telhado e estrutura */}
        <path d={`M${x0 - 14} ${y0} L${x0 + W / 2} ${y0 - 34} L${x0 + W + 14} ${y0}`} style={{ ['--d' as string]: '0s' }} />
        <rect x={x0} y={y0} width={W} height={floorH * 3} style={{ ['--d' as string]: '.4s' }} />
        {floors.slice(1).map((f) => <line key={f} x1={x0} x2={x0 + W} y1={y0 + f * floorH} y2={y0 + f * floorH} style={{ ['--d' as string]: `${0.9 + f * 0.2}s` }} />)}
        {/* 9 apartamentos: janelas */}
        {floors.map((f) => [0, 1, 2].map((c) => (
          <rect key={`${f}${c}`} className="bp-win" x={x0 + 26 + c * 94} y={y0 + 16 + f * floorH} width={60} height={36} rx="2" style={{ ['--d' as string]: `${1.4 + (f * 3 + c) * 0.12}s` }} />
        )))}
        {/* porta e chão */}
        <line x1={x0 - 30} x2={x0 + W + 30} y1={y0 + floorH * 3} y2={y0 + floorH * 3} className="bp-ground" style={{ ['--d' as string]: '.2s' }} />
      </g>
      <g className="bp-dim">
        <line x1={x0} x2={x0 + W} y1={y0 + floorH * 3 + 26} y2={y0 + floorH * 3 + 26} />
        <line x1={x0} x2={x0} y1={y0 + floorH * 3 + 18} y2={y0 + floorH * 3 + 34} />
        <line x1={x0 + W} x2={x0 + W} y1={y0 + floorH * 3 + 18} y2={y0 + floorH * 3 + 34} />
        <text x={x0 + W / 2} y={y0 + floorH * 3 + 46} textAnchor="middle">3 pav. · 9 unidades</text>
        <line x1={x0 + W + 30} x2={x0 + W + 30} y1={y0} y2={y0 + floorH * 3} />
        {floors.map((f) => <text key={f} x={x0 + W + 38} y={y0 + floorH * (2.6 - f)} >{f + 1}º</text>)}
      </g>
      <g className="bp-stamp">
        <rect x="262" y="318" width="150" height="34" />
        <text x="270" y="332">PRANCHA 01/01</text>
        <text x="270" y="345">FACHADA · ESC. 1:100</text>
      </g>
    </svg>
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
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <span className="auth-eyebrow">nova senha</span>
        <h1 className="auth-title"><span>crie</span> sua senha</h1>
        <label className="auth-field"><span>Nova senha</span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
        {error && <p className="auth-msg err">{error}</p>}
        <button className="auth-submit">Salvar senha</button>
      </form>
    </AuthLayout>
  )
}

const initials = (n: string) => { const w = n.trim().split(/\s+/); return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() }
const shortName = (n?: string) => { if (!n) return ''; const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0] }

/** Tema claro/escuro, lembrado neste aparelho (começa pelo tema do sistema). */
function useTheme(): ['light' | 'dark', (t: 'light' | 'dark') => void] {
  const [t, setT] = useState<'light' | 'dark'>(() => {
    try { const v = localStorage.getItem('rogerio-tema'); if (v === 'light' || v === 'dark') return v } catch { /* bloqueado */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = t
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e1522' : '#172a4d')
  }, [t])
  return [t, (v) => { setT(v); try { localStorage.setItem('rogerio-tema', v) } catch { /* bloqueado */ } }]
}
