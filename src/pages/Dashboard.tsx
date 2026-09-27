import { useMemo } from 'react'
import { useStore, sampleData } from '../store'
import { go } from '../router'
import type { Tx } from '../types'
import { BarsChart, Progress, Stat, confirmDialog } from '../components/ui'
import { TxList } from '../components/TxList'
import { KIND_LABEL, accountBalance, addDays, daysBetween, addMonth, inScope, isLate, money, month, monthName, monthShort, monthSummary, projectStats, today } from '../utils'

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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Olá, {data.settings.owner || 'bem-vindo'}</h1>
          <p className="muted">{ent ? ent.name : 'Todas as empresas e pessoal'} · {monthName(ym)}</p>
        </div>
      </div>

      {fresh && (
        <div className="card welcome">
          <h2>Vamos começar</h2>
          <ol>
            <li><a href="#/cadastros/empresas">Cadastre suas empresas (CNPJs), o pessoal e as contas bancárias</a> com o saldo de hoje.</li>
            <li><a href="#/obras">Cadastre as obras</a> — para o prédio, escolha "Incorporação" e gere os 9 apartamentos (3 pavimentos × 3).</li>
            <li><a href="#/equipe/pessoas">Cadastre a equipe</a>: fixos (salário), diaristas (valor da diária) e empreiteiros.</li>
            <li>Lance as contas a pagar e a receber pelo botão <b>+ Lançar</b>.</li>
          </ol>
          <button className="btn" onClick={loadSample}>Ver a plataforma com dados de exemplo</button>
        </div>
      )}

      <div className="stats">
        <Stat label="Saldo nas contas" value={money(balance)} sub={`${accounts.length} conta(s)`} tone={balance < 0 ? 'bad' : undefined} onClick={() => go('/cadastros/empresas')} />
        <Stat label="A receber" value={money(sum(toReceive))} sub={`${toReceive.length} lançamento(s)`} tone="good" onClick={() => go('/financeiro')} />
        <Stat label="A pagar" value={money(sum(toPay) + pendingDaily)} sub={pendingDaily ? `inclui ${money(pendingDaily)} em diárias` : `${toPay.length} lançamento(s)`} tone="warn" onClick={() => go('/financeiro')} />
        <Stat label={`Resultado de ${monthName(ym).split(' ')[0]}`} value={money(m.result)} sub={`previsto no mês: ${money(m.forecast)}`} tone={m.result < 0 ? 'bad' : 'good'} />
      </div>

      {scope === 'all' && <Compare />}

      {(late.length > 0 || pendingDaily > 0) && (
        <div className="alerts">
          {late.filter((x) => x.kind === 'out').length > 0 && (
            <div className="alert bad" onClick={() => go('/financeiro')}>
              <b>{late.filter((x) => x.kind === 'out').length} conta(s) vencida(s)</b> — {money(sum(late.filter((x) => x.kind === 'out')))} a pagar
            </div>
          )}
          {late.filter((x) => x.kind === 'in').length > 0 && (
            <div className="alert warn" onClick={() => go('/financeiro')}>
              <b>{late.filter((x) => x.kind === 'in').length} recebimento(s) atrasado(s)</b> — {money(sum(late.filter((x) => x.kind === 'in')))} para cobrar
            </div>
          )}
          {pendingDaily > 0 && (
            <div className="alert info" onClick={() => go('/equipe/diarias')}>
              <b>Diárias em aberto:</b> {money(pendingDaily)} para acertar com os diaristas
            </div>
          )}
        </div>
      )}

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
            <div className="card-head"><h2>Agenda de hoje e amanhã</h2><a className="link" href="#/agenda">abrir agenda</a></div>
            {agenda.length ? agenda.map((e) => (
              <a key={e.id + e.date} className="ag-item" href="#/agenda">
                <span className="dot" style={{ background: '#e8772e' }} />
                <span><b>{e.date === t ? 'Hoje' : 'Amanhã'}{e.time ? ` ${e.time}` : ''} · {e.title}</b>{e.place && <small>{e.place}</small>}</span>
              </a>
            )) : <p className="muted">Nenhum compromisso. <a href="#/agenda">Marcar</a></p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Últimos 6 meses</h2></div>
            <BarsChart data={chart} />
          </section>
          <section className="card">
            <div className="card-head"><h2>Contas</h2><a className="link" href="#/cadastros/empresas">editar</a></div>
            <div className="acc-list">
              {accounts.map((a) => {
                const v = accountBalance(data, a.id)
                const e = data.entities.find((x) => x.id === a.entityId)
                return (
                  <div key={a.id} className="acc">
                    <span className="dot" style={{ background: e?.color }} />
                    <span className="acc-name">{a.name}<small>{e?.name}</small></span>
                    <b className={v < 0 ? 'neg' : ''}>{money(v)}</b>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      {projects.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Obras em andamento</h2><a className="link" href="#/obras">ver todas</a></div>
          <div className="proj-grid">
            {projects.map((p) => {
              const s = projectStats(data, p.id)
              return (
                <a key={p.id} className="proj-mini" href={`#/obras/${p.id}`}>
                  <strong>{p.name}</strong>
                  <small className="muted">{KIND_LABEL[p.kind]}</small>
                  <span className="small">Gasto <b>{money(s.cost)}</b>{p.budget ? <span className="muted"> de {money(p.budget)}</span> : ''}</span>
                  {p.budget > 0 && <Progress value={s.budgetUse} />}
                  {s.toReceive > 0 && <small className="pos">A receber: {money(s.toReceive)}</small>}
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
    return { e, bal, rec, pay, res: m.result, inM: m.inPaid, year: y.i - y.o, yearIn: y.i, obras, quotes }
  })
  const maxIn = Math.max(1, ...rows.map((r) => r.yearIn))
  return (
    <section className="card flush">
      <div className="card-head pad"><h2>Comparar empresas</h2><small className="muted">toque numa empresa para ver só ela</small></div>
      <div className="compare">
        <table className="table">
          <thead><tr><th>Empresa</th><th className="r">Saldo</th><th className="r">A receber</th><th className="r">A pagar</th><th className="r">Resultado do mês</th><th className="r">Últimos 12 meses</th><th className="r">Obras</th><th className="r">Orçam. enviados</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id} className={`clickable ${r.e.favorite ? '' : 'minor'}`} onClick={() => setSettings({ scope: r.e.id })}>
                <td><span className="row"><span className="dot" style={{ background: r.e.color }} /><b>{r.e.name}</b>{r.e.favorite && <span className="muted">★</span>}</span></td>
                <td className={`r ${r.bal < 0 ? 'neg' : ''}`}>{money(r.bal)}</td>
                <td className="r pos">{money(r.rec)}</td>
                <td className="r neg">{money(r.pay)}</td>
                <td className={`r ${r.res < 0 ? 'neg' : 'pos'}`}><b>{money(r.res)}</b></td>
                <td className="r"><span className={r.year < 0 ? 'neg' : ''}>{money(r.year)}</span><div className="mini-bar"><div style={{ width: `${(r.yearIn / maxIn) * 100}%`, background: r.e.color }} /></div></td>
                <td className="r">{r.obras || '—'}</td>
                <td className="r">{r.quotes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
