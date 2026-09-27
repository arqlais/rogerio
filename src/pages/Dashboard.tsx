import { useMemo } from 'react'
import { useStore, sampleData } from '../store'
import { go } from '../router'
import type { Tx } from '../types'
import { EntityMark, confirmDialog } from '../components/ui'
import { Donut, ForecastChart, MonthBars, Ring, Sparkline } from '../components/Charts'
import { Icon } from '../components/Icon'
import { TxList } from '../components/TxList'
import { KIND_LABEL, accountBalance, addDays, daysBetween, addMonth, fmtDate, inScope, isLate, money, month, monthName, monthShort, monthSummary, projectStats, today } from '../utils'

export function Dashboard({ onNewTx }: { onNewTx: (t: Partial<Tx>) => void }) {
  const { data, replaceAll } = useStore()
  const scope = data.settings.scope
  const t = today()
  const ym = month(t)
  const ent = data.entities.find((e) => e.id === scope)

  const accounts = data.accounts.filter((a) => !a.archived && (scope === 'all' || a.entityId === scope))
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
    const projectsInScope = new Set(data.projects.filter((p) => scope === 'all' || p.entityId === scope).map((p) => p.id))
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
  const projects = data.projects.filter((p) => p.status === 'andamento' && (scope === 'all' || p.entityId === scope))
  const fresh = !data.txs.length && !data.projects.length && !data.people.length

  const loadSample = async () => {
    if (!(await confirmDialog('Carregar dados de exemplo? Eles substituem o que está cadastrado agora. Depois é só apagar em Ajustes → começar do zero.', 'Carregar exemplo', false))) return
    replaceAll(sampleData())
  }

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
        const v = x.kind === 'in' ? x.amount : x.kind === 'out' ? -x.amount : scope === 'all' ? 0 : x.toEntityId === scope && x.entityId !== scope ? x.amount : x.entityId === scope && x.toEntityId !== scope ? -x.amount : 0
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
  const results = Array.from({ length: 6 }, (_, i) => monthSummary(data, addMonth(ym, i - 5), scope).result)
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

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-main">
          <span className="hero-eyebrow">{ent && <><EntityMark e={ent} size={18} /> {ent.name} ·</>} {longDate}</span>
          <h1 className="hero-title"><span className="hello">{hello.toLowerCase()},</span> <b>{(data.settings.owner || 'Rogério').toLowerCase()}</b></h1>
          <p className="hero-sub">{weekLine}</p>
          <div className="hero-balance">
            <span>Saldo hoje nas contas</span>
            <strong className={balance < 0 ? 'neg' : ''}>{money(balance)}</strong>
            <small>Em 45 dias, se tudo for pago e recebido: <b className={endBal < 0 ? 'neg' : ''}>{money(endBal)}</b></small>
          </div>
        </div>
        {ent?.logo ? <img className="hero-logo" src={ent.logo} alt={ent.name} /> : (
          <div className="quick">
            <button onClick={() => onNewTx({ kind: 'out' })}><span className="qi out"><Icon name="arrowDown" /></span>Paguei / vou pagar</button>
            <button onClick={() => onNewTx({ kind: 'in' })}><span className="qi in"><Icon name="arrowUp" /></span>Recebi / vou receber</button>
            <button onClick={() => go('/equipe/diarias')}><span className="qi"><Icon name="hardhat" /></span>Diárias da equipe</button>
            <button onClick={() => go('/orcamentos')}><span className="qi"><Icon name="file" /></span>Fazer orçamento</button>
          </div>
        )}
      </section>

      {fresh && (
        <div className="card welcome">
          <h2>Vamos começar</h2>
          <ol>
            <li><a href="#/cadastros/empresas">Confira as empresas e as contas bancárias</a> e coloque o saldo de hoje.</li>
            <li><a href="#/obras">Cadastre as obras</a> — para o prédio, escolha "Incorporação" e gere os 9 apartamentos (3 pavimentos × 3).</li>
            <li><a href="#/equipe/pessoas">Cadastre a equipe</a>: fixos (salário), diaristas (valor da diária) e empreiteiros.</li>
            <li>Lance as contas a pagar e a receber pelo botão <b>+ Lançar</b>.</li>
          </ol>
          <button className="btn" onClick={loadSample}>Ver a plataforma com dados de exemplo</button>
        </div>
      )}

      <div className="kpis">
        <button className="kpi" onClick={() => go('/financeiro')}>
          <span className="kpi-ic in"><Icon name="arrowUp" /></span>
          <span className="kpi-l">A receber</span>
          <strong>{money(sum(toReceive))}</strong>
          <small>{lateIn.length ? <span className="neg">{lateIn.length} atrasado(s)</span> : `${toReceive.length} lançamento(s)`}</small>
        </button>
        <button className="kpi" onClick={() => go('/financeiro')}>
          <span className="kpi-ic out"><Icon name="arrowDown" /></span>
          <span className="kpi-l">A pagar</span>
          <strong>{money(sum(toPay) + pendingDaily)}</strong>
          <small>{lateOut.length ? <span className="neg">{lateOut.length} vencida(s)</span> : pendingDaily ? `inclui ${money(pendingDaily)} de diárias` : `${toPay.length} lançamento(s)`}</small>
        </button>
        <div className="kpi">
          <span className="kpi-ic"><Icon name="trend" /></span>
          <span className="kpi-l">Resultado de {monthName(ym).split(' ')[0]}</span>
          <strong className={m.result < 0 ? 'neg' : 'pos'}>{money(m.result)}</strong>
          <Sparkline values={results} color={m.result < 0 ? 'var(--bad)' : 'var(--good)'} />
        </div>
        <button className="kpi" onClick={() => go('/obras')}>
          <span className="kpi-ic"><Icon name="building" /></span>
          <span className="kpi-l">Obras em andamento</span>
          <strong>{projects.length}</strong>
          <small>{data.quotes.filter((q) => q.status === 'enviado' && (scope === 'all' || q.entityId === scope)).length} orçamento(s) esperando resposta</small>
        </button>
      </div>

      {(lateOut.length > 0 || lateIn.length > 0 || pendingDaily > 0 || lowest.value < 0) && (
        <div className="pills">
          {lowest.value < 0 && <button className="pill bad" onClick={() => go('/financeiro')}><Icon name="alert" size={16} /> O saldo fica negativo em {fmtDate(lowest.date).slice(0, 5)} ({money(lowest.value)})</button>}
          {lateOut.length > 0 && <button className="pill bad" onClick={() => go('/financeiro')}><Icon name="alert" size={16} /> {lateOut.length} conta(s) vencida(s) · {money(sum(lateOut))}</button>}
          {lateIn.length > 0 && <button className="pill warn" onClick={() => go('/financeiro')}><Icon name="wallet" size={16} /> Cobrar {money(sum(lateIn))} atrasado</button>}
          {pendingDaily > 0 && <button className="pill info" onClick={() => go('/equipe/diarias')}><Icon name="hardhat" size={16} /> Diárias para acertar · {money(pendingDaily)}</button>}
        </div>
      )}

      <div className="cols">
        <section className="card">
          <div className="card-head"><div><h2>Saldo previsto</h2><small className="muted">próximos 45 dias, com o que já está lançado</small></div><span className={`chip-v ${endBal < balance ? 'down' : 'up'}`}>{endBal >= balance ? '▲' : '▼'} {money(Math.abs(endBal - balance))}</span></div>
          <ForecastChart points={forecast} />
        </section>
        <section className="card">
          <div className="card-head"><div><h2>Gastos do mês</h2><small className="muted">onde o dinheiro foi em {monthName(ym).split(' ')[0]}</small></div></div>
          {spend.total ? <Donut rows={spend.rows} total={spend.total} /> : <p className="muted">Nenhum gasto lançado neste mês.</p>}
        </section>
      </div>

      {scope === 'all' && <Compare />}

      <div className="cols">
        <section className="card">
          <div className="card-head">
            <h2>Próximos 15 dias</h2>
            <button className="link" onClick={() => onNewTx({ kind: 'out' })}>+ conta</button>
          </div>
          <TxList txs={upcoming} scope={scope} empty="Nada vencendo nos próximos 15 dias" />
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Agenda</h2><a className="link" href="#/agenda">abrir</a></div>
            {agenda.length ? agenda.map((e) => (
              <a key={e.id + e.date} className="ag-card" href="#/agenda">
                <span className="ag-day"><b>{e.date === t ? 'Hoje' : 'Amanhã'}</b>{e.time && <small>{e.time}</small>}</span>
                <span><b>{e.title}</b>{e.place && <small><Icon name="pin" size={13} /> {e.place}</small>}</span>
              </a>
            )) : <p className="muted">Nada marcado para hoje e amanhã. <a className="link" href="#/agenda">Marcar compromisso</a></p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Entradas × saídas</h2><small className="muted">6 meses</small></div>
            <MonthBars data={chart} />
          </section>
        </div>
      </div>

      {projects.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Obras em andamento</h2><a className="link" href="#/obras">ver todas</a></div>
          <div className="proj-grid">
            {projects.map((p) => {
              const s = projectStats(data, p.id)
              const pe = data.entities.find((e) => e.id === p.entityId)
              return (
                <a key={p.id} className="proj-tile" href={`#/obras/${p.id}`}>
                  {p.budget > 0 ? <Ring value={s.budgetUse} /> : <span className="ring-ph"><Icon name="building" size={26} /></span>}
                  <span className="proj-tile-b">
                    <strong>{p.name}</strong>
                    <small className="muted"><EntityMark e={pe} size={14} /> {pe?.name} · {KIND_LABEL[p.kind]}</small>
                    <small>Gasto <b>{money(s.cost)}</b>{p.budget ? <span className="muted"> de {money(p.budget)}</span> : ''}</small>
                    {s.toReceive > 0 && <small className="pos">A receber {money(s.toReceive)}</small>}
                  </span>
                </a>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/** Resumo lado a lado das empresas (e do pessoal) para comparar. */
function Compare() {
  const { data, setSettings } = useStore()
  const ym = month(today())
  const rows = [...data.entities].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || Number(a.kind === 'pessoal') - Number(b.kind === 'pessoal')).map((e) => {
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
  return (
    <section className="compare-wrap">
      <div className="section-head"><h2>Suas empresas</h2><small className="muted">toque numa para ver só ela</small></div>
      <div className="co-grid">
        {rows.filter((r) => r.e.favorite || r.bal || r.rec || r.pay || r.res).map((r) => (
          <button key={r.e.id} className={`co-card ${r.e.favorite ? '' : 'minor'}`} style={{ ['--c' as string]: r.e.color }} onClick={() => setSettings({ scope: r.e.id })}>
            <span className="co-top"><EntityMark e={r.e} size={34} /><b>{r.e.name}</b>{r.obras > 0 && <span className="co-badge">{r.obras} obra{r.obras > 1 ? 's' : ''}</span>}</span>
            <span className="co-l">Saldo</span>
            <strong className={r.bal < 0 ? 'neg' : ''}>{money(r.bal)}</strong>
            <Sparkline values={r.series} color={r.e.color} />
            <span className="co-row"><span>Resultado do mês</span><b className={r.res < 0 ? 'neg' : 'pos'}>{money(r.res)}</b></span>
            <span className="co-row"><span className="pos">+ {money(r.rec)}</span><span className="neg">− {money(r.pay)}</span></span>
          </button>
        ))}
      </div>
    </section>
  )
}
