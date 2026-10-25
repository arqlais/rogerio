import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth'
import { CLOUD, auth } from './cloud'
import { rememberLogin } from './migrate'
import { ARTIFACT } from './env'
import { confirmDialog, toast } from './components/ui'
import { StoreProvider, useStore } from './store'
import { useRoute } from './router'
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
import { PricingPage } from './pages/Pricing'
import { ImportPage } from './pages/Import'
import { Onboarding } from './pages/Onboarding'
import { Assistant } from './components/Assistant'

const NAV: [string, string, string][] = [
  ['', 'Início', 'home'],
  ['agenda', 'Agenda', 'calendar'],
  ['financeiro', 'Financeiro', 'wallet'],
  ['orcamentos', 'Orçamentos', 'file'],
  ['obras', 'Obras', 'building'],
  ['equipe', 'Equipe', 'users'],
  ['clientes', 'Clientes', 'school'],
  ['precos', 'Preços', 'calc'],
  ['cadastros', 'Empresas', 'briefcase'],
  ['config', 'Ajustes', 'settings'],
]
// no cabeçalho: as páginas do dia a dia; o resto fica em "Mais"
const MAIN = ['', 'agenda', 'financeiro', 'orcamentos', 'obras', 'equipe']
const MORE: [string, string, string, string][] = [
  ['clientes', 'Clientes e escolas', 'school', 'cadastro com CNPJ da APM'],
  ['precos', 'Tabela de preços', 'calc', 'calcular obra e serviços'],
  ['importar', 'Importar planilha', 'upload', 'trazer o que já está no Excel'],
  ['cadastros', 'Empresas e contas', 'briefcase', 'CNPJs, logos, bancos'],
  ['config', 'Ajustes', 'settings', 'assistente, backup, agenda'],
]
// no celular: 2 atalhos + botão Lançar + 2 atalhos + "Mais"
const PHONE = ['', 'financeiro', 'orcamentos', 'agenda']

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
  const [menu, setMenu] = useState<'' | 'mais' | 'eu' | 'sheet'>('')
  const [chat, setChat] = useState(false)
  const layout: Layout = 'classico'
  const setLayout = () => {}
  // o filtro Empresa/Pessoal fica só dentro do Financeiro; aqui só garante um valor válido
  const scope = data.settings.scope
  const validScope = scope === 'all' || scope === 'empresa' || data.entities.some((e) => e.id === scope && e.kind === 'pessoal')
  useEffect(() => { if (!validScope) setSettings({ scope: 'all' }) }, [validScope, setSettings])
  const route0 = route[0] ?? ''
  useEffect(() => { setMenu(''); window.scrollTo(0, 0) }, [route0, route[1]])
  const toggleDemo = () => { setDemo(!demo); setMenu(''); toast(demo ? 'Voltou para os seus dados' : 'Mostrando o exemplo preenchido — seus dados continuam guardados') }

  const page = route0
  let content: ReactNode
  if (page === 'financeiro') content = <Finance onNewTx={setTx} />
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
  else if (page === 'precos') content = <PricingPage tab={route[1]} />
  else if (page === 'importar') content = <ImportPage />
  else content = <Dashboard onNewTx={setTx} onChat={() => setChat(true)} />

  const isOn = (k: string) => page === k || (k === 'equipe' && page === 'pessoa') || (k === 'cadastros' && page === 'empresa') || (k === 'config' && (page === 'perfil' || page === 'importar'))
  const moreOn = MORE.some(([k]) => isOn(k))
  const syncText = sync === 'local' ? 'salvo neste aparelho' : sync === 'salvando' ? 'salvando…' : sync === 'erro' ? 'erro ao salvar na nuvem' : `salvo na nuvem${savedAt ? ` · ${savedAt}` : ''}`
  const name = shortName(data.settings.profile?.fullName) || data.settings.owner || 'Gestão'
  const ini = initials(data.settings.profile?.fullName || data.settings.owner || 'RV')
  const avatar = data.settings.profile?.photo ? <img src={data.settings.profile.photo} alt="" /> : <span>{ini}</span>
  const userMenu = (
    <div className="menu me-menu" role="menu">
      <div className="me-head"><b>{name}</b><small>{userEmail || data.settings.profile?.email}</small><small className="me-sync"><span className={`sync-dot ${sync}`} />{syncText}</small></div>
      <a href="#/perfil"><span className="mi"><Icon name="user" size={18} /></span>Meu perfil</a>
      <a href="#/cadastros"><span className="mi"><Icon name="briefcase" size={18} /></span>Empresas e contas</a>
      <a href="#/config"><span className="mi"><Icon name="settings" size={18} /></span>Ajustes</a>
      <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenu('') }} aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}><span className="mi"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</button>
      <button onClick={toggleDemo} aria-label="Exemplo preenchido"><span className="mi"><Icon name={demo ? 'eyeOff' : 'eye'} size={18} /></span>{demo ? 'Voltar para os meus dados' : 'Ver exemplo preenchido'}</button>
      <button onClick={() => { setMenu(''); setSettings({ onboarded: false }) }} aria-label="Passo a passo"><span className="mi"><Icon name="help" size={18} /></span>Passo a passo</button>
      {CLOUD && <button onClick={async () => { setMenu(''); if (await confirmDialog('Sair da conta neste aparelho?', 'Sair', false)) signOut() }} aria-label="Sair"><span className="mi out"><Icon name="logout" size={18} /></span>Sair</button>}
    </div>
  )
  const bars = (
    <>
      {ARTIFACT && !demo && <div className="demo-bar">Prévia · versão vazia, para preencher. O que você muda fica só neste navegador. <button className="link" onClick={toggleDemo}>ver exemplo preenchido</button></div>}
      {demo && <div className="demo-bar"><Icon name="eye" size={16} /> Você está vendo um <b>exemplo preenchido</b>. Seus dados continuam guardados. <button className="link" onClick={toggleDemo}>voltar para os meus dados</button></div>}
    </>
  )

  return (
    <LayoutCtx.Provider value={{ layout, setLayout }}>
    <div className="app">
      <header className="hdr">
        <div className="hdr-in">
          <a className="hdr-brand" href="#/">
            <span className="brand-mark">{ini}</span>
            <span className="hdr-brand-t"><b>{name}</b><small>{data.settings.profile?.profession || 'Engenharia'} · gestão</small></span>
          </a>
          <nav className="hdr-nav" aria-label="Páginas">
            {NAV.filter(([k]) => MAIN.includes(k)).map(([k, l, i]) => (
              <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''}><Icon name={i} size={17} /><span>{l}</span></a>
            ))}
            <div className="new-wrap">
              <button className={moreOn ? 'on' : ''} onClick={() => setMenu(menu === 'mais' ? '' : 'mais')} aria-haspopup="menu"><Icon name="grid" size={17} /><span>Mais</span><Icon name="chevronDown" size={14} /></button>
              {menu === 'mais' && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenu('')} />
                  <div className="menu" role="menu">
                    {MORE.map(([k, l, i, sub]) => <a key={k} href={`#/${k}`}><span className="mi"><Icon name={i} size={18} /></span><span className="mt"><b>{l}</b><small>{sub}</small></span></a>)}
                  </div>
                </>
              )}
            </div>
          </nav>
          <div className="hdr-act">
            <button className="ai-btn" onClick={() => setChat(true)} aria-label="Assistente" title="Assistente (Gemini)"><Icon name="sparkle" size={19} /><span>Assistente</span></button>
            <button className="pill-btn hdr-launch" onClick={() => setTx({ kind: 'out' })}><span>Lançar</span><i><Icon name="plus" size={18} /></i></button>
            <div className="new-wrap">
              <button className="hdr-me" onClick={() => setMenu(menu === 'eu' ? '' : 'eu')} aria-haspopup="menu" aria-label="Meu menu">{avatar}<i className={`sync-dot ${sync}`} /></button>
              {menu === 'eu' && <><div className="menu-backdrop" onClick={() => setMenu('')} />{userMenu}</>}
            </div>
          </div>
        </div>
      </header>
      {bars}
      <main className="content">{content}</main>

      <nav className="bottomnav" aria-label="Atalhos">
        {NAV.filter(([k]) => PHONE.slice(0, 2).includes(k)).map(([k, l, i]) => <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''}><span className="nav-i"><Icon name={i} /></span><small>{l}</small></a>)}
        <button className="fab" onClick={() => setTx({ kind: 'out' })} aria-label="Lançar"><Icon name="plus" size={26} /></button>
        {NAV.filter(([k]) => PHONE.slice(2).includes(k)).map(([k, l, i]) => <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''}><span className="nav-i"><Icon name={i} /></span><small>{l}</small></a>)}
        <button className={menu === 'sheet' || (!PHONE.includes(page) && page !== 'pessoa') ? 'on' : ''} onClick={() => setMenu(menu === 'sheet' ? '' : 'sheet')}><span className="nav-i"><Icon name="grid" /></span><small>Mais</small></button>
      </nav>
      {menu === 'sheet' && (
        <>
          <div className="menu-backdrop" onClick={() => setMenu('')} />
          <div className="sheet">
            <div className="sheet-grid">
              {NAV.filter(([k]) => !PHONE.includes(k)).map(([k, l, i]) => <a key={k} href={`#/${k}`} className={isOn(k) ? 'on' : ''}><span className="nav-i"><Icon name={i} /></span>{l}</a>)}
              <a href="#/importar"><span className="nav-i"><Icon name="upload" /></span>Importar</a>
            </div>
            {userMenu}
          </div>
        </>
      )}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
      {chat && <Assistant onClose={() => setChat(false)} onEditTx={(t) => { setChat(false); setTx(t) }} />}
      {!data.settings.onboarded && !demo && <Onboarding onClose={() => setSettings({ onboarded: true })} />}
    </div>
    </LayoutCtx.Provider>
  )
}

// ---------- login (só quando a nuvem está ligada) ----------
function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(CLOUD ? undefined : null)
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])
  if (!CLOUD) return <StoreProvider>{children}</StoreProvider>
  if (user === undefined) return <div className="center-screen"><div className="spinner" /></div>
  if (!user) return <Login />
  return (
    <StoreProvider key={user.uid} userId={user.uid} userEmail={user.email ?? ''}>
      {children}
    </StoreProvider>
  )
}

export const signOut = () => (auth ? fbSignOut(auth) : undefined)

const AUTH_ERR: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos. Confira e tente de novo.',
  'auth/wrong-password': 'E-mail ou senha incorretos. Confira e tente de novo.',
  'auth/user-not-found': 'E-mail ou senha incorretos. Confira e tente de novo.',
  'auth/invalid-email': 'Esse e-mail não parece certo.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem internet. Confira a conexão e tente de novo.',
}

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
    try {
      rememberLogin(email.trim(), password)
      await signInWithEmailAndPassword(auth!, email.trim(), password)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(AUTH_ERR[code] ?? `Não consegui entrar (${code || String(err)})`)
    }
    setBusy(false)
  }
  const forgot = async () => {
    if (!email.trim()) return setError('Digite seu e-mail acima e toque de novo em "esqueci minha senha".')
    try { await sendPasswordResetEmail(auth!, email.trim()) } catch { /* não revela se o e-mail existe */ }
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

