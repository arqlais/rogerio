import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Tx } from '../types'
import { EntityMark } from '../components/ui'
import { Donut, ForecastChart, MonthBars, Ring } from '../components/Charts'
import { Icon } from '../components/Icon'
import { TxList } from '../components/TxList'
import { isGroup, ownedBy, signed, accountBalance, addDays, daysBetween, addMonth, fmtDate, inScope, isLate, money, month, monthName, monthShort, monthSummary, projectStats, today } from '../utils'

export function Dashboard({ onNewTx }: { onNewTx: (t: Partial<Tx>) => void }) {
  const { data, setDemo } = useStore()
  const scope = data.settings.scope
  const t = today()
  const ym = month(t)
  const ent = data.entities.find((e) => e.id === scope)

  const accounts = data.accounts.filter((a) => !a.archived && ownedBy(a.entityId, scope))
  const balance = accounts.reduce((s, a) => s + accountBalance(data, a.id), 0)
  const open = data.txs.filter((x) => !x.paid && inScope(x, scope))
  const toReceive = open.filter((x) => x.kind === 'in')
  const toPay = open.filter((x) => x.kind === 'out')
  const late = open.filter((x) => isLate(x) && x.kind !== 'transfer')
  const sum = (l: Tx[]) => l.reduce((s, x) => s + x.amount, 0)
  const m = monthSummary(data, ym, scope)
  const upcoming = open.filter((x) => x.due <= addDays(t, 15)).sort((a, b) => a.due.localeCompare(b.due))

  const pendingDaily = useMemo(() => {
    const list = data.attendance.filter((a) => !a.txId)
    const projectsInScope = new Set(data.projects.filter((p) => ownedBy(p.entityId, scope)).map((p) => p.id))
    return list.filter((a) => projectsInScope.has(a.projectId)).reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0)
  }, [data.attendance, data.projects, scope])

  const chart = Array.from({ length: 6 }, (_, i) => {
    const k = addMonth(ym, i - 5)
    const s = monthSummary(data, k, scope)
    return { label: monthShort(k), a: s.inPaid + s.transfersIn, b: s.outPaid + s.transfersOut }
  })

  const tomorrow = addDays(t, 1)
  const agenda = data.events
    .flatMap((e) => {
      if (e.done) return []
      const hits = [t, tomorrow].filter((d) => d === e.date || (d > e.date && (e.repeat === 'semanal' ? daysBetween(e.date, d) % 7 === 0 : e.repeat === 'mensal' ? d.slice(8) === e.date.slice(8) : false)))
      return hits.map((d) => ({ ...e, date: d }))
    })
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  const projects = data.projects.filter((p) => p.status === 'andamento' && (ownedBy(p.entityId, scope)))
  const fresh = !data.txs.length && !data.projects.length && !data.people.length

  const loadSample = () => setDemo(true)


  // saldo previsto: saldo de hoje + o que vence em cada dia (atrasados contam hoje)
  const forecast = useMemo(() => {
    const days = 45
    const pts: { date: string; value: number; ins: number; outs: number }[] = []
    let bal = balance
    for (let i = 0; i <= days; i++) {
      const d = addDays(t, i)
      let ins = 0, outs = 0
      for (const x of open) {
        const due = x.due < t ? t : x.due
        if (due !== d) continue
        const v = signed(x, scope)
        if (v > 0) ins += v
        else outs -= v
      }
      bal += ins - outs
      pts.push({ date: d, value: bal, ins, outs })
    }
    return pts
  }, [open, balance, t, scope])
  const endBal = forecast[forecast.length - 1]?.value ?? balance
  const lowest = forecast.reduce((m, p) => (p.value < m.value ? p : m), forecast[0] ?? { value: balance, date: t })

  // gastos do mês por categoria
  const spend = useMemo(() => {
    const by: Record<string, number> = {}
    for (const x of data.txs) if (x.kind === 'out' && inScope(x, scope) && month(x.paid ?? x.due) === ym) by[x.category] = (by[x.category] ?? 0) + x.amount
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
    return { rows, total: rows.reduce((s, r) => s + r[1], 0) }
  }, [data.txs, scope, ym])
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const longDate = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const weekEnd = addDays(t, 7)
  const payWeek = toPay.filter((x) => x.due <= weekEnd)
  const recWeek = toReceive.filter((x) => x.due <= weekEnd)
  const weekLine = [
    payWeek.length ? `${payWeek.length} conta${payWeek.length > 1 ? 's' : ''} para pagar esta semana (${money(sum(payWeek))})` : 'nenhuma conta para pagar esta semana',
    recWeek.length ? `${money(sum(recWeek))} a receber` : '',
  ].filter(Boolean).join(' · ')
  const lateOut = late.filter((x) => x.kind === 'out')
  const lateIn = late.filter((x) => x.kind === 'in')

  const [view, setView] = useState<'saldo' | 'meses' | 'gastos' | 'cnpj'>('saldo')
  return (
    <div className="page">
      <header className="dash-head">
        <span className="eyebrow">{longDate}{ent ? ` · ${ent.name}` : scope === 'empresa' ? ' · empresa' : scope === 'all' ? ' · tudo' : ''}</span>
        <h1 className="dash-title"><span className="hello">{hello.toLowerCase()},</span> {(data.settings.owner || 'Rogério').toLowerCase()}</h1>
        <p className="dash-sub">{weekLine}</p>
        {ent && ent.kind === 'empresa' && (
          <a className="ent-chip" href={`#/empresa/${ent.id}`}><EntityMark e={ent} size={18} /><b>{ent.name}</b><span>{ent.legalName}</span>{ent.doc && <span>CNPJ {ent.doc}</span>}</a>
        )}
      </header>

      {fresh && (
        <div className="card welcome">
          <h2>Vamos começar</h2>
          <ol>
            <li><a href="#/cadastros/empresas">Confira os CNPJs e as contas bancárias</a> e coloque o saldo de hoje.</li>
            <li><a href="#/obras">Cadastre as obras</a> — para o prédio, escolha "Incorporação" e gere os 9 apartamentos.</li>
            <li><a href="#/equipe/pessoas">Cadastre a equipe</a>: fixos, diaristas e empreiteiros.</li>
            <li>Lance as contas a pagar e a receber no botão <b>Lançar</b>, no alto da tela.</li>
          </ol>
          <button className="btn" onClick={loadSample}>Ver a plataforma com dados de exemplo</button>
        </div>
      )}

      <div className="kpis">
        <button className="kpi" onClick={() => go('/cadastros/empresas')}>
          <span className="kpi-top"><span className="kpi-l">saldo nas contas</span><span className="kpi-ic"><Icon name="wallet" size={16} /></span></span>
          <strong className={balance < 0 ? 'neg' : ''}>{money(balance)}</strong>
          <small>em 45 dias: {money(endBal)}{lowest.value < 0 ? <span className="neg"> · fica negativo em {fmtDate(lowest.date).slice(0, 5)}</span> : ''}</small>
        </button>
        <button className="kpi" onClick={() => go('/financeiro')}>
          <span className="kpi-top"><span className="kpi-l">a receber</span><span className="kpi-ic in"><Icon name="arrowUp" size={16} /></span></span>
          <strong className="pos">{money(sum(toReceive))}</strong>
          <small>{lateIn.length ? <span className="neg">{money(sum(lateIn))} atrasado</span> : `${toReceive.length} lançamento(s)`}</small>
        </button>
        <button className="kpi" onClick={() => go('/financeiro')}>
          <span className="kpi-top"><span className="kpi-l">a pagar</span><span className="kpi-ic out"><Icon name="arrowDown" size={16} /></span></span>
          <strong>{money(sum(toPay) + pendingDaily)}</strong>
          <small>{lateOut.length ? <span className="neg">{lateOut.length} vencida(s) · {money(sum(lateOut))}</span> : pendingDaily ? `inclui ${money(pendingDaily)} de diárias` : `${toPay.length} lançamento(s)`}</small>
        </button>
        <div className="kpi">
          <span className="kpi-top"><span className="kpi-l">resultado de {monthName(ym).split(' ')[0]}</span><span className="kpi-ic"><Icon name="trend" size={16} /></span></span>
          <strong className={m.result < 0 ? 'neg' : 'pos'}>{money(m.result)}</strong>
          <small>previsto no mês: {money(m.forecast)}</small>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="seg compact">
            <button className={view === 'saldo' ? 'on' : ''} onClick={() => setView('saldo')}>saldo previsto</button>
            <button className={view === 'meses' ? 'on' : ''} onClick={() => setView('meses')}>entradas × saídas</button>
            <button className={view === 'gastos' ? 'on' : ''} onClick={() => setView('gastos')}>gastos do mês</button>
            {isGroup(scope) && <button className={view === 'cnpj' ? 'on' : ''} onClick={() => setView('cnpj')}>por CNPJ</button>}
          </div>
          {view === 'saldo' && <span className={`chip-v ${endBal < balance ? 'down' : 'up'}`}>{endBal >= balance ? '▲' : '▼'} {money(Math.abs(endBal - balance))} em 45 dias</span>}
        </div>
        {view === 'saldo' && <ForecastChart points={forecast} height={220} />}
        {view === 'meses' && <MonthBars data={chart} />}
        {view === 'gastos' && (spend.total ? <Donut rows={spend.rows} total={spend.total} /> : <p className="muted">Nenhum gasto lançado neste mês.</p>)}
        {view === 'cnpj' && <Compare scope={scope} />}
      </section>

      <div className="cols">
        <section className="card">
          <div className="card-head">
            <h2>próximos 15 dias</h2>
            {(pendingDaily > 0) && <a className="link" href="#/equipe/diarias">diárias a acertar: {money(pendingDaily)}</a>}
          </div>
          <TxList txs={upcoming} scope={scope} empty="Nada vencendo nos próximos 15 dias" />
          <button className="link" onClick={() => onNewTx({ kind: 'out' })}>+ lançar conta</button>
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>agenda</h2><a className="link" href="#/agenda">abrir</a></div>
            {agenda.length ? agenda.map((e) => (
              <a key={e.id + e.date} className="ag-card" href="#/agenda">
                <span className="ag-day"><b>{e.date === t ? 'hoje' : 'amanhã'}</b>{e.time && <small>{e.time}</small>}</span>
                <span><b>{e.title}</b>{e.place && <small><Icon name="pin" size={13} /> {e.place}</small>}</span>
              </a>
            )) : <p className="muted">Nada marcado para hoje e amanhã.</p>}
          </section>
          {projects.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>obras em andamento</h2><a className="link" href="#/obras">ver todas</a></div>
              <div className="proj-list">
                {projects.map((p) => {
                  const s = projectStats(data, p.id)
                  return (
                    <a key={p.id} className="proj-row" href={`#/obras/${p.id}`}>
                      {p.budget > 0 ? <Ring value={s.budgetUse} size={44} /> : <span className="ring-ph sm"><Icon name="building" size={18} /></span>}
                      <span className="proj-row-b"><b>{p.name}</b><small>gasto {money(s.cost)}{p.budget ? ` de ${money(p.budget)}` : ''}</small></span>
                    </a>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** Resumo lado a lado das empresas (e do pessoal) para comparar. */
function Compare({ scope }: { scope: string }) {
  const { data } = useStore()
  const ym = month(today())
  const rows = data.entities.filter((e) => scope === 'all' || e.kind === 'empresa').sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || Number(a.kind === 'pessoal') - Number(b.kind === 'pessoal')).map((e) => {
    const bal = data.accounts.filter((a) => a.entityId === e.id && !a.archived).reduce((s, a) => s + accountBalance(data, a.id), 0)
    const open = data.txs.filter((t) => !t.paid && inScope(t, e.id))
    const rec = open.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0)
    const pay = open.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0)
    const m = monthSummary(data, ym, e.id)
    const y = Array.from({ length: 12 }, (_, i) => monthSummary(data, addMonth(ym, -i), e.id)).reduce((s, x) => ({ i: s.i + x.inPaid, o: s.o + x.outPaid }), { i: 0, o: 0 })
    const obras = data.projects.filter((p) => p.entityId === e.id && p.status === 'andamento').length
    const quotes = data.quotes.filter((q) => q.entityId === e.id && q.status === 'enviado').length
    const series = Array.from({ length: 6 }, (_, i) => monthSummary(data, addMonth(ym, i - 5), e.id).result)
    return { e, bal, rec, pay, res: m.result, inM: m.inPaid, year: y.i - y.o, yearIn: y.i, obras, quotes, series }
  })
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.res)), ...rows.map((r) => Math.abs(r.bal)))
  return (
    <div className="cnpj-list">
      <div className="cnpj-row head"><span>CNPJ</span><span>saldo</span><span>resultado do mês</span><span>a receber</span><span>a pagar</span></div>
      {rows.filter((r) => r.e.favorite || r.bal || r.rec || r.pay || r.res).map((r) => (
        <button key={r.e.id} className="cnpj-row" onClick={() => go(`/empresa/${r.e.id}`)}>
          <span className="cnpj-name"><EntityMark e={r.e} size={24} /><b>{r.e.name}</b></span>
          <span className={r.bal < 0 ? 'neg' : ''}>{money(r.bal)}<i className="bar-mini"><i style={{ width: `${(Math.abs(r.bal) / max) * 100}%`, background: r.e.color }} /></i></span>
          <span className={r.res < 0 ? 'neg' : 'pos'}>{money(r.res)}</span>
          <span className="muted">{money(r.rec)}</span>
          <span className="muted">{money(r.pay)}</span>
        </button>
      ))}
    </div>
  )
}
