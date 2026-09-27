import type { PriceInput, PriceService, Pricing } from './types'
import { uid } from './utils'

/** BDI pela fórmula do TCU (Acórdão 2622/2013): [(1+AC+S+G+R)×(1+DF)×(1+L) / (1−I)] − 1 */
export function bdiOf(p: Pricing) {
  const b = p.bdi
  const tax = b.pis + b.cofins + b.iss + b.other
  if (tax >= 1) return 0
  return ((1 + b.ac + b.sg + b.r) * (1 + b.df) * (1 + b.l)) / (1 - tax) - 1
}

/** Custo de uma unidade do insumo: material = preço; mão de obra = hora com encargos. */
export function inputCost(p: Pricing, i?: PriceInput) {
  if (!i) return 0
  return i.labor ? (i.price / (p.hours || 8)) * (1 + p.charges) : i.price
}

export function serviceCost(p: Pricing, s: PriceService) {
  let material = 0
  let labor = 0
  for (const it of s.items) {
    const i = p.inputs.find((x) => x.id === it.inputId)
    const c = inputCost(p, i) * it.coef
    if (i?.labor) labor += c
    else material += c
  }
  const cost = material + labor
  return { material, labor, cost, price: cost * (1 + bdiOf(p)) }
}

export const M2_KIND = { construcao: ['Construção', 1], leve: ['Reforma leve', 0.35], media: ['Reforma média', 0.6], pesada: ['Reforma pesada', 0.85] } as const

export function defaultPricing(): Pricing {
  const inputs: PriceInput[] = []
  const add = (name: string, unit: string, price: number, labor = false) => { const i = { id: uid(), name, unit, price, labor }; inputs.push(i); return i.id }
  const L: Record<string, string> = {}
  for (const [n, v] of [['Pedreiro', 180], ['Servente', 120], ['Eletricista', 220], ['Encanador', 200], ['Pintor', 180], ['Carpinteiro', 200], ['Azulejista', 200], ['Vidraceiro', 200], ['Mestre de obras', 250]] as const) L[n] = add(n, 'h', v, true)
  const M: Record<string, string> = {}
  for (const [n, u, v] of [
    ['Cimento CP-II 50 kg', 'saco', 38], ['Areia média', 'm³', 150], ['Brita 1', 'm³', 160], ['Cal hidratada 20 kg', 'saco', 18], ['Bloco cerâmico 14x19x39', 'un', 2.6],
    ['Argamassa colante AC-II 20 kg', 'saco', 28], ['Rejunte 1 kg', 'kg', 9], ['Piso cerâmico', 'm²', 45], ['Tinta acrílica 18 L', 'lata', 380], ['Massa corrida 25 kg', 'lata', 95],
    ['Lixa', 'un', 2], ['Selador acrílico 18 L', 'lata', 160], ['Fio 2,5 mm²', 'm', 3.2], ['Eletroduto corrugado 3/4"', 'm', 2.5], ['Caixa 4x2', 'un', 3], ['Tomada 2P+T', 'un', 18],
    ['Disjuntor 20 A', 'un', 25], ['Telha fibrocimento 2,44 x 1,10 m', 'un', 75], ['Parafuso p/ telha c/ vedação', 'un', 1.5], ['Assento sanitário', 'un', 60], ['Vidro liso 4 mm', 'm²', 120], ['Massa de vidraceiro', 'kg', 12],
  ] as const) M[n] = add(n, u, v)
  const id = (n: string) => M[n] ?? L[n]
  const svc = (code: string, name: string, unit: string, items: [string, number][]): PriceService => ({ id: uid(), code, name, unit, items: items.map(([n, coef]) => ({ inputId: id(n), coef })) })
  const services = [
    svc('S01', 'Alvenaria de bloco cerâmico 14 cm', 'm²', [['Bloco cerâmico 14x19x39', 13.5], ['Cimento CP-II 50 kg', 0.07], ['Areia média', 0.012], ['Cal hidratada 20 kg', 0.1], ['Pedreiro', 0.9], ['Servente', 0.9]]),
    svc('S02', 'Chapisco em parede', 'm²', [['Cimento CP-II 50 kg', 0.04], ['Areia média', 0.005], ['Pedreiro', 0.1], ['Servente', 0.1]]),
    svc('S03', 'Reboco / emboço 2 cm', 'm²', [['Cimento CP-II 50 kg', 0.12], ['Cal hidratada 20 kg', 0.15], ['Areia média', 0.025], ['Pedreiro', 0.6], ['Servente', 0.6]]),
    svc('S04', 'Contrapiso 5 cm', 'm²', [['Cimento CP-II 50 kg', 0.3], ['Areia média', 0.05], ['Pedreiro', 0.4], ['Servente', 0.5]]),
    svc('S05', 'Piso cerâmico assentado com rejunte', 'm²', [['Piso cerâmico', 1.1], ['Argamassa colante AC-II 20 kg', 0.25], ['Rejunte 1 kg', 0.3], ['Azulejista', 0.6], ['Servente', 0.3]]),
    svc('S06', 'Pintura acrílica 2 demãos com massa', 'm²', [['Tinta acrílica 18 L', 0.012], ['Massa corrida 25 kg', 0.05], ['Selador acrílico 18 L', 0.006], ['Lixa', 0.2], ['Pintor', 0.35], ['Servente', 0.1]]),
    svc('S07', 'Ponto de tomada (instalação completa)', 'un', [['Fio 2,5 mm²', 8], ['Eletroduto corrugado 3/4"', 3], ['Caixa 4x2', 1], ['Tomada 2P+T', 1], ['Eletricista', 1.2], ['Servente', 0.6]]),
    svc('S08', 'Troca de telha de fibrocimento', 'm²', [['Telha fibrocimento 2,44 x 1,10 m', 0.42], ['Parafuso p/ telha c/ vedação', 3], ['Carpinteiro', 0.3], ['Servente', 0.3]]),
    svc('S09', 'Instalação de assento sanitário', 'un', [['Assento sanitário', 1], ['Encanador', 0.8]]),
    svc('S10', 'Troca de vidro liso 4 mm', 'm²', [['Vidro liso 4 mm', 1.05], ['Massa de vidraceiro', 0.3], ['Vidraceiro', 0.8]]),
  ]
  const byCode = (c: string) => services.find((s) => s.code === c)!.id
  return {
    hours: 8,
    charges: 0.2,
    bdi: { ac: 0.04, sg: 0.008, r: 0.0127, df: 0.0123, l: 0.074, pis: 0.0065, cofins: 0.03, iss: 0.02, other: 0 },
    inputs,
    services,
    calc: {
      title: '',
      lines: [['S02', 120], ['S03', 120], ['S06', 350], ['S07', 6], ['S08', 40]].map(([c, q]) => ({ id: uid(), serviceId: byCode(c as string), qty: q as number })),
      extras: [['Mobilização / desmobilização', 800], ['Caçamba de entulho', 1400], ['ART / taxas', 300], ['Limpeza final', 500]].map(([n, v]) => ({ id: uid(), name: n as string, value: v as number })),
    },
    m2: { kind: 'construcao', area: 180, cost: 2200, adjust: 0 },
  }
}
