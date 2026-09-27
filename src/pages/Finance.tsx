import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { TxList } from '../components/TxList'
import { TxForm } from '../components/TxForm'
import { Badge } from '../components/ui'
import { Icon } from '../components/Icon'
import { Donut } from '../components/Charts'
import { HBars, Stat, Tabs } from '../components/ui'
import { isGroup, accountName, addDays, addMonth, downloadFile, entityName, fmtDate, inScope, isLate, money, month, monthName, personName, projectName, signed, toCSV, today } from '../utils'

type Tab = 'aberto' | 'gastos' | 'extrato' | 'notas' | 'relatorio'

export function Finance() {
  const [tab, setTab] = useState<Tab>('aberto')
  const [tx, setTx] = useState<Partial<Tx> | null>(null)
  return (
    <div className="page">
      <div className="page-head">
        <h1>Financeiro</h1>
        <div className="row wrap">
          <button className="btn" onClick={() => setTx({ kind: 'transfer' })}><Icon name="swap" size={16} /> Transferência</button>
          <button className="btn" onClick={() => setTx({ kind: 'in' })}><Icon name="arrowUp" size={16} /> Entrada</button>
          <button className="btn primary" onClick={() => setTx({ kind: 'out' })}><Icon name="plus" size={16} /> Gasto</button>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[['aberto', 'A pagar e a receber'], ['gastos', 'Gastos'], ['extrato', 'Extrato do mês'], ['notas', 'Notas fiscais'], ['relatorio', 'Relatórios']]} />
      {tab === 'aberto' && <Open />}
      {tab === 'gastos' && <Spending onNew={setTx} />}
      {tab === 'extrato' && <Statement />}
      {tab === 'notas' && <Invoices />}
      {tab === 'relatorio' && <Reports />}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </div>
  )
}

function useFilters(list: Tx[]) {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [cat, setCat] = useState('')
  const filtered = list.filter((t) => {
    if (project && (project === '-' ? t.projectId : t.projectId !== project)) return false
    if (cat && t.category !== cat) return false
    if (q) {
      const s = `${t.description} ${t.category} ${personName(data, t.personId)} ${projectName(data, t.projectId)} ${t.docNo ?? ''} ${t.notes ?? ''}`.toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  })
  const cats = [...new Set(list.map((t) => t.category))].sort()
  const bar = (
    <div className="filters">
      <input type="search" placeholder="Buscar descrição, pessoa, nota…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filtrar por obra">
        <option value="">Todas as obras</option>
        <option value="-">Sem obra (gerais)</option>
        {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
        <option value="">Todas as categorias</option>
        {cats.map((c) => <option key={c}>{c}</option>)}
      </select>
    </div>
  )
  return { filtered, bar }
}

function Open() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [kind, setKind] = useState<'out' | 'in'>('out')
  const open = data.txs.filter((t) => !t.paid && inScope(t, scope) && (t.kind === kind || (kind === 'out' && t.kind === 'transfer'))).sort((a, b) => a.due.localeCompare(b.due))
  const { filtered, bar } = useFilters(open)
  const sum = (l: Tx[]) => l.reduce((s, t) => s + t.amount, 0)
  const late = filtered.filter((t) => isLate(t))
  const week = filtered.filter((t) => !isLate(t) && t.due <= addDaysStr(7))
  const later = filtered.filter((t) => t.due > addDaysStr(7))
  return (
    <>
      <div className="seg">
        <button className={kind === 'out' ? 'on out' : 'out'} onClick={() => setKind('out')}>A pagar</button>
        <button className={kind === 'in' ? 'on in' : 'in'} onClick={() => setKind('in')}>A receber</button>
      </div>
      <div className="stats">
        <Stat label="Vencido" value={money(sum(late))} sub={`${late.length} lançamento(s)`} tone={late.length ? 'bad' : undefined} />
        <Stat label="Próximos 7 dias" value={money(sum(week))} sub={`${week.length} lançamento(s)`} tone="warn" />
        <Stat label="Depois" value={money(sum(later))} sub={`${later.length} lançamento(s)`} />
        <Stat label="Total em aberto" value={money(sum(filtered))} tone={kind === 'in' ? 'good' : undefined} />
      </div>
      {bar}
      {late.length > 0 && <><h3 className="section-t bad">Vencidos</h3><TxList txs={late} scope={scope} /></>}
      {week.length > 0 && <><h3 className="section-t">Próximos 7 dias</h3><TxList txs={week} scope={scope} /></>}
      <h3 className="section-t">Mais adiante</h3>
      <TxList txs={later} scope={scope} empty={kind === 'in' ? 'Nada a receber mais adiante' : 'Nada a pagar mais adiante'} />
    </>
  )
}
const addDaysStr = (n: number) => addDays(today(), n)

function Statement() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [ym, setYm] = useState(month(today()))
  const [kind, setKind] = useState<'' | Tx['kind']>('')
  const list = data.txs
    .filter((t) => inScope(t, scope) && month(t.paid ?? t.due) === ym && (!kind || t.kind === kind))
    .sort((a, b) => (b.paid ?? b.due).localeCompare(a.paid ?? a.due))
  const { filtered, bar } = useFilters(list)
  const paidIn = filtered.filter((t) => t.paid && signed(t, scope) > 0).reduce((s, t) => s + signed(t, scope), 0)
  const paidOut = filtered.filter((t) => t.paid && signed(t, scope) < 0).reduce((s, t) => s - signed(t, scope), 0)

  const exportCSV = () => {
    const rows: (string | number)[][] = [['Data pagamento', 'Vencimento', 'Tipo', 'Empresa/Pessoal', 'Conta', 'Categoria', 'Descrição', 'Obra', 'Pessoa', 'Nota/Doc', 'Valor bruto', 'Retenções', 'Valor', 'Situação']]
    for (const t of filtered)
      rows.push([fmtDate(t.paid), fmtDate(t.due), t.kind === 'in' ? 'Entrada' : t.kind === 'out' ? 'Saída' : 'Transferência', entityName(data, t.entityId), accountName(data, t.accountId), t.category, t.description, projectName(data, t.projectId), personName(data, t.personId), t.docNo ?? '', t.gross ?? t.amount, t.retention ?? 0, t.amount, t.paid ? 'Pago' : 'Em aberto'])
    downloadFile(`lancamentos-${ym}.csv`, toCSV(rows), 'text/csv')
  }

  return (
    <>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, -1))} aria-label="Mês anterior">‹</button>
        <strong>{monthName(ym)}</strong>
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, 1))} aria-label="Próximo mês">›</button>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={exportCSV}>Exportar CSV (contador)</button>
      </div>
      <div className="stats">
        <Stat label="Entrou" value={money(paidIn)} tone="good" />
        <Stat label="Saiu" value={money(paidOut)} tone="bad" />
        <Stat label="Saldo do mês" value={money(paidIn - paidOut)} tone={paidIn - paidOut < 0 ? 'bad' : 'good'} />
        <Stat label="Ainda em aberto" value={money(filtered.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0))} sub={`${filtered.filter((t) => !t.paid).length} lançamento(s)`} />
      </div>
      <div className="row wrap">
        <div className="seg compact">
          {([['', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas'], ['transfer', 'Transferências']] as const).map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>
      {bar}
      <TxList txs={filtered} scope={scope} empty="Nenhum lançamento neste mês" />
    </>
  )
}

function Reports() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [period, setPeriod] = useState<'mes' | 'ano' | '12m'>('ano')
  const [ref, setRef] = useState(month(today()))
  const [from, to] = period === 'mes' ? [ref, ref] : period === 'ano' ? [`${ref.slice(0, 4)}-01`, `${ref.slice(0, 4)}-12`] : [addMonth(ref, -11), ref]
  const label = period === 'mes' ? monthName(ref) : period === 'ano' ? ref.slice(0, 4) : `${monthName(from)} a ${monthName(to)}`

  const r = useMemo(() => {
    const txs = data.txs.filter((t) => t.paid && inScope(t, scope) && month(t.paid) >= from && month(t.paid) <= to)
    const inc: Record<string, number> = {}, exp: Record<string, number> = {}, byProject: Record<string, number> = {}
    let tin = 0, tout = 0, retention = 0, gross = 0
    for (const t of txs) {
      if (t.kind === 'in') { inc[t.category] = (inc[t.category] ?? 0) + t.amount; retention += t.retention ?? 0; gross += t.gross ?? t.amount }
      else if (t.kind === 'out') { exp[t.category] = (exp[t.category] ?? 0) + t.amount; if (t.projectId) byProject[t.projectId] = (byProject[t.projectId] ?? 0) + t.amount }
      else { const s = signed(t, scope); if (s > 0) tin += s; else tout -= s }
    }
    const totalIn = Object.values(inc).reduce((a, b) => a + b, 0)
    const totalOut = Object.values(exp).reduce((a, b) => a + b, 0)
    const sort = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])
    return { inc: sort(inc), exp: sort(exp), byProject: sort(byProject), totalIn, totalOut, tin, tout, retention, gross }
  }, [data.txs, scope, from, to])

  // por empresa (quando "Tudo")
  const byEntity = data.entities.map((e) => {
    const txs = data.txs.filter((t) => t.paid && t.kind !== 'transfer' && t.entityId === e.id && month(t.paid) >= from && month(t.paid) <= to)
    const i = txs.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0)
    const o = txs.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0)
    return { e, i, o }
  })

  const exportDRE = () => {
    const rows: (string | number)[][] = [[`Resultado ${label}`, scope === 'all' ? 'Tudo' : scope === 'empresa' ? 'Empresa (todos os CNPJs)' : entityName(data, scope)], [], ['ENTRADAS', r.totalIn], ...r.inc.map(([k, v]) => ['  ' + k, v]), [], ['SAÍDAS', r.totalOut], ...r.exp.map(([k, v]) => ['  ' + k, v]), [], ['RESULTADO', r.totalIn - r.totalOut], ['Retenções nas notas', r.retention], ['Transferências recebidas', r.tin], ['Transferências enviadas / retiradas', r.tout]]
    downloadFile(`resultado-${label.replace(/\s/g, '-')}.csv`, toCSV(rows), 'text/csv')
  }

  return (
    <>
      <div className="month-nav">
        <div className="seg compact">
          {([['mes', 'Mês'], ['ano', 'Ano'], ['12m', '12 meses']] as const).map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        <button className="icon-btn" onClick={() => setRef(addMonth(ref, period === 'mes' ? -1 : -12))} aria-label="Anterior">‹</button>
        <strong>{label}</strong>
        <button className="icon-btn" onClick={() => setRef(addMonth(ref, period === 'mes' ? 1 : 12))} aria-label="Próximo">›</button>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={exportDRE}>Exportar CSV</button>
      </div>
      <div className="stats">
        <Stat label="Entradas (recebido)" value={money(r.totalIn)} tone="good" sub={r.retention ? `bruto ${money(r.gross)} · retido ${money(r.retention)}` : undefined} />
        <Stat label="Saídas (pago)" value={money(r.totalOut)} tone="bad" />
        <Stat label="Resultado" value={money(r.totalIn - r.totalOut)} tone={r.totalIn - r.totalOut < 0 ? 'bad' : 'good'} sub={r.totalIn ? `margem ${Math.round(((r.totalIn - r.totalOut) / r.totalIn) * 100)}%` : undefined} />
        {scope !== 'all' && <Stat label={scope === 'empresa' ? 'Retiradas (pró-labore, lucros)' : 'Transferências'} value={money(r.tin - r.tout)} sub={`recebidas ${money(r.tin)} · enviadas ${money(r.tout)}`} />}
      </div>
      {isGroup(scope) && data.entities.length > 1 && (
        <section className="card">
          <div className="card-head"><h2>Por empresa / pessoal</h2></div>
          <table className="table">
            <thead><tr><th>Carteira</th><th className="r">Entradas</th><th className="r">Saídas</th><th className="r">Resultado</th></tr></thead>
            <tbody>
              {byEntity.map(({ e, i, o }) => (
                <tr key={e.id}><td><span className="dot" style={{ background: e.color }} /> {e.name}</td><td className="r pos">{money(i)}</td><td className="r neg">{money(o)}</td><td className={`r ${i - o < 0 ? 'neg' : ''}`}><b>{money(i - o)}</b></td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Pró-labore e distribuição de lucros são transferências: não entram como despesa da empresa nem como receita do pessoal aqui. Selecione a carteira no topo para ver as transferências dela.</p>
        </section>
      )}
      <div className="cols even">
        <section className="card"><div className="card-head"><h2>Saídas por categoria</h2></div>{r.exp.length ? <HBars rows={r.exp} /> : <p className="muted">Sem saídas pagas no período.</p>}</section>
        <section className="card"><div className="card-head"><h2>Entradas por categoria</h2></div>{r.inc.length ? <HBars rows={r.inc} /> : <p className="muted">Sem entradas recebidas no período.</p>}</section>
      </div>
      {r.byProject.length > 0 && (
        <section className="card"><div className="card-head"><h2>Gasto por obra no período</h2></div><HBars rows={r.byProject.map(([k, v]) => [projectName(data, k), v])} /></section>
      )}
    </>
  )
}

/** Notas fiscais: emitidas (entradas) e recebidas (saídas), com o arquivo anexado. */
function Invoices() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [ym, setYm] = useState(month(today()))
  const [kind, setKind] = useState<'in' | 'out'>('in')
  const [edit, setEdit] = useState<Tx | null>(null)
  const [newTx, setNewTx] = useState(false)
  const list = data.txs
    .filter((t) => t.kind === kind && inScope(t, scope) && month(t.paid ?? t.due) === ym && (kind === 'in' || t.docNo || t.files?.length || t.category === 'Material de construção'))
    .sort((a, b) => (a.paid ?? a.due).localeCompare(b.paid ?? b.due))
  const gross = list.reduce((s, t) => s + (t.gross ?? t.amount), 0)
  const ret = list.reduce((s, t) => s + (t.retention ?? 0), 0)
  const missing = list.filter((t) => !t.files?.length).length
  return (
    <>
      <div className="help">Anexe o PDF ou a foto de cada nota no lançamento. Aqui você vê as notas do mês e quais ainda estão <b>sem arquivo</b> — útil na hora de mandar para o contador.</div>
      <div className="month-nav">
        <div className="seg compact">
          <button className={kind === 'in' ? 'on in' : 'in'} onClick={() => setKind('in')}>Emitidas (recebimentos)</button>
          <button className={kind === 'out' ? 'on out' : 'out'} onClick={() => setKind('out')}>Recebidas (compras)</button>
        </div>
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, -1))} aria-label="Mês anterior">‹</button>
        <strong>{monthName(ym)}</strong>
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, 1))} aria-label="Próximo mês">›</button>
        <span style={{ flex: 1 }} />
        {kind === 'in' && <button className="btn small primary" onClick={() => setNewTx(true)}>+ Lançar nota emitida</button>}
      </div>
      <div className="stats">
        <Stat label={kind === 'in' ? 'Valor das notas' : 'Total em notas'} value={money(gross)} />
        {kind === 'in' && <Stat label="Retenções (ISS, INSS…)" value={money(ret)} />}
        <Stat label={kind === 'in' ? 'Líquido' : 'Quantidade'} value={kind === 'in' ? money(gross - ret) : String(list.length)} tone="good" />
        <Stat label="Sem arquivo anexado" value={String(missing)} tone={missing ? 'warn' : undefined} />
      </div>
      {!list.length ? <p className="muted">Nenhuma nota neste mês.</p> : (
        <div className="card flush"><div className="compare">
          <table className="table">
            <thead><tr><th>Data</th><th>Nº</th><th>{kind === 'in' ? 'Tomador / obra' : 'Fornecedor'}</th><th>Empresa</th><th className="r">Valor</th>{kind === 'in' && <th className="r">Retenção</th>}<th>Arquivo</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => setEdit(t)}>
                  <td>{fmtDate(t.paid ?? t.due).slice(0, 5)}</td>
                  <td>{t.docNo || '—'}</td>
                  <td>{personName(data, t.personId) || projectName(data, t.projectId) || t.description}<br /><small className="muted">{t.description}</small></td>
                  <td>{entityName(data, t.entityId)}</td>
                  <td className="r">{money(t.gross ?? t.amount)}</td>
                  {kind === 'in' && <td className="r">{t.retention ? money(t.retention) : '—'}</td>}
                  <td>{t.files?.length ? <Badge tone="good">{t.files.length} anexo(s)</Badge> : <Badge tone="warn">anexar</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {edit && <TxForm initial={edit} onClose={() => setEdit(null)} />}
      {newTx && <TxForm initial={{ kind: 'in', category: 'Medição de obra' }} onClose={() => setNewTx(false)} />}
    </>
  )
}

/** Gastos do mês: por categoria e por obra, com a lista de cada grupo. */
function Spending({ onNew }: { onNew: (t: Partial<Tx>) => void }) {
  const { data } = useStore()
  const scope = data.settings.scope
  const [ym, setYm] = useState(month(today()))
  const [by, setBy] = useState<'categoria' | 'obra'>('categoria')
  const [open, setOpen] = useState<string | null>(null)
  const list = data.txs.filter((t) => t.kind === 'out' && inScope(t, scope) && month(t.paid ?? t.due) === ym)
  const total = list.reduce((s, t) => s + t.amount, 0)
  const paid = list.filter((t) => t.paid).reduce((s, t) => s + t.amount, 0)
  const prev = data.txs.filter((t) => t.kind === 'out' && inScope(t, scope) && month(t.paid ?? t.due) === addMonth(ym, -1)).reduce((s, t) => s + t.amount, 0)
  const key = (t: Tx) => (by === 'categoria' ? t.category : projectName(data, t.projectId) || 'Despesas gerais (sem obra)')
  const groups = Object.entries(list.reduce<Record<string, Tx[]>>((acc, t) => ((acc[key(t)] ??= []).push(t), acc), {})).map(([k, v]) => [k, v, v.reduce((s, t) => s + t.amount, 0)] as const).sort((a, b) => b[2] - a[2])
  const diff = prev ? ((total - prev) / prev) * 100 : 0
  return (
    <>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, -1))} aria-label="Mês anterior">‹</button>
        <strong>{monthName(ym)}</strong>
        <button className="icon-btn" onClick={() => setYm(addMonth(ym, 1))} aria-label="Próximo mês">›</button>
        <span style={{ flex: 1 }} />
        <div className="seg compact">
          <button className={by === 'categoria' ? 'on' : ''} onClick={() => setBy('categoria')}>por categoria</button>
          <button className={by === 'obra' ? 'on' : ''} onClick={() => setBy('obra')}>por obra</button>
        </div>
      </div>
      <div className="stats">
        <Stat label="Gastos do mês" value={money(total)} sub={`${list.length} lançamento(s)`} />
        <Stat label="Já pago" value={money(paid)} tone="good" />
        <Stat label="Falta pagar" value={money(total - paid)} tone={total - paid ? 'warn' : undefined} />
        <Stat label="Comparado ao mês anterior" value={prev ? `${diff > 0 ? '+' : ''}${Math.round(diff)}%` : '—'} sub={prev ? `mês anterior: ${money(prev)}` : 'sem gastos no mês anterior'} tone={diff > 10 ? 'bad' : diff < -10 ? 'good' : undefined} />
      </div>
      {!list.length ? (
        <div className="empty"><strong>Nenhum gasto neste mês</strong><p>Lance materiais, combustível, aluguel de equipamento, contas da casa…</p><button className="btn primary" onClick={() => onNew({ kind: 'out' })}>+ Lançar gasto</button></div>
      ) : (
        <div className="cols">
          <section className="card">
            <div className="card-head"><h2>{by === 'categoria' ? 'Por categoria' : 'Por obra'}</h2><small className="muted">toque para ver os lançamentos</small></div>
            <div className="spend-groups">
              {groups.map(([k, items, sum]) => (
                <div key={k} className={`spend-group ${open === k ? 'open' : ''}`}>
                  <button className="spend-head" onClick={() => setOpen(open === k ? null : k)}>
                    <span className="spend-name">{k}<small>{items.length} lançamento(s)</small></span>
                    <span className="spend-bar"><i style={{ width: `${(sum / groups[0][2]) * 100}%` }} /></span>
                    <b>{money(sum)}</b>
                    <em>{Math.round((sum / total) * 100)}%</em>
                  </button>
                  {open === k && <TxList txs={[...items].sort((a, b) => (b.paid ?? b.due).localeCompare(a.paid ?? a.due))} scope={scope} hide={by === 'obra' ? ['project'] : []} />}
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Divisão</h2></div>
            <Donut rows={groups.map(([k, , v]) => [k, v] as [string, number])} total={total} />
          </section>
        </div>
      )}
    </>
  )
}
