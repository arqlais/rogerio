import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CLOUD, PROJECT_REF, fetchRemote, publishAgenda, pushRemote } from './cloud'
import { buildICS } from './ics'
import { ARTIFACT } from './env'
import { setFilesUser } from './files'
import schemaSql from '../supabase/schema.sql?raw'
import type { Category, Collection, Data, Entity, Settings } from './types'
import { BRAND_ASSETS } from './brandAssets'
import { addDays, addMonths, setCompanyIds, today, uid } from './utils'

const KEY = 'rogerio-gestao-v1'
const META = 'rogerio-gestao-meta'

const cat = (name: string, kind: 'in' | 'out', scope: Category['scope']): Category => ({ id: uid(), name, kind, scope })

export const DEFAULT_CATEGORIES = (): Category[] => [
  // saídas das empresas
  ...['Material de construção', 'Mão de obra – diárias', 'Salários', 'Empreitada', 'Adiantamento / vale', 'Encargos (INSS/FGTS)', 'Aluguel de equipamentos', 'Ferramentas e EPI', 'Combustível e transporte', 'Alimentação da equipe', 'Projetos e terceiros', 'Taxas, alvarás e cartório', 'Impostos da empresa', 'Contador', 'Escritório e despesas fixas', 'Tarifas bancárias', 'Pró-labore'].map((n) => cat(n, 'out', 'empresa')),
  // entradas das empresas
  ...['Medição de obra', 'Contrato / serviço', 'Venda de unidade', 'Aporte de sócio'].map((n) => cat(n, 'in', 'empresa')),
  // pessoal
  ...['Casa e contas', 'Mercado', 'Saúde e plano', 'Educação', 'Carro', 'Lazer e viagens', 'Cartão de crédito', 'Impostos pessoais (IR, IPTU, IPVA)', 'Família', 'Investimentos'].map((n) => cat(n, 'out', 'pessoal')),
  ...['Pró-labore recebido', 'Distribuição de lucros', 'Aluguéis recebidos', 'Rendimentos'].map((n) => cat(n, 'in', 'pessoal')),
  cat('Outras despesas', 'out', 'ambos'),
  cat('Outras receitas', 'in', 'ambos'),
]

export const DEFAULT_SETTINGS: Settings = { owner: 'Rogério', scope: 'empresa', payday: 5, weekStart: 1 }
const withProfile = (s: Settings): Settings => ({ ...s, profile: { ...DEFAULT_PROFILE, ...(s.profile ?? {}) } })

/** Dados das empresas (tirados dos orçamentos, NF, contrato e placa de obra). Tudo editável no perfil da empresa. */
const COMPANIES: Omit<Entity, 'id'>[] = [
  {
    name: 'Quira', kind: 'empresa', color: '#1f3a68', favorite: true,
    legalName: 'Dinéia Alves do Amaral LTDA', doc: '29.266.779/0001-73',
    address: 'Rua dos Missionários, 211', district: 'Jardim Santo André', city: 'Santo André – SP',
    phone: '(11) 97467-5293', email: 'quira.construcoes@gmail.com', contactName: 'Dinéia',
    tagline: 'QUIRA - Prestadora Eficiente em Construções e Reformas (Projetos, Laudos Técnicos e Perícias)',
    ...BRAND_ASSETS.quira,
  },
  {
    name: 'RDL', kind: 'empresa', color: '#f08a2c', favorite: true,
    legalName: 'RDL Engenharia Representações e Construções LTDA', doc: '48.624.017/0001-46', municipalReg: '328612',
    address: 'Rua Luziânia, 119', district: 'Sítio dos Vianas', city: 'Santo André – SP', cep: '09169-150',
    phone: '(11) 97520-8296', email: 'roger.rdl76@yahoo.com.br', contactName: 'Rogério',
    responsible: 'Eng. Rogério Francisco Vieira – CREA-SP 5070438360',
    bank: 'Nu Pagamentos S.A. – Banco 260 – Agência 0001 – Conta 43520212-8', pix: 'roger.rdl76@yahoo.com.br',
    tagline: 'ENGENHARIA E REPRESENTAÇÕES - CONSTRUÇÕES E REFORMAS - COMÉRCIO VAREJISTA E ATACADISTA',
    ...BRAND_ASSETS.rdl,
  },
  {
    name: 'Engforte', kind: 'empresa', color: '#4caf50', favorite: true,
    legalName: 'ENGFORTE Construção e Empreendimento LTDA', doc: '53.059.975/0001-51',
    address: 'Rua dos Missionários, 227', district: 'Jardim Santo André', city: 'Santo André – SP',
    phone: '(11) 95123-3515', email: 'comercial.engforte@gmail.com', contactName: 'Laís',
    ...BRAND_ASSETS.engforte,
  },
  { name: 'AV', kind: 'empresa', color: '#8a4fbf' },
]

export const DEFAULT_PROFILE = {
  fullName: 'Rogério Francisco Vieira', cpf: '152.551.248-00', profession: 'Engenheiro Civil', crea: 'CREA-SP 5070438360',
  phone: '(11) 97520-8296', email: 'roger.rdl76@yahoo.com.br',
}

export function emptyData(): Data {
  const start = today()
  const entities: Data['entities'] = [
    ...COMPANIES.map((c) => ({ ...c, id: uid() })),
    { id: uid(), name: 'Pessoal', kind: 'pessoal', doc: DEFAULT_PROFILE.cpf, color: '#5b6573', favorite: true },
  ]
  return {
    version: 3,
    entities,
    accounts: entities.map((e) => ({ id: uid(), entityId: e.id, name: e.kind === 'pessoal' ? 'Conta pessoal' : `Conta ${e.name}`, initial: 0, initialDate: start })),
    projects: [], units: [], people: [], txs: [], attendance: [], contracts: [], quotes: [], events: [],
    categories: DEFAULT_CATEGORIES(),
    settings: withProfile({ ...DEFAULT_SETTINGS }),
  }
}

/** Dados de exemplo para conhecer a plataforma antes de cadastrar os reais. */
export function sampleData(): Data {
  const d = emptyData()
  const t = today()
  const e1 = d.entities[1] // RDL
  const e2 = d.entities[2] // Engforte
  const pess = d.entities.find((e) => e.kind === 'pessoal')!
  const start = addDays(t, -60)
  d.accounts.forEach((a) => { a.initialDate = start })
  const accOf = (id: string) => d.accounts.find((a) => a.entityId === id)!
  const acc1 = accOf(e1.id), acc2 = accOf(e2.id), accP = accOf(pess.id)
  acc1.initial = 85000; acc2.initial = 30000; accP.initial = 22000

  const predio = { id: uid(), name: 'Residencial – prédio 3 pavimentos', entityId: e1.id, kind: 'incorporacao' as const, status: 'andamento' as const, client: 'Obra própria', address: 'Rua Exemplo, 100', contractValue: 0, budget: 1450000, start: addDays(t, -120), end: addDays(t, 300) }
  const escola = { id: uid(), name: 'Reforma E.M. Exemplo', entityId: e2.id, kind: 'reforma_escola' as const, status: 'andamento' as const, client: 'Prefeitura Municipal', contractNo: 'Contrato 045/2026', address: 'Centro', contractValue: 380000, budget: 290000, start: addDays(t, -75), end: addDays(t, 45) }
  d.projects.push(predio, escola)
  for (let f = 1; f <= 3; f++)
    for (let n = 1; n <= 3; n++)
      d.units.push({ id: uid(), projectId: predio.id, floor: f, number: `${f}0${n}`, area: 68, price: 360000 + f * 15000, status: 'disponivel' })
  d.units[0].status = 'vendido'; d.units[0].buyer = 'Comprador Exemplo'; d.units[0].saleDate = addDays(t, -40); d.units[0].salePrice = 370000
  d.units[4].status = 'reservado'; d.units[4].buyer = 'Interessado'

  const p = (name: string, role: Data['people'][number]['role'], extra: Partial<Data['people'][number]> = {}) => {
    const x = { id: uid(), name, role, active: true, ...extra }
    d.people.push(x)
    return x
  }
  const mestre = p('João (mestre de obras)', 'fixo', { job: 'Mestre de obras', salary: 4200, charges: 28, entityId: e1.id, phone: '' })
  p('Carlos', 'fixo', { job: 'Pedreiro', salary: 2900, charges: 28, entityId: e1.id })
  const d1 = p('Antônio', 'diarista', { job: 'Pedreiro', dailyRate: 180 })
  const d2 = p('Marcos', 'diarista', { job: 'Servente', dailyRate: 120 })
  const emp = p('Zé Elétrica', 'empreiteiro', { job: 'Instalações elétricas', pix: 'chave-pix' })
  const forn = p('Depósito Exemplo', 'fornecedor', { job: 'Material de construção' })

  const tx = (x: Partial<Data['txs'][number]> & Pick<Data['txs'][number], 'kind' | 'entityId' | 'category' | 'description' | 'amount' | 'due'>) =>
    d.txs.push({ id: uid(), createdAt: new Date().toISOString(), ...x })

  // medições da escola (com retenção)
  tx({ kind: 'in', entityId: e2.id, accountId: acc2.id, projectId: escola.id, category: 'Medição de obra', description: '1ª medição', gross: 95000, retention: 10450, amount: 84550, due: addDays(t, -35), paid: addDays(t, -30), docNo: 'NF 101' })
  tx({ kind: 'in', entityId: e2.id, accountId: acc2.id, projectId: escola.id, category: 'Medição de obra', description: '2ª medição', gross: 110000, retention: 12100, amount: 97900, due: addDays(t, 10), docNo: 'NF 108' })
  tx({ kind: 'out', entityId: e2.id, accountId: acc2.id, projectId: escola.id, personId: forn.id, category: 'Material de construção', description: 'Telhas e madeiramento', amount: 38400, due: addDays(t, -20), paid: addDays(t, -20), method: 'Boleto' })
  tx({ kind: 'out', entityId: e2.id, accountId: acc2.id, projectId: escola.id, personId: forn.id, category: 'Material de construção', description: 'Tintas e massa', amount: 12650, due: addDays(t, 5), method: 'Boleto' })
  // prédio
  tx({ kind: 'out', entityId: e1.id, accountId: acc1.id, projectId: predio.id, personId: forn.id, category: 'Material de construção', description: 'Concreto usinado – laje 1º pav.', amount: 42800, due: addDays(t, -25), paid: addDays(t, -25), method: 'Pix' })
  tx({ kind: 'out', entityId: e1.id, accountId: acc1.id, projectId: predio.id, personId: forn.id, category: 'Material de construção', description: 'Aço CA-50', amount: 31200, due: addDays(t, -2), method: 'Boleto' })
  tx({ kind: 'out', entityId: e1.id, accountId: acc1.id, projectId: predio.id, category: 'Aluguel de equipamentos', description: 'Andaimes e escoras', amount: 3800, due: addDays(t, 3), method: 'Boleto' })
  const g = uid()
  for (let i = 0; i < 4; i++)
    tx({ kind: 'in', entityId: e1.id, accountId: acc1.id, projectId: predio.id, unitId: d.units[0].id, category: 'Venda de unidade', description: i === 0 ? 'Apto 101 – entrada' : `Apto 101 – parcela ${i}/3`, amount: i === 0 ? 74000 : 12000, due: addMonths(addDays(t, -40), i), paid: i < 2 ? addMonths(addDays(t, -40), i) : undefined, group: g })
  // empreitada
  const c = { id: uid(), personId: emp.id, projectId: predio.id, entityId: e1.id, service: 'Instalação elétrica completa (9 aptos + áreas comuns)', total: 58000, progress: 30, status: 'andamento' as const, start: addDays(t, -30) }
  d.contracts.push(c)
  tx({ kind: 'out', entityId: e1.id, accountId: acc1.id, projectId: predio.id, contractId: c.id, personId: emp.id, category: 'Empreitada', description: 'Empreitada elétrica – 1ª parcela', amount: 15000, due: addDays(t, -10), paid: addDays(t, -10), method: 'Pix' })
  // folha e adiantamento
  tx({ kind: 'out', entityId: e1.id, accountId: acc1.id, personId: mestre.id, projectId: predio.id, category: 'Adiantamento / vale', description: 'Vale – João', amount: 500, due: addDays(t, -3), paid: addDays(t, -3), method: 'Pix' })
  // diárias da semana passada e desta
  const ws = addDays(t, -((new Date().getDay() + 6) % 7) - 7)
  for (let i = 0; i < 11; i++) {
    const day = addDays(ws, i)
    if (new Date(day + 'T12:00').getDay() === 0 || day > t) continue
    const proj = i % 2 ? escola.id : predio.id
    d.attendance.push({ id: uid(), date: day, personId: d1.id, projectId: proj, fraction: 1, rate: 180 })
    d.attendance.push({ id: uid(), date: day, personId: d2.id, projectId: proj, fraction: new Date(day + 'T12:00').getDay() === 6 ? 0.5 : 1, rate: 120 })
  }
  // pessoal
  tx({ kind: 'transfer', entityId: e1.id, accountId: acc1.id, toEntityId: pess.id, toAccountId: accP.id, category: 'Pró-labore', description: 'Pró-labore do mês', amount: 12000, due: addDays(t, -5), paid: addDays(t, -5) })
  tx({ kind: 'out', entityId: pess.id, accountId: accP.id, category: 'Casa e contas', description: 'Luz, água e internet', amount: 780, due: addDays(t, 4) })
  tx({ kind: 'out', entityId: pess.id, accountId: accP.id, category: 'Saúde e plano', description: 'Plano de saúde', amount: 1650, due: addDays(t, -8), paid: addDays(t, -8) })
  tx({ kind: 'out', entityId: pess.id, accountId: accP.id, category: 'Cartão de crédito', description: 'Fatura do cartão', amount: 4320, due: addDays(t, 8) })
  d.events.push(
    { id: uid(), title: 'Visita na obra do prédio', date: t, time: '08:00', kind: 'visita', projectId: predio.id },
    { id: uid(), title: 'Reunião na prefeitura – 2ª medição', date: addDays(t, 1), time: '14:30', kind: 'reuniao', projectId: escola.id, place: 'Secretaria de Obras' },
    { id: uid(), title: 'Pagar diaristas', date: addDays(t, (6 - new Date().getDay() + 7) % 7), kind: 'compromisso', repeat: 'semanal' },
  )
  d.quotes.push({ id: uid(), model: 'pdde', number: `001/${t.slice(0, 4)}`, entityId: e1.id, client: '', title: '', apmName: 'E.E. Escola Exemplo', apmCnpj: '00.000.000/0001-00', subprogram: 'PDDE Paulista - Manutenção', exercise: t.slice(0, 4), contactName: 'Rogério',
    date: addDays(t, -5), validDays: 20, payment: 'Após apresentação da nota fiscal', bdi: 0, discount: 0, status: 'enviado',
    items: [
      { id: uid(), description: 'Manutenção elétrica da sala Maker', unit: '', qty: 0, price: 0, total: 4000 },
      { id: uid(), description: 'Reparação de porta da sala Maker', unit: '', qty: 0, price: 0, total: 2500 },
      { id: uid(), description: 'Troca de lâmpadas', unit: 'un', qty: 30, price: 50 },
    ] })
  d.settings.owner = 'Rogério'
  return d
}

/** Completa dados antigos/incompletos com os campos novos. */
function normalize(raw: Partial<Data>): Data {
  const base = emptyData()
  // versão 1 → 2: completa as empresas com os dados e logotipos reais (sem apagar o que já foi preenchido)
  if ((raw.version ?? 1) < 2 && raw.entities) {
    raw = {
      ...raw,
      version: 2,
      entities: raw.entities.map((e) => {
        const key = e.name.toLowerCase().replace('engefort', 'engforte')
        const def = COMPANIES.find((c) => c.name.toLowerCase() === key)
        if (!def) return e.kind === 'pessoal' ? { ...e, favorite: true, doc: e.doc || DEFAULT_PROFILE.cpf } : e
        const merged: Entity = { ...def, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== '' && v !== undefined)), id: e.id } as Entity
        return { ...merged, name: def.name, color: def.color, favorite: def.favorite }
      }),
    }
  }
  // versão 2 → 3: símbolo do logo para botões e listas
  if ((raw.version ?? 1) < 3 && raw.entities) {
    raw = {
      ...raw,
      version: 3,
      entities: raw.entities.map((e) => {
        const def = COMPANIES.find((c) => c.name.toLowerCase() === e.name.toLowerCase())
        return def && !e.mark ? { ...e, mark: def.mark, logo: e.logo ?? def.logo } : e
      }),
    }
  }
  return {
    ...base,
    ...raw,
    categories: raw.categories?.length ? raw.categories : base.categories,
    quotes: raw.quotes ?? [],
    events: raw.events ?? [],
    settings: withProfile({ ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }),
  } as Data
}

type Item<K extends Collection> = Data[K][number]
type Sync = 'local' | 'salvando' | 'salvo' | 'erro'

interface Store {
  data: Data
  update: (fn: (d: Data) => Data) => void
  save: <K extends Collection>(k: K, item: Item<K>) => void
  saveMany: <K extends Collection>(k: K, items: Item<K>[]) => void
  remove: <K extends Collection>(k: K, id: string) => void
  replaceAll: (d: Data) => void
  setSettings: (s: Partial<Settings>) => void
  sync: Sync
  savedAt?: string
  userEmail?: string
  userId?: string
  publishAgendaNow: (token?: string) => Promise<boolean>
  demo: boolean // mostrando o exemplo preenchido (não mexe nos dados reais)
  setDemo: (v: boolean) => void
  resetDemo: () => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

const DEMO = 'rogerio-gestao-exemplo'
const DEMO_ON = 'rogerio-gestao-exemplo-ligado'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* bloqueado */ } }
function loadDemo(): Data | null {
  try { const s = lsGet(DEMO); return s ? normalize(JSON.parse(s)) : null } catch { return null }
}

function loadLocal(): Data | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? normalize(JSON.parse(s)) : null
  } catch {
    return null
  }
}

export function StoreProvider({ children, userId, userEmail }: { children: ReactNode; userId?: string; userEmail?: string }) {
  if (userId) setFilesUser(userId)
  const [data, setData] = useState<Data>(() => loadLocal() ?? emptyData())
  // modo exemplo: um conjunto separado, só neste aparelho; os dados reais ficam intactos
  const [demo, setDemoState] = useState(() => { const v = lsGet(DEMO_ON); return v === null ? ARTIFACT : v === '1' })
  const [demoData, setDemoData] = useState<Data>(() => loadDemo() ?? sampleData())
  const demoRef = useRef(demo)
  demoRef.current = demo
  const [savedAt, setSavedAt] = useState<string>()
  const [ready, setReady] = useState(!userId)
  const [sync, setSync] = useState<Sync>(userId ? 'salvando' : 'local')
  const [loadError, setLoadError] = useState('')
  const first = useRef(true)
  const timer = useRef<number | undefined>(undefined)

  // com nuvem: baixa os dados do usuário (ou envia os locais, na primeira vez)
  useEffect(() => {
    if (!userId || !CLOUD) return
    let alive = true
    fetchRemote(userId)
      .then(async (r) => {
        if (!alive) return
        if (r) {
          setData(normalize(r.data))
          localStorage.setItem(META, r.updatedAt)
        } else {
          await pushRemote(userId, loadLocal() ?? emptyData())
        }
        setSync('salvo')
        setReady(true)
      })
      .catch((e) => {
        console.error(e)
        setLoadError(String(e?.message ?? e))
      })
    return () => { alive = false }
  }, [userId])

  // grava no navegador sempre e na nuvem com um pequeno atraso
  useEffect(() => {
    if (!ready) return
    if (first.current) { first.current = false; return }
    try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* cheio ou bloqueado */ }
    if (!userId) return
    setSync('salvando')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      pushRemote(userId, data)
        .then((at) => { localStorage.setItem(META, at); setSync('salvo'); setSavedAt(new Date().toTimeString().slice(0, 5)) })
        .catch((e) => { console.error(e); setSync('erro') })
    }, 700)
  }, [data, ready, userId])

  useEffect(() => { lsSet(DEMO, JSON.stringify(demoData)) }, [demoData])

  // agenda do celular: republica o .ics (só dos dados reais) alguns segundos depois de cada mudança
  const agTimer = useRef<number | undefined>(undefined)
  const publishAgendaNow = useCallback(async (token?: string) => {
    if (!CLOUD || !userId) return false
    try { await publishAgenda(userId, token ?? data.settings.calendarToken ?? '', buildICS(data)); return true } catch (e) { console.error(e); return false }
  }, [data, userId])
  useEffect(() => {
    if (!ready || !CLOUD || !userId || !data.settings.calendarToken) return
    window.clearTimeout(agTimer.current)
    agTimer.current = window.setTimeout(() => { void publishAgendaNow() }, 4000)
  }, [data, ready, userId, publishAgendaNow])
  const setDemo = useCallback((v: boolean) => { setDemoState(v); lsSet(DEMO_ON, v ? '1' : '0') }, [])
  const resetDemo = useCallback(() => setDemoData(sampleData()), [])
  // todas as alterações vão para o conjunto que está na tela
  const setCur = useCallback((fn: (d: Data) => Data) => (demoRef.current ? setDemoData(fn) : setData(fn)), [])
  const cur = demo ? demoData : data
  setCompanyIds(cur.entities.filter((e) => e.kind === 'empresa').map((e) => e.id))
  const update = useCallback((fn: (d: Data) => Data) => setCur((d) => fn(d)), [setCur])
  const save = useCallback(<K extends Collection>(k: K, item: Item<K>) => {
    setCur((d) => {
      const list = d[k] as Item<K>[]
      const i = list.findIndex((x) => x.id === item.id)
      const next = i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
      return { ...d, [k]: next }
    })
  }, [setCur])
  const saveMany = useCallback(<K extends Collection>(k: K, items: Item<K>[]) => {
    setCur((d) => {
      const ids = new Set(items.map((x) => x.id))
      const list = (d[k] as Item<K>[]).filter((x) => !ids.has(x.id))
      return { ...d, [k]: [...list, ...items] }
    })
  }, [setCur])
  const remove = useCallback(<K extends Collection>(k: K, id: string) => {
    setCur((d) => ({ ...d, [k]: (d[k] as Item<K>[]).filter((x) => x.id !== id) }))
  }, [setCur])
  const replaceAll = useCallback((d: Data) => setCur(() => normalize(d)), [setCur])
  const setSettings = useCallback((s: Partial<Settings>) => setCur((d) => ({ ...d, settings: { ...d.settings, ...s } })), [setCur])

  if (loadError) return <CloudSetup error={loadError} />
  if (!ready) return <div className="center-screen"><div className="spinner" /></div>

  return <Ctx.Provider value={{ data: cur, update, save, saveMany, remove, replaceAll, setSettings, sync, savedAt, userEmail, userId, publishAgendaNow, demo, setDemo, resetDemo }}>{children}</Ctx.Provider>
}

/** Tela quando a tabela ainda não existe no Supabase: mostra o SQL pronto para copiar. */
function CloudSetup({ error }: { error: string }) {
  const [copied, setCopied] = useState(false)
  const missing = /schema cache|does not exist|relation/i.test(error)
  const copy = async () => {
    try { await navigator.clipboard.writeText(schemaSql); setCopied(true) } catch { /* seleciona o texto abaixo */ }
  }
  return (
    <div className="center-screen">
      <div className="card setup">
        <h2>{missing ? 'Falta um passo no Supabase (uma vez só)' : 'Não consegui abrir os dados na nuvem'}</h2>
        {missing ? (
          <ol>
            <li>Clique em <b>Copiar SQL</b>.</li>
            <li>Abra o <a className="link" href={`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`} target="_blank" rel="noreferrer">SQL Editor do Supabase</a> (projeto <b>{PROJECT_REF}</b>), cole e clique em <b>Run</b>.</li>
            <li>Volte aqui e clique em <b>Tentar de novo</b>.</li>
          </ol>
        ) : <p className="muted">Verifique a internet e tente de novo.</p>}
        <p className="muted small">Detalhe: {error}</p>
        <div className="row wrap">
          {missing && <button className="btn" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar SQL'}</button>}
          <button className="btn primary" onClick={() => location.reload()}>Tentar de novo</button>
        </div>
        {missing && <textarea className="sql" readOnly value={schemaSql} onFocus={(e) => e.target.select()} aria-label="SQL para rodar no Supabase" />}
      </div>
    </div>
  )
}
