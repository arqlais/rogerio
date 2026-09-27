import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Attendance, Contract, Person, Tx } from '../types'
import { ContractForm } from '../components/ContractForm'
import { TxForm } from '../components/TxForm'
import { printReceipt } from '../components/Receipt'
import { ContractTable } from './Projects'
import { Badge, Empty, Field, Modal, MoneyInput, NumInput, Stat, Tabs, confirmDialog, toast } from '../components/ui'
import { ROLE_LABEL, WEEKDAYS, addDays, addMonth, fmtDate, fmtDateShort, money, month, monthName, num, projectName, today, uid, weekStart } from '../utils'

type T = 'diarias' | 'folha' | 'empreitadas' | 'pessoas'

export function Team({ tab }: { tab?: string }) {
  const t = (['diarias', 'folha', 'empreitadas', 'pessoas'].includes(tab ?? '') ? tab : 'diarias') as T
  return (
    <div className="page">
      <div className="page-head"><h1>Equipe</h1></div>
      <Tabs value={t} onChange={(v) => go(`/equipe/${v}`)} items={[['diarias', 'Diárias'], ['folha', 'Fixos (salários)'], ['empreitadas', 'Empreitadas'], ['pessoas', 'Pessoas']]} />
      {t === 'diarias' && <Daily />}
      {t === 'folha' && <Payroll />}
      {t === 'empreitadas' && <Contracts />}
      {t === 'pessoas' && <People />}
    </div>
  )
}

const short = (s: string) => s.split(/\s+/).filter((w) => w.length > 2 && !/^(de|da|do|das|dos|obra|reforma)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || s.slice(0, 2).toUpperCase()

// ---------------- diárias ----------------
function Daily() {
  const { data, save, saveMany, remove } = useStore()
  const [ws, setWs] = useState(weekStart(today(), data.settings.weekStart))
  const active = data.projects.filter((p) => p.status === 'andamento' || p.status === 'pausada')
  const [project, setProject] = useState(active[0]?.id ?? data.projects[0]?.id ?? '')
  const [newPerson, setNewPerson] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const end = days[6]
  const workers = data.people.filter((p) => p.role === 'diarista' && p.active)
  // quem trabalhou na semana mas está inativo também aparece
  const extra = data.people.filter((p) => !workers.includes(p) && data.attendance.some((a) => a.personId === p.id && a.date >= ws && a.date <= end))
  const rows = [...workers, ...extra]
  const colors = useMemo(() => Object.fromEntries(data.projects.map((p, i) => [p.id, `hsl(${(i * 67 + 20) % 360} 55% 45%)`])), [data.projects])

  const cell = (pid: string, day: string) => data.attendance.filter((a) => a.personId === pid && a.date === day)
  const click = (p: Person, day: string) => {
    const list = cell(p.id, day)
    const a = list[0]
    if (a?.txId) return toast('Esta diária já foi paga. Para mudar, exclua o pagamento no financeiro.', 'err')
    if (!a) {
      if (!project) return toast('Cadastre uma obra primeiro', 'err')
      return save('attendance', { id: uid(), date: day, personId: p.id, projectId: project, fraction: 1, rate: p.dailyRate ?? 0 })
    }
    if (a.fraction === 1) return save('attendance', { ...a, fraction: 0.5 })
    remove('attendance', a.id)
  }
  const weekOf = (pid: string) => data.attendance.filter((a) => a.personId === pid && a.date >= ws && a.date <= end)
  const value = (a: Attendance) => a.rate * a.fraction + (a.extra ?? 0)

  const payWeek = (p: Person) => {
    const open = weekOf(p.id).filter((a) => !a.txId)
    if (!open.length) return
    const byProject = open.reduce<Record<string, Attendance[]>>((acc, a) => ((acc[a.projectId] ??= []).push(a), acc), {})
    const g = uid()
    const txs: Tx[] = []
    const updates: Attendance[] = []
    for (const [projId, list] of Object.entries(byProject)) {
      const proj = data.projects.find((x) => x.id === projId)
      const entityId = proj?.entityId ?? data.entities[0].id
      const id = uid()
      const days = list.reduce((s, a) => s + a.fraction, 0)
      txs.push({
        id, kind: 'out', entityId, accountId: data.accounts.find((x) => x.entityId === entityId && !x.archived)?.id, projectId: projId, personId: p.id,
        category: 'Mão de obra – diárias', description: `Diárias ${p.name} – ${num(days)} dia(s) (${fmtDateShort(ws)} a ${fmtDateShort(end)})`,
        amount: list.reduce((s, a) => s + value(a), 0), due: today(), paid: today(), method: 'Pix', group: g, createdAt: new Date().toISOString(),
      })
      updates.push(...list.map((a) => ({ ...a, txId: id })))
    }
    saveMany('txs', txs)
    saveMany('attendance', updates)
    toast(`Pagamento de ${p.name} lançado`)
    const total = txs.reduce((s, t) => s + t.amount, 0)
    const detail = open.sort((a, b) => a.date.localeCompare(b.date)).map((a) => `${fmtDate(a.date)} (${WEEKDAYS[new Date(a.date + 'T12:00').getDay()]}) – ${a.fraction === 1 ? 'dia inteiro' : 'meio dia'} – ${projectName(data, a.projectId)} – ${money(value(a))}`).join('\n')
    printReceipt(data, { ...txs[0], amount: total, description: `diárias de ${fmtDate(ws)} a ${fmtDate(end)}`, projectId: txs.length === 1 ? txs[0].projectId : undefined }, detail)
  }

  const totalWeek = rows.reduce((s, p) => s + weekOf(p.id).reduce((x, a) => x + value(a), 0), 0)
  const openWeek = rows.reduce((s, p) => s + weekOf(p.id).filter((a) => !a.txId).reduce((x, a) => x + value(a), 0), 0)
  const allOpen = data.attendance.filter((a) => !a.txId && a.date < ws)

  return (
    <>
      <div className="help">Escolha a obra e toque no dia de cada diarista: <b>1 toque = dia inteiro</b>, <b>2 = meio dia</b>, <b>3 = apaga</b>. No fim da semana, toque em <b>Pagar</b> — o valor vai para o financeiro da obra e sai o recibo.</div>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setWs(addDays(ws, -7))} aria-label="Semana anterior">‹</button>
        <strong>{fmtDateShort(ws)} a {fmtDateShort(end)}</strong>
        <button className="icon-btn" onClick={() => setWs(addDays(ws, 7))} aria-label="Próxima semana">›</button>
        <button className="btn small" onClick={() => setWs(weekStart(today(), data.settings.weekStart))}>Esta semana</button>
        <span style={{ flex: 1 }} />
        <label className="inline-field">Obra:
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Obra das diárias">
            {data.projects.filter((p) => p.status !== 'concluida' || p.id === project).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {allOpen.length > 0 && <div className="alert warn">Há {allOpen.length} diária(s) de semanas anteriores sem pagamento ({money(allOpen.reduce((s, a) => s + value(a), 0))}). Volte nas semanas anteriores para acertar.</div>}
      {!rows.length ? (
        <Empty title="Nenhum diarista cadastrado" text="Cadastre os diaristas com o valor da diária." action={<button className="btn primary" onClick={() => setNewPerson(true)}>+ Cadastrar diarista</button>} />
      ) : (
        <div className="card flush">
          <div className="daily">
            <table>
              <thead>
                <tr>
                  <th className="l">Diarista</th>
                  {days.map((d) => <th key={d} className={d === today() ? 'today' : ''}>{WEEKDAYS[new Date(d + 'T12:00').getDay()]}<br /><small>{fmtDateShort(d)}</small></th>)}
                  <th className="r">Semana</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const w = weekOf(p.id)
                  const open = w.filter((a) => !a.txId)
                  const tot = w.reduce((s, a) => s + value(a), 0)
                  return (
                    <tr key={p.id}>
                      <td className="l"><a href={`#/pessoa/${p.id}`}><b>{p.name}</b></a><br /><small className="muted">{p.job ? `${p.job} · ` : ''}{money(p.dailyRate ?? 0)}/dia</small></td>
                      {days.map((d) => {
                        const a = cell(p.id, d)[0]
                        return (
                          <td key={d} className={d === today() ? 'today' : ''}>
                            <button className={`day ${a ? (a.fraction === 1 ? 'full' : 'half') : ''} ${a?.txId ? 'paid' : ''}`} style={a ? { ['--pc' as string]: colors[a.projectId] } : undefined} onClick={() => click(p, d)} title={a ? `${projectName(data, a.projectId)} – ${a.fraction === 1 ? 'dia inteiro' : 'meio dia'}${a.txId ? ' (pago)' : ''}` : 'Marcar diária'} aria-label={`${p.name} ${d}`}>
                              {a ? (a.fraction === 1 ? short(projectName(data, a.projectId)) : '½') : ''}
                            </button>
                          </td>
                        )
                      })}
                      <td className="r"><b>{money(tot)}</b><br /><small className="muted">{num(w.reduce((s, a) => s + a.fraction, 0))} dia(s)</small></td>
                      <td>{open.length ? <button className="btn small primary" onClick={() => payWeek(p)}>Pagar {money(open.reduce((s, a) => s + value(a), 0))}</button> : w.length ? <Badge tone="good">pago</Badge> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="daily-foot">
            <div className="row wrap">{[...new Set(data.attendance.filter((a) => a.date >= ws && a.date <= end).map((a) => a.projectId))].map((id) => <span key={id} className="chip"><span className="dot" style={{ background: colors[id] }} />{short(projectName(data, id))} = {projectName(data, id)}</span>)}</div>
            <div><span className="muted">Total da semana</span> <b>{money(totalWeek)}</b> · <span className="muted">a pagar</span> <b className={openWeek ? 'neg' : ''}>{money(openWeek)}</b></div>
          </div>
          <button className="link" onClick={() => setNewPerson(true)}>+ cadastrar diarista</button>
        </div>
      )}
      {newPerson && <PersonForm initial={{ role: 'diarista' }} onClose={() => setNewPerson(false)} />}
    </>
  )
}

// ---------------- fixos ----------------
function Payroll() {
  const { data, saveMany } = useStore()
  const [ym, setYm] = useState(month(today()))
  const [vale, setVale] = useState<Partial<Tx> | null>(null)
  const [newPerson, setNewPerson] = useState(false)
  const fixed = data.people.filter((p) => p.role === 'fixo' && p.active)
  const group = (pid: string) => `folha-${ym}-${pid}`
  const payDate = `${addMonth(ym, 1)}-${String(Math.min(28, data.settings.payday)).padStart(2, '0')}`
  const rows = fixed.map((p) => {
    const launched = data.txs.filter((t) => t.group === group(p.id))
    const salaryTx = launched.find((t) => t.category === 'Salários')
    const advances = data.txs.filter((t) => t.personId === p.id && t.category === 'Adiantamento / vale' && (salaryTx ? t.settledBy === salaryTx.id : !t.settledBy && month(t.paid ?? t.due) <= ym))
    const adv = advances.reduce((s, t) => s + t.amount, 0)
    const salary = p.salary ?? 0
    const charges = (salary * (p.charges ?? 0)) / 100
    return { p, launched, salaryTx, advances, adv, salary, charges, net: Math.max(0, salary - adv) }
  })
  const launch = (r: (typeof rows)[number]) => {
    const entityId = r.p.entityId ?? data.entities.find((e) => e.kind === 'empresa')!.id
    const accountId = data.accounts.find((a) => a.entityId === entityId && !a.archived)?.id
    const base = { kind: 'out' as const, entityId, accountId, personId: r.p.id, group: group(r.p.id), due: payDate, createdAt: new Date().toISOString() }
    const salaryId = uid()
    const items: Tx[] = [{ ...base, id: salaryId, category: 'Salários', description: `Salário ${monthName(ym)} – ${r.p.name}${r.adv ? ` (descontado ${money(r.adv)} de vales)` : ''}`, amount: r.net }]
    if (r.charges > 0) items.push({ ...base, id: uid(), category: 'Encargos (INSS/FGTS)', description: `Encargos ${monthName(ym)} – ${r.p.name}`, amount: Math.round(r.charges * 100) / 100, due: `${addMonth(ym, 1)}-20` })
    saveMany('txs', [...items, ...r.advances.map((t) => ({ ...t, settledBy: salaryId }))])
    toast(`Salário de ${r.p.name} lançado em "A pagar"`)
  }
  const launchAll = () => rows.filter((r) => !r.salaryTx && r.salary > 0).forEach(launch)
  const pending = rows.filter((r) => !r.salaryTx && r.salary > 0)

  return (
    <>
      <div className="help">Todo mês, toque em <b>Lançar salários</b>: o sistema desconta os vales do mês e coloca o salário em "A pagar" para o dia {data.settings.payday} do mês seguinte (e os encargos, se informados no cadastro).</div>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, -1))} aria-label="Mês anterior">‹</button>
        <strong>Salários de {monthName(ym)}</strong>
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, 1))} aria-label="Próximo mês">›</button>
        <span style={{ flex: 1 }} />
        {pending.length > 0 && <button className="btn primary" onClick={launchAll}>Lançar salários ({pending.length})</button>}
      </div>
      <div className="stats">
        <Stat label="Salários" value={money(rows.reduce((s, r) => s + r.salary, 0))} sub={`${rows.length} funcionário(s)`} />
        <Stat label="Vales descontados" value={money(rows.reduce((s, r) => s + r.adv, 0))} />
        <Stat label="Encargos estimados" value={money(rows.reduce((s, r) => s + r.charges, 0))} />
        <Stat label="Custo total do mês" value={money(rows.reduce((s, r) => s + r.salary + r.charges, 0))} tone="warn" />
      </div>
      {!rows.length ? <Empty title="Nenhum funcionário fixo" action={<button className="btn primary" onClick={() => setNewPerson(true)}>+ Cadastrar funcionário</button>} /> : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Funcionário</th><th className="r">Salário</th><th className="r">Vales</th><th className="r">A pagar</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td><a href={`#/pessoa/${r.p.id}`}><b>{r.p.name}</b></a><br /><small className="muted">{r.p.job}</small></td>
                  <td className="r">{money(r.salary)}</td>
                  <td className="r">{r.adv ? <span className="neg">−{money(r.adv)}</span> : '—'}</td>
                  <td className="r"><b>{money(r.salaryTx?.amount ?? r.net)}</b></td>
                  <td>{r.salaryTx ? (r.salaryTx.paid ? <Badge tone="good">pago {fmtDateShort(r.salaryTx.paid)}</Badge> : <Badge tone="warn">lançado · vence {fmtDateShort(r.salaryTx.due)}</Badge>) : <Badge tone="muted">não lançado</Badge>}</td>
                  <td className="r nowrap">
                    <button className="btn small" onClick={() => setVale({ kind: 'out', personId: r.p.id, entityId: r.p.entityId, category: 'Adiantamento / vale', description: `Vale – ${r.p.name}`, paid: today() })}>+ Vale</button>{' '}
                    {!r.salaryTx && r.salary > 0 && <button className="btn small primary" onClick={() => launch(r)}>Lançar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link" onClick={() => setNewPerson(true)}>+ cadastrar funcionário fixo</button>
        </div>
      )}
      {vale && <TxForm initial={vale} onClose={() => setVale(null)} />}
      {newPerson && <PersonForm initial={{ role: 'fixo' }} onClose={() => setNewPerson(false)} />}
    </>
  )
}

// ---------------- empreitadas ----------------
function Contracts() {
  const { data } = useStore()
  const [edit, setEdit] = useState<Partial<Contract> | null>(null)
  const [show, setShow] = useState<'andamento' | 'todas'>('andamento')
  const list = data.contracts.filter((c) => show === 'todas' || c.status === 'andamento')
  const byProject = [...new Set(list.map((c) => c.projectId))]
  return (
    <>
      <div className="row between">
        <div className="seg compact">
          <button className={show === 'andamento' ? 'on' : ''} onClick={() => setShow('andamento')}>Em andamento</button>
          <button className={show === 'todas' ? 'on' : ''} onClick={() => setShow('todas')}>Todas</button>
        </div>
        <button className="btn primary" onClick={() => setEdit({})}>+ Nova empreitada</button>
      </div>
      {!list.length && <Empty title="Nenhuma empreitada" text="Registre os serviços contratados por preço fechado para controlar quanto já foi pago e quanto falta." />}
      {byProject.map((pid) => (
        <section key={pid} className="card">
          <div className="card-head"><h2><a href={`#/obras/${pid}`}>{projectName(data, pid) || 'Sem obra'}</a></h2></div>
          <ContractTable contracts={list.filter((c) => c.projectId === pid)} onEdit={setEdit} />
        </section>
      ))}
      {edit && <ContractForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

// ---------------- pessoas ----------------
function People() {
  const { data } = useStore()
  const [role, setRole] = useState<'' | Person['role']>('')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Person> | null>(null)
  const [inactive, setInactive] = useState(false)
  const list = data.people
    .filter((p) => (!role || p.role === role) && (inactive || p.active) && (!q || `${p.name} ${p.job ?? ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Buscar nome ou função" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pessoa" />
        <select value={role} onChange={(e) => setRole(e.target.value as Person['role'])} aria-label="Tipo">
          <option value="">Todos</option>
          {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> mostrar inativos</label>
        <button className="btn primary" onClick={() => setEdit({})}>+ Pessoa</button>
      </div>
      {!list.length && <Empty title="Ninguém por aqui" text="Cadastre funcionários, diaristas, empreiteiros, fornecedores e clientes." />}
      <div className="people">
        {list.map((p) => (
          <a key={p.id} className={`card person ${p.active ? '' : 'inactive'}`} href={`#/pessoa/${p.id}`}>
            <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{p.name}</strong>
              <small className="muted">{ROLE_LABEL[p.role]}{p.job ? ` · ${p.job}` : ''}</small>
              <small>{p.role === 'fixo' ? `${money(p.salary ?? 0)}/mês` : p.role === 'diarista' ? `${money(p.dailyRate ?? 0)}/dia` : p.phone}</small>
            </div>
          </a>
        ))}
      </div>
      {edit && <PersonForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

export function PersonForm({ initial, onClose }: { initial: Partial<Person>; onClose: () => void }) {
  const { data, save, remove } = useStore()
  const editing = !!initial.id && data.people.some((p) => p.id === initial.id)
  const [p, setP] = useState<Person>(() => ({ id: uid(), name: '', role: 'diarista', active: true, entityId: data.entities.find((e) => e.kind === 'empresa')?.id, ...initial }))
  const set = (x: Partial<Person>) => setP((o) => ({ ...o, ...x }))
  const submit = () => {
    if (!p.name.trim()) return toast('Informe o nome', 'err')
    save('people', { ...p, name: p.name.trim() })
    toast(editing ? 'Cadastro atualizado' : 'Pessoa cadastrada')
    onClose()
  }
  const del = async () => {
    const used = data.txs.some((t) => t.personId === p.id) || data.attendance.some((a) => a.personId === p.id) || data.contracts.some((c) => c.personId === p.id)
    if (used) {
      if (await confirmDialog(`${p.name} tem lançamentos no histórico. Deixar como inativo (some das listas, mas o histórico fica)?`, 'Deixar inativo', false)) { save('people', { ...p, active: false }); onClose() }
      return
    }
    if (await confirmDialog(`Excluir ${p.name}?`, 'Excluir')) { remove('people', p.id); onClose(); go('/equipe/pessoas') }
  }
  return (
    <Modal title={editing ? 'Editar cadastro' : 'Nova pessoa'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Nome" span={2}><input value={p.name} onChange={(e) => set({ name: e.target.value })} autoFocus aria-label="Nome" /></Field>
        <Field label="Tipo">
          <select value={p.role} onChange={(e) => set({ role: e.target.value as Person['role'] })} aria-label="Tipo de pessoa">
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Função / ramo"><input value={p.job ?? ''} onChange={(e) => set({ job: e.target.value })} placeholder="Pedreiro, servente, eletricista, depósito…" aria-label="Função" /></Field>
        {p.role === 'fixo' && <>
          <Field label="Salário mensal"><MoneyInput value={p.salary ?? 0} onChange={(v) => set({ salary: v })} ariaLabel="Salário" /></Field>
          <Field label="Encargos (% do salário)" hint="INSS + FGTS etc. Deixe 0 se não quiser calcular"><NumInput value={p.charges ?? 0} min={0} onChange={(v) => set({ charges: v })} suffix="%" ariaLabel="Encargos" /></Field>
        </>}
        {p.role === 'diarista' && <Field label="Valor da diária"><MoneyInput value={p.dailyRate ?? 0} onChange={(v) => set({ dailyRate: v })} ariaLabel="Diária" /></Field>}
        {(p.role === 'fixo' || p.role === 'diarista') && (
          <Field label="Empresa que paga">
            <select value={p.entityId ?? ''} onChange={(e) => set({ entityId: e.target.value })} aria-label="Empresa">
              {data.entities.filter((e) => e.kind === 'empresa').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Telefone / WhatsApp"><input value={p.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" aria-label="Telefone" /></Field>
        <Field label="CPF / CNPJ"><input value={p.doc ?? ''} onChange={(e) => set({ doc: e.target.value })} aria-label="Documento" /></Field>
        <Field label="Chave Pix"><input value={p.pix ?? ''} onChange={(e) => set({ pix: e.target.value })} aria-label="Pix" /></Field>
        <Field label="Situação"><select value={p.active ? '1' : '0'} onChange={(e) => set({ active: e.target.value === '1' })} aria-label="Ativo"><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
        <Field label="Observações" span={2}><textarea rows={2} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" /></Field>
      </div>
    </Modal>
  )
}
