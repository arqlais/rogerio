import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { CalEvent, Tx } from '../types'
import { EntityMark } from '../components/ui'
import { Donut, ForecastChart, MonthBars, Ring } from '../components/Charts'
import { Icon } from '../components/Icon'
import { TxList } from '../components/TxList'
import { ownedBy, signed, accountBalance, addDays, daysBetween, addMonth, fmtDate, inScope, isLate, money, month, monthName, monthShort, monthSummary, projectStats, today } from '../utils'

const EV_TONE: Record<string, string> = { visita: 'orange', reuniao: 'navy', entrega: 'green', pessoal: 'purple', compromisso: 'navy', outro: 'navy', conta: 'red', receber: 'green' }

/** Início: o que importa hoje. Usa tudo (empresa + pessoal) e mostra a divisão sozinho. */
export function Dashboard({ onNewTx, onChat }: { onNewTx: (t: Partial<Tx>) => void; onChat?: () => void }) {
  const { data, setDemo, setSettings } = useStore()
  const scope = 'all'
  const t = today()
  const ym = month(t)
  const pessoal = data.entities.find((e) => e.kind === 'pessoal')

  const bal = (sc: string) => data.accounts.filter((a) => !a.archived && ownedBy(a.entityId, sc)).reduce((s, a) => s + accountBalance(data, a.id), 0)
  const balance = bal('all')
  const balEmp = bal('empresa')
  const balPes = pessoal ? bal(pessoal.id) : 0
  const open = data.txs.filter((x) => !x.paid && inScope(x, scope))
  const toReceive = open.filter((x) => x.kind === 'in')
  const toPay = open.filter((x) => x.kind === 'out')
  const late = open.filter((x) => isLate(x) && x.kind !== 'transfer')
  const sum = (l: Tx[]) => l.reduce((s, x) => s + x.amount, 0)
  const mEmp = monthSummary(data, ym, 'empresa')
  const mPes = pessoal ? monthSummary(data, ym, pessoal.id) : null
  const upcoming = open.filter((x) => x.due <= addDays(t, 15)).sort((a, b) => a.due.localeCompare(b.due))

  const pendingDaily = useMemo(() => data.attendance.filter((a) => !a.txId).reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0), [data.attendance])

  const chart = Array.from({ length: 6 }, (_, i) => {
    const k = addMonth(ym, i - 5)
    const s = monthSummary(data, k, scope)
    return { label: monthShort(k), a: s.inPaid + s.transfersIn, b: s.outPaid + s.transfersOut }
  })

  // agenda dos próximos 7 dias: compromissos + contas que vencem (no estilo de cronograma)
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i))
  const occurs = (e: CalEvent, d: string) => d === e.date || (d > e.date && (e.repeat === 'semanal' ? daysBetween(e.date, d) % 7 === 0 : e.repeat === 'mensal' ? d.slice(8) === e.date.slice(8) : false))
  const timeline = days.map((d) => ({
    d,
    items: [
      ...data.events.filter((e) => !e.done && occurs(e, d)).map((e) => ({ id: e.id, title: e.title, time: e.time, sub: e.place || data.projects.find((p) => p.id === e.projectId)?.name, tone: EV_TONE[e.kind] ?? 'navy', go: () => go('/agenda') })),
      ...open.filter((x) => (d === t ? x.due <= t : x.due === d) && x.kind !== 'transfer').map((x) => ({ id: x.id, title: x.description, time: undefined, sub: `${x.kind === 'in' ? 'receber' : 'pagar'} ${money(x.amount)}${x.due < t ? ' · vencido' : ''}`, tone: x.kind === 'in' ? 'green' : x.due < t ? 'red' : 'orange', go: () => go('/financeiro') })),
    ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')),
  }))
  const [day, setDay] = useState(t)
  const dayItems = timeline.find((x) => x.d === day)?.items ?? []

  const projects = data.projects.filter((p) => p.status === 'andamento')
  const fresh = !data.txs.length && !data.projects.length && !data.people.length

  // saldo previsto: saldo de hoje + o que vence em cada dia (atrasados contam hoje)
  const forecast = useMemo(() => {
    const pts: { date: string; value: number; ins: number; outs: number }[] = []
    let b = balance
    for (let i = 0; i <= 45; i++) {
      const d = addDays(t, i)
      let ins = 0, outs = 0
      for (const x of open) {
        const due = x.due < t ? t : x.due
        if (due !== d) continue
        const v = signed(x, scope)
        if (v > 0) ins += v
        else outs -= v
      }
      b += ins - outs
      pts.push({ date: d, value: b, ins, outs })
    }
    return pts
  }, [open, balance, t])
  const endBal = forecast[forecast.length - 1]?.value ?? balance
  const lowest = forecast.reduce((m, p) => (p.value < m.value ? p : m), forecast[0] ?? { value: balance, date: t })

  const spend = useMemo(() => {
    const by: Record<string, number> = {}
    for (const x of data.txs) if (x.kind === 'out' && month(x.paid ?? x.due) === ym) by[x.category] = (by[x.category] ?? 0) + x.amount
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
    return { rows, total: rows.reduce((s, r) => s + r[1], 0) }
  }, [data.txs, ym])
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const weekEnd = addDays(t, 7)
  const payWeek = toPay.filter((x) => x.due <= weekEnd)
  const recWeek = toReceive.filter((x) => x.due <= weekEnd)
  const todayEvents = timeline[0].items.filter((i) => i.time !== undefined || !i.sub?.includes('pagar')).length
  const lateOut = late.filter((x) => x.kind === 'out')
  const lateIn = late.filter((x) => x.kind === 'in')

  // "precisa da sua atenção": tarefas que o sistema encontra sozinho
  const todo: { icon: string; tone: 'bad' | 'warn' | 'info'; title: string; sub: string; action: string; go: () => void }[] = []
  if (lateOut.length) todo.push({ icon: 'alert', tone: 'bad', title: `${lateOut.length} conta${lateOut.length > 1 ? 's' : ''} vencida${lateOut.length > 1 ? 's' : ''}`, sub: `${money(sum(lateOut))} para pagar`, action: 'ver contas', go: () => go('/financeiro') })
  if (lateIn.length) todo.push({ icon: 'wallet', tone: 'warn', title: `Cobrar ${money(sum(lateIn))}`, sub: `${lateIn.length} recebimento${lateIn.length > 1 ? 's' : ''} atrasado${lateIn.length > 1 ? 's' : ''}`, action: 'ver quem deve', go: () => go('/financeiro') })
  if (pendingDaily > 0) todo.push({ icon: 'hardhat', tone: 'info', title: 'Acertar diárias', sub: `${money(pendingDaily)} com os diaristas`, action: 'abrir diárias', go: () => go('/equipe/diarias') })
  const oldQuotes = data.quotes.filter((q) => q.status === 'enviado' && daysBetween(q.date, t) >= 7)
  if (oldQuotes.length) todo.push({ icon: 'file', tone: 'info', title: `${oldQuotes.length} orçamento${oldQuotes.length > 1 ? 's' : ''} sem resposta`, sub: 'enviados há mais de 7 dias', action: 'ver orçamentos', go: () => go('/orcamentos') })
  for (const p of projects) {
    const st = projectStats(data, p.id)
    if (p.budget && st.budgetUse >= 90) todo.push({ icon: 'building', tone: st.budgetUse > 100 ? 'bad' : 'warn', title: `${p.name}: ${Math.round(st.budgetUse)}% do previsto`, sub: `gasto ${money(st.cost)} de ${money(p.budget)}`, action: 'ver obra', go: () => go(`/obras/${p.id}`) })
  }
  const lastYm = addMonth(ym, -1)
  const unpaid = data.people.filter((p) => p.role === 'fixo' && p.active && (p.salary ?? 0) > 0).filter((p) => !data.txs.some((x) => x.group === `folha-${lastYm}-${p.id}`))
  if (unpaid.length) todo.push({ icon: 'users', tone: 'info', title: `Salários de ${monthName(lastYm).split(' ')[0]}`, sub: `${unpaid.length} funcionário${unpaid.length > 1 ? 's' : ''} sem salário lançado`, action: 'lançar salários', go: () => go('/equipe/folha') })

  const [view, setView] = useState<'saldo' | 'meses' | 'gastos' | 'cnpj'>('saldo')
  const actions: [string, string, string, () => void][] = [
    ['arrowDown', 'Paguei uma conta', 'ou vou pagar', () => onNewTx({ kind: 'out' })],
    ['arrowUp', 'Recebi', 'ou vou receber', () => onNewTx({ kind: 'in' })],
    ['hardhat', 'Diárias', 'marcar e pagar', () => go('/equipe/diarias')],
    ['file', 'Orçamento', 'escola ou comum', () => go('/orcamentos')],
    ['calendar', 'Compromisso', 'visita, reunião', () => go('/agenda')],
    ['building', 'Nova obra', 'ou ver as obras', () => go('/obras')],
  ]
  const owner = data.settings.owner || 'Rogério'
  const viewFin = (sc: string) => { setSettings({ scope: sc }); go('/financeiro') }
  const maxSplit = Math.max(1, mEmp.inAll, mEmp.outAll, mPes?.inAll ?? 0, mPes?.outAll ?? 0)

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-in">
          <div className="hero-text">
            <span className="eyebrow light">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1 className="hero-title">{hello},<br /><em>{owner}</em></h1>
            <div className="hero-chips">
              <span><Icon name="calendar" size={15} /> {todayEvents ? `${todayEvents} compromisso${todayEvents > 1 ? 's' : ''} hoje` : 'agenda livre hoje'}</span>
              <span><Icon name="arrowDown" size={15} /> {payWeek.length ? `${payWeek.length} conta${payWeek.length > 1 ? 's' : ''} na semana · ${money(sum(payWeek))}` : 'nada pra pagar na semana'}</span>
              {recWeek.length > 0 && <span><Icon name="arrowUp" size={15} /> {money(sum(recWeek))} a receber</span>}
              {late.length > 0 && <span className="bad"><Icon name="alert" size={15} /> {late.length} atrasado{late.length > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <div className="hero-stats">
            <button onClick={() => viewFin('empresa')}><strong className={balEmp < 0 ? 'neg' : ''}>{money(balEmp)}</strong><span>saldo da empresa</span></button>
            <button onClick={() => pessoal && viewFin(pessoal.id)}><strong>{money(mPes?.outPaid ?? 0)}</strong><span>gastos pessoais em {monthName(ym).split(' ')[0]}</span></button>
            <button onClick={() => go('/financeiro')}><strong>{money(sum(toReceive))}</strong><span>a receber</span></button>
          </div>
        </div>
      </section>

      {fresh && (
        <div className="card welcome">
          <span className="eyebrow">começando</span>
          <h2 className="duo">Sua plataforma está <em>vazia</em></h2>
          <p>O passo a passo deixa tudo pronto em poucos minutos: empresas, saldo, equipe, obras e contas do mês. Se você anota em planilha, dá para importar.</p>
          <div className="row wrap">
            <button className="pill-btn" onClick={() => setSettings({ onboarded: false })}><span>Abrir o passo a passo</span><i><Icon name="chevron" size={18} /></i></button>
            <a className="btn" href="#/importar"><Icon name="upload" size={16} /> Importar planilha</a>
            <button className="btn ghost" onClick={() => setDemo(true)}>Ver um exemplo preenchido</button>
          </div>
        </div>
      )}

      <button className="ai-bar" onClick={onChat}>
        <span className="ai-logo"><Icon name="sparkle" size={18} /></span>
        <span className="ai-bar-t"><b>Pergunte ou conte o que aconteceu</b><small>“paguei 300 de areia pra obra do prédio” · “o que vence essa semana?” · foto de nota</small></span>
        <span className="ai-bar-go"><Icon name="chevron" size={18} /></span>
      </button>

      <section className="cmd">
        <h2 className="sec-title"><i />o que você quer fazer?</h2>
        <div className="cmd-grid">
          {actions.map(([ic, l, sub, fn], i) => (
            <button key={l} className={`cmd-btn c${i}`} onClick={fn}><span className="cmd-ic"><Icon name={ic} size={22} /></span><b>{l}</b><small>{sub}</small></button>
          ))}
        </div>
      </section>

      <div className="home-grid">
        <section className="card sched">
          <div className="card-head">
            <div><span className="eyebrow">próximos dias</span><h2 className="duo">Sua <em>agenda</em></h2></div>
            <a className="pill-btn sm" href="#/agenda"><span>abrir</span><i><Icon name="chevron" size={16} /></i></a>
          </div>
          <div className="sched-body">
            <div className="sched-days" role="tablist" aria-label="Dias">
              {timeline.map(({ d, items }) => (
                <button key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
                  <b>{d.slice(8)}</b><small>{d === t ? 'hoje' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
                  {items.length > 0 && <i />}
                </button>
              ))}
            </div>
            <div className="sched-list">
              {dayItems.length ? dayItems.map((it) => (
                <button key={it.id} className={`sched-item ${it.tone}`} onClick={it.go}>
                  <span className="sched-dot" />
                  <span className="sched-t"><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span>
                  <span className="sched-time">{it.time ?? ''}</span>
                </button>
              )) : <p className="sched-empty"><Icon name="check" size={18} /> Nada marcado para {day === t ? 'hoje' : fmtDate(day).slice(0, 5)}.</p>}
            </div>
          </div>
        </section>

        <section className="card todo">
          <div className="card-head"><div><span className="eyebrow">eu aviso</span><h2 className="duo">Precisa da <em>sua atenção</em></h2></div>{todo.length > 0 && <span className="todo-count">{todo.length}</span>}</div>
          {todo.length ? (
            <div className="todo-list">
              {todo.map((x) => (
                <button key={x.title} className={`todo-row ${x.tone}`} onClick={x.go}>
                  <span className="todo-ic"><Icon name={x.icon} size={18} /></span>
                  <span className="todo-t"><b>{x.title}</b><small>{x.sub}</small></span>
                  <span className="todo-go">{x.action} <Icon name="chevron" size={14} /></span>
                </button>
              ))}
            </div>
          ) : <p className="todo-ok"><Icon name="check" size={18} /> Tudo em dia. Nada pendente por aqui.</p>}
        </section>

        <section className="card split">
          <div className="card-head"><div><span className="eyebrow">separado sozinho · {monthName(ym).split(' ')[0]}</span><h2 className="duo">Empresa <em>e pessoal</em></h2></div></div>
          {([['empresa', 'Empresa', mEmp, balEmp, 'briefcase'], ...(pessoal && mPes ? [[pessoal.id, 'Pessoal', mPes, balPes, 'user']] : [])] as [string, string, ReturnType<typeof monthSummary>, number, string][]).map(([sc, label, m, b, ic]) => (
            <button key={sc} className="split-row" onClick={() => viewFin(sc)}>
              <span className={`split-ic ${label === 'Pessoal' ? 'pes' : 'emp'}`}><Icon name={ic} size={18} /></span>
              <span className="split-main">
                <span className="split-top"><b>{label}</b><small>saldo {money(b)}</small></span>
                <span className="split-bars">
                  <i className="in" style={{ width: `${(m.inAll / maxSplit) * 100}%` }} />
                  <i className="out" style={{ width: `${(m.outAll / maxSplit) * 100}%` }} />
                </span>
                <span className="split-nums"><span className="pos">+{money(m.inAll)}</span><span className="neg">−{money(m.outAll)}</span><b className={m.forecast < 0 ? 'neg' : ''}>{m.forecast >= 0 ? '' : '−'}{money(Math.abs(m.forecast))}</b></span>
              </span>
            </button>
          ))}
          <p className="muted small">Entradas, saídas e resultado previsto do mês. Toque para ver os lançamentos.</p>
        </section>

        <section className="card">
          <div className="card-head"><div><span className="eyebrow">em andamento</span><h2 className="duo">Suas <em>obras</em></h2></div><a className="link" href="#/obras">ver todas</a></div>
          {projects.length ? (
            <div className="proj-list">
              {projects.map((p) => {
                const st = projectStats(data, p.id)
                return (
                  <a key={p.id} className="proj-row" href={`#/obras/${p.id}`}>
                    {p.budget > 0 ? <Ring value={st.budgetUse} size={44} /> : <span className="ring-ph sm"><Icon name="building" size={18} /></span>}
                    <span className="proj-row-b"><b>{p.name}</b><small>gasto {money(st.cost)}{p.budget ? ` de ${money(p.budget)}` : ''}</small></span>
                  </a>
                )
              })}
            </div>
          ) : <p className="muted">Nenhuma obra em andamento. <a className="link" href="#/obras">Cadastrar obra</a></p>}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="seg compact">
            <button className={view === 'saldo' ? 'on' : ''} onClick={() => setView('saldo')}>saldo previsto</button>
            <button className={view === 'meses' ? 'on' : ''} onClick={() => setView('meses')}>entradas × saídas</button>
            <button className={view === 'gastos' ? 'on' : ''} onClick={() => setView('gastos')}>gastos do mês</button>
            <button className={view === 'cnpj' ? 'on' : ''} onClick={() => setView('cnpj')}>por CNPJ</button>
          </div>
          {view === 'saldo' && <span className={`chip-v ${endBal < balance ? 'down' : 'up'}`}>{money(Math.abs(endBal - balance))} em 45 dias{lowest.value < 0 ? ` · negativo em ${fmtDate(lowest.date).slice(0, 5)}` : ''}</span>}
        </div>
        {view === 'saldo' && <ForecastChart points={forecast} height={220} />}
        {view === 'meses' && <MonthBars data={chart} />}
        {view === 'gastos' && (spend.total ? <Donut rows={spend.rows} total={spend.total} /> : <p className="muted">Nenhum gasto lançado neste mês.</p>)}
        {view === 'cnpj' && <Compare scope={scope} />}
      </section>

      <section className="card">
        <div className="card-head"><div><span className="eyebrow">15 dias</span><h2 className="duo">Contas que <em>vêm aí</em></h2></div><button className="link" onClick={() => onNewTx({ kind: 'out', paid: undefined })}>+ lançar conta</button></div>
        <TxList txs={upcoming} scope={scope} empty="Nada vencendo nos próximos 15 dias" />
      </section>
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
