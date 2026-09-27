import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Client, Data, Entity, Quote, QuoteItem, QuoteTheme } from '../types'
import carlito400 from '@fontsource/carlito/files/carlito-latin-400-normal.woff2?inline'
import carlito700 from '@fontsource/carlito/files/carlito-latin-700-normal.woff2?inline'
import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff2?inline'
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff2?inline'
import { Attachments } from '../components/Attachments'
import { Icon } from '../components/Icon'
import { EntityForm } from './Profiles'
import { ClientForm } from './Clients'
import { Badge, EntityMark, Empty, Field, Modal, MoneyInput, NumInput, Stat, confirmDialog, openDocument, toast } from '../components/ui'
import { downloadPdf } from '../pdf'
import { ownedBy, addDays, entityName, extenso, fmtDate, money, today, uid } from '../utils'

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
  const { data, save, setSettings } = useStore()
  const scope = data.settings.scope
  const [status, setStatus] = useState<'' | Quote['status']>('')
  const [q, setQ] = useState('')
  const all = data.quotes.filter((x) => ownedBy(x.entityId, scope))
  const list = all
    .filter((x) => (!status || x.status === status) && (!q || `${quoteClient(x)} ${x.title} ${x.number}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date))
  const sum = (s: Quote['status']) => all.filter((x) => x.status === s).reduce((t, x) => t + quoteTotals(x).total, 0)
  const decided = all.filter((x) => x.status === 'aprovado' || x.status === 'recusado')

  const [picking, setPicking] = useState<'pdde' | 'padrao' | null>(null)
  const companies = [...data.entities.filter((e) => e.kind === 'empresa')].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
  const create = (model: 'pdde' | 'padrao') => setPicking(model)
  const createWith = (model: 'pdde' | 'padrao', entId: string) => {
    setPicking(null)
    const ent = companies.find((e) => e.id === entId) ?? companies[0]
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
    setSettings({ lastEntity: ent.id })
    go(`/orcamentos/${quote.id}`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Orçamentos</h1>
        <div className="row wrap">
          <button className="btn primary" onClick={() => create('pdde')}>+ Orçamento para escola (PDDE)</button>
          <button className="btn" onClick={() => create('padrao')}>+ Orçamento comum</button>
          <a className="btn" href="./planilhas/Precificacao-obras-e-servicos.xlsx" download>Planilha de preços (Excel)</a>
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
              <a key={x.id} className="tx with-mark" href={`#/orcamentos/${x.id}`}>
                <EntityMark e={e} size={40} />
                <div className="tx-main">
                  <strong>{quoteClient(x) || 'Sem cliente'}</strong>
                  <span className="tx-meta">nº {x.number} · {fmtDate(x.date)} · {e?.name}{x.model === 'pdde' ? ` · ${x.subprogram ?? 'PDDE'}` : x.title ? ` · ${x.title}` : ''}{x.files?.length ? ' · assinado anexado' : ''}</span>
                </div>
                <div className="tx-right"><span className="tx-amount">{money(quoteTotals(x).total)}</span><Badge tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge></div>
              </a>
            )
          })}
        </div>
      )}
      {picking && (
        <Modal title={picking === 'pdde' ? 'Orçamento para escola: qual empresa?' : 'Novo orçamento: qual empresa?'} onClose={() => setPicking(null)}>
          <p className="muted small" style={{ marginTop: 0 }}>O papel timbrado, o CNPJ e o nome do PDF vêm da empresa escolhida. Dá para trocar depois.</p>
          <div className="pick-co">
            {companies.map((e) => (
              <button key={e.id} className={e.id === data.settings.lastEntity ? 'on' : ''} onClick={() => createWith(picking, e.id)}>
                {e.logo ? <img src={e.logo} alt="" /> : <span className="ph" style={{ background: e.color }}>{e.name.slice(0, 2)}</span>}
                <b>{e.name}</b>
                <small>{e.doc || 'CNPJ não informado'}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function QuoteEditor({ id }: { id: string }) {
  const { data, save, remove, setSettings } = useStore()
  const [entForm, setEntForm] = useState<Partial<Entity> | null>(null)
  const [clientForm, setClientForm] = useState<Partial<Client> | null>(null)
  const q = data.quotes.find((x) => x.id === id)
  if (!q) return <div className="page"><Empty title="Orçamento não encontrado" action={<a className="btn" href="#/orcamentos">Voltar</a>} /></div>
  const pdde = q.model === 'pdde'
  const ent = data.entities.find((e) => e.id === q.entityId)
  const schools = data.clients.filter((c) => c.kind === 'escola' && !c.archived).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name))
  const others = data.clients.filter((c) => c.kind !== 'escola' && !c.archived).sort((a, b) => a.name.localeCompare(b.name))
  const fillFrom = (c: Client): Partial<Quote> => (pdde
    ? { clientId: c.id, apmName: c.apm || c.name.toUpperCase(), apmCnpj: c.doc, client: c.name }
    : { clientId: c.id, client: c.name, clientDoc: c.doc, clientContact: [c.contact, c.phone].filter(Boolean).join(' · '), address: c.address ?? q.address })
  const pickClient = (id: string) => {
    const c = data.clients.find((x) => x.id === id)
    set(c ? fillFrom(c) : { clientId: undefined })
  }
  const clientFormEl = clientForm && <ClientForm initial={clientForm} onClose={() => setClientForm(null)} onSaved={(c) => set(fillFrom(c))} />
  const entFormEl = entForm && <EntityForm initial={entForm} onClose={() => setEntForm(null)} onSaved={(e) => { if (!entForm.id) changeEntity(e.id) }} />
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
    <div className="page quote-page">
      <a className="back" href="#/orcamentos">‹ Orçamentos</a>
      <div className="page-head">
        <div className="row" style={{ gap: 16 }}>
          {ent?.logo && <img className="quote-logo" src={ent.logo} alt={ent.name} />}
          <div><h1>Orçamento nº {q.number}</h1><p className="muted">{client || 'Cliente'} · {fmtDate(q.date)} · {money(t.total)}</p></div>
        </div>
        <div className="row wrap">
          <select value={q.status} onChange={(e) => set({ status: e.target.value as Quote['status'] })} aria-label="Situação do orçamento">
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn" onClick={() => printQuote(data, q)}>Ver / imprimir</button>
          <button className="btn primary" onClick={() => downloadQuotePdf(data, q)}>Baixar PDF</button>
        </div>
      </div>

      <div className="q-layout">
      <div className="q-form">
      <section className="card">
        <div className="card-head"><h2>Dados</h2></div>
        <div className="q-top">
          <Field label="Empresa que está orçando" hint="O papel timbrado, o CNPJ e o nome do PDF vêm desta empresa.">
            <div className="row">
              <select value={q.entityId} onChange={(e) => changeEntity(e.target.value)} aria-label="Empresa do orçamento" style={{ flex: 1 }}>
                {data.entities.filter((e) => e.kind === 'empresa').map((e) => <option key={e.id} value={e.id}>{e.name}{e.doc ? ` · ${e.doc}` : ''}</option>)}
              </select>
              <button className="btn icon-only" onClick={() => setEntForm(ent ?? {})} title="Editar dados da empresa" aria-label="Editar dados da empresa"><Icon name="pencil" size={17} /></button>
              <button className="btn icon-only" onClick={() => setEntForm({})} title="Cadastrar nova empresa" aria-label="Cadastrar nova empresa"><Icon name="plus" size={17} /></button>
            </div>
          </Field>
          <Field label="Nº e data" hint="Vão no PDF, no nome do arquivo e na lista.">
            <div className="row">
              <input value={q.number} onChange={(e) => set({ number: e.target.value })} aria-label="Número" style={{ width: 110 }} />
              <input type="date" value={q.date} onChange={(e) => set({ date: e.target.value })} aria-label="Data de emissão" style={{ flex: 1 }} />
            </div>
          </Field>
        </div>
        <div className="q-model">
          <span className="field-label">Modelo</span>
          <div className="seg">
            <button className={pdde ? 'on' : ''} onClick={() => set({ model: 'pdde' })}>Escola (PDDE / APM)</button>
            <button className={!pdde ? 'on' : ''} onClick={() => set({ model: 'padrao' })}>Orçamento comum</button>
          </div>
        </div>
      </section>

      {pdde ? (
        <>
          <section className="card">
            <div className="card-head"><h2>1. Orçamento destinado a</h2><a className="link" href="#/clientes">cadastro de escolas</a></div>
            <Field label="Escola" hint="Escolha na lista: nome e CNPJ da APM entram sozinhos. Ou preencha à mão abaixo.">
              <div className="row">
                <select value={q.clientId ?? ''} onChange={(e) => pickClient(e.target.value)} aria-label="Escola cadastrada" style={{ flex: 1 }}>
                  <option value="">Selecione…</option>
                  {schools.map((c) => <option key={c.id} value={c.id}>{c.name}{c.doc ? ` · ${c.doc}` : ''}</option>)}
                </select>
                {q.clientId && <button className="btn icon-only" onClick={() => setClientForm(data.clients.find((c) => c.id === q.clientId) ?? null)} title="Editar escola" aria-label="Editar escola"><Icon name="pencil" size={17} /></button>}
                <button className="btn icon-only" onClick={() => setClientForm({ kind: 'escola' })} title="Nova escola" aria-label="Nova escola"><Icon name="plus" size={17} /></button>
              </div>
            </Field>
            <div className="grid-form" style={{ marginTop: 14 }}>
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
            <Field label="Cliente cadastrado" hint="Escolha na lista ou preencha os dados à mão abaixo.">
              <div className="row">
                <select value={q.clientId ?? ''} onChange={(e) => pickClient(e.target.value)} aria-label="Cliente cadastrado" style={{ flex: 1 }}>
                  <option value="">Selecione…</option>
                  {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {q.clientId && <button className="btn icon-only" onClick={() => setClientForm(data.clients.find((c) => c.id === q.clientId) ?? null)} title="Editar cliente" aria-label="Editar cliente"><Icon name="pencil" size={17} /></button>}
                <button className="btn icon-only" onClick={() => setClientForm({ kind: 'particular' })} title="Novo cliente" aria-label="Novo cliente"><Icon name="plus" size={17} /></button>
              </div>
            </Field>
            <div className="grid-form three" style={{ marginTop: 14 }}>
              <Field label="Cliente" span={2}><input value={q.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nome do cliente" aria-label="Cliente" /></Field>
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
      <aside className="q-preview">
        <QuotePreview html={quoteHtml(data, q)} />
        <div className="row wrap q-preview-actions">
          <button className="btn small" onClick={() => printQuote(data, q)}>Abrir em tela cheia</button>
          <button className="btn small primary" onClick={() => downloadQuotePdf(data, q)}>Baixar PDF</button>
        </div>
        <small className="muted">Pré-visualização do PDF · papel timbrado da {ent?.name}</small>
      </aside>
      </div>
      {entFormEl}
      {clientFormEl}
    </div>
  )
}

/** Miniatura viva do PDF (folha A4 em escala), atualiza enquanto ele digita. */
function QuotePreview({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(360)
  const [doc, setDoc] = useState(html)
  useEffect(() => { const t = setTimeout(() => setDoc(html), 350); return () => clearTimeout(t) }, [html])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = w / 794
  const clean = doc.replace('</head>', '<style>.bar{display:none!important}html,body{background:#fff!important;overflow:hidden}.sheet{margin:0!important;box-shadow:none!important}</style></head>')
  return (
    <div className="q-sheet" ref={box} style={{ height: 1123 * scale }}>
      <iframe title="Pré-visualização do orçamento" srcDoc={clean} style={{ width: 794, height: 1123, transform: `scale(${scale})` }} tabIndex={-1} />
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

/** Papel timbrado da empresa, montado em pontos (pt) da folha A4 igual aos modelos originais:
 *  logo, marca-d'água e rodapé nas mesmas posições, Calibri (Carlito) ou Arial (Arimo), títulos na cor da empresa. */
export function letterhead(e: Entity | undefined, body: string, title: string) {
  const th: QuoteTheme = e?.quoteTheme ?? { font: 'calibri', heading: e?.color ?? '#333', headingSize: 11, labelSize: 10, logo: [148, 30, 300, 90], top: 150 }
  const fam = (f?: string) => (f === 'arial' ? "Arimo, Arial, Helvetica, sans-serif" : "Carlito, Calibri, 'Segoe UI', sans-serif")
  const box = (b?: number[]) => (b ? `left:${b[0]}pt;top:${b[1]}pt;width:${b[2]}pt;height:${b[3]}pt` : '')
  let footer = ''
  if (e?.footer) footer = `<img class="foot-img" style="${box(th.footer ?? [41, 719, 513, 74])}" src="${e.footer}" alt="">`
  else {
    const [brand, rest] = (e?.tagline ?? '').includes(' - ') ? [e!.tagline!.split(' - ')[0], e!.tagline!.split(' - ').slice(1).join(' - ')] : ['', e?.tagline ?? '']
    footer = `<div class="foot-txt">${brand ? `<b class="brand">${esc(brand)} -</b> ` : ''}${esc(rest)}<br>${[e?.doc && `CNPJ ${esc(e.doc)}`, e?.email && esc(e.email)].filter(Boolean).join('&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;')}</div>`
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@font-face{font-family:Carlito;font-weight:400;src:url(${carlito400}) format('woff2')}
@font-face{font-family:Carlito;font-weight:700;src:url(${carlito700}) format('woff2')}
@font-face{font-family:Arimo;font-weight:400;src:url(${arimo400}) format('woff2')}
@font-face{font-family:Arimo;font-weight:700;src:url(${arimo700}) format('woff2')}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:${fam(th.font)};color:#000;font-size:10pt;background:#e9eaee}
.sheet{width:595pt;height:842pt;margin:12px auto;background:#fff;position:relative;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.logo{position:absolute;${box(th.logo)};display:flex;align-items:center;justify-content:center}
.logo img{max-width:100%;max-height:100%;object-fit:contain}
.logo b{font-size:28pt;color:${th.heading}}
.wm{position:absolute;${box(th.wm)};background:url('${e?.watermark ?? ''}') center/contain no-repeat;opacity:${e?.watermark && th.wm ? th.wmOpacity ?? 1 : 0}}
.content{position:absolute;left:85pt;top:${th.top}pt;width:425pt}
h2{font-family:${fam(th.font)};color:${th.heading};font-size:${th.headingSize}pt;margin:0 0 9pt 18pt;font-weight:700;text-transform:uppercase;line-height:1.2}
h2 span{display:inline-block;min-width:18pt}
table+h2{margin-top:25pt}
p{line-height:1.45;margin:6pt 0}
table{width:100%;border-collapse:collapse;background:transparent}
td,th{border:.75pt solid #000;padding:1.5pt 5pt;vertical-align:middle;line-height:1.15}
.info td{height:17pt}
.info td:first-child{width:190pt;font-weight:700;font-family:${fam(th.labelFont ?? th.font)};font-size:${th.labelSize}pt;color:#0d0d0d}
.items th{font-weight:700;text-align:center;font-size:${th.labelSize - 1}pt;height:34pt;font-family:${fam(th.labelFont ?? th.font)}}
.items td{font-size:9pt;height:17pt}
.items td.n{text-align:center;padding:0}.items td.c{text-align:center}.items td.r{text-align:right;white-space:nowrap}
.items tr.tot td{font-weight:700;font-size:${th.labelSize}pt}
.foot-img{position:absolute;object-fit:contain}
.foot-txt{position:absolute;left:40pt;right:40pt;bottom:30pt;text-align:center;font-size:8pt;color:#213260;line-height:1.5}
.foot-txt .brand{font-family:Arimo,Arial,sans-serif;font-weight:700;letter-spacing:.02em}
.bar{position:fixed;top:10px;right:10px;z-index:5}.bar button{padding:10px 16px;border:0;border-radius:8px;background:#222;color:#fff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}
@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.bar{display:none}@page{size:A4;margin:0}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir / salvar PDF</button></div>
<div class="sheet"><div class="wm"></div>
<div class="logo">${e?.logo ? `<img src="${e.logo}" alt="${esc(e.name)}">` : `<b>${esc(e?.name)}</b>`}</div>
<div class="content">${body}</div>
${footer}
</div></body></html>`
}

const pdfName = (d: Data, q: Quote) => `Orçamento ${q.number.replace('/', '-')} ${entityName(d, q.entityId)} - ${quoteClient(q) || 'cliente'}.pdf`

/** Gera o PDF do orçamento (papel timbrado) e baixa o arquivo. */
export async function downloadQuotePdf(d: Data, q: Quote) {
  toast('Gerando o PDF…')
  try {
    await downloadPdf(quoteHtml(d, q), pdfName(d, q))
    toast('PDF baixado')
  } catch (e) {
    if ((e as Error).message === 'preview') {
      toast('Na prévia o navegador bloqueia downloads. No site publicado o PDF baixa direto.', 'err')
      printQuote(d, q)
    } else {
      console.error(e)
      toast('Não consegui gerar o PDF. Use "Imprimir" e escolha "Salvar como PDF".', 'err')
    }
  }
}

/** Abre o orçamento no papel timbrado da empresa, pronto para imprimir, carimbar e assinar. */
export function printQuote(d: Data, q: Quote) {
  openDocument(quoteHtml(d, q), `Orçamento nº ${q.number} · ${entityName(d, q.entityId)}`)
}

function quoteHtml(d: Data, q: Quote): string {
  const e = d.entities.find((x) => x.id === q.entityId)
  const t = quoteTotals(q)
  let body: string
  if (q.model === 'pdde') {
    const quira = e?.quoteTheme?.variant === 'quira'
    const rows = q.items.map((i, n) => `<tr><td class="n">${n + 1}</td><td>${esc(i.description)}</td><td class="c">${i.qty ? i.qty.toLocaleString('pt-BR') : quira ? '-' : ''}</td><td class="c">${esc(i.unit)}</td><td class="r">${i.price && i.qty ? num(i.price) : ''}</td><td class="r">${num(itemTotal(i))}</td></tr>`).join('')
    const head = quira
      ? '<th style="width:13pt"></th><th>Descrição dos Serviços</th><th style="width:28pt;font-size:8pt">Qtd/<br>un.</th><th style="width:83pt">Unidade de<br>Fornecimento</th><th style="width:59pt">Valor un.</th><th style="width:69pt">Valor Total</th>'
      : '<th style="width:17pt"></th><th>Descrição dos Serviços</th><th style="width:35pt">Qtd<br>(un.)</th><th style="width:76pt">Unidade de<br>Fornecimento</th><th style="width:62pt">Valor<br>un. (R$)</th><th style="width:62pt">Valor Total</th>'
    const total = quira
      ? `<tr class="tot"><td colspan="5">TOTAL</td><td class="r">${money(t.total)}</td></tr>`
      : `<tr class="tot"><td></td><td colspan="4">Total</td><td class="r">${money(t.total)}</td></tr>`
    body = `
<h2><span>1.</span> Orçamento destinado a:</h2>
<table class="info"><tr><td>CNPJ da APM</td><td>${esc(q.apmCnpj)}</td></tr><tr><td>Nome da APM</td><td>${esc(q.apmName)}</td></tr><tr><td>Subprograma do PDDE Paulista</td><td>${esc(q.subprogram)}</td></tr><tr><td>Ano de Exercício</td><td>${esc(q.exercise)}</td></tr></table>
<h2><span>2.</span> Dados do proponente:</h2>
<table class="info"><tr><td>CNPJ</td><td>${esc(e?.doc)}</td></tr><tr><td>Razão Social</td><td>${esc(e?.legalName || e?.name)}</td></tr><tr><td>Endereço</td><td>${esc([e?.address, e?.district].filter(Boolean).join(' - '))}</td></tr><tr><td>Telefone para Contato</td><td>${esc(e?.phone)}</td></tr><tr><td>Data de Emissão do Orçamento</td><td>${fmtDate(q.date)}</td></tr><tr><td>Prazo de Validade do Orçamento</td><td>${q.validDays} dias</td></tr><tr><td>Pessoa Responsável pela Empresa</td><td>${esc(q.contactName)}</td></tr><tr><td>Condição de Pagamento</td><td>${esc(q.payment)}</td></tr></table>
<h2><span>3.</span> Dados do orçamento:</h2>
<table class="items"><thead><tr>${head}</tr></thead>
<tbody>${rows}${total}</tbody></table>
`
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
`
  }
  return letterhead(e, body, `Orçamento ${q.number} – ${quoteClient(q)}`)
}
