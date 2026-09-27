/* Modelo de dados. Tudo fica num único objeto (Data), salvo no navegador e,
   com a nuvem ligada, numa linha do Supabase por usuário. */

/** Arquivo anexado (NF, contrato, orçamento assinado, foto). O conteúdo fica no Storage/IndexedDB. */
export interface FileRef {
  id: string
  name: string
  type: string
  size: number
  at: string
  path?: string // caminho no Supabase Storage (sem isso, está no aparelho)
}

/** Medidas em pontos (pt) da folha A4 (595 × 842), tiradas dos modelos originais. */
export interface QuoteTheme {
  font: 'calibri' | 'arial'
  heading: string // cor dos títulos "1. ORÇAMENTO DESTINADO A:"
  headingSize: number
  labelFont?: 'calibri' | 'arial'
  labelSize: number
  logo: [number, number, number, number] // x, y, largura, altura
  top: number // onde começa o primeiro título
  footer?: [number, number, number, number]
  wm?: [number, number, number, number]
  wmOpacity?: number
  variant?: 'padrao' | 'quira'
}

/** Carteira: cada empresa (CNPJ) ou a pessoa física (finanças pessoais). */
export interface Entity {
  id: string
  name: string
  kind: 'empresa' | 'pessoal'
  doc?: string // CNPJ ou CPF
  color: string
  favorite?: boolean // aparece em destaque no topo
  legalName?: string // razão social
  municipalReg?: string // inscrição municipal
  stateReg?: string // inscrição estadual
  logo?: string // imagem (data URL) usada nos orçamentos e recibos
  mark?: string // símbolo quadrado do logo (botões e listas)
  quoteTheme?: QuoteTheme // como o papel timbrado dos orçamentos é montado (igual ao modelo da empresa)
  footer?: string // imagem do rodapé do papel timbrado
  watermark?: string // marca-d'água do fundo
  tagline?: string // frase do rodapé (atividades)
  address?: string
  district?: string
  city?: string
  cep?: string
  phone?: string
  email?: string
  contactName?: string // "Pessoa responsável pela empresa" nos orçamentos
  responsible?: string // responsável técnico (nome e CREA)
  bank?: string // banco, agência e conta
  pix?: string
  notes?: string
}

/** Conta bancária, caixa ou cartão de uma carteira. */
export interface Account {
  id: string
  entityId: string
  name: string // ex.: Itaú PJ, Caixa (dinheiro), Nubank
  initial: number // saldo na data de início
  initialDate: string
  archived?: boolean
}

export type ProjectKind = 'reforma_escola' | 'reforma' | 'construcao' | 'incorporacao' | 'outro'
export type ProjectStatus = 'orcamento' | 'andamento' | 'pausada' | 'concluida'

/** Obra / contrato. */
export interface Project {
  id: string
  name: string
  entityId: string // empresa responsável
  kind: ProjectKind
  status: ProjectStatus
  client?: string // prefeitura, secretaria, cliente particular…
  contractNo?: string // nº do contrato / licitação
  address?: string
  contractValue: number // valor do contrato (0 em obra própria)
  budget: number // custo previsto
  start?: string
  end?: string
  notes?: string
  files?: FileRef[] // contrato, ART, projetos, fotos
}

export type UnitStatus = 'disponivel' | 'reservado' | 'vendido' | 'permuta'

/** Unidade de uma incorporação (ex.: apartamento do prédio). */
export interface Unit {
  id: string
  projectId: string
  floor: number
  number: string
  area?: number
  price: number // preço de tabela
  status: UnitStatus
  buyer?: string
  buyerPhone?: string
  saleDate?: string
  salePrice?: number
  notes?: string
}

export type PersonRole = 'fixo' | 'diarista' | 'empreiteiro' | 'fornecedor' | 'cliente' | 'outro'

/** Funcionários, empreiteiros, fornecedores e clientes. */
export interface Person {
  id: string
  name: string
  role: PersonRole
  job?: string // pedreiro, servente, eletricista, mestre…
  phone?: string
  doc?: string
  pix?: string
  entityId?: string // empresa onde está registrado / que contrata
  salary?: number // fixo: salário mensal
  charges?: number // fixo: encargos estimados (% sobre o salário)
  dailyRate?: number // diarista: valor da diária
  fullName?: string // nome completo (o "name" é como ele é chamado na obra)
  rg?: string
  birth?: string
  address?: string
  pixType?: 'cpf' | 'telefone' | 'email' | 'aleatoria' | 'cnpj'
  bank?: string // banco, agência e conta
  admission?: string // data de admissão / início
  emergency?: string // contato de emergência (nome e telefone)
  photo?: string
  active: boolean
  notes?: string
}

/** Lançamento financeiro: entrada, saída ou transferência entre contas/carteiras. */
export interface Tx {
  id: string
  kind: 'in' | 'out' | 'transfer'
  entityId: string
  accountId?: string
  toEntityId?: string // transferência
  toAccountId?: string
  category: string
  description: string
  amount: number // valor efetivo (líquido)
  gross?: number // entrada: valor bruto da nota/medição
  retention?: number // entrada: retenções (ISS, INSS, IR…)
  due: string // vencimento
  paid?: string // data do pagamento/recebimento; vazio = em aberto
  projectId?: string
  unitId?: string
  contractId?: string
  personId?: string
  method?: string
  docNo?: string // NF, boleto, recibo
  group?: string // parcelamento/repetição
  installment?: string // "2/10"
  settledBy?: string // adiantamento já descontado na folha (id do lançamento do salário)
  files?: FileRef[] // nota fiscal, boleto, comprovante
  notes?: string
  createdAt: string
}

/** Apontamento de diária de um diarista numa obra. */
export interface Attendance {
  id: string
  date: string
  personId: string
  projectId: string
  fraction: number // 1 = dia inteiro, 0.5 = meio dia
  rate: number // valor da diária no dia
  extra?: number // hora extra, passagem, café…
  note?: string
  txId?: string // lançamento que pagou
}

/** Empreitada: serviço contratado por preço fechado. */
export interface Contract {
  id: string
  personId: string
  projectId: string
  entityId: string
  service: string
  total: number
  progress: number // % executado (medido pelo engenheiro)
  status: 'andamento' | 'concluida' | 'cancelada'
  start?: string
  notes?: string
}

export interface QuoteItem {
  id: string
  group?: string // etapa (ex.: 1 – Serviços preliminares)
  description: string
  unit: string // m², m³, un, vb…
  qty: number
  price: number // valor unitário
  total?: number // valor total digitado direto (quando não há quantidade/preço unitário)
}

export type QuoteStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado'

/** Orçamento / proposta para cliente. */
export interface Quote {
  id: string
  model?: 'pdde' | 'padrao' // PDDE Paulista (APM de escola) ou orçamento comum
  apmCnpj?: string
  apmName?: string
  subprogram?: string
  exercise?: string
  contactName?: string // pessoa responsável pela empresa
  clientId?: string // cliente/escola cadastrado
  files?: FileRef[] // orçamento assinado e carimbado, fotos
  number: string
  entityId: string
  client: string
  clientDoc?: string
  clientContact?: string
  address?: string // local da obra
  title: string // objeto: "Reforma da cobertura…"
  date: string
  validDays: number
  deadline?: string // prazo de execução
  payment?: string // condições de pagamento
  items: QuoteItem[]
  bdi: number // % de BDI sobre o custo direto
  discount: number // R$
  notes?: string
  status: QuoteStatus
  projectId?: string // obra criada a partir dele
}

export type EventKind = 'compromisso' | 'visita' | 'reuniao' | 'entrega' | 'pessoal' | 'outro'

/** Compromisso da agenda. */
export interface CalEvent {
  id: string
  title: string
  date: string
  time?: string
  kind: EventKind
  projectId?: string
  place?: string
  notes?: string
  done?: boolean
  repeat?: 'semanal' | 'mensal'
}

export type ClientKind = 'escola' | 'prefeitura' | 'empresa' | 'particular'

/** Cliente: escola (APM), prefeitura, empresa ou pessoa. Usado nos orçamentos e nas obras. */
export interface Client {
  id: string
  kind: ClientKind
  name: string // nome da escola / cliente
  apm?: string // nome da APM (escola), como vai no orçamento
  doc?: string // CNPJ da APM / CNPJ / CPF
  contact?: string // diretor(a), responsável
  phone?: string
  email?: string
  address?: string
  city?: string
  notes?: string
  favorite?: boolean
  archived?: boolean
}

export interface Category {
  id: string
  name: string
  kind: 'in' | 'out'
  scope: 'empresa' | 'pessoal' | 'ambos'
}

/** Perfil do dono (aparece em contratos, recibos e na saudação). */
export interface Profile {
  fullName?: string
  cpf?: string
  rg?: string
  profession?: string
  crea?: string
  phone?: string
  email?: string
  address?: string
  photo?: string
}

export interface Settings {
  owner: string
  profile?: Profile
  scope: string // 'all' ou id da carteira em foco
  calendarToken?: string // endereço secreto da agenda do celular
  calendarSync?: { compromissos?: boolean; contas?: boolean; obras?: boolean }
  lastEntity?: string // última empresa usada nos formulários (já vem escolhida)
  payday: number // dia do pagamento dos fixos
  weekStart: number // 1 = segunda (fechamento das diárias)
}

export interface Data {
  version: number
  entities: Entity[]
  accounts: Account[]
  projects: Project[]
  units: Unit[]
  people: Person[]
  txs: Tx[]
  attendance: Attendance[]
  contracts: Contract[]
  quotes: Quote[]
  events: CalEvent[]
  clients: Client[]
  categories: Category[]
  settings: Settings
}

export type Collection = 'entities' | 'accounts' | 'projects' | 'units' | 'people' | 'txs' | 'attendance' | 'contracts' | 'categories' | 'quotes' | 'events' | 'clients'
