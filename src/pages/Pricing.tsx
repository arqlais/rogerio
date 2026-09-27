import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { PriceInput, PriceService, Pricing, QuoteItem } from '../types'
import { bdiOf, inputCost, M2_KIND, serviceCost } from '../pricing'
import { Icon } from '../components/Icon'
import { Empty, Field, Modal, MoneyInput, NumInput, Tabs, confirmDialog, toast } from '../components/ui'
import { money, uid } from '../utils'
import { buildQuote, CompanyPicker } from './Quotes'

type Tab = 'calculo' | 'servicos' | 'insumos' | 'bdi' | 'm2'
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
const r2 = (v: number) => Math.round(v * 100) / 100

function Pct({ value, onChange, ariaLabel }: { value: number; onChange: (v: number) => void; ariaLabel: string }) {
  return <NumInput value={r2(value * 100)} step={0.01} min={0} suffix="%" onChange={(v) => onChange(v / 100)} ariaLabel={ariaLabel} />
}

function usePricing() {
  const { data, update } = useStore()
  const p = data.pricing!
  const setP = (fn: (p: Pricing) => Pricing) => update((d) => ({ ...d, pricing: fn(d.pricing!) }))
  return { p, setP }
}

export function PricingPage({ tab = 'calculo' }: { tab?: string }) {
  const { p } = usePricing()
  const t = (['calculo', 'servicos', 'insumos', 'bdi', 'm2'].includes(tab) ? tab : 'calculo') as Tab
  const bdi = bdiOf(p)
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">BDI atual {pct(bdi)} · {p.services.length} serviços · {p.inputs.length} insumos</span>
          <h1>Tabela de preços</h1>
        </div>
      </div>
      <Tabs value={t} onChange={(v) => go(`/precos/${v}`)} items={[['calculo', 'Calcular obra'], ['servicos', 'Serviços', p.services.length], ['insumos', 'Materiais e diárias'], ['bdi', 'BDI e encargos'], ['m2', 'Estimativa por m²']]} />
      {t === 'calculo' && <Calc />}
      {t === 'servicos' && <Services />}
      {t === 'insumos' && <Inputs />}
      {t === 'bdi' && <Bdi />}
      {t === 'm2' && <M2 />}
      <p className="muted small pr-note">Os preços e quantidades que vêm preenchidos são exemplos para começar. Confira com os seus fornecedores e com o SINAPI / CUB do mês antes de usar num orçamento real.</p>
    </div>
  )
}

/* ---------------- calcular obra ---------------- */
function Calc() {
  const { data, save, setSettings } = useStore()
  const { p, setP } = usePricing()
  const [picking, setPicking] = useState<'pdde' | 'padrao' | null>(null)
  const [adding, setAdding] = useState(false)
  const bdi = bdiOf(p)
  const c = p.calc
  const setC = (x: Partial<Pricing['calc']>) => setP((o) => ({ ...o, calc: { ...o.calc, ...x } }))
  const lines = c.lines.map((l) => {
    const s = p.services.find((x) => x.id === l.serviceId)
    const k = s ? serviceCost(p, s) : { cost: 0, price: 0 }
    return { l, s, unitCost: k.cost, unitPrice: k.price }
  })
  const cost = lines.reduce((t, x) => t + x.unitCost * x.l.qty, 0) + c.extras.reduce((t, e) => t + e.value, 0)
  const price = cost * (1 + bdi)
  const b = p.bdi
  const profit = cost * (1 + b.ac + b.sg + b.r) * (1 + b.df) * b.l

  const generate = (model: 'pdde' | 'padrao', entId: string) => {
    setPicking(null)
    const group = model === 'padrao' ? '1. Serviços' : undefined
    const items: QuoteItem[] = [
      ...lines.filter((x) => x.s && x.l.qty).map((x) => ({ id: uid(), group, description: x.s!.name, unit: x.s!.unit, qty: x.l.qty, price: r2(x.unitPrice) })),
      ...c.extras.filter((e) => e.value).map((e) => ({ id: uid(), group: model === 'padrao' ? '2. Custos da obra' : undefined, description: e.name, unit: 'vb', qty: 1, price: r2(e.value * (1 + bdi)) })),
    ]
    if (!items.length) return toast('Coloque pelo menos um serviço com quantidade', 'err')
    const q = buildQuote(data, model, entId, items, c.title)
    save('quotes', q)
    setSettings({ lastEntity: q.entityId })
    toast('Orçamento criado com os preços calculados')
    go(`/orcamentos/${q.id}`)
  }
  const clear = async () => { if (await confirmDialog('Limpar este cálculo? A tabela de preços continua igual.', 'Limpar', false)) setC({ title: '', lines: [] }) }

  return (
    <div className="pr-calc">
      <div className="pr-calc-main">
        <section className="card">
          <Field label="Obra / cliente (vai como objeto do orçamento)"><input value={c.title} onChange={(e) => setC({ title: e.target.value })} placeholder="Ex.: Reforma dos banheiros – E.E. Calvitti" aria-label="Obra ou cliente" /></Field>
        </section>
        <section className="card flush">
          <div className="card-head pad"><h2>Serviços</h2><small className="muted">escolha o serviço e digite a quantidade</small></div>
          {!lines.length ? <Empty title="Nenhum serviço no cálculo" text="Adicione os serviços da obra; o preço de cada um vem da tabela." /> : (
            <div className="pr-table calc">
              <div className="pr-row head"><span>serviço</span><span>quantidade</span><span className="r">preço unit.</span><span className="r">total</span><span /></div>
              {lines.map(({ l, s, unitPrice }) => (
                <div key={l.id} className="pr-row">
                  <select value={l.serviceId} onChange={(e) => setC({ lines: c.lines.map((x) => (x.id === l.id ? { ...x, serviceId: e.target.value } : x)) })} aria-label="Serviço">
                    {!s && <option value="">(serviço apagado)</option>}
                    {p.services.map((sv) => <option key={sv.id} value={sv.id}>{sv.code} · {sv.name}</option>)}
                  </select>
                  <NumInput value={l.qty} step={0.01} min={0} suffix={s?.unit} onChange={(v) => setC({ lines: c.lines.map((x) => (x.id === l.id ? { ...x, qty: v } : x)) })} ariaLabel="Quantidade" />
                  <span className="r muted">{money(unitPrice)}</span>
                  <b className="r">{money(unitPrice * l.qty)}</b>
                  <button className="icon-btn" onClick={() => setC({ lines: c.lines.filter((x) => x.id !== l.id) })} aria-label="Remover serviço">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="row pad"><button className="btn small" onClick={() => setAdding(true)} disabled={!p.services.length}>+ Serviço</button><a className="link" href="#/precos/servicos">cadastrar serviço novo</a></div>
        </section>
        <section className="card flush">
          <div className="card-head pad"><h2>Custos da obra</h2><small className="muted">valores fechados (recebem BDI)</small></div>
          <div className="pr-table extras">
            {c.extras.map((e) => (
              <div key={e.id} className="pr-row">
                <input value={e.name} onChange={(ev) => setC({ extras: c.extras.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) })} aria-label="Descrição do custo" />
                <MoneyInput value={e.value} onChange={(v) => setC({ extras: c.extras.map((x) => (x.id === e.id ? { ...x, value: v } : x)) })} ariaLabel="Valor do custo" />
                <button className="icon-btn" onClick={() => setC({ extras: c.extras.filter((x) => x.id !== e.id) })} aria-label="Remover custo">✕</button>
              </div>
            ))}
          </div>
          <div className="row pad"><button className="btn small" onClick={() => setC({ extras: [...c.extras, { id: uid(), name: '', value: 0 }] })}>+ Custo</button></div>
        </section>
      </div>
      <aside className="card pr-sum">
        <div className="card-head"><h2>Resultado</h2></div>
        <div className="kv"><span>Custo direto</span><b>{money(cost)}</b></div>
        <div className="kv"><span>BDI <a className="link small" href="#/precos/bdi">({pct(bdi)})</a></span><b>{money(price - cost)}</b></div>
        <div className="pr-price"><span>preço de venda</span><strong>{money(price)}</strong></div>
        <div className="kv"><span>Lucro estimado</span><b className="pos">{money(profit)}</b></div>
        <div className="kv"><span>Margem sobre o preço</span><b>{price ? pct(profit / price) : '—'}</b></div>
        <div className="pr-actions">
          <button className="btn primary" onClick={() => setPicking('pdde')}><Icon name="file" size={16} /> Gerar orçamento para escola</button>
          <button className="btn" onClick={() => setPicking('padrao')}>Gerar orçamento comum</button>
          <button className="link" onClick={clear}>limpar cálculo</button>
        </div>
      </aside>
      {adding && <ServicePicker onClose={() => setAdding(false)} onPick={(ids) => { setC({ lines: [...c.lines, ...ids.map((sid) => ({ id: uid(), serviceId: sid, qty: 1 }))] }); setAdding(false) }} />}
      {picking && <CompanyPicker title="Gerar orçamento: qual empresa?" onPick={(id) => generate(picking, id)} onClose={() => setPicking(null)} />}
    </div>
  )
}

/** Escolher serviços da tabela (usado no cálculo e dentro do orçamento). */
export function ServicePicker({ onPick, onClose }: { onPick: (ids: string[]) => void; onClose: () => void }) {
  const { p } = usePricing()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const list = p.services.filter((s) => !q || `${s.code} ${s.name}`.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: string) => setSel((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
  return (
    <Modal title="Serviços da tabela de preços" onClose={onClose} footer={<><a className="link" href="#/precos/servicos" onClick={onClose}>editar a tabela</a><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!sel.length} onClick={() => onPick(sel)}>Adicionar{sel.length ? ` (${sel.length})` : ''}</button></>}>
      <input className="pick-search" type="search" placeholder="Buscar serviço…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar serviço" autoFocus />
      <div className="pick-svc">
        {list.map((s) => (
          <label key={s.id} className={sel.includes(s.id) ? 'on' : ''}>
            <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />
            <span><b>{s.name}</b><small>{s.code} · por {s.unit}</small></span>
            <em>{money(serviceCost(p, s).price)}</em>
          </label>
        ))}
        {!list.length && <p className="muted">Nenhum serviço encontrado.</p>}
      </div>
    </Modal>
  )
}

/* ---------------- serviços ---------------- */
function Services() {
  const { p } = usePricing()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<PriceService | null>(null)
  const list = p.services.filter((s) => !q || `${s.code} ${s.name}`.toLowerCase().includes(q.toLowerCase()))
  const nextCode = () => `S${String(p.services.reduce((m, s) => Math.max(m, Number(s.code.replace(/\D/g, '')) || 0), 0) + 1).padStart(2, '0')}`
  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Buscar serviço…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar serviço" />
        <button className="btn primary" onClick={() => setEdit({ id: uid(), code: nextCode(), name: '', unit: 'm²', items: [] })}><Icon name="plus" size={16} /> Novo serviço</button>
      </div>
      {!list.length ? <Empty title="Nenhum serviço" /> : (
        <div className="card flush">
          <div className="pr-table svc">
            <div className="pr-row head"><span>serviço</span><span className="r">material</span><span className="r">mão de obra</span><span className="r">custo</span><span className="r">preço c/ BDI</span></div>
            {list.map((s) => {
              const k = serviceCost(p, s)
              return (
                <button key={s.id} className="pr-row click" onClick={() => setEdit(s)}>
                  <span className="pr-name"><b>{s.name}</b><small>{s.code} · por {s.unit}</small></span>
                  <span className="r muted">{money(k.material)}</span>
                  <span className="r muted">{money(k.labor)}</span>
                  <span className="r">{money(k.cost)}</span>
                  <b className="r">{money(k.price)}</b>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {edit && <ServiceForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function ServiceForm({ initial, onClose }: { initial: PriceService; onClose: () => void }) {
  const { p, setP } = usePricing()
  const exists = p.services.some((s) => s.id === initial.id)
  const [s, setS] = useState<PriceService>(initial)
  const set = (x: Partial<PriceService>) => setS((o) => ({ ...o, ...x }))
  const k = serviceCost(p, s)
  const submit = () => {
    if (!s.name.trim()) return toast('Informe o nome do serviço', 'err')
    const clean = { ...s, name: s.name.trim(), items: s.items.filter((i) => i.inputId) }
    setP((o) => ({ ...o, services: exists ? o.services.map((x) => (x.id === s.id ? clean : x)) : [...o.services, clean] }))
    toast(exists ? 'Serviço atualizado' : 'Serviço cadastrado')
    onClose()
  }
  const del = async () => {
    if (!(await confirmDialog(`Apagar o serviço "${s.name}" da tabela?`, 'Apagar'))) return
    setP((o) => ({ ...o, services: o.services.filter((x) => x.id !== s.id) }))
    onClose()
  }
  const mats = p.inputs.filter((i) => !i.labor)
  const labor = p.inputs.filter((i) => i.labor)
  return (
    <Modal wide title={exists ? s.name : 'Novo serviço'} onClose={onClose} footer={<>{exists && <button className="btn danger ghost" onClick={del}>Apagar</button>}{exists && <button className="btn ghost" onClick={() => { setP((o) => ({ ...o, services: [...o.services, { ...s, id: uid(), code: `${s.code}-B`, name: `${s.name} (cópia)` }] })); toast('Cópia criada'); onClose() }}>Duplicar</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Código"><input value={s.code} onChange={(e) => set({ code: e.target.value })} aria-label="Código" /></Field>
        <Field label="Unidade"><input value={s.unit} onChange={(e) => set({ unit: e.target.value })} list="pr-units" aria-label="Unidade" /></Field>
        <Field label="Nome do serviço (como vai no orçamento)" span={2}><input value={s.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!exists} aria-label="Nome do serviço" /></Field>
      </div>
      <datalist id="pr-units">{['m²', 'm³', 'm', 'un', 'vb', 'kg', 'pt', 'h'].map((u) => <option key={u} value={u} />)}</datalist>
      <h3 className="section-t">O que gasta por {s.unit || 'unidade'}</h3>
      <p className="muted small" style={{ marginTop: -6 }}>Material: quantidade por {s.unit || 'unidade'}. Mão de obra: horas por {s.unit || 'unidade'}.</p>
      <div className="pr-table comp">
        {s.items.map((it, ix) => {
          const inp = p.inputs.find((x) => x.id === it.inputId)
          return (
            <div key={ix} className="pr-row">
              <select value={it.inputId} onChange={(e) => set({ items: s.items.map((x, j) => (j === ix ? { ...x, inputId: e.target.value } : x)) })} aria-label="Insumo">
                <option value="">escolha…</option>
                <optgroup label="Materiais">{mats.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
                <optgroup label="Mão de obra (horas)">{labor.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
              </select>
              <NumInput value={it.coef} step={0.001} min={0} suffix={inp?.unit} onChange={(v) => set({ items: s.items.map((x, j) => (j === ix ? { ...x, coef: v } : x)) })} ariaLabel="Quantidade por unidade" />
              <span className="r muted">{money(inputCost(p, inp))}{inp ? `/${inp.unit}` : ''}</span>
              <b className="r">{money(inputCost(p, inp) * it.coef)}</b>
              <button className="icon-btn" onClick={() => set({ items: s.items.filter((_, j) => j !== ix) })} aria-label="Remover insumo">✕</button>
            </div>
          )
        })}
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="row"><button className="btn small" onClick={() => set({ items: [...s.items, { inputId: mats[0]?.id ?? '', coef: 1 }] })}>+ Material</button><button className="btn small" onClick={() => set({ items: [...s.items, { inputId: labor[0]?.id ?? '', coef: 1 }] })}>+ Mão de obra</button></span>
      </div>
      <div className="pr-svc-tot">
        <span>material <b>{money(k.material)}</b></span>
        <span>mão de obra <b>{money(k.labor)}</b></span>
        <span>custo <b>{money(k.cost)}</b></span>
        <span className="hl">preço c/ BDI <b>{money(k.price)}</b> por {s.unit}</span>
      </div>
    </Modal>
  )
}

/* ---------------- materiais e diárias ---------------- */
function Inputs() {
  const { p, setP } = usePricing()
  const [q, setQ] = useState('')
  const setI = (id: string, x: Partial<PriceInput>) => setP((o) => ({ ...o, inputs: o.inputs.map((i) => (i.id === id ? { ...i, ...x } : i)) }))
  const add = (labor: boolean) => setP((o) => ({ ...o, inputs: [...o.inputs, { id: uid(), name: '', unit: labor ? 'h' : 'un', price: 0, labor }] }))
  const del = async (i: PriceInput) => {
    const used = p.services.filter((s) => s.items.some((x) => x.inputId === i.id))
    if (!(await confirmDialog(used.length ? `"${i.name}" é usado em ${used.length} serviço(s). Apagar mesmo assim? Ele sai desses serviços.` : `Apagar "${i.name || 'item'}"?`, 'Apagar'))) return
    setP((o) => ({ ...o, inputs: o.inputs.filter((x) => x.id !== i.id), services: o.services.map((s) => ({ ...s, items: s.items.filter((x) => x.inputId !== i.id) })) }))
  }
  const match = (i: PriceInput) => !q || i.name.toLowerCase().includes(q.toLowerCase())
  const mats = p.inputs.filter((i) => !i.labor && match(i))
  const labor = p.inputs.filter((i) => i.labor && match(i))
  return (
    <>
      <div className="filters"><input type="search" placeholder="Buscar material ou profissional…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar insumo" /></div>
      <div className="cols even">
        <section className="card flush">
          <div className="card-head pad"><h2>Materiais</h2><small className="muted">atualize os preços do seu fornecedor</small></div>
          <div className="pr-table inp">
            <div className="pr-row head"><span>material</span><span>unid.</span><span>preço</span><span /></div>
            {mats.map((i) => (
              <div key={i.id} className="pr-row">
                <input value={i.name} onChange={(e) => setI(i.id, { name: e.target.value })} placeholder="Nome do material" aria-label="Material" />
                <input value={i.unit} onChange={(e) => setI(i.id, { unit: e.target.value })} aria-label="Unidade" />
                <MoneyInput value={i.price} onChange={(v) => setI(i.id, { price: v })} ariaLabel={`Preço ${i.name}`} />
                <button className="icon-btn" onClick={() => del(i)} aria-label={`Apagar ${i.name}`}>✕</button>
              </div>
            ))}
          </div>
          <div className="row pad"><button className="btn small" onClick={() => add(false)}>+ Material</button></div>
        </section>
        <section className="card flush">
          <div className="card-head pad"><h2>Mão de obra</h2><small className="muted">diária → custo da hora com encargos</small></div>
          <div className="pr-table lab">
            <div className="pr-row head"><span>profissional</span><span>diária</span><span className="r">hora</span><span /></div>
            {labor.map((i) => (
              <div key={i.id} className="pr-row">
                <input value={i.name} onChange={(e) => setI(i.id, { name: e.target.value })} placeholder="Profissão" aria-label="Profissional" />
                <MoneyInput value={i.price} onChange={(v) => setI(i.id, { price: v })} ariaLabel={`Diária ${i.name}`} />
                <b className="r">{money(inputCost(p, i))}</b>
                <button className="icon-btn" onClick={() => del(i)} aria-label={`Apagar ${i.name}`}>✕</button>
              </div>
            ))}
          </div>
          <div className="row pad"><button className="btn small" onClick={() => add(true)}>+ Profissional</button><small className="muted">{p.hours} h/dia · encargos {pct(p.charges)} · <a className="link" href="#/precos/bdi">mudar</a></small></div>
        </section>
      </div>
    </>
  )
}

/* ---------------- BDI ---------------- */
const BDI_ITEMS: [keyof Pricing['bdi'], string, string][] = [
  ['ac', 'Administração central', 'escritório, contador, veículo… (TCU: 3% a 5,5%)'],
  ['sg', 'Seguro e garantia', 'TCU: 0,8% a 1%'],
  ['r', 'Risco', 'imprevistos (TCU: 0,97% a 1,27%)'],
  ['df', 'Despesas financeiras', 'custo de esperar o pagamento (TCU: 0,59% a 1,39%)'],
  ['l', 'Lucro', 'seu lucro (TCU: 6,16% a 8,96%)'],
  ['pis', 'PIS', 'conforme o regime da empresa'],
  ['cofins', 'COFINS', 'conforme o regime da empresa'],
  ['iss', 'ISS', 'confira a alíquota do município'],
  ['other', 'CPRB / Simples / outros', 'no Simples, coloque a alíquota efetiva aqui e zere PIS, COFINS e ISS'],
]
function Bdi() {
  const { p, setP } = usePricing()
  const bdi = bdiOf(p)
  const tax = p.bdi.pis + p.bdi.cofins + p.bdi.iss + p.bdi.other
  const setB = (k: keyof Pricing['bdi'], v: number) => setP((o) => ({ ...o, bdi: { ...o.bdi, [k]: v } }))
  return (
    <div className="cols">
      <section className="card">
        <div className="card-head"><h2>Itens do BDI</h2></div>
        <div className="pr-bdi">
          {BDI_ITEMS.map(([k, l, h], ix) => (
            <div key={k} className={`pr-bdi-row ${ix === 5 ? 'sep' : ''}`}>
              <span><b>{l}</b><small>{h}</small></span>
              <Pct value={p.bdi[k]} onChange={(v) => setB(k, v)} ariaLabel={l} />
            </div>
          ))}
        </div>
      </section>
      <div className="stack">
        <section className="card pr-sum">
          <div className="pr-price"><span>BDI calculado</span><strong>{pct(bdi)}</strong></div>
          <div className="kv"><span>Impostos somados</span><b>{pct(tax)}</b></div>
          <p className="muted small">Fórmula do TCU (Acórdão 2622/2013): [(1 + AC + S + G + R) × (1 + DF) × (1 + L) ÷ (1 − impostos)] − 1. Obras de edificação costumam ficar entre 20% e 30%.</p>
        </section>
        <section className="card">
          <div className="card-head"><h2>Mão de obra</h2></div>
          <div className="grid-form">
            <Field label="Horas trabalhadas por dia"><NumInput value={p.hours} min={1} onChange={(v) => setP((o) => ({ ...o, hours: Math.max(1, v) }))} suffix="h" ariaLabel="Horas por dia" /></Field>
            <Field label="Encargos sobre a mão de obra" hint="diarista ≈ 10–25%, CLT ≈ 70–120%"><Pct value={p.charges} onChange={(v) => setP((o) => ({ ...o, charges: v }))} ariaLabel="Encargos" /></Field>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------- estimativa por m² ---------------- */
function M2() {
  const { p, setP } = usePricing()
  const m = p.m2
  const set = (x: Partial<Pricing['m2']>) => setP((o) => ({ ...o, m2: { ...o.m2, ...x } }))
  const bdi = bdiOf(p)
  const cost = m.area * m.cost * M2_KIND[m.kind][1] * (1 + m.adjust)
  const price = cost * (1 + bdi)
  return (
    <div className="cols">
      <section className="card">
        <div className="card-head"><h2>Conta rápida pela área</h2></div>
        <div className="seg" style={{ marginBottom: 16 }}>
          {(Object.keys(M2_KIND) as (keyof typeof M2_KIND)[]).map((k) => <button key={k} className={m.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>{M2_KIND[k][0]}</button>)}
        </div>
        <div className="grid-form">
          <Field label="Área"><NumInput value={m.area} min={0} step={0.01} suffix="m²" onChange={(v) => set({ area: v })} ariaLabel="Área" /></Field>
          <Field label="Custo de referência por m²" hint="use o CUB-SP do mês (Sinduscon-SP) para o padrão da obra"><MoneyInput value={m.cost} onChange={(v) => set({ cost: v })} ariaLabel="Custo por m²" /></Field>
          <Field label="Ajuste do padrão" hint="+10% acabamento melhor, −10% mais simples"><NumInput value={r2(m.adjust * 100)} step={1} suffix="%" onChange={(v) => set({ adjust: v / 100 })} ariaLabel="Ajuste" /></Field>
          <Field label="Fator do tipo de obra"><input value={`${M2_KIND[m.kind][1].toLocaleString('pt-BR')} × (${M2_KIND[m.kind][0].toLowerCase()})`} readOnly aria-label="Fator" /></Field>
        </div>
      </section>
      <section className="card pr-sum">
        <div className="kv"><span>Custo estimado</span><b>{money(cost)}</b></div>
        <div className="kv"><span>BDI</span><b>{pct(bdi)}</b></div>
        <div className="pr-price"><span>preço estimado</span><strong>{money(price)}</strong></div>
        <div className="kv"><span>Por m²</span><b>{m.area ? money(price / m.area) : '—'}</b></div>
        <p className="muted small">É só uma ideia de preço, antes do orçamento detalhado. Os fatores de reforma (0,35 / 0,60 / 0,85) são estimativas de partida.</p>
      </section>
    </div>
  )
}
