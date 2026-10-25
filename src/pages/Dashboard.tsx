import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { CalEvent, Tx } from '../types'
import { Icon } from '../components/Icon'
import { ownedBy, accountBalance, addDays, daysBetween, addMonth, fmtDate, isLate, money, month, monthName, monthSummary, projectStats, today } from '../utils'

const EV_TONE: Record<string, string> = { visita: 'orange', reuniao: 'navy', entrega: 'green', pessoal: 'purple', compromisso: 'navy', outro: 'navy' }

/** Início simples: resumo, o que fazer, o que precisa de atenção e a agenda. O resto fica nas páginas. */
export function Dashboard({ onNewTx, onChat }: { onNewTx: (t: Partial<Tx>) => void; onChat?: () => void }) {
  const { data, setDemo, setSettings } = useStore()
  const t = today()
  const ym = month(t)
  const pessoal = data.entities.find((e) => e.kind === 'pessoal')

  const bal = (sc: string) => data.accounts.filter((a) => !a.archived && ownedBy(a.entityId, sc)).reduce((s, a) => s + accountBalance(data, a.id), 0)
  const balEmp = bal('empresa')
  const open = data.txs.filter((x) => !x.paid && x.kind !== 'transfer')
  const toReceive = open.filter((x) => x.kind === 'in')
  const late = open.filter((x) => isLate(x))
  const sum = (l: Tx[]) => l.reduce((s, x) => s + x.amount, 0)
  const mPes = pessoal ? monthSummary(data, ym, pessoal.id) : null
  const pendingDaily = useMemo(() => data.attendance.filter((a) => !a.txId).reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0), [data.attendance])

  // agenda dos próximos 7 dias: compromissos + contas que vencem
  const occurs = (e: CalEvent, d: string) => d === e.date || (d > e.date && (e.repeat === 'semanal' ? daysBetween(e.date, d) % 7 === 0 : e.repeat === 'mensal' ? d.slice(8) === e.date.slice(8) : false))
  const timeline = Array.from({ length: 7 }, (_, i) => addDays(t, i)).map((d) => ({
    d,
    items: [
      ...data.events.filter((e) => !e.done && occurs(e, d)).map((e) => ({ id: e.id, title: e.title, time: e.time, sub: e.place || data.projects.find((p) => p.id === e.projectId)?.name, tone: EV_TONE[e.kind] ?? 'navy', go: () => go('/agenda') })),
      ...open.filter((x) => (d === t ? x.due <= t : x.due === d)).map((x) => ({ id: x.id, title: x.description, time: undefined as string | undefined, sub: `${x.kind === 'in' ? 'receber' : 'pagar'} ${money(x.amount)}${x.due < t ? ' · vencido' : ''}`, tone: x.kind === 'in' ? 'green' : x.due < t ? 'red' : 'orange', go: () => go('/financeiro') })),
    ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')),
  }))
  const [day, setDay] = useState(t)
  const dayItems = timeline.find((x) => x.d === day)?.items ?? []
  const fresh = !data.txs.length && !data.projects.length && !data.people.length

  // o que precisa de atenção (o sistema encontra sozinho)
  const lateOut = late.filter((x) => x.kind === 'out')
  const lateIn = late.filter((x) => x.kind === 'in')
  const todo: { icon: string; tone: 'bad' | 'warn' | 'info'; title: string; sub: string; go: () => void }[] = []
  if (lateOut.length) todo.push({ icon: 'alert', tone: 'bad', title: `${lateOut.length} conta${lateOut.length > 1 ? 's' : ''} vencida${lateOut.length > 1 ? 's' : ''}`, sub: `${money(sum(lateOut))} para pagar`, go: () => go('/financeiro') })
  if (lateIn.length) todo.push({ icon: 'wallet', tone: 'warn', title: `Cobrar ${money(sum(lateIn))}`, sub: `${lateIn.length} recebimento${lateIn.length > 1 ? 's' : ''} atrasado${lateIn.length > 1 ? 's' : ''}`, go: () => go('/financeiro') })
  if (pendingDaily > 0) todo.push({ icon: 'hardhat', tone: 'info', title: 'Acertar diárias', sub: `${money(pendingDaily)} com os diaristas`, go: () => go('/equipe/diarias') })
  const oldQuotes = data.quotes.filter((q) => q.status === 'enviado' && daysBetween(q.date, t) >= 7)
  if (oldQuotes.length) todo.push({ icon: 'file', tone: 'info', title: `${oldQuotes.length} orçamento${oldQuotes.length > 1 ? 's' : ''} sem resposta`, sub: 'enviados há mais de 7 dias', go: () => go('/orcamentos') })
  for (const p of data.projects.filter((x) => x.status === 'andamento')) {
    const st = projectStats(data, p.id)
    if (p.budget && st.budgetUse >= 90) todo.push({ icon: 'building', tone: st.budgetUse > 100 ? 'bad' : 'warn', title: `${p.name}: ${Math.round(st.budgetUse)}% do previsto`, sub: `gasto ${money(st.cost)} de ${money(p.budget)}`, go: () => go(`/obras/${p.id}`) })
  }
  const lastYm = addMonth(ym, -1)
  const unpaid = data.people.filter((p) => p.role === 'fixo' && p.active && (p.salary ?? 0) > 0).filter((p) => !data.txs.some((x) => x.group === `folha-${lastYm}-${p.id}`))
  if (unpaid.length) todo.push({ icon: 'users', tone: 'info', title: `Salários de ${monthName(lastYm).split(' ')[0]}`, sub: `${unpaid.length} sem salário lançado`, go: () => go('/equipe/folha') })

  const actions: [string, string, () => void][] = [
    ['arrowDown', 'Gastei / paguei', () => onNewTx({ kind: 'out' })],
    ['arrowUp', 'Recebi', () => onNewTx({ kind: 'in' })],
    ['file', 'Orçamento', () => go('/orcamentos')],
    ['hardhat', 'Diárias', () => go('/equipe/diarias')],
  ]
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const viewFin = (sc: string) => { setSettings({ scope: sc }); go('/financeiro') }

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-in">
          <div className="hero-text">
            <span className="eyebrow light">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1 className="hero-title">{hello}, <em>{data.settings.owner || 'Rogério'}</em></h1>
          </div>
          <div className="hero-stats">
            <button onClick={() => viewFin('empresa')}><strong className={balEmp < 0 ? 'neg' : ''}>{money(balEmp)}</strong><span>saldo da empresa</span></button>
            <button onClick={() => pessoal && viewFin(pessoal.id)}><strong>{money(mPes?.outPaid ?? 0)}</strong><span>gasto pessoal no mês</span></button>
            <button onClick={() => viewFin('all')}><strong>{money(sum(toReceive))}</strong><span>a receber</span></button>
          </div>
        </div>
      </section>

      {fresh && (
        <div className="card welcome">
          <h2 className="duo">Vamos <em>começar?</em></h2>
          <p>O passo a passo deixa tudo pronto em poucos minutos. Se você anota em planilha, dá para importar.</p>
          <div className="row wrap">
            <button className="pill-btn" onClick={() => setSettings({ onboarded: false })}><span>Passo a passo</span><i><Icon name="chevron" size={18} /></i></button>
            <a className="btn" href="#/importar">Importar planilha</a>
            <button className="btn ghost" onClick={() => setDemo(true)}>Ver exemplo</button>
          </div>
        </div>
      )}

      <div className="acts">
        {actions.map(([ic, l, fn], i) => (
          <button key={l} className={`act-btn q${i}`} onClick={fn}><span><Icon name={ic} size={22} /></span>{l}</button>
        ))}
      </div>

      <button className="ai-bar" onClick={onChat}>
        <span className="ai-logo"><Icon name="sparkle" size={18} /></span>
        <span className="ai-bar-t"><b>Pergunte ou conte o que aconteceu</b><small>ex.: “paguei 300 de areia pra obra do prédio”</small></span>
        <span className="ai-bar-go"><Icon name="chevron" size={18} /></span>
      </button>

      <div className="home-grid">
        <section className="card sched">
          <div className="card-head"><h2>Agenda</h2><a className="link" href="#/agenda">ver tudo</a></div>
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
            )) : <p className="sched-empty"><Icon name="check" size={18} /> Nada para {day === t ? 'hoje' : fmtDate(day).slice(0, 5)}.</p>}
          </div>
        </section>

        <section className="card todo">
          <div className="card-head"><h2>Precisa de atenção</h2>{todo.length > 0 && <span className="todo-count">{todo.length}</span>}</div>
          {todo.length ? (
            <div className="todo-list">
              {todo.map((x) => (
                <button key={x.title} className={`todo-row ${x.tone}`} onClick={x.go}>
                  <span className="todo-ic"><Icon name={x.icon} size={18} /></span>
                  <span className="todo-t"><b>{x.title}</b><small>{x.sub}</small></span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          ) : <p className="todo-ok"><Icon name="check" size={18} /> Tudo em dia.</p>}
        </section>
      </div>
    </div>
  )
}
