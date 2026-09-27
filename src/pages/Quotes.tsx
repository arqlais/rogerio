import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Data, Entity, Quote, QuoteItem } from '../types'
import { Attachments } from '../components/Attachments'
import { Badge, Empty, Field, MoneyInput, NumInput, Stat, confirmDialog, openDocument, toast } from '../components/ui'
import { addDays, entityName, extenso, fmtDate, money, today, uid } from '../utils'

const STATUS: Record<Quote['status'], [string, 'muted' | 'info' | 'good' | 'bad']> = {
  rascunho: ['Rascunho', 'muted'],
  enviado: ['Enviado', 'info'],
  aprovado: ['Aprovado', 'good'],
  recusado: ['Recusado', 'bad'],
}
const UNITS = ['m²', 'm³', 'm', 'un', 'vb', 'kg', 'h', 'dia', 'mês', 'pt', 'cj']
const SUBPROGRAMS = ['PDDE Paulista - Manutenção', 'PDDE Paulista - Custeio', 'PDDE Paulista - Capital', 'PDDE Federal - Básico', 'Recursos próprios da APM']

export const itemTotal = (i: QuoteItem) => (i.total !== undefined && i.total !== null ? i.total : i.qty * i.price)
export const quoteTotals = (q: Quote) => {
  const direct = q.items.reduce((s, i) => s + itemTotal(i), 0)
  const bdi = q.model === 'pdde' ? 0 : (direct * (q.bdi || 0)) / 100
  return { direct, bdi, total: Math.max(0, direct + bdi - (q.model === 'pdde' ? 0 : q.discount || 0)) }
}
const quoteClient = (q: Quote) => (q.model === 'pdde' ? q.apmName || q.client : q.client)

export function Quotes({ id }: { id?: string }) {
  if (id) return <QuoteEditor id={id} />
  return <QuoteList />
}

function nextNumber(d: Data) {
  const year = today().slice(0, 4)
  const n = d.quotes.filter((q) => q.date.startsWith(year)).length + 1
  return `${String(n).padStart(3, '0')}/${year}`
}

function QuoteList() {
  const { data, save } = useStore()
  const scope = data.settings.scope
  const [status, setStatus] = useState<'' | Quote['status']>('')
  const [q, setQ] = useState('')
  const all = data.quotes.filter((x) => scope === 'all' || x.entityId === scope)
  const list = all
    .filter((x) => (!status || x.status === status) && (!q || `${quoteClient(x)} ${x.title} ${x.number}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date))
  const sum = (s: Quote['status']) => all.filter((x) => x.status === s).reduce((t, x) => t + quoteTotals(x).total, 0)
  const decided = all.filter((x) => x.status === 'aprovado' || x.status === 'recusado')

  const create = (model: 'pdde' | 'padrao') => {
    const companies = data.entities.filter((e) => e.kind === 'empresa')
    const ent = companies.find((e) => e.id === scope) ?? companies.find((e) => e.id === data.settings.lastEntity) ?? companies.find((e) => e.favorite) ?? companies[0]
    const base: Quote = {
      id: uid(), model, number: nextNumber(data), entityId: ent.id, client: '', title: '', date: today(), status: 'rascunho', bdi: 0, discount: 0,
      contactName: ent.contactName ?? '', items: [],
      validDays: model === 'pdde' ? 15 : 30,
      payment: model === 'pdde' ? 'Após apresentação da nota fiscal' : 'Conforme medições mensais dos serviços executados.',
    }
    const quote: Quote = model === 'pdde'
      ? { ...base, subprogram: SUBPROGRAMS[0], exercise: today().slice(0, 4), items: [{ id: uid(), description: '', unit: '', qty: 0, price: 0 }] }
      : { ...base, items: [{ id: uid(), group: '1. Serviços preliminares', description: '', unit: 'vb', qty: 1, price: 0 }] }
    save('quotes', quote)
    go(`/orcamentos/${quote.id}`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Orçamentos</h1>
        <div className="row wrap">
          <button className="btn primary" onClick={() => create('pdde')}>+ Orçamento para escola (PDDE)</button>
          <button className="btn" onClick={() => create('padrao')}>+ Orçamento comum</button>
        </div>
      </div>
      <div className="stats">
        <Stat label="Aguardando resposta" value={money(sum('enviado'))} sub={`${all.filter((x) => x.status === 'enviado').length} orçamento(s)`} tone="info" />
        <Stat label="Aprovados" value={money(sum('aprovado'))} sub={`${all.filter((x) => x.status === 'aprovado').length} orçamento(s)`} tone="good" />
        <Stat label="Taxa de aprovação" value={decided.length ? `${Math.round((all.filter((x) => x.status === 'aprovado').length / decided.length) * 100)}%` : '—'} />
      </div>
      <div className="filters">
        <input type="search" placeholder="Buscar escola, cliente, número…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar orçamento" />
        <div className="seg compact">
          {([['', 'Todos'], ['rascunho', 'Rascunhos'], ['enviado', 'Enviados'], ['aprovado', 'Aprovados'], ['recusado', 'Recusados']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
      </div>
      {!list.length ? <Empty title="Nenhum orçamento" text="Preencha os serviços e gere o orçamento no papel timbrado da empresa, pronto para imprimir, carimbar e assinar." action={<button className="btn primary" onClick={() => create('pdde')}>Fazer orçamento</button>} /> : (
        <div className="txlist">
          {list.map((x) => {
            const e = data.entities.find((en) => en.id === x.entityId)
            return (
              <a key={x.id} className="tx" href={`#/orcamentos/${x.id}`}>
                <div className="tx-date"><span>{x.number.split('/')[0]}</span><small>{fmtDate(x.date).slice(0, 5)}</small></div>
                <div className="tx-main">
                  <strong>{quoteClient(x) || 'Sem cliente'}</strong>
                  <span className="tx-meta"><span className="dot" style={{ background: e?.color }} /> {e?.name}{x.model === 'pdde' ? ` · ${x.subprogram ?? 'PDDE'}` : x.title ? ` · ${x.title}` : ''}{x.files?.length ? ' · assinado anexado' : ''}</span>
                </div>
                <div className="tx-right"><span className="tx-amount">{money(quoteTotals(x).total)}</span><Badge tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge></div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuoteEditor({ id }: { id: string }) {
  const { data, save, remove, setSettings } = useStore()
  const q = data.quotes.find((x) => x.id === id)
  if (!q) return <div className="page"><Empty title="Orçamento não encontrado" action={<a className="btn" href="#/orcamentos">Voltar</a>} /></div>
  const pdde = q.model === 'pdde'
  const ent = data.entities.find((e) => e.id === q.entityId)
  const set = (x: Partial<Quote>) => save('quotes', { ...q, ...x })
  const setItem = (iid: string, x: Partial<QuoteItem>) => set({ items: q.items.map((i) => (i.id === iid ? { ...i, ...x } : i)) })
  const addItem = (group?: string) => set({ items: [...q.items, { id: uid(), group: pdde ? undefined : group ?? q.items[q.items.length - 1]?.group, description: '', unit: pdde ? '' : 'm²', qty: pdde ? 0 : 1, price: 0 }] })
  const renameGroup = (old: string | undefined, name: string) => set({ items: q.items.map((i) => (i.group === old ? { ...i, group: name } : i)) })
  const move = (iid: string, dir: -1 | 1) => {
    const i = q.items.findIndex((x) => x.id === iid)
    const j = i + dir
    if (j < 0 || j >= q.items.length) return
    const items = [...q.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    set({ items })
  }
  // quantidade × preço calcula sozinho; digitar o total direto também vale
  const setQtyPrice = (i: QuoteItem, x: Partial<QuoteItem>) => {
    const n = { ...i, ...x }
    setItem(i.id, { ...x, total: n.qty > 0 && n.price > 0 ? undefined : i.total })
  }
  const changeEntity = (eid: string) => {
    const e = data.entities.find((x) => x.id === eid)
    set({ entityId: eid, contactName: e?.contactName ?? q.contactName })
    setSettings({ lastEntity: eid })
  }
  const t = quoteTotals(q)
  const groups = [...new Set(q.items.map((i) => i.group ?? ''))]
  const client = quoteClient(q)

  const approve = async () => {
    const name = q.title || (pdde ? `Reparos – ${q.apmName}` : `Obra ${q.client}`)
    if (!(await confirmDialog(`Marcar como aprovado e criar a obra "${name}" com contrato de ${money(t.total)}?`, 'Aprovar e criar obra', false))) return
    const pid = uid()
    save('projects', { id: pid, name, entityId: q.entityId, kind: pdde || /escola|e\.e\.|emef/i.test(client) ? 'reforma_escola' : /reforma/i.test(q.title) ? 'reforma' : 'construcao', status: 'andamento', client, contractNo: pdde ? `${q.subprogram ?? 'PDDE'} ${q.exercise ?? ''}`.trim() : undefined, address: q.address, contractValue: t.total, budget: pdde ? 0 : Math.round(t.direct * 100) / 100, start: today(), notes: `Criada do orçamento nº ${q.number}` })
    save('quotes', { ...q, status: 'aprovado', projectId: pid })
    toast(pdde ? 'Obra criada — informe o custo previsto em Editar' : 'Obra criada')
    go(`/obras/${pid}`)
  }
  const duplicate = () => {
    const c: Quote = { ...q, id: uid(), number: nextNumber(data), date: today(), status: 'rascunho', projectId: undefined, files: undefined, items: q.items.map((i) => ({ ...i, id: uid() })) }
    save('quotes', c)
    go(`/orcamentos/${c.id}`)
  }
  const del = async () => {
    if (await confirmDialog('Excluir este orçamento?', 'Excluir')) { remove('quotes', q.id); go('/orcamentos') }
  }

  return (
    <div className="page">
      <a className="back" href="#/orcamentos">‹ Orçamentos</a>
      <div className="page-head">
        <div><h1>Orçamento nº {q.number}</h1><p className="muted">{client || 'Cliente'} · {money(t.total)}</p></div>
        <div className="row wrap">
          <select value={q.status} onChange={(e) => set({ status: e.target.value as Quote['status'] })} aria-label="Situação do orçamento">
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn primary" onClick={() => printQuote(data, q)}>Ver para imprimir</button>
        </div>
      </div>

      <section className="card">
        <div className="grid-form three">
          <Field label="Empresa que está orçando">
            <select value={q.entityId} onChange={(e) => changeEntity(e.target.value)} aria-label="Empresa do orçamento">
              {data.entities.filter((e) => e.kind === 'empresa').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Modelo">
            <select value={q.model ?? 'padrao'} onChange={(e) => set({ model: e.target.value as Quote['model'] })} aria-label="Modelo">
              <option value="pdde">Escola – PDDE (APM)</option><option value="padrao">Orçamento comum</option>
            </select>
          </Field>
          <Field label="Número"><input value={q.number} onChange={(e) => set({ number: e.target.value })} aria-label="Número" /></Field>
        </div>
      </section>

      {pdde ? (
        <>
          <section className="card">
            <div className="card-head"><h2>1. Orçamento destinado a</h2></div>
            <div className="grid-form">
              <Field label="Nome da APM (escola)" span={2}><input value={q.apmName ?? ''} onChange={(e) => set({ apmName: e.target.value })} placeholder="Ex.: E.E. Prof. José Calvitti Filho" aria-label="Nome da APM" /></Field>
              <Field label="CNPJ da APM"><input value={q.apmCnpj ?? ''} onChange={(e) => set({ apmCnpj: e.target.value })} placeholder="00.000.000/0001-00" aria-label="CNPJ da APM" /></Field>
              <Field label="Ano de exercício"><input value={q.exercise ?? ''} onChange={(e) => set({ exercise: e.target.value })} aria-label="Ano de exercício" /></Field>
              <Field label="Subprograma do PDDE Paulista" span={2}>
                <input list="subprogramas" value={q.subprogram ?? ''} onChange={(e) => set({ subprogram: e.target.value })} aria-label="Subprograma" />
                <datalist id="subprogramas">{SUBPROGRAMS.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>
            {pastSchools(data, q).length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                <small className="muted">Escolas já orçadas:</small>
                {pastSchools(data, q).map((s) => <button key={s.apmName} className="chip" onClick={() => set({ apmName: s.apmName, apmCnpj: s.apmCnpj })}>{s.apmName}</button>)}
              </div>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>2. Dados do proponente</h2><a className="link" href={`#/empresa/${q.entityId}`}>editar dados da empresa</a></div>
            <div className="proponent">
              <div className="kv"><span>CNPJ</span><b>{ent?.doc || <span className="neg">falta no perfil</span>}</b></div>
              <div className="kv"><span>Razão social</span><b>{ent?.legalName || ent?.name}</b></div>
              <div className="kv"><span>Endereço</span><b>{[ent?.address, ent?.district].filter(Boolean).join(' - ') || <span className="neg">falta no perfil</span>}</b></div>
              <div className="kv"><span>Telefone</span><b>{ent?.phone || '—'}</b></div>
            </div>
            <div className="grid-form four" style={{ marginTop: 12 }}>
              <Field label="Data de emissão"><input type="date" value={q.date} onChange={(e) => set({ date: e.target.value })} aria-label="Data de emissão" /></Field>
              <Field label="Validade (dias)"><NumInput value={q.validDays} min={1} onChange={(v) => set({ validDays: v })} ariaLabel="Validade" /></Field>
              <Field label="Pessoa responsável"><input value={q.contactName ?? ''} onChange={(e) => set({ contactName: e.target.value })} aria-label="Pessoa responsável" /></Field>
              <Field label="Condição de pagamento">
                <input list="pagamentos" value={q.payment ?? ''} onChange={(e) => set({ payment: e.target.value })} aria-label="Condição de pagamento" />
                <datalist id="pagamentos"><option value="Após apresentação da nota fiscal" /><option value="Entrada 0%, pagamento no final da obra" /><option value="50% na aprovação e 50% na entrega" /></datalist>
              </Field>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>3. Dados do orçamento</h2><span className="muted small">Pode preencher só a descrição e o valor total, como nos seus modelos.</span></div>
            <div className="q-items">
              <div className="q-row pdde head"><span>Descrição dos serviços</span><span>Qtd</span><span>Unidade</span><span>Valor un.</span><span>Valor total</span><span /></div>
              {q.items.map((i, n) => (
                <div key={i.id} className="q-row pdde">
                  <span className="q-desc"><b className="q-n">{n + 1}</b><input value={i.description} onChange={(e) => setItem(i.id, { description: e.target.value })} placeholder="Ex.: Manutenção elétrica da sala Maker" aria-label="Descrição do item" /></span>
                  <input inputMode="decimal" value={i.qty || ''} onChange={(e) => setQtyPrice(i, { qty: Number(e.target.value.replace(',', '.')) || 0 })} placeholder="—" aria-label="Quantidade" />
                  <input list="units" value={i.unit} onChange={(e) => setItem(i.id, { unit: e.target.value })} placeholder="—" aria-label="Unidade" />
                  <MoneyInput value={i.price} onChange={(v) => setQtyPrice(i, { price: v })} placeholder="—" ariaLabel="Preço unitário" />
                  <MoneyInput value={itemTotal(i)} onChange={(v) => setItem(i.id, { total: v, price: i.qty > 0 ? Math.round((v / i.qty) * 100) / 100 : i.price })} ariaLabel="Valor total do item" />
                  <span className="q-act">
                    <button className="icon-btn" onClick={() => move(i.id, -1)} aria-label="Subir">↑</button>
                    <button className="icon-btn" onClick={() => set({ items: q.items.filter((x) => x.id !== i.id) })} aria-label="Remover item">✕</button>
                  </span>
                </div>
              ))}
              <div className="row between">
                <button className="btn small" onClick={() => addItem()}>+ Serviço</button>
                <span className="q-total">Total <b>{money(t.total)}</b></span>
              </div>
              <small className="muted">{extenso(t.total)}</small>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <div className="grid-form three">
              <Field label="Cliente" span={2}><input value={q.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nome do cliente" aria-label="Cliente" /></Field>
              <Field label="Data"><input type="date" value={q.date} onChange={(e) => set({ date: e.target.value })} aria-label="Data" /></Field>
              <Field label="Serviço / objeto" span={2}><input value={q.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Reforma da cobertura e pintura geral" aria-label="Objeto" /></Field>
              <Field label="CPF / CNPJ do cliente"><input value={q.clientDoc ?? ''} onChange={(e) => set({ clientDoc: e.target.value })} aria-label="Documento do cliente" /></Field>
              <Field label="Local da obra" span={2}><input value={q.address ?? ''} onChange={(e) => set({ address: e.target.value })} aria-label="Local da obra" /></Field>
              <Field label="Contato"><input value={q.clientContact ?? ''} onChange={(e) => set({ clientContact: e.target.value })} aria-label="Contato" /></Field>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Itens do orçamento</h2><span className="muted small">Organize por etapas. Valor = quantidade × preço unitário.</span></div>
            {groups.map((g) => (
              <div key={g} className="q-group">
                <input className="q-group-name" value={g} onChange={(e) => renameGroup(g || undefined, e.target.value)} placeholder="Etapa" aria-label="Nome da etapa" />
                <div className="q-items">
                  <div className="q-row head"><span>Descrição</span><span>Un.</span><span>Qtd.</span><span>Preço unit.</span><span className="r">Total</span><span /></div>
                  {q.items.filter((i) => (i.group ?? '') === g).map((i) => (
                    <div key={i.id} className="q-row">
                      <input value={i.description} onChange={(e) => setItem(i.id, { description: e.target.value })} placeholder="Descrição do serviço ou material" aria-label="Descrição do item" />
                      <input list="units" value={i.unit} onChange={(e) => setItem(i.id, { unit: e.target.value })} aria-label="Unidade" />
                      <NumInput value={i.qty} step={0.01} onChange={(v) => setQtyPrice(i, { qty: v })} ariaLabel="Quantidade" />
                      <MoneyInput value={i.price} onChange={(v) => setQtyPrice(i, { price: v })} ariaLabel="Preço unitário" />
                      <b className="r">{money(itemTotal(i))}</b>
                      <span className="q-act">
                        <button className="icon-btn" onClick={() => move(i.id, -1)} aria-label="Subir">↑</button>
                        <button className="icon-btn" onClick={() => set({ items: q.items.filter((x) => x.id !== i.id) })} aria-label="Remover item">✕</button>
                      </span>
                    </div>
                  ))}
                  <div className="row between">
                    <button className="link" onClick={() => addItem(g || undefined)}>+ item nesta etapa</button>
                    <small className="muted">Subtotal: <b>{money(q.items.filter((i) => (i.group ?? '') === g).reduce((s, i) => s + itemTotal(i), 0))}</b></small>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn small" onClick={() => addItem(`${groups.length + 1}. Nova etapa`)}>+ Nova etapa</button>
          </section>
        </>
      )}
      <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

      <div className="cols even">
        <section className="card">
          <div className="card-head"><h2>{pdde ? 'Orçamento assinado' : 'Condições'}</h2></div>
          {!pdde && (
            <div className="grid-form">
              <Field label="Validade (dias)"><NumInput value={q.validDays} min={1} onChange={(v) => set({ validDays: v })} ariaLabel="Validade" /></Field>
              <Field label="Prazo de execução"><input value={q.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} placeholder="Ex.: 90 dias" aria-label="Prazo" /></Field>
              <Field label="Forma de pagamento" span={2}><textarea rows={2} value={q.payment ?? ''} onChange={(e) => set({ payment: e.target.value })} aria-label="Pagamento" /></Field>
              <Field label="Observações" span={2}><textarea rows={3} value={q.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="O que está incluso, o que não está, garantia…" aria-label="Observações do orçamento" /></Field>
            </div>
          )}
          <p className="muted small">Depois de imprimir, carimbar e assinar, tire uma foto ou escaneie e anexe aqui para guardar junto.</p>
          <Attachments files={q.files} onChange={(files) => set({ files })} label="Anexar orçamento assinado" />
        </section>
        <section className="card">
          <div className="card-head"><h2>Total</h2></div>
          <div className="kv"><span>Serviços</span><b>{money(t.direct)}</b></div>
          {!pdde && <div className="kv"><span>BDI (lucro + despesas indiretas)</span><span className="row"><NumInput value={q.bdi} min={0} step={0.5} onChange={(v) => set({ bdi: v })} suffix="%" ariaLabel="BDI" /> <b>{money(t.bdi)}</b></span></div>}
          {!pdde && <div className="kv"><span>Desconto</span><MoneyInput value={q.discount} onChange={(v) => set({ discount: v })} ariaLabel="Desconto" /></div>}
          <div className="kv total"><span>Valor final</span><b>{money(t.total)}</b></div>
          <div className="row wrap" style={{ marginTop: 16 }}>
            {q.projectId ? <a className="btn good" href={`#/obras/${q.projectId}`}>Ver obra criada</a> : <button className="btn good" onClick={approve}>Aprovado → criar obra</button>}
            <button className="btn" onClick={duplicate}>Duplicar</button>
            <button className="btn danger ghost" onClick={del}>Excluir</button>
          </div>
        </section>
      </div>
    </div>
  )
}

function pastSchools(d: Data, q: Quote) {
  const seen = new Map<string, { apmName: string; apmCnpj?: string }>()
  for (const x of d.quotes) if (x.id !== q.id && x.apmName && !seen.has(x.apmName)) seen.set(x.apmName, { apmName: x.apmName, apmCnpj: x.apmCnpj })
  return [...seen.values()].slice(0, 8)
}

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const nl = (s = '') => esc(s).replace(/\n/g, '<br>')
const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Papel timbrado da empresa: logo no topo, marca-d'água e rodapé. */
export function letterhead(e: Entity | undefined, body: string, title: string) {
  const color = e?.color ?? '#333'
  const footer = e?.footer
    ? `<img class="foot-img" src="${e.footer}" alt="">`
    : `<div class="foot-txt">${e?.tagline ? `<b>${esc(e.tagline)}</b><br>` : ''}${[e?.doc && `CNPJ ${esc(e.doc)}`, e?.phone && esc(e.phone), e?.email && esc(e.email)].filter(Boolean).join('  |  ')}</div>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;color:#111;font-size:12.5px;background:#e9eaee}
.sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;position:relative;padding:12mm 16mm 34mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.logo{text-align:center;margin-bottom:8mm}.logo img{max-height:26mm;max-width:120mm}
.logo b{font-size:30px;color:${color}}
.wm{position:absolute;inset:60mm 18mm 50mm;background:url('${e?.watermark ?? ''}') center/contain no-repeat;opacity:${e?.watermark ? 0.55 : 0};pointer-events:none}
.content{position:relative}
h2{color:${color};font-size:14px;margin:7mm 0 3mm;font-weight:700;text-transform:uppercase}
h2 span{margin-right:6px}
p{line-height:1.5}
table{width:100%;border-collapse:collapse;background:transparent}
td,th{border:1px solid #333;padding:3px 6px;vertical-align:middle}
.info td:first-child{width:50%;font-weight:700}
.items th{font-weight:700;text-align:center;font-size:12px}
.items td.n{width:22px;text-align:center}.items td.c{text-align:center}.items td.r{text-align:right;white-space:nowrap}
.items tr.tot td{font-weight:700}
.stamp{margin-top:14mm;margin-left:auto;width:85mm;height:38mm;border:1px dashed #bbb;border-radius:4px;display:flex;align-items:flex-end;justify-content:center;color:#999;font-size:10.5px;padding:4px}
.foot{position:absolute;left:16mm;right:16mm;bottom:8mm;text-align:center}
.foot-img{width:100%;max-height:26mm;object-fit:contain}
.foot-txt{border-top:2px solid ${color};padding-top:4px;font-size:10.5px;color:#333}
.bar{position:fixed;top:10px;right:10px;z-index:5}.bar button{padding:10px 16px;border:0;border-radius:8px;background:${color};color:#fff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}
@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;width:auto;min-height:0;height:297mm}.stamp{border-color:transparent;color:transparent}.bar{display:none}@page{size:A4;margin:0}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir / salvar PDF</button></div>
<div class="sheet"><div class="wm"></div>
<div class="logo">${e?.logo ? `<img src="${e.logo}" alt="${esc(e.name)}">` : `<b>${esc(e?.name)}</b>`}</div>
<div class="content">${body}</div>
<div class="foot">${footer}</div>
</div></body></html>`
}

/** Abre o orçamento no papel timbrado da empresa, pronto para imprimir, carimbar e assinar. */
export function printQuote(d: Data, q: Quote) {
  const e = d.entities.find((x) => x.id === q.entityId)
  const t = quoteTotals(q)
  let body: string
  if (q.model === 'pdde') {
    const rows = q.items.map((i, n) => `<tr><td class="n">${n + 1}</td><td>${esc(i.description)}</td><td class="c">${i.qty ? i.qty.toLocaleString('pt-BR') : ''}</td><td class="c">${esc(i.unit)}</td><td class="r">${i.price && i.qty ? num(i.price) : ''}</td><td class="r">${num(itemTotal(i))}</td></tr>`).join('')
    body = `
<h2><span>1.</span> Orçamento destinado a:</h2>
<table class="info"><tr><td>CNPJ da APM</td><td>${esc(q.apmCnpj)}</td></tr><tr><td>Nome da APM</td><td>${esc(q.apmName)}</td></tr><tr><td>Subprograma do PDDE Paulista</td><td>${esc(q.subprogram)}</td></tr><tr><td>Ano de Exercício</td><td>${esc(q.exercise)}</td></tr></table>
<h2><span>2.</span> Dados do proponente:</h2>
<table class="info"><tr><td>CNPJ</td><td>${esc(e?.doc)}</td></tr><tr><td>Razão Social</td><td>${esc(e?.legalName || e?.name)}</td></tr><tr><td>Endereço</td><td>${esc([e?.address, e?.district].filter(Boolean).join(' - '))}</td></tr><tr><td>Telefone para Contato</td><td>${esc(e?.phone)}</td></tr><tr><td>Data de Emissão do Orçamento</td><td>${fmtDate(q.date)}</td></tr><tr><td>Prazo de Validade do Orçamento</td><td>${q.validDays} dias</td></tr><tr><td>Pessoa Responsável pela Empresa</td><td>${esc(q.contactName)}</td></tr><tr><td>Condição de Pagamento</td><td>${esc(q.payment)}</td></tr></table>
<h2><span>3.</span> Dados do orçamento:</h2>
<table class="items"><thead><tr><th></th><th>Descrição dos Serviços</th><th style="width:48px">Qtd<br>(un.)</th><th style="width:86px">Unidade de<br>Fornecimento</th><th style="width:70px">Valor<br>un. (R$)</th><th style="width:92px">Valor Total</th></tr></thead>
<tbody>${rows}<tr class="tot"><td></td><td colspan="4">Total</td><td class="r">${money(t.total)}</td></tr></tbody></table>
<div class="stamp">carimbo do CNPJ e assinatura</div>`
  } else {
    const groups = [...new Set(q.items.map((i) => i.group ?? ''))]
    const rows = groups.map((g, gi) => {
      const items = q.items.filter((i) => (i.group ?? '') === g)
      const head = g ? `<tr class="tot"><td colspan="5">${esc(g)}</td><td class="r">${num(items.reduce((s, i) => s + itemTotal(i), 0))}</td></tr>` : ''
      return head + items.map((i, ii) => `<tr><td class="n">${gi + 1}.${ii + 1}</td><td>${esc(i.description)}</td><td class="c">${esc(i.unit)}</td><td class="c">${i.qty.toLocaleString('pt-BR')}</td><td class="r">${num(i.price)}</td><td class="r">${num(itemTotal(i))}</td></tr>`).join('')
    }).join('')
    body = `
<h2><span>1.</span> Orçamento nº ${esc(q.number)}</h2>
<table class="info"><tr><td>Cliente</td><td>${esc(q.client)}${q.clientDoc ? ` – ${esc(q.clientDoc)}` : ''}</td></tr>${q.title ? `<tr><td>Serviço</td><td>${esc(q.title)}</td></tr>` : ''}${q.address ? `<tr><td>Local da obra</td><td>${esc(q.address)}</td></tr>` : ''}<tr><td>Data</td><td>${fmtDate(q.date)}</td></tr><tr><td>Validade</td><td>${q.validDays} dias (até ${fmtDate(addDays(q.date, q.validDays))})</td></tr></table>
<h2><span>2.</span> Serviços</h2>
<table class="items"><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Valor un.</th><th>Total</th></tr></thead><tbody>${rows}
${t.bdi ? `<tr><td></td><td colspan="4">BDI (${q.bdi.toLocaleString('pt-BR')}%)</td><td class="r">${num(t.bdi)}</td></tr>` : ''}${q.discount ? `<tr><td></td><td colspan="4">Desconto</td><td class="r">− ${num(q.discount)}</td></tr>` : ''}
<tr class="tot"><td></td><td colspan="4">Total (${esc(extenso(t.total))})</td><td class="r">${money(t.total)}</td></tr></tbody></table>
${q.deadline || q.payment || q.notes ? `<h2><span>3.</span> Condições</h2><p>${q.deadline ? `<b>Prazo:</b> ${nl(q.deadline)}<br>` : ''}${q.payment ? `<b>Pagamento:</b> ${nl(q.payment)}<br>` : ''}${q.notes ? nl(q.notes) : ''}</p>` : ''}
<div class="stamp">carimbo do CNPJ e assinatura</div>`
  }
  openDocument(letterhead(e, body, `Orçamento ${q.number} – ${quoteClient(q)}`), `Orçamento nº ${q.number} · ${entityName(d, q.entityId)}`)
}
