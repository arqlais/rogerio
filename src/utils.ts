import { ARTIFACT } from './env'
import type { Data, PersonRole, ProjectKind, ProjectStatus, Tx, UnitStatus } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (v: number) => brl.format(Number.isFinite(v) ? v : 0)
/** Valor curto para gráficos: R$ 12,5 mil */
export const moneyShort = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return money(v)
}
export const pct = (v: number) => `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
export const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Aceita "1.234,56", "1234.56", "R$ 1.234" */
export function parseMoney(s: string): number {
  const t = s.replace(/[^\d,.-]/g, '')
  if (!t) return 0
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

// ---------- datas (sempre "AAAA-MM-DD", sem fuso) ----------
const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => iso(new Date())
export const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const addMonths = (s: string, n: number) => {
  const d = toDate(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return iso(d)
}
export const month = (s: string) => s.slice(0, 7)
export const fmtDate = (s?: string) => (s ? s.split('-').reverse().join('/') : '')
export const fmtDateShort = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '')
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
export const monthShort = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3)}/${ym.slice(2, 4)}`
export const addMonth = (ym: string, n: number) => month(addMonths(`${ym}-01`, n))
export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** Início da semana (segunda por padrão) que contém a data */
export const weekStart = (s: string, first = 1) => {
  const d = toDate(s)
  const diff = (d.getDay() - first + 7) % 7
  return addDays(s, -diff)
}
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5)

// ---------- rótulos ----------
export const KIND_LABEL: Record<ProjectKind, string> = {
  reforma_escola: 'Reforma de escola',
  reforma: 'Reforma',
  construcao: 'Construção',
  incorporacao: 'Incorporação (obra própria)',
  outro: 'Outro serviço',
}
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  orcamento: 'Em orçamento',
  andamento: 'Em andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
}
export const ROLE_LABEL: Record<PersonRole, string> = {
  fixo: 'Funcionário fixo',
  diarista: 'Diarista',
  empreiteiro: 'Empreiteiro',
  fornecedor: 'Fornecedor',
  cliente: 'Cliente / comprador',
  outro: 'Outro',
}
export const UNIT_LABEL: Record<UnitStatus, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  permuta: 'Permuta',
}
export const METHODS = ['Pix', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Cheque']

// ---------- contas ----------
export const isOpen = (t: Tx) => !t.paid
export const isLate = (t: Tx, ref = today()) => !t.paid && t.due < ref

/** Lançamento pertence à carteira em foco? (transferências contam para os dois lados) */
export const inScope = (t: Tx, scope: string) => scope === 'all' || t.entityId === scope || t.toEntityId === scope

/** Efeito do lançamento no caixa da carteira (positivo = entrou) */
export function signed(t: Tx, scope: string): number {
  if (t.kind === 'in') return t.amount
  if (t.kind === 'out') return -t.amount
  if (scope === 'all') return 0
  if (t.entityId === scope && t.toEntityId === scope) return 0
  return t.toEntityId === scope ? t.amount : -t.amount
}

export function accountBalance(d: Data, accountId: string, until = '9999-12-31'): number {
  const a = d.accounts.find((x) => x.id === accountId)
  if (!a) return 0
  let v = a.initial
  for (const t of d.txs) {
    if (!t.paid || t.paid > until || t.paid < a.initialDate) continue
    if (t.accountId === accountId) v += t.kind === 'in' ? t.amount : -t.amount
    if (t.kind === 'transfer' && t.toAccountId === accountId) v += t.amount
  }
  return v
}

/** Resumo do mês de uma carteira: entradas/saídas realizadas e previstas (sem transferências). */
export function monthSummary(d: Data, ym: string, scope: string) {
  let inPaid = 0, outPaid = 0, inAll = 0, outAll = 0, transfersIn = 0, transfersOut = 0
  for (const t of d.txs) {
    if (!inScope(t, scope)) continue
    const ref = t.paid ?? t.due
    if (month(ref) !== ym) continue
    if (t.kind === 'transfer') {
      if (scope === 'all' || !t.paid) continue
      const s = signed(t, scope)
      if (s > 0) transfersIn += s
      else transfersOut -= s
      continue
    }
    if (t.kind === 'in') { inAll += t.amount; if (t.paid) inPaid += t.amount }
    else { outAll += t.amount; if (t.paid) outPaid += t.amount }
  }
  return { inPaid, outPaid, inAll, outAll, transfersIn, transfersOut, result: inPaid - outPaid, forecast: inAll - outAll }
}

/** Custos e receitas de uma obra */
export function projectStats(d: Data, projectId: string) {
  const p = d.projects.find((x) => x.id === projectId)
  const txs = d.txs.filter((t) => t.projectId === projectId && t.kind !== 'transfer')
  const cost = txs.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0)
  const costPaid = txs.filter((t) => t.kind === 'out' && t.paid).reduce((s, t) => s + t.amount, 0)
  const received = txs.filter((t) => t.kind === 'in' && t.paid).reduce((s, t) => s + t.amount, 0)
  const toReceive = txs.filter((t) => t.kind === 'in' && !t.paid).reduce((s, t) => s + t.amount, 0)
  const retention = txs.filter((t) => t.kind === 'in').reduce((s, t) => s + (t.retention ?? 0), 0)
  // diárias apontadas e ainda não pagas também são custo da obra
  const pendingDaily = d.attendance.filter((a) => a.projectId === projectId && !a.txId).reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0)
  // saldo das empreitadas ainda por pagar
  const contracts = d.contracts.filter((c) => c.projectId === projectId && c.status !== 'cancelada')
  const contractPaid = (id: string) => d.txs.filter((t) => t.contractId === id && t.kind === 'out').reduce((s, t) => s + t.amount, 0)
  const contractsOpen = contracts.reduce((s, c) => s + Math.max(0, c.total - contractPaid(c.id)), 0)
  const byCat: Record<string, number> = {}
  for (const t of txs) if (t.kind === 'out') byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
  if (pendingDaily) byCat['Mão de obra – diárias'] = (byCat['Mão de obra – diárias'] ?? 0) + pendingDaily
  const units = d.units.filter((u) => u.projectId === projectId)
  const vgv = units.reduce((s, u) => s + (u.status === 'vendido' || u.status === 'permuta' ? u.salePrice ?? u.price : u.price), 0)
  const sold = units.filter((u) => u.status === 'vendido').reduce((s, u) => s + (u.salePrice ?? u.price), 0)
  const revenue = p?.kind === 'incorporacao' ? vgv : (p?.contractValue ?? 0)
  const totalCost = cost + pendingDaily
  const projected = totalCost + contractsOpen
  return {
    cost: totalCost, costPaid, pendingDaily, contractsOpen, projected,
    received, toReceive, retention, byCat, vgv, sold, revenue,
    budgetUse: p?.budget ? (totalCost / p.budget) * 100 : 0,
    margin: revenue ? ((revenue - Math.max(projected, p?.budget ?? 0)) / revenue) * 100 : 0,
  }
}

export function contractPaid(d: Data, contractId: string) {
  return d.txs.filter((t) => t.contractId === contractId && t.kind === 'out').reduce((s, t) => s + t.amount, 0)
}

export const personName = (d: Data, id?: string) => d.people.find((p) => p.id === id)?.name ?? ''
export const entityName = (d: Data, id?: string) => d.entities.find((p) => p.id === id)?.name ?? ''
export const projectName = (d: Data, id?: string) => d.projects.find((p) => p.id === id)?.name ?? ''
export const accountName = (d: Data, id?: string) => d.accounts.find((p) => p.id === id)?.name ?? ''

export function downloadFile(name: string, content: string, type = 'text/plain') {
  if (ARTIFACT) return notice('Na prévia não dá para baixar arquivos. No site publicado, este botão baixa o arquivo.')
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toCSV(rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v ?? ''
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
}

/** Valor por extenso (para recibos) */
export function extenso(v: number): string {
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const ct = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
  const tri = (n: number): string => {
    if (n === 100) return 'cem'
    const c = Math.floor(n / 100), r = n % 100
    const parts: string[] = []
    if (c) parts.push(ct[c])
    if (r < 20) { if (r) parts.push(u[r]) }
    else { parts.push(dz[Math.floor(r / 10)] + (r % 10 ? ' e ' + u[r % 10] : '')) }
    return parts.join(' e ')
  }
  const inteiro = Math.floor(v)
  const cent = Math.round((v - inteiro) * 100)
  const mi = Math.floor(inteiro / 1e6), mil = Math.floor((inteiro % 1e6) / 1000), r = inteiro % 1000
  const out: string[] = []
  if (mi) out.push(mi === 1 ? 'um milhão' : `${tri(mi)} milhões`)
  if (mil) out.push(mil === 1 ? 'mil' : `${tri(mil)} mil`)
  if (r) out.push(tri(r))
  let s = out.join(out.length > 1 && r && (r < 100 || r % 100 === 0) ? ' e ' : ' ')
  if (inteiro) s += inteiro === 1 ? ' real' : mi && !mil && !r ? ' de reais' : ' reais'
  if (cent) s += (inteiro ? ' e ' : '') + tri(cent) + (cent === 1 ? ' centavo' : ' centavos')
  return s || 'zero reais'
}

/** Aviso rápido sem depender dos componentes (usado pela prévia). */
function notice(msg: string) {
  window.dispatchEvent(new CustomEvent('app-notice', { detail: msg }))
}
