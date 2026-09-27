import { useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { TxForm } from '../components/TxForm'
import { TxList } from '../components/TxList'
import { Empty, Stat } from '../components/ui'
import { ROLE_LABEL, money, num } from '../utils'
import { PersonForm } from './Team'

export function PersonDetail({ id }: { id: string }) {
  const { data } = useStore()
  const p = data.people.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  const [tx, setTx] = useState<Partial<Tx> | null>(null)
  if (!p) return <div className="page"><Empty title="Cadastro não encontrado" action={<a className="btn" href="#/equipe/pessoas">Voltar</a>} /></div>
  const txs = data.txs.filter((t) => t.personId === p.id).sort((a, b) => (b.paid ?? b.due).localeCompare(a.paid ?? a.due))
  const paidOut = txs.filter((t) => t.kind === 'out' && t.paid).reduce((s, t) => s + t.amount, 0)
  const openOut = txs.filter((t) => t.kind === 'out' && !t.paid).reduce((s, t) => s + t.amount, 0)
  const received = txs.filter((t) => t.kind === 'in' && t.paid).reduce((s, t) => s + t.amount, 0)
  const att = data.attendance.filter((a) => a.personId === p.id)
  const openDays = att.filter((a) => !a.txId)
  const wa = p.phone?.replace(/\D/g, '')
  return (
    <div className="page">
      <a className="back" href="#/equipe/pessoas">‹ Pessoas</a>
      <div className="page-head">
        <div>
          <h1>{p.name}</h1>
          <p className="muted">{ROLE_LABEL[p.role]}{p.job ? ` · ${p.job}` : ''}{p.active ? '' : ' · inativo'}</p>
        </div>
        <div className="row wrap">
          {wa && <a className="btn" href={`https://wa.me/${wa.length <= 11 ? '55' + wa : wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className="btn" onClick={() => setEdit(true)}>Editar</button>
          <button className="btn primary" onClick={() => setTx({ kind: p.role === 'cliente' ? 'in' : 'out', personId: p.id, entityId: p.entityId })}>{p.role === 'cliente' ? '+ Recebimento' : '+ Pagamento'}</button>
        </div>
      </div>
      <div className="stats">
        {p.role === 'cliente' ? <Stat label="Recebido" value={money(received)} tone="good" /> : <Stat label="Total pago" value={money(paidOut)} />}
        <Stat label="Em aberto" value={money(openOut + openDays.reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0))} tone={openOut || openDays.length ? 'warn' : undefined} sub={openDays.length ? `${num(openDays.reduce((s, a) => s + a.fraction, 0))} diária(s) sem pagar` : undefined} />
        {p.role === 'fixo' && <Stat label="Salário" value={money(p.salary ?? 0)} />}
        {p.role === 'diarista' && <Stat label="Diária" value={money(p.dailyRate ?? 0)} sub={`${num(att.reduce((s, a) => s + a.fraction, 0))} dias trabalhados`} />}
        {p.pix && <Stat label="Pix" value={<span className="small">{p.pix}</span>} />}
      </div>
      {(p.doc || p.phone || p.notes) && (
        <section className="card">
          {p.phone && <div className="kv"><span>Telefone</span><b>{p.phone}</b></div>}
          {p.doc && <div className="kv"><span>CPF/CNPJ</span><b>{p.doc}</b></div>}
          {p.notes && <p className="muted">{p.notes}</p>}
        </section>
      )}
      <h3 className="section-t">Histórico</h3>
      <TxList txs={txs} hide={['person']} empty="Nenhum pagamento ainda" />
      {edit && <PersonForm initial={p} onClose={() => setEdit(false)} />}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </div>
  )
}
