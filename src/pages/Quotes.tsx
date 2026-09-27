import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Data, Quote, QuoteItem } from '../types'
import { Badge, Empty, Field, MoneyInput, NumInput, Stat, confirmDialog, openDocument, toast } from '../components/ui'
import { addDays, entityName, extenso, fmtDate, money, today, uid } from '../utils'

const STATUS: Record<Quote['status'], [string, 'muted' | 'info' | 'good' | 'bad']> = {
  rascunho: ['Rascunho', 'muted'],
  enviado: ['Enviado', 'info'],
  aprovado: ['Aprovado', 'good'],
  recusado: ['Recusado', 'bad'],
}
const UNITS = ['m²', 'm³', 'm', 'un', 'vb', 'kg', 'h', 'dia', 'mês', 'pt', 'cj']

export const quoteTotals = (q: Quote) => {
  const direct = q.items.reduce((s, i) => s + i.qty * i.price, 0)
  const bdi = (direct * (q.bdi || 0)) / 100
  return { direct, bdi, total: Math.max(0, direct + bdi - (q.discount || 0)) }
}

export function Quotes({ id }: { id?: string }) {
  if (id) return <QuoteEditor id={id} />
  return <QuoteList />
}

function QuoteList() {
  const { data, save } = useStore()
  const scope = data.settings.scope
  const [status, setStatus] = useState<'' | Quote['status']>('')
  const list = data.quotes.filter((q) => (scope === 'all' || q.entityId === scope) && (!status || q.status === status)).sort((a, b) => b.date.localeCompare(a.date))
  const all = data.quotes.filter((q) => scope === 'all' || q.entityId === scope)
  const sum = (s: Quote['status']) => all.filter((q) => q.status === s).reduce((t, q) => t + quoteTotals(q).total, 0)
  const decided = all.filter((q) => q.status === 'aprovado' || q.status === 'recusado')
  const create = () => {
    const ent = scope !== 'all' && data.entities.find((e) => e.id === scope)?.kind === 'empresa' ? scope : data.entities.find((e) => e.kind === 'empresa')!.id
    const year = today().slice(0, 4)
    const n = data.quotes.filter((q) => q.date.startsWith(year)).length + 1
    const q: Quote = {
      id: uid(), number: `${String(n).padStart(3, '0')}/${year}`, entityId: ent, client: '', title: '', date: today(), validDays: 30,
      payment: 'Conforme medições mensais dos serviços executados.', deadline: '', bdi: 0, discount: 0, status: 'rascunho',
      items: [{ id: uid(), group: '1. Serviços preliminares', description: '', unit: 'vb', qty: 1, price: 0 }],
    }
    save('quotes', q)
    go(`/orcamentos/${q.id}`)
  }
  return (
    <div className="page">
      <div className="page-head"><h1>Orçamentos</h1><button className="btn primary" onClick={create}>+ Novo orçamento</button></div>
      <div className="stats">
        <Stat label="Aguardando resposta" value={money(sum('enviado'))} sub={`${all.filter((q) => q.status === 'enviado').length} orçamento(s)`} tone="info" />
        <Stat label="Aprovados" value={money(sum('aprovado'))} sub={`${all.filter((q) => q.status === 'aprovado').length} orçamento(s)`} tone="good" />
        <Stat label="Taxa de aprovação" value={decided.length ? `${Math.round((all.filter((q) => q.status === 'aprovado').length / decided.length) * 100)}%` : '—'} />
      </div>
      <div className="seg compact">
        {([['', 'Todos'], ['rascunho', 'Rascunhos'], ['enviado', 'Enviados'], ['aprovado', 'Aprovados'], ['recusado', 'Recusados']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      {!list.length ? <Empty title="Nenhum orçamento" text="Monte o orçamento com as etapas e itens, e gere o PDF com o logotipo da empresa." action={<button className="btn primary" onClick={create}>Fazer orçamento</button>} /> : (
        <div className="txlist">
          {list.map((q) => (
            <a key={q.id} className="tx" href={`#/orcamentos/${q.id}`}>
              <div className="tx-date"><span>{q.number.split('/')[0]}</span><small>{fmtDate(q.date).slice(0, 5)}</small></div>
              <div className="tx-main"><strong>{q.title || 'Sem título'}</strong><span className="tx-meta">{q.client || 'sem cliente'} · {entityName(data, q.entityId)}</span></div>
              <div className="tx-right"><span className="tx-amount">{money(quoteTotals(q).total)}</span><Badge tone={STATUS[q.status][1]}>{STATUS[q.status][0]}</Badge></div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function QuoteEditor({ id }: { id: string }) {
  const { data, save, remove } = useStore()
  const q = data.quotes.find((x) => x.id === id)
  if (!q) return <div className="page"><Empty title="Orçamento não encontrado" action={<a className="btn" href="#/orcamentos">Voltar</a>} /></div>
  const set = (x: Partial<Quote>) => save('quotes', { ...q, ...x })
  const setItem = (iid: string, x: Partial<QuoteItem>) => set({ items: q.items.map((i) => (i.id === iid ? { ...i, ...x } : i)) })
  const addItem = (group?: string) => set({ items: [...q.items, { id: uid(), group: group ?? q.items[q.items.length - 1]?.group, description: '', unit: 'm²', qty: 1, price: 0 }] })
  const addGroup = () => {
    const n = new Set(q.items.map((i) => i.group)).size + 1
    addItem(`${n}. Nova etapa`)
  }
  const renameGroup = (old: string | undefined, name: string) => set({ items: q.items.map((i) => (i.group === old ? { ...i, group: name } : i)) })
  const move = (iid: string, dir: -1 | 1) => {
    const i = q.items.findIndex((x) => x.id === iid)
    const j = i + dir
    if (j < 0 || j >= q.items.length) return
    const items = [...q.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    set({ items })
  }
  const t = quoteTotals(q)
  const groups = [...new Set(q.items.map((i) => i.group ?? ''))]

  const approve = async () => {
    if (!(await confirmDialog(`Marcar como aprovado e criar a obra "${q.title || q.client}" com contrato de ${money(t.total)}?`, 'Aprovar e criar obra', false))) return
    const pid = uid()
    save('projects', { id: pid, name: q.title || `Obra ${q.client}`, entityId: q.entityId, kind: /escola/i.test(`${q.title} ${q.client}`) ? 'reforma_escola' : /reforma/i.test(q.title) ? 'reforma' : 'construcao', status: 'andamento', client: q.client, address: q.address, contractValue: t.total, budget: Math.round(t.direct * 100) / 100, start: today(), notes: `Criada do orçamento nº ${q.number}` })
    save('quotes', { ...q, status: 'aprovado', projectId: pid })
    toast('Obra criada')
    go(`/obras/${pid}`)
  }
  const duplicate = () => {
    const year = today().slice(0, 4)
    const n = data.quotes.filter((x) => x.date.startsWith(year)).length + 1
    const c: Quote = { ...q, id: uid(), number: `${String(n).padStart(3, '0')}/${year}`, date: today(), status: 'rascunho', projectId: undefined, items: q.items.map((i) => ({ ...i, id: uid() })) }
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
        <div><h1>Orçamento nº {q.number}</h1><p className="muted">{q.client || 'Cliente'} · {money(t.total)}</p></div>
        <div className="row wrap">
          <select value={q.status} onChange={(e) => set({ status: e.target.value as Quote['status'] })} aria-label="Situação do orçamento">
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn primary" onClick={() => printQuote(data, q)}>Gerar PDF</button>
        </div>
      </div>

      <section className="card">
        <div className="grid-form three">
          <Field label="Empresa">
            <select value={q.entityId} onChange={(e) => set({ entityId: e.target.value })} aria-label="Empresa do orçamento">
              {data.entities.filter((e) => e.kind === 'empresa').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Número"><input value={q.number} onChange={(e) => set({ number: e.target.value })} aria-label="Número" /></Field>
          <Field label="Data"><input type="date" value={q.date} onChange={(e) => set({ date: e.target.value })} aria-label="Data" /></Field>
          <Field label="Cliente" span={2}><input value={q.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nome do cliente, prefeitura, escola…" aria-label="Cliente" /></Field>
          <Field label="CPF / CNPJ do cliente"><input value={q.clientDoc ?? ''} onChange={(e) => set({ clientDoc: e.target.value })} aria-label="Documento do cliente" /></Field>
          <Field label="Serviço / objeto" span={2}><input value={q.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Reforma da cobertura e pintura geral" aria-label="Objeto" /></Field>
          <Field label="Contato (telefone / e-mail)"><input value={q.clientContact ?? ''} onChange={(e) => set({ clientContact: e.target.value })} aria-label="Contato" /></Field>
          <Field label="Local da obra" span={3}><input value={q.address ?? ''} onChange={(e) => set({ address: e.target.value })} aria-label="Local da obra" /></Field>
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
                  <NumInput value={i.qty} step={0.01} onChange={(v) => setItem(i.id, { qty: v })} ariaLabel="Quantidade" />
                  <MoneyInput value={i.price} onChange={(v) => setItem(i.id, { price: v })} ariaLabel="Preço unitário" />
                  <b className="r">{money(i.qty * i.price)}</b>
                  <span className="q-act">
                    <button className="icon-btn" onClick={() => move(i.id, -1)} aria-label="Subir">↑</button>
                    <button className="icon-btn" onClick={() => set({ items: q.items.filter((x) => x.id !== i.id) })} aria-label="Remover item">✕</button>
                  </span>
                </div>
              ))}
              <div className="row between">
                <button className="link" onClick={() => addItem(g || undefined)}>+ item nesta etapa</button>
                <small className="muted">Subtotal: <b>{money(q.items.filter((i) => (i.group ?? '') === g).reduce((s, i) => s + i.qty * i.price, 0))}</b></small>
              </div>
            </div>
          </div>
        ))}
        <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        <button className="btn small" onClick={addGroup}>+ Nova etapa</button>
      </section>

      <div className="cols even">
        <section className="card">
          <div className="card-head"><h2>Condições</h2></div>
          <div className="grid-form">
            <Field label="Validade (dias)"><NumInput value={q.validDays} min={1} onChange={(v) => set({ validDays: v })} ariaLabel="Validade" /></Field>
            <Field label="Prazo de execução"><input value={q.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} placeholder="Ex.: 90 dias" aria-label="Prazo" /></Field>
            <Field label="Forma de pagamento" span={2}><textarea rows={2} value={q.payment ?? ''} onChange={(e) => set({ payment: e.target.value })} aria-label="Pagamento" /></Field>
            <Field label="Observações" span={2}><textarea rows={3} value={q.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="O que está incluso, o que não está, garantia…" aria-label="Observações do orçamento" /></Field>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Total</h2></div>
          <div className="kv"><span>Custo dos itens</span><b>{money(t.direct)}</b></div>
          <div className="kv"><span>BDI (lucro + despesas indiretas)</span><span className="row"><NumInput value={q.bdi} min={0} step={0.5} onChange={(v) => set({ bdi: v })} suffix="%" ariaLabel="BDI" /> <b>{money(t.bdi)}</b></span></div>
          <div className="kv"><span>Desconto</span><MoneyInput value={q.discount} onChange={(v) => set({ discount: v })} ariaLabel="Desconto" /></div>
          <div className="kv total"><span>Valor final</span><b>{money(t.total)}</b></div>
          <small className="muted">{extenso(t.total)}</small>
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

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const nl = (s = '') => esc(s).replace(/\n/g, '<br>')

/** Abre o orçamento formatado com o logo e a cor da empresa, pronto para imprimir / salvar em PDF. */
export function printQuote(d: Data, q: Quote) {
  const e = d.entities.find((x) => x.id === q.entityId)
  const t = quoteTotals(q)
  const color = e?.color ?? '#333'
  const groups = [...new Set(q.items.map((i) => i.group ?? ''))]
  const rows = groups.map((g, gi) => {
    const items = q.items.filter((i) => (i.group ?? '') === g)
    const sub = items.reduce((s, i) => s + i.qty * i.price, 0)
    const head = g ? `<tr class="grp"><td colspan="5">${esc(g)}</td><td class="r">${money(sub)}</td></tr>` : ''
    return head + items.map((i, ii) => { return `<tr><td>${gi + 1}.${ii + 1}</td><td>${esc(i.description)}</td><td class="c">${esc(i.unit)}</td><td class="r">${i.qty.toLocaleString('pt-BR')}</td><td class="r">${money(i.price)}</td><td class="r">${money(i.qty * i.price)}</td></tr>` }).join('')
  }).join('')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento ${esc(q.number)} – ${esc(q.client)}</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#1d2530;margin:0;padding:28px;font-size:12.5px}
.head{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:3px solid ${color};padding-bottom:14px}
.head img{max-height:80px;max-width:220px}.head .co{text-align:right;font-size:11.5px;color:#444;line-height:1.5}.head .co b{font-size:15px;color:#1d2530}
h1{font-size:19px;margin:22px 0 4px;letter-spacing:.04em}.sub{color:#555;margin:0 0 14px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f5f6f8;padding:12px 14px;border-radius:6px;margin-bottom:16px}
.info div span{color:#666}
table{width:100%;border-collapse:collapse}th{background:${color};color:#fff;text-align:left;padding:7px 8px;font-size:11.5px}
td{padding:6px 8px;border-bottom:1px solid #e3e5e8;vertical-align:top}.r{text-align:right;white-space:nowrap}.c{text-align:center}
tr.grp td{background:#eef0f3;font-weight:700}
.tot{margin-left:auto;width:320px;margin-top:12px}.tot div{display:flex;justify-content:space-between;padding:5px 0}.tot .big{border-top:2px solid ${color};font-size:16px;font-weight:700;padding-top:8px}
.ext{text-align:right;color:#555;font-style:italic;margin-top:2px}
.cond{margin-top:22px;line-height:1.6}.cond h3{font-size:13px;margin:14px 0 4px;color:${color}}
.sign{margin-top:60px;display:flex;justify-content:space-around;text-align:center}.sign div{border-top:1px solid #1d2530;width:260px;padding-top:6px}
.bar{position:fixed;top:12px;right:12px}.bar button{padding:10px 16px;border:0;border-radius:8px;background:${color};color:#fff;font-size:14px;cursor:pointer}
@media print{.bar{display:none}body{padding:0}@page{margin:14mm}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir / salvar PDF</button></div>
<div class="head">
  <div>${e?.logo ? `<img src="${e.logo}" alt="">` : `<b style="font-size:26px;color:${color}">${esc(e?.name)}</b>`}</div>
  <div class="co"><b>${esc(e?.name)}</b><br>${e?.doc ? `CNPJ ${esc(e.doc)}<br>` : ''}${e?.address ? `${esc(e.address)}<br>` : ''}${[e?.phone, e?.email].filter(Boolean).map((x) => esc(x)).join(' · ')}</div>
</div>
<h1>ORÇAMENTO Nº ${esc(q.number)}</h1>
<p class="sub">${esc(q.title)}</p>
<div class="info">
  <div><span>Cliente:</span> <b>${esc(q.client)}</b></div><div><span>Data:</span> ${fmtDate(q.date)}</div>
  ${q.clientDoc ? `<div><span>CPF/CNPJ:</span> ${esc(q.clientDoc)}</div>` : ''}${q.clientContact ? `<div><span>Contato:</span> ${esc(q.clientContact)}</div>` : ''}
  ${q.address ? `<div style="grid-column:1/-1"><span>Local da obra:</span> ${esc(q.address)}</div>` : ''}
</div>
<table><thead><tr><th style="width:44px">Item</th><th>Descrição</th><th class="c" style="width:50px">Un.</th><th class="r" style="width:70px">Qtd.</th><th class="r" style="width:100px">Preço unit.</th><th class="r" style="width:110px">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">
  ${t.bdi || q.discount ? `<div><span>Subtotal</span><span>${money(t.direct)}</span></div>` : ''}
  ${t.bdi ? `<div><span>BDI (${q.bdi.toLocaleString('pt-BR')}%)</span><span>${money(t.bdi)}</span></div>` : ''}
  ${q.discount ? `<div><span>Desconto</span><span>− ${money(q.discount)}</span></div>` : ''}
  <div class="big"><span>VALOR TOTAL</span><span>${money(t.total)}</span></div>
</div>
<div class="ext">(${esc(extenso(t.total))})</div>
<div class="cond">
  ${q.deadline ? `<h3>Prazo de execução</h3>${nl(q.deadline)}` : ''}
  ${q.payment ? `<h3>Forma de pagamento</h3>${nl(q.payment)}` : ''}
  <h3>Validade da proposta</h3>${q.validDays} dias (até ${fmtDate(addDays(q.date, q.validDays))}).
  ${q.notes ? `<h3>Observações</h3>${nl(q.notes)}` : ''}
</div>
<div class="sign"><div>${esc(e?.responsible || e?.name)}<br><small>${esc(e?.name)}</small></div><div>De acordo – ${esc(q.client)}</div></div>
</body></html>`
  openDocument(html, `Orçamento nº ${q.number}`)
}
