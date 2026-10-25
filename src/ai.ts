import type { Data, QuoteItem, Tx } from './types'
import { accountBalance, addDays, month, monthSummary, ownedBy, today, uid } from './utils'
import { serviceCost } from './pricing'

/* Assistente (Google Gemini). A chave fica nos Ajustes (dados do Rogério) e também neste aparelho.
   O site manda para o Gemini um resumo dos dados (obras, contas, equipe, agenda, preços) junto com a pergunta;
   o Gemini responde em texto e, quando for o caso, propõe ações que o Rogério confirma com um toque. */

export const DEFAULT_MODEL = 'gemini-flash-latest'
const LS = 'rogerio-gemini'

export function aiConfig(d: Data) {
  let local: { key?: string; model?: string } = {}
  try { local = JSON.parse(localStorage.getItem(LS) || '{}') } catch { /* sem armazenamento */ }
  return { key: d.settings.ai?.key || local.key || '', model: d.settings.ai?.model || local.model || DEFAULT_MODEL }
}
export function rememberAi(key: string, model: string) {
  try { localStorage.setItem(LS, JSON.stringify({ key, model })) } catch { /* sem armazenamento */ }
}

export type AiAction = {
  type: 'lancar' | 'compromisso' | 'orcamento' | 'pagar'
  kind?: 'in' | 'out'
  amount?: number
  description?: string
  date?: string
  paid?: boolean
  scope?: 'empresa' | 'pessoal'
  category?: string
  projectId?: string
  personId?: string
  title?: string
  time?: string
  place?: string
  model?: 'pdde' | 'padrao'
  company?: string
  clientId?: string
  clientName?: string
  items?: { description: string; unit?: string; qty?: number; price?: number }[]
  txId?: string
}
export type AiReply = { reply: string; actions: AiAction[] }
export type ChatMsg = { role: 'user' | 'model'; text: string; image?: { mime: string; data: string } }

const brl = (v: number) => Math.round(v * 100) / 100
const scopeOf = (d: Data, entityId?: string) => (d.entities.find((e) => e.id === entityId)?.kind === 'pessoal' ? 'pessoal' : 'empresa')

/** Resumo dos dados para o Gemini entender o contexto (compacto, sem anexos nem imagens). */
export function buildContext(d: Data): string {
  const t = today()
  const ym = month(t)
  const pessoal = d.entities.find((e) => e.kind === 'pessoal')
  const bal = (sc: string) => brl(d.accounts.filter((a) => !a.archived && ownedBy(a.entityId, sc)).reduce((s, a) => s + accountBalance(d, a.id), 0))
  const me = monthSummary(d, ym, 'empresa')
  const mp = pessoal ? monthSummary(d, ym, pessoal.id) : null
  const ctx = {
    hoje: t,
    dono: d.settings.profile?.fullName || d.settings.owner,
    empresas: d.entities.filter((e) => e.kind === 'empresa').map((e) => ({ nome: e.name, cnpj: e.doc, razao: e.legalName, principal: e.id === d.settings.mainCompany || undefined })),
    saldo: { empresa: bal('empresa'), pessoal: pessoal ? bal(pessoal.id) : 0 },
    mes_atual: { empresa: { entradas: brl(me.inAll), saidas: brl(me.outAll), resultado_previsto: brl(me.forecast) }, pessoal: mp ? { entradas: brl(mp.inAll), saidas: brl(mp.outAll) } : null },
    obras: d.projects.map((p) => ({ id: p.id, nome: p.name, situacao: p.status, cliente: p.client, contrato: p.contractValue, previsto: p.budget, gasto: brl(d.txs.filter((x) => x.projectId === p.id && x.kind === 'out').reduce((s, x) => s + x.amount, 0)) })),
    equipe: d.people.filter((p) => p.active).map((p) => ({ id: p.id, nome: p.name, tipo: p.role, funcao: p.job, diaria: p.dailyRate, salario: p.salary })),
    clientes: d.clients.filter((c) => !c.archived).map((c) => ({ id: c.id, nome: c.name, apm: c.apm, cnpj: c.doc })),
    categorias: d.categories.map((c) => `${c.name} (${c.kind === 'in' ? 'entrada' : 'saída'}, ${c.scope})`),
    contas_em_aberto: d.txs.filter((x) => !x.paid && x.kind !== 'transfer' && x.due <= addDays(t, 60)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 60).map((x) => ({ id: x.id, vence: x.due, tipo: x.kind === 'in' ? 'receber' : 'pagar', valor: x.amount, descricao: x.description, categoria: x.category, de: scopeOf(d, x.entityId) })),
    ultimos_lancamentos: d.txs.filter((x) => x.paid && x.kind !== 'transfer').sort((a, b) => (b.paid ?? '').localeCompare(a.paid ?? '')).slice(0, 80).map((x) => ({ data: x.paid, tipo: x.kind === 'in' ? 'entrou' : 'saiu', valor: x.amount, descricao: x.description, categoria: x.category, de: scopeOf(d, x.entityId), obra: d.projects.find((p) => p.id === x.projectId)?.name })),
    agenda: d.events.filter((e) => !e.done && e.date >= addDays(t, -1) && e.date <= addDays(t, 30)).map((e) => ({ data: e.date, hora: e.time, titulo: e.title, local: e.place })),
    orcamentos: d.quotes.slice(-15).map((q) => ({ numero: q.number, cliente: q.apmName || q.client, objeto: q.title, situacao: q.status, data: q.date })),
    tabela_de_precos: d.pricing ? d.pricing.services.map((s) => ({ codigo: s.code, servico: s.name, unidade: s.unit, preco_com_bdi: brl(serviceCost(d.pricing!, s).price) })) : [],
  }
  return JSON.stringify(ctx)
}

const SYSTEM = (ctx: string) => `Você é o assistente da plataforma de gestão do engenheiro civil Rogério Vieira (obras, reformas de escolas pelo PDDE, um prédio de 9 apartamentos, equipe de diaristas e fixos, e as finanças da empresa e pessoais).
Ele não é de tecnologia e anota tudo de forma bagunçada. Seu papel é ajudar a organizar sem dar trabalho.

Regras:
- Responda em português do Brasil, curto, claro e direto, com frases simples. Use valores em reais (R$ 1.234,56) e datas dd/mm.
- Não use emoji. Pode usar listas curtas com hífen.
- Use os DADOS abaixo para responder. Se não souber, diga que não encontrou e sugira onde lançar.
- Quando ele contar algo que aconteceu ("paguei", "gastei", "recebi", "comprei", "vou pagar"), proponha a ação "lancar". Se for de obra, preencha projectId com o id da obra. Se for pagamento a alguém da equipe, personId. Diga em scope se é empresa ou pessoal (gastos de casa, mercado, saúde, escola, carro = pessoal; material, diária, imposto da empresa, obra = empresa). paid=true se já aconteceu, false se ainda vai pagar/receber. date no formato AAAA-MM-DD (hoje é ${today()}).
- Quando ele pedir para marcar compromisso/visita/reunião, proponha "compromisso".
- Quando ele disser que pagou uma conta que já está em contas_em_aberto, proponha "pagar" com o txId.
- Quando ele pedir um orçamento, proponha "orcamento" com itens (descrição técnica clara, unidade, quantidade e preço unitário). Use a tabela_de_precos quando o serviço existir; senão estime preços de mercado de Santo André/SP e avise que são estimativas para ele conferir. model "pdde" para escola (APM), senão "padrao". clientId se o cliente estiver cadastrado.
- Se aparecer foto de nota fiscal, recibo ou comprovante: leia valor, data, fornecedor e o que foi comprado, e proponha o lançamento.
- Nunca invente ações que ele não pediu. Se faltar informação essencial (valor, por exemplo), pergunte.

DADOS (JSON): ${ctx}`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['lancar', 'compromisso', 'orcamento', 'pagar'] },
          kind: { type: 'STRING', enum: ['in', 'out'] },
          amount: { type: 'NUMBER' },
          description: { type: 'STRING' },
          date: { type: 'STRING' },
          paid: { type: 'BOOLEAN' },
          scope: { type: 'STRING', enum: ['empresa', 'pessoal'] },
          category: { type: 'STRING' },
          projectId: { type: 'STRING' },
          personId: { type: 'STRING' },
          title: { type: 'STRING' },
          time: { type: 'STRING' },
          place: { type: 'STRING' },
          model: { type: 'STRING', enum: ['pdde', 'padrao'] },
          company: { type: 'STRING' },
          clientId: { type: 'STRING' },
          clientName: { type: 'STRING' },
          txId: { type: 'STRING' },
          items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { description: { type: 'STRING' }, unit: { type: 'STRING' }, qty: { type: 'NUMBER' }, price: { type: 'NUMBER' } }, required: ['description'] } },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
}

async function call(d: Data, body: unknown) {
  const { key, model } = aiConfig(d)
  if (!key) throw new Error('sem-chave')
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = (j as { error?: { message?: string } }).error?.message ?? `erro ${r.status}`
    if (r.status === 400 && /api key/i.test(msg)) throw new Error('A chave do Gemini não é válida. Confira em Ajustes → Assistente.')
    if (r.status === 404) throw new Error(`O modelo "${model}" não foi encontrado. Troque o modelo em Ajustes → Assistente.`)
    if (r.status === 429) throw new Error('O limite gratuito do Gemini foi atingido por agora. Tente de novo em alguns minutos.')
    throw new Error(msg)
  }
  const text = (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return text
}

/** Conversa com contexto; devolve a resposta e as ações propostas. */
export async function ask(d: Data, history: ChatMsg[]): Promise<AiReply> {
  const contents = history.slice(-16).map((m) => ({
    role: m.role,
    parts: [...(m.image ? [{ inlineData: { mimeType: m.image.mime, data: m.image.data } }] : []), { text: m.text || 'Veja a imagem.' }],
  }))
  const text = await call(d, {
    systemInstruction: { parts: [{ text: SYSTEM(buildContext(d)) }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.3 },
  })
  try {
    const parsed = JSON.parse(text) as AiReply
    return { reply: parsed.reply ?? '', actions: Array.isArray(parsed.actions) ? parsed.actions : [] }
  } catch {
    return { reply: text, actions: [] }
  }
}

/** Monta os itens de um orçamento a partir de uma descrição solta do serviço. */
export async function suggestItems(d: Data, description: string, model: 'pdde' | 'padrao'): Promise<{ items: QuoteItem[]; note: string }> {
  const r = await ask(d, [{ role: 'user', text: `Monte os itens de um orçamento ${model === 'pdde' ? 'para escola (PDDE)' : 'comum'} para: ${description}. Responda com UMA ação "orcamento" contendo os itens e, no reply, uma frase curta dizendo o que conferir.` }])
  const act = r.actions.find((a) => a.type === 'orcamento')
  const items = (act?.items ?? []).map((i) => ({ id: uid(), description: i.description, unit: i.unit ?? 'un', qty: i.qty ?? 1, price: brl(i.price ?? 0) }))
  return { items, note: r.reply }
}

export const actionTx = (a: AiAction): Partial<Tx> => ({ kind: a.kind ?? 'out', amount: a.amount ?? 0, description: a.description ?? '', due: a.date || today(), paid: a.paid === false ? undefined : a.date || today(), projectId: a.projectId || undefined, personId: a.personId || undefined })
