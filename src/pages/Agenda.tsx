import { useState } from 'react'
import { useStore } from '../store'
import type { CalEvent, EventKind, Tx } from '../types'
import { TxForm } from '../components/TxForm'
import { Field, Modal, confirmDialog, toast } from '../components/ui'
import { WEEKDAYS, addDays, addMonth, addMonths, daysBetween, fmtDate, inScope, money, month, monthName, projectName, toDate, today, uid } from '../utils'

const KINDS: Record<EventKind, [string, string]> = {
  visita: ['Visita à obra', '#e8772e'],
  reuniao: ['Reunião', '#2f6fb0'],
  compromisso: ['Compromisso', '#8a4fbf'],
  entrega: ['Entrega / prazo', '#c0392b'],
  pessoal: ['Pessoal', '#2f9e6b'],
  outro: ['Outro', '#5b6573'],
}

type Item =
  | { type: 'event'; date: string; ev: CalEvent }
  | { type: 'tx'; date: string; tx: Tx }
  | { type: 'obra'; date: string; id: string; name: string }

/** Repetições semanais/mensais aparecem em cada data do intervalo. */
function occurrences(ev: CalEvent, from: string, to: string): string[] {
  if (!ev.repeat) return ev.date >= from && ev.date <= to ? [ev.date] : []
  const out: string[] = []
  let d = ev.date
  let i = 0
  if (ev.repeat === 'semanal' && d < from) d = addDays(d, Math.floor(daysBetween(d, from) / 7) * 7)
  while (d <= to && i < 500) {
    if (d >= from) out.push(d)
    i++
    d = ev.repeat === 'semanal' ? addDays(d, 7) : addMonths(ev.date, i)
  }
  return out
}

export function Agenda() {
  const { data } = useStore()
  const scope = data.settings.scope
  const [ym, setYm] = useState(month(today()))
  const [day, setDay] = useState(today())
  const [edit, setEdit] = useState<Partial<CalEvent> | null>(null)
  const [tx, setTx] = useState<Tx | null>(null)
  const [showMoney, setShowMoney] = useState(true)

  const first = `${ym}-01`
  const gridStart = addDays(first, -toDate(first).getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const from = days[0], to = days[41]

  const items: Item[] = []
  for (const ev of data.events) for (const d of occurrences(ev, from, addDays(to, 60))) items.push({ type: 'event', date: d, ev })
  if (showMoney) for (const t of data.txs) if (!t.paid && t.kind !== 'transfer' && inScope(t, scope)) items.push({ type: 'tx', date: t.due, tx: t })
  for (const p of data.projects) if (p.end && p.status !== 'concluida' && (scope === 'all' || p.entityId === scope)) items.push({ type: 'obra', date: p.end, id: p.id, name: p.name })
  const on = (d: string) => items.filter((i) => i.date === d).sort((a, b) => (a.type === 'event' ? a.ev.time ?? '' : 'zz').localeCompare(b.type === 'event' ? b.ev.time ?? '' : 'zz'))
  const upcoming = items.filter((i) => i.type === 'event' && i.date >= today() && i.date <= addDays(today(), 14) && !i.ev.done).sort((a, b) => a.date.localeCompare(b.date))

  const Row = ({ it }: { it: Item }) => {
    if (it.type === 'event') {
      const [label, color] = KINDS[it.ev.kind]
      return (
        <button className={`ag-item ${it.ev.done ? 'done' : ''}`} onClick={() => setEdit(it.ev)}>
          <span className="dot" style={{ background: color }} />
          <span><b>{it.ev.time ? `${it.ev.time} · ` : ''}{it.ev.title}</b><small>{label}{it.ev.projectId ? ` · ${projectName(data, it.ev.projectId)}` : ''}{it.ev.place ? ` · ${it.ev.place}` : ''}{it.ev.repeat ? ` · repete ${it.ev.repeat === 'semanal' ? 'toda semana' : 'todo mês'}` : ''}</small></span>
        </button>
      )
    }
    if (it.type === 'tx') {
      return (
        <button className="ag-item" onClick={() => setTx(it.tx)}>
          <span className={`dot ${it.tx.kind === 'in' ? 'in' : 'out'}`} />
          <span><b>{it.tx.kind === 'in' ? 'Receber' : 'Pagar'} {money(it.tx.amount)}</b><small>{it.tx.description}</small></span>
        </button>
      )
    }
    return (
      <a className="ag-item" href={`#/obras/${it.id}`}>
        <span className="dot" style={{ background: '#c0392b' }} />
        <span><b>Término previsto</b><small>{it.name}</small></span>
      </a>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Agenda</h1>
        <button className="btn primary" onClick={() => setEdit({ date: day })}>+ Compromisso</button>
      </div>
      <div className="agenda">
        <section className="card flush">
          <div className="month-nav pad">
            <button className="icon-btn" onClick={() => setYm(addMonth(ym, -1))} aria-label="Mês anterior">‹</button>
            <strong>{monthName(ym)}</strong>
            <button className="icon-btn" onClick={() => setYm(addMonth(ym, 1))} aria-label="Próximo mês">›</button>
            <button className="btn small" onClick={() => { setYm(month(today())); setDay(today()) }}>Hoje</button>
            <span style={{ flex: 1 }} />
            <label className="check small"><input type="checkbox" checked={showMoney} onChange={(e) => setShowMoney(e.target.checked)} /> mostrar contas</label>
          </div>
          <div className="cal">
            {WEEKDAYS.map((w) => <div key={w} className="cal-h">{w}</div>)}
            {days.map((d) => {
              const list = on(d)
              const evs = list.filter((i) => i.type === 'event')
              const pay = list.filter((i) => i.type === 'tx' && i.tx.kind === 'out').length
              const rec = list.filter((i) => i.type === 'tx' && i.tx.kind === 'in').length
              return (
                <button key={d} className={`cal-d ${month(d) !== ym ? 'other' : ''} ${d === today() ? 'today' : ''} ${d === day ? 'sel' : ''}`} onClick={() => setDay(d)} onDoubleClick={() => setEdit({ date: d })}>
                  <span className="cal-n">{Number(d.slice(8))}</span>
                  <span className="cal-evs">
                    {evs.slice(0, 2).map((i, k) => i.type === 'event' && <span key={k} className="cal-ev" style={{ background: KINDS[i.ev.kind][1] }}>{i.ev.time ? i.ev.time + ' ' : ''}{i.ev.title}</span>)}
                    {evs.length > 2 && <span className="cal-more">+{evs.length - 2}</span>}
                  </span>
                  <span className="cal-dots">
                    {pay > 0 && <span className="dot out" title={`${pay} a pagar`} />}
                    {rec > 0 && <span className="dot in" title={`${rec} a receber`} />}
                    {list.some((i) => i.type === 'obra') && <span className="dot" style={{ background: '#c0392b' }} />}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>{fmtDate(day)} · {WEEKDAYS[toDate(day).getDay()]}</h2><button className="link" onClick={() => setEdit({ date: day })}>+ adicionar</button></div>
            {on(day).length ? on(day).map((it, i) => <Row key={i} it={it} />) : <p className="muted">Nada neste dia.</p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Próximos 14 dias</h2></div>
            {upcoming.length ? upcoming.map((it, i) => <div key={i} className="ag-up"><small>{fmtDate(it.date).slice(0, 5)}</small><Row it={it} /></div>) : <p className="muted">Nenhum compromisso marcado.</p>}
          </section>
        </div>
      </div>
      {edit && <EventForm initial={edit} onClose={() => setEdit(null)} />}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </div>
  )
}

export function EventForm({ initial, onClose }: { initial: Partial<CalEvent>; onClose: () => void }) {
  const { data, save, remove } = useStore()
  const editing = !!initial.id
  const [e, setE] = useState<CalEvent>(() => ({ id: uid(), title: '', date: today(), kind: 'visita', ...initial }))
  const set = (x: Partial<CalEvent>) => setE((o) => ({ ...o, ...x }))
  const submit = () => {
    if (!e.title.trim()) return toast('Escreva o que é o compromisso', 'err')
    save('events', { ...e, title: e.title.trim() })
    toast('Compromisso salvo')
    onClose()
  }
  const del = async () => {
    if (await confirmDialog(e.repeat ? 'Excluir este compromisso e todas as repetições?' : 'Excluir este compromisso?', 'Excluir')) { remove('events', e.id); onClose() }
  }
  return (
    <Modal title={editing ? 'Compromisso' : 'Novo compromisso'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} />{editing && <button className="btn" onClick={() => { save('events', { ...e, done: !e.done }); onClose() }}>{e.done ? 'Reabrir' : '✓ Feito'}</button>}<button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="O quê" span={2}><input value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder="Ex.: Visita na escola, reunião na prefeitura, entregar medição" autoFocus aria-label="Título" /></Field>
        <Field label="Tipo">
          <div className="chips pick">
            {Object.entries(KINDS).map(([k, [l, c]]) => <button key={k} className={e.kind === k ? 'on' : ''} style={{ ['--c' as string]: c }} onClick={() => set({ kind: k as EventKind })}>{l}</button>)}
          </div>
        </Field>
        <Field label="Obra (opcional)">
          <select value={e.projectId ?? ''} onChange={(x) => set({ projectId: x.target.value || undefined })} aria-label="Obra">
            <option value="">—</option>
            {data.projects.filter((p) => p.status !== 'concluida' || p.id === e.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Dia"><input type="date" value={e.date} onChange={(x) => set({ date: x.target.value })} aria-label="Dia" /></Field>
        <Field label="Horário (opcional)"><input type="time" value={e.time ?? ''} onChange={(x) => set({ time: x.target.value || undefined })} aria-label="Horário" /></Field>
        <Field label="Local"><input value={e.place ?? ''} onChange={(x) => set({ place: x.target.value })} aria-label="Local" /></Field>
        <Field label="Repetir">
          <select value={e.repeat ?? ''} onChange={(x) => set({ repeat: (x.target.value || undefined) as CalEvent['repeat'] })} aria-label="Repetir">
            <option value="">Não repete</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
          </select>
        </Field>
        <Field label="Anotações" span={2}><textarea rows={3} value={e.notes ?? ''} onChange={(x) => set({ notes: x.target.value })} aria-label="Anotações" /></Field>
      </div>
    </Modal>
  )
}
