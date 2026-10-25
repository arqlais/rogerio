import type { Data, Tx } from './types'

/* Separação automática: o Rogério só descreve o que foi ("cimento", "mercado", "luz de casa")
   e o sistema decide a categoria e se é da EMPRESA ou PESSOAL.
   Ordem: o que ele já corrigiu antes (aprendido) → obra/pessoa da equipe → palavras-chave.
   Quando não dá para saber, pergunta uma vez (Empresa ou Pessoal?) e aprende. */

export type Scope = 'empresa' | 'pessoal'
export interface Guess { category?: string; scope?: Scope; sure: boolean; why: string }

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Chave do aprendizado: as primeiras palavras da descrição, sem números (ex.: "conta de luz 03/25" → "conta de luz"). */
export const learnKey = (description: string) => norm(description).split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ')

// [palavras, categoria] — a categoria diz se é empresa, pessoal ou ambos
const OUT: [string[], string][] = [
  [['cimento', 'areia', 'brita', 'pedra', 'tijolo', 'bloco', 'ferro', 'vergalhao', 'aco ca', 'tinta', 'massa corrida', 'argamassa', 'rejunte', 'piso', 'azulejo', 'porcelanato', 'telha', 'madeira', 'compensado', 'cal ', 'gesso', 'drywall', 'cano', 'tubo', 'conexao', 'fio ', 'cabo ', 'disjuntor', 'tomada', 'material', 'deposito', 'leroy', 'telhanorte', 'c c', 'sodimac', 'loja de material', 'vidro', 'esquadria', 'porta', 'janela', 'impermeabilizante', 'concreto', 'usinado', 'graute', 'prego', 'parafuso', 'lixa', 'selador', 'manta'], 'Material de construção'],
  [['diaria', 'diarias', 'pedreiro', 'servente', 'ajudante', 'pintor', 'eletricista', 'encanador', 'carpinteiro', 'azulejista', 'mestre de obra'], 'Mão de obra – diárias'],
  [['salario', 'holerite', 'folha de pagamento', 'decimo terceiro', 'ferias do', 'rescisao'], 'Salários'],
  [['empreitada', 'empreiteiro', 'medicao do empreiteiro'], 'Empreitada'],
  [['vale', 'adiantamento'], 'Adiantamento / vale'],
  [['inss', 'fgts', 'esocial', 'gps '], 'Encargos (INSS/FGTS)'],
  [['andaime', 'betoneira', 'cacamba', 'locacao de', 'aluguel de maquina', 'aluguel de equipamento', 'escora', 'martelete', 'compactador', 'retroescavadeira', 'munck', 'guindaste'], 'Aluguel de equipamentos'],
  [['ferramenta', 'epi', 'capacete', 'bota', 'luva', 'oculos de protecao', 'furadeira', 'serra', 'esmerilhadeira', 'parafusadeira'], 'Ferramentas e EPI'],
  [['frete', 'carreto', 'pedagio', 'estacionamento obra', 'combustivel obra', 'diesel', 'caminhao'], 'Combustível e transporte'],
  [['marmita', 'marmitex', 'almoco da equipe', 'cafe da equipe', 'lanche da equipe', 'refeicao da equipe'], 'Alimentação da equipe'],
  [['projeto', 'arquiteto', 'topografia', 'sondagem', 'laudo', 'calculista', 'terceirizado'], 'Projetos e terceiros'],
  [['art ', 'crea', 'alvara', 'cartorio', 'prefeitura taxa', 'habite se', 'taxa de'], 'Taxas, alvarás e cartório'],
  [['das ', 'simples nacional', 'iss ', 'issqn', 'pis ', 'cofins', 'irpj', 'csll', 'darf', 'imposto da empresa', 'nota fiscal imposto'], 'Impostos da empresa'],
  [['contador', 'contabilidade', 'honorario contabil'], 'Contador'],
  [['escritorio', 'material de escritorio', 'impressora', 'papel sulfite', 'sistema', 'software', 'site'], 'Escritório e despesas fixas'],
  [['tarifa', 'taxa bancaria', 'ted ', 'doc ', 'anuidade conta pj', 'pacote de servicos'], 'Tarifas bancárias'],
  [['pro labore', 'prolabore'], 'Pró-labore'],
  // pessoal
  [['mercado', 'supermercado', 'padaria', 'acougue', 'hortifruti', 'feira', 'atacadao', 'assai', 'carrefour', 'extra ', 'pao de acucar', 'sacolao'], 'Mercado'],
  [['farmacia', 'drogaria', 'drogasil', 'raia', 'medico', 'consulta', 'exame', 'dentista', 'unimed', 'amil', 'bradesco saude', 'sulamerica', 'plano de saude', 'hospital', 'remedio', 'academia'], 'Saúde e plano'],
  [['escola dos', 'escola do', 'escola da', 'faculdade', 'mensalidade', 'curso', 'material escolar', 'livro'], 'Educação'],
  [['ipva', 'licenciamento', 'seguro do carro', 'oficina', 'mecanico', 'revisao do carro', 'pneu', 'lava rapido', 'multa'], 'Carro'],
  [['restaurante', 'ifood', 'pizza', 'lanchonete', 'cinema', 'viagem', 'hotel', 'passagem', 'netflix', 'spotify', 'streaming', 'presente', 'bar '], 'Lazer e viagens'],
  [['fatura', 'cartao de credito', 'nubank pessoal', 'cartao pessoal'], 'Cartão de crédito'],
  [['iptu', 'imposto de renda', 'irpf'], 'Impostos pessoais (IR, IPTU, IPVA)'],
  [['condominio', 'luz de casa', 'agua de casa', 'conta de casa', 'aluguel de casa', 'aluguel da casa', 'gas de casa', 'diarista de casa', 'faxina', 'internet de casa', 'casa'], 'Casa e contas'],
  [['mesada', 'pensao', 'familia', 'filho', 'filha', 'esposa', 'mae', 'pai'], 'Família'],
  [['investimento', 'aplicacao', 'poupanca', 'tesouro', 'previdencia'], 'Investimentos'],
]
const IN: [string[], string][] = [
  [['medicao', 'medição', 'parcela da obra', 'pagamento da prefeitura', 'pagamento da escola', 'apm', 'pdde'], 'Medição de obra'],
  [['servico', 'contrato', 'orcamento aprovado', 'reforma', 'nota fiscal', 'nf '], 'Contrato / serviço'],
  [['venda', 'apartamento', 'apto', 'unidade', 'sinal', 'entrada do apto', 'financiamento'], 'Venda de unidade'],
  [['aporte'], 'Aporte de sócio'],
  [['pro labore', 'prolabore'], 'Pró-labore recebido'],
  [['lucro', 'distribuicao'], 'Distribuição de lucros'],
  [['aluguel recebido', 'inquilino', 'aluguel do'], 'Aluguéis recebidos'],
  [['rendimento', 'juros', 'dividendo', 'resgate'], 'Rendimentos'],
]
// palavras que sozinhas não dizem se é de casa ou da empresa
const AMBIGUOUS = ['luz', 'energia', 'enel', 'agua', 'sabesp', 'internet', 'telefone', 'celular', 'aluguel', 'gasolina', 'combustivel', 'posto', 'uber', 'seguro', 'almoco', 'cafe']

const scopeOfCategory = (d: Data, name?: string): Scope | undefined => {
  const c = d.categories.find((x) => x.name === name)
  return c?.scope === 'empresa' || c?.scope === 'pessoal' ? c.scope : undefined
}

export function classify(d: Data, t: Pick<Tx, 'kind' | 'description' | 'projectId' | 'personId'>): Guess {
  const desc = ` ${norm(t.description)} `
  const kind = t.kind === 'in' ? 'in' : 'out'
  // 1. ele já disse antes
  const learned = d.settings.learned?.[`${kind}:${learnKey(t.description)}`]
  if (learned && learnKey(t.description)) return { category: learned.category, scope: learned.scope, sure: true, why: 'como da última vez' }
  // 2. palavras-chave
  // vale a palavra mais longa que bater ("material escolar" ganha de "material")
  let category: string | undefined
  let best = 0
  for (const [words, cat] of kind === 'in' ? IN : OUT) {
    if (!d.categories.some((c) => c.name === cat)) continue
    for (const w of words) {
      const k = norm(w)
      if (k.length > best && desc.includes(` ${k}`)) { best = k.length; category = cat }
    }
  }
  // 3. obra ou alguém da equipe = empresa
  const person = d.people.find((p) => p.id === t.personId)
  if (t.projectId || (person && person.role !== 'cliente')) {
    const cat = category && scopeOfCategory(d, category) !== 'pessoal' ? category : kind === 'in' ? 'Medição de obra' : person?.role === 'fixo' ? 'Salários' : person?.role === 'diarista' ? 'Mão de obra – diárias' : person?.role === 'empreiteiro' ? 'Empreitada' : category && scopeOfCategory(d, category) !== 'pessoal' ? category : 'Outras despesas'
    return { category: cat, scope: 'empresa', sure: true, why: t.projectId ? 'é de uma obra' : 'é da equipe' }
  }
  if (category) {
    const sc = scopeOfCategory(d, category)
    if (sc) return { category, scope: sc, sure: true, why: 'pela descrição' }
  }
  if (AMBIGUOUS.some((w) => desc.includes(` ${w}`))) return { category, sure: false, why: 'pode ser de casa ou da empresa' }
  return { category, sure: false, why: desc.trim() ? 'não reconheci a descrição' : '' }
}

/** Empresa principal (onde caem os lançamentos da empresa sem obra) e a carteira pessoal. */
export function homeEntities(d: Data) {
  const companies = d.entities.filter((e) => e.kind === 'empresa')
  const main = companies.find((e) => e.id === d.settings.mainCompany) ?? companies.find((e) => e.favorite) ?? companies[0]
  const personal = d.entities.find((e) => e.kind === 'pessoal')
  return { main, personal }
}

/** Decide a carteira (CNPJ ou pessoal) e a conta do lançamento a partir do escopo. */
export function placeFor(d: Data, scope: Scope, projectId?: string) {
  const { main, personal } = homeEntities(d)
  const proj = d.projects.find((p) => p.id === projectId)
  const ent = scope === 'pessoal' ? personal : (proj && d.entities.find((e) => e.id === proj.entityId)) || main
  const entityId = ent?.id ?? d.entities[0]?.id ?? ''
  const accountId = d.accounts.find((a) => a.entityId === entityId && !a.archived)?.id
  return { entityId, accountId }
}

/** Fallback de categoria quando a descrição não diz nada. */
export const fallbackCategory = (kind: Tx['kind'], scope: Scope) => (kind === 'in' ? (scope === 'pessoal' ? 'Outras receitas' : 'Contrato / serviço') : 'Outras despesas')

/** Guarda a escolha para a próxima vez (aprende com o uso). */
export function learn(learned: Record<string, { category: string; scope: Scope }> | undefined, kind: Tx['kind'], description: string, category: string, scope: Scope) {
  const k = learnKey(description)
  if (!k || kind === 'transfer') return learned
  const next = { ...(learned ?? {}), [`${kind === 'in' ? 'in' : 'out'}:${k}`]: { category, scope } }
  const keys = Object.keys(next)
  if (keys.length > 400) delete next[keys[0]]
  return next
}
