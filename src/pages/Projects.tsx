import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Contract, Project, Tx, Unit } from '../types'
import { TxForm } from '../components/TxForm'
import { TxList } from '../components/TxList'
import { ContractForm } from '../components/ContractForm'
import { Attachments } from '../components/Attachments'
import { Badge, Empty, Field, HBars, Modal, MoneyInput, NumInput, Progress, Stat, Tabs, confirmDialog, toast } from '../components/ui'
import { isGroup, ownedBy, KIND_LABEL, STATUS_LABEL, UNIT_LABEL, addMonths, contractPaid, entityName, fmtDate, money, num, personName, projectStats, today, uid } from '../utils'

const STATUS_TONE = { orcamento: 'info', andamento: 'good', pausada: 'warn', concluida: 'muted' } as const

export function Projects() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [edit, setEdit] = useState<Partial<Project> | null>(null)
  const [status, setStatus] = useState<'ativas' | 'todas' | 'concluida'>('ativas')
  const list = data.projects
    .filter((p) => ownedBy(p.entityId, scope))
    .filter((p) => (status === 'todas' ? true : status === 'concluida' ? p.status === 'concluida' : p.status !== 'concluida'))
  return (
    <div className="page">
      <div className="page-head">
        <h1>Obras</h1>
        <button className="btn primary" onClick={() => setEdit({})}>+ Nova obra</button>
      </div>
      <div className="seg compact">
        {([['ativas', 'Ativas'], ['concluida', 'Concluídas'], ['todas', 'Todas']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      {!list.length && <Empty title="Nenhuma obra aqui" text="Cadastre as reformas de escola, construções e o prédio para acompanhar o que entra e o que sai de cada uma." action={<button className="btn primary" onClick={() => setEdit({})}>Cadastrar obra</button>} />}
      <div className="proj-cards">
        {list.map((p) => {
          const s = projectStats(data, p.id)
          const ent = data.entities.find((e) => e.id === p.entityId)
          return (
            <a key={p.id} className="card proj-card" href={`#/obras/${p.id}`}>
              <div className="row between">
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                <small className="muted"><span className="dot" style={{ background: ent?.color }} /> {ent?.name}</small>
              </div>
              <h3>{p.name}</h3>
              <p className="muted small">{KIND_LABEL[p.kind]}{p.client ? ` · ${p.client}` : ''}</p>
              <div className="kv"><span>Gasto até agora</span><b>{money(s.cost)}</b></div>
              {p.budget > 0 && <><Progress value={s.budgetUse} /><div className="kv small muted"><span>Previsto {money(p.budget)}</span><span>{Math.round(s.budgetUse)}%</span></div></>}
              {p.kind === 'incorporacao'
                ? <div className="kv"><span>Vendido</span><b>{money(s.sold)} <small className="muted">de {money(s.vgv)}</small></b></div>
                : p.contractValue > 0 && <div className="kv"><span>Recebido</span><b className="pos">{money(s.received)} <small className="muted">de {money(p.contractValue)}</small></b></div>}
            </a>
          )
        })}
      </div>
      {edit && <ProjectForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

export function ProjectForm({ initial, onClose }: { initial: Partial<Project>; onClose: () => void }) {
  const { data, save, saveMany, remove } = useStore()
  const editing = !!initial.id
  const scope = data.settings.scope
  const [p, setP] = useState<Project>(() => ({
    id: uid(), name: '', kind: 'reforma', status: 'andamento', contractValue: 0, budget: 0, start: today(),
    entityId: !isGroup(scope) && data.entities.find((e) => e.id === scope)?.kind === 'empresa' ? scope : data.entities.find((e) => e.kind === 'empresa')?.id ?? '',
    ...initial,
  }))
  const [floors, setFloors] = useState(3)
  const [perFloor, setPerFloor] = useState(3)
  const [area, setArea] = useState(0)
  const [price, setPrice] = useState(0)
  const hasUnits = data.units.some((u) => u.projectId === p.id)
  const set = (x: Partial<Project>) => setP((o) => ({ ...o, ...x }))

  const submit = () => {
    if (!p.name.trim()) return toast('Dê um nome para a obra', 'err')
    save('projects', { ...p, name: p.name.trim() })
    if (p.kind === 'incorporacao' && !hasUnits && floors > 0 && perFloor > 0) {
      const units: Unit[] = []
      for (let f = 1; f <= floors; f++)
        for (let n = 1; n <= perFloor; n++)
          units.push({ id: uid(), projectId: p.id, floor: f, number: `${f}0${n}`, area: area || undefined, price, status: 'disponivel' })
      saveMany('units', units)
    }
    toast(editing ? 'Obra atualizada' : 'Obra cadastrada')
    onClose()
    if (!editing) go(`/obras/${p.id}`)
  }
  const del = async () => {
    const n = data.txs.filter((t) => t.projectId === p.id).length
    if (!(await confirmDialog(`Excluir a obra "${p.name}"? ${n ? `Os ${n} lançamentos dela continuam no financeiro, mas sem obra.` : ''}`, 'Excluir obra'))) return
    remove('projects', p.id)
    data.units.filter((u) => u.projectId === p.id).forEach((u) => remove('units', u.id))
    data.txs.filter((t) => t.projectId === p.id).forEach((t) => save('txs', { ...t, projectId: undefined }))
    onClose()
    go('/obras')
  }

  return (
    <Modal title={editing ? 'Editar obra' : 'Nova obra'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Nome da obra" span={2}><input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Reforma E.E. Santos Dumont, Prédio Rua X" autoFocus aria-label="Nome da obra" /></Field>
        <Field label="Tipo">
          <select value={p.kind} onChange={(e) => set({ kind: e.target.value as Project['kind'] })} aria-label="Tipo">
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Empresa responsável">
          <select value={p.entityId} onChange={(e) => set({ entityId: e.target.value })} aria-label="Empresa">
            {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Situação">
          <select value={p.status} onChange={(e) => set({ status: e.target.value as Project['status'] })} aria-label="Situação">
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label={p.kind === 'incorporacao' ? 'Proprietário' : 'Cliente / contratante'}><input value={p.client ?? ''} onChange={(e) => set({ client: e.target.value })} placeholder={p.kind === 'reforma_escola' ? 'Ex.: Prefeitura, Secretaria de Educação' : ''} aria-label="Cliente" /></Field>
        {p.kind !== 'incorporacao' && <Field label="Valor do contrato"><MoneyInput value={p.contractValue} onChange={(v) => set({ contractValue: v })} ariaLabel="Valor do contrato" /></Field>}
        <Field label="Custo previsto (orçamento)" hint="Quanto deve gastar na obra toda"><MoneyInput value={p.budget} onChange={(v) => set({ budget: v })} ariaLabel="Custo previsto" /></Field>
        <Field label="Nº do contrato / licitação"><input value={p.contractNo ?? ''} onChange={(e) => set({ contractNo: e.target.value })} aria-label="Contrato" /></Field>
        <Field label="Endereço"><input value={p.address ?? ''} onChange={(e) => set({ address: e.target.value })} aria-label="Endereço" /></Field>
        <Field label="Início"><input type="date" value={p.start ?? ''} onChange={(e) => set({ start: e.target.value })} aria-label="Início" /></Field>
        <Field label="Previsão de término"><input type="date" value={p.end ?? ''} onChange={(e) => set({ end: e.target.value })} aria-label="Término" /></Field>
        {p.kind === 'incorporacao' && !hasUnits && (
          <div className="span-2 box">
            <b>Gerar apartamentos</b>
            <div className="grid-form inner four">
              <Field label="Pavimentos"><NumInput value={floors} min={0} onChange={setFloors} ariaLabel="Pavimentos" /></Field>
              <Field label="Aptos por pavimento"><NumInput value={perFloor} min={0} onChange={setPerFloor} ariaLabel="Aptos por pavimento" /></Field>
              <Field label="Área (m²)"><NumInput value={area} min={0} onChange={setArea} ariaLabel="Área" /></Field>
              <Field label="Preço de venda"><MoneyInput value={price} onChange={setPrice} ariaLabel="Preço" /></Field>
            </div>
            <small className="muted">Serão criados {floors * perFloor} apartamentos ({floors > 0 ? `101 a ${floors}0${perFloor}` : ''}). Dá para ajustar cada um depois.</small>
          </div>
        )}
        <Field label="Observações" span={2}><textarea rows={2} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" /></Field>
      </div>
    </Modal>
  )
}

type DTab = 'resumo' | 'lancamentos' | 'equipe' | 'unidades' | 'documentos'

export function ProjectDetail({ id }: { id: string }) {
  const { data, save } = useStore()
  const p = data.projects.find((x) => x.id === id)
  const [tab, setTab] = useState<DTab>(p?.kind === 'incorporacao' ? 'unidades' : 'resumo')
  const [edit, setEdit] = useState(false)
  const [tx, setTx] = useState<Partial<Tx> | null>(null)
  const [contract, setContract] = useState<Partial<Contract> | null>(null)
  if (!p) return <div className="page"><Empty title="Obra não encontrada" action={<a className="btn" href="#/obras">Voltar</a>} /></div>
  const s = projectStats(data, p.id)
  const txs = data.txs.filter((t) => t.projectId === p.id).sort((a, b) => (b.paid ?? b.due).localeCompare(a.paid ?? a.due))
  const contracts = data.contracts.filter((c) => c.projectId === p.id)
  const att = data.attendance.filter((a) => a.projectId === p.id)
  const byWorker = Object.entries(att.reduce<Record<string, { days: number; total: number; open: number }>>((acc, a) => {
    const r = (acc[a.personId] ??= { days: 0, total: 0, open: 0 })
    const v = a.rate * a.fraction + (a.extra ?? 0)
    r.days += a.fraction; r.total += v; if (!a.txId) r.open += v
    return acc
  }, {}))
  const units = data.units.filter((u) => u.projectId === p.id)
  const incorp = p.kind === 'incorporacao'

  const tabs: [DTab, string, number?][] = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos', txs.length], ['equipe', 'Mão de obra', contracts.length + byWorker.length], ['documentos', 'Documentos', (p.files?.length ?? 0) + txs.filter((t) => t.files?.length).length]]
  if (incorp || units.length) tabs.splice(1, 0, ['unidades', 'Apartamentos', units.length])

  return (
    <div className="page">
      <a className="back" href="#/obras">‹ Obras</a>
      <div className="page-head">
        <div>
          <h1>{p.name}</h1>
          <p className="muted">{KIND_LABEL[p.kind]} · {entityName(data, p.entityId)}{p.client ? ` · ${p.client}` : ''}{p.contractNo ? ` · ${p.contractNo}` : ''}</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => setEdit(true)}>Editar</button>
          <button className="btn" onClick={() => setTx({ kind: 'out', projectId: p.id, entityId: p.entityId })}>− Gasto</button>
          <button className="btn good" onClick={() => setTx({ kind: 'in', projectId: p.id, entityId: p.entityId, category: incorp ? 'Venda de unidade' : 'Medição de obra' })}>+ {incorp ? 'Recebimento' : 'Medição'}</button>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} items={tabs} />

      {tab === 'resumo' && (
        <>
          <div className="stats">
            <Stat label="Gasto até agora" value={money(s.cost)} sub={s.pendingDaily ? `inclui ${money(s.pendingDaily)} de diárias a pagar` : `pago ${money(s.costPaid)}`} />
            <Stat label="Custo previsto" value={money(p.budget)} sub={p.budget ? `${Math.round(s.budgetUse)}% usado · falta ${money(p.budget - s.cost)}` : 'informe em Editar'} tone={s.budgetUse > 100 ? 'bad' : s.budgetUse > 85 ? 'warn' : undefined} />
            {incorp ? (
              <Stat label="Vendas" value={money(s.sold)} sub={`${units.filter((u) => u.status === 'vendido').length} de ${units.length} vendidos · VGV ${money(s.vgv)}`} tone="good" />
            ) : (
              <Stat label="Recebido" value={money(s.received)} sub={`de ${money(p.contractValue)} · a receber ${money(s.toReceive)}`} tone="good" />
            )}
            <Stat label={incorp ? 'Lucro estimado' : 'Lucro previsto'} value={money(s.revenue - Math.max(s.projected, p.budget))} sub={s.revenue ? `margem ${Math.round(s.margin)}%` : ''} tone={s.revenue - Math.max(s.projected, p.budget) < 0 ? 'bad' : 'good'} />
          </div>
          {p.budget > 0 && (
            <section className="card">
              <div className="card-head"><h2>Previsto × gasto</h2><span className="muted small">{money(s.cost)} de {money(p.budget)}</span></div>
              <Progress value={s.budgetUse} />
              {s.contractsOpen > 0 && <p className="muted small">Ainda falta pagar {money(s.contractsOpen)} em empreitadas contratadas — custo final projetado: <b>{money(s.projected)}</b>.</p>}
            </section>
          )}
          <div className="cols even">
            <section className="card"><div className="card-head"><h2>Onde o dinheiro foi</h2></div>{Object.keys(s.byCat).length ? <HBars rows={Object.entries(s.byCat).sort((a, b) => b[1] - a[1])} /> : <p className="muted">Nenhum gasto lançado ainda.</p>}</section>
            <section className="card">
              <div className="card-head"><h2>Dados da obra</h2></div>
              <div className="kv"><span>Início</span><b>{fmtDate(p.start) || '—'}</b></div>
              <div className="kv"><span>Término previsto</span><b>{fmtDate(p.end) || '—'}</b></div>
              <div className="kv"><span>Endereço</span><b>{p.address || '—'}</b></div>
              {s.retention > 0 && <div className="kv"><span>Retenções nas notas</span><b>{money(s.retention)}</b></div>}
              {p.notes && <p className="muted">{p.notes}</p>}
            </section>
          </div>
        </>
      )}

      {tab === 'lancamentos' && <TxList txs={txs} hide={['project']} empty="Nenhum lançamento nesta obra" />}

      {tab === 'equipe' && (
        <>
          <section className="card">
            <div className="card-head"><h2>Empreitadas</h2><button className="btn small" onClick={() => setContract({ projectId: p.id, entityId: p.entityId })}>+ Empreitada</button></div>
            {contracts.length ? <ContractTable contracts={contracts} onEdit={setContract} /> : <p className="muted">Nenhuma empreitada nesta obra.</p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Diaristas nesta obra</h2><a className="btn small" href="#/equipe/diarias">Apontar diárias</a></div>
            {byWorker.length ? (
              <table className="table">
                <thead><tr><th>Diarista</th><th className="r">Dias</th><th className="r">Total</th><th className="r">Em aberto</th></tr></thead>
                <tbody>{byWorker.map(([pid, r]) => <tr key={pid}><td><a href={`#/pessoa/${pid}`}>{personName(data, pid)}</a></td><td className="r">{num(r.days)}</td><td className="r">{money(r.total)}</td><td className={`r ${r.open ? 'neg' : ''}`}>{money(r.open)}</td></tr>)}</tbody>
              </table>
            ) : <p className="muted">Nenhuma diária apontada nesta obra.</p>}
          </section>
        </>
      )}

      {tab === 'unidades' && <Units project={p} />}

      {tab === 'documentos' && (
        <>
          <section className="card">
            <div className="card-head"><h2>Documentos da obra</h2></div>
            <p className="muted small">Contrato, ART, projetos, alvará, fotos, orçamento assinado…</p>
            <Attachments files={p.files} onChange={(files) => save('projects', { ...p, files })} label="Anexar documento" />
          </section>
          <section className="card">
            <div className="card-head"><h2>Notas e comprovantes dos lançamentos</h2></div>
            {txs.filter((t) => t.files?.length).length ? <TxList txs={txs.filter((t) => t.files?.length)} hide={['project']} /> : <p className="muted">Nenhum lançamento desta obra tem nota anexada ainda. Abra o lançamento e use "Anexar NF".</p>}
          </section>
        </>
      )}

      {edit && <ProjectForm initial={p} onClose={() => setEdit(false)} />}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
      {contract && <ContractForm initial={contract} onClose={() => setContract(null)} />}
    </div>
  )
}

export function ContractTable({ contracts, onEdit }: { contracts: Contract[]; onEdit: (c: Contract) => void }) {
  const { data } = useStore()
  return (
    <div className="contracts">
      {contracts.map((c) => {
        const paid = contractPaid(data, c.id)
        const executed = (c.total * c.progress) / 100
        const ahead = paid - executed
        return (
          <div key={c.id} className="contract" onClick={() => onEdit(c)} role="button" tabIndex={0}>
            <div className="row between"><strong>{c.service}</strong><Badge tone={c.status === 'concluida' ? 'muted' : c.status === 'cancelada' ? 'bad' : 'good'}>{c.status === 'andamento' ? 'em andamento' : c.status === 'concluida' ? 'concluída' : 'cancelada'}</Badge></div>
            <small className="muted">{personName(data, c.personId)}</small>
            <div className="contract-bars">
              <div><small>Executado {c.progress}%</small><Progress value={c.progress} tone="good" /></div>
              <div><small>Pago {c.total ? Math.round((paid / c.total) * 100) : 0}%</small><Progress value={c.total ? (paid / c.total) * 100 : 0} tone={ahead > 0.5 ? 'warn' : 'good'} /></div>
            </div>
            <div className="row between small"><span>Pago {money(paid)} de {money(c.total)}</span><b>Falta {money(c.total - paid)}</b></div>
            {ahead > 0.5 && c.status === 'andamento' && <small className="warn-t">⚠ Pago {money(ahead)} a mais do que o executado</small>}
          </div>
        )
      })}
    </div>
  )
}

function Units({ project }: { project: Project }) {
  const { data, save } = useStore()
  const [edit, setEdit] = useState<Unit | null>(null)
  const units = data.units.filter((u) => u.projectId === project.id)
  const floors = [...new Set(units.map((u) => u.floor))].sort((a, b) => b - a)
  const recv = (u: Unit) => data.txs.filter((t) => t.unitId === u.id && t.kind === 'in')
  const addUnit = () => {
    const floor = Math.max(1, ...units.map((u) => u.floor))
    save('units', { id: uid(), projectId: project.id, floor, number: `${floor}0${units.filter((u) => u.floor === floor).length + 1}`, price: units[0]?.price ?? 0, area: units[0]?.area, status: 'disponivel' })
  }
  const count = (s: Unit['status']) => units.filter((u) => u.status === s).length
  return (
    <>
      <div className="row wrap legend-row">
        <span><span className="dot st-disponivel" /> Disponível ({count('disponivel')})</span>
        <span><span className="dot st-reservado" /> Reservado ({count('reservado')})</span>
        <span><span className="dot st-vendido" /> Vendido ({count('vendido')})</span>
        {count('permuta') > 0 && <span><span className="dot st-permuta" /> Permuta ({count('permuta')})</span>}
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={addUnit}>+ Unidade</button>
      </div>
      <div className="building">
        <div className="roof" />
        {floors.map((f) => (
          <div key={f} className="floor">
            <span className="floor-n">{f}º</span>
            {units.filter((u) => u.floor === f).sort((a, b) => a.number.localeCompare(b.number)).map((u) => {
              const r = recv(u)
              const got = r.filter((t) => t.paid).reduce((s, t) => s + t.amount, 0)
              const total = u.salePrice ?? u.price
              return (
                <button key={u.id} className={`unit st-${u.status}`} onClick={() => setEdit(u)}>
                  <b>{u.number}</b>
                  <small>{UNIT_LABEL[u.status]}</small>
                  {u.buyer && <small className="ellipsis">{u.buyer}</small>}
                  <small>{money(total)}</small>
                  {u.status === 'vendido' && total > 0 && <Progress value={(got / total) * 100} tone="good" />}
                </button>
              )
            })}
          </div>
        ))}
        <div className="ground">térreo</div>
      </div>
      {edit && <UnitForm unit={edit} project={project} onClose={() => setEdit(null)} />}
    </>
  )
}

function UnitForm({ unit, project, onClose }: { unit: Unit; project: Project; onClose: () => void }) {
  const { data, save, saveMany, remove } = useStore()
  const [u, setU] = useState<Unit>(unit)
  const [plan, setPlan] = useState({ entry: 0, n: 0, first: addMonths(today(), 1), balloon: 0, balloonDate: '' })
  const set = (x: Partial<Unit>) => setU((o) => ({ ...o, ...x }))
  const txs = data.txs.filter((t) => t.unitId === u.id).sort((a, b) => a.due.localeCompare(b.due))
  const total = u.salePrice ?? u.price
  const planned = txs.reduce((s, t) => s + t.amount, 0)
  const rest = Math.max(0, total - plan.entry - plan.balloon)
  const acc = data.accounts.find((a) => a.entityId === project.entityId && !a.archived)?.id

  const makePlan = () => {
    const g = uid()
    const base = { kind: 'in' as const, entityId: project.entityId, accountId: acc, projectId: project.id, unitId: u.id, category: 'Venda de unidade', group: g, createdAt: new Date().toISOString() }
    const items: Tx[] = []
    if (plan.entry > 0) items.push({ ...base, id: uid(), description: `Apto ${u.number} – entrada`, amount: plan.entry, due: u.saleDate || today() })
    const each = plan.n > 0 ? Math.floor((rest / plan.n) * 100) / 100 : 0
    for (let i = 0; i < plan.n; i++) items.push({ ...base, id: uid(), installment: `${i + 1}/${plan.n}`, description: `Apto ${u.number} – parcela ${i + 1}/${plan.n}`, amount: i === plan.n - 1 ? Math.round((rest - each * (plan.n - 1)) * 100) / 100 : each, due: addMonths(plan.first, i) })
    if (plan.balloon > 0) items.push({ ...base, id: uid(), description: `Apto ${u.number} – reforço/chaves`, amount: plan.balloon, due: plan.balloonDate || addMonths(plan.first, plan.n) })
    if (!items.length) return toast('Informe a entrada e/ou as parcelas', 'err')
    saveMany('txs', items)
    toast(`${items.length} recebimentos lançados`)
  }
  const submit = () => { save('units', u); onClose() }
  const del = async () => {
    if (txs.length) return toast('Esta unidade tem recebimentos lançados. Exclua-os antes.', 'err')
    if (await confirmDialog(`Excluir o apartamento ${u.number}?`, 'Excluir')) { remove('units', u.id); onClose() }
  }

  return (
    <Modal wide title={`Apartamento ${u.number}`} onClose={onClose} footer={<><button className="btn danger ghost" onClick={del}>Excluir</button><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Número"><input value={u.number} onChange={(e) => set({ number: e.target.value })} aria-label="Número" /></Field>
        <Field label="Pavimento"><NumInput value={u.floor} onChange={(v) => set({ floor: v })} ariaLabel="Pavimento" /></Field>
        <Field label="Área (m²)"><NumInput value={u.area} onChange={(v) => set({ area: v })} ariaLabel="Área" /></Field>
        <Field label="Preço de tabela"><MoneyInput value={u.price} onChange={(v) => set({ price: v })} ariaLabel="Preço de tabela" /></Field>
        <Field label="Situação">
          <select value={u.status} onChange={(e) => set({ status: e.target.value as Unit['status'], saleDate: e.target.value === 'vendido' && !u.saleDate ? today() : u.saleDate })} aria-label="Situação">
            {Object.entries(UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {u.status !== 'disponivel' && (
          <>
            <Field label="Comprador / interessado"><input value={u.buyer ?? ''} onChange={(e) => set({ buyer: e.target.value })} aria-label="Comprador" /></Field>
            <Field label="Telefone"><input value={u.buyerPhone ?? ''} onChange={(e) => set({ buyerPhone: e.target.value })} aria-label="Telefone" /></Field>
            {u.status === 'vendido' && <>
              <Field label="Data da venda"><input type="date" value={u.saleDate ?? ''} onChange={(e) => set({ saleDate: e.target.value })} aria-label="Data da venda" /></Field>
              <Field label="Valor fechado"><MoneyInput value={u.salePrice ?? u.price} onChange={(v) => set({ salePrice: v })} ariaLabel="Valor fechado" /></Field>
            </>}
          </>
        )}
        <Field label="Observações" span={2}><textarea rows={2} value={u.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" /></Field>
      </div>
      {u.status === 'vendido' && (
        <div className="box">
          <div className="row between"><b>Pagamentos do comprador</b><small className="muted">lançado {money(planned)} de {money(total)}</small></div>
          {txs.length > 0 && <TxList txs={txs} hide={['project', 'entity']} />}
          {planned < total - 0.5 && (
            <>
              <p className="small muted">Monte o plano de pagamento — os recebimentos vão para "A receber" com as datas certas:</p>
              <div className="grid-form inner four">
                <Field label="Entrada"><MoneyInput value={plan.entry} onChange={(v) => setPlan({ ...plan, entry: v })} ariaLabel="Entrada" /></Field>
                <Field label="Nº de parcelas"><NumInput value={plan.n} min={0} onChange={(v) => setPlan({ ...plan, n: v })} ariaLabel="Parcelas" /></Field>
                <Field label="1ª parcela em"><input type="date" value={plan.first} onChange={(e) => setPlan({ ...plan, first: e.target.value })} aria-label="Primeira parcela" /></Field>
                <Field label="Reforço / chaves"><MoneyInput value={plan.balloon} onChange={(v) => setPlan({ ...plan, balloon: v })} ariaLabel="Reforço" /></Field>
              </div>
              <div className="row between">
                <small className="muted">{plan.n > 0 ? `${plan.n}× de ${money(rest / plan.n)}` : ''}</small>
                <button className="btn primary small" onClick={() => { save('units', u); makePlan() }}>Lançar plano de pagamento</button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
