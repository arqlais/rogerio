import { useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { TxForm } from '../components/TxForm'
import { TxList } from '../components/TxList'
import { Empty, Stat } from '../components/ui'
import { ROLE_LABEL, fmtDate, money, num } from '../utils'
import { Icon } from '../components/Icon'
import { toast } from '../components/ui'
import { PersonForm } from './Team'

const PIX = { cpf: 'CPF', telefone: 'telefone', email: 'e-mail', cnpj: 'CNPJ', aleatoria: 'aleatória' } as const
function Copy({ text }: { text?: string }) {
  if (!text) return <b className="muted">—</b>
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copiado') } catch { toast('Selecione e copie o texto', 'err') } }
  return <span className="copy"><b>{text}</b><button className="link small" onClick={copy}>copiar</button></span>
}

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
      <section className="card person-hero">
        {p.photo ? <img className="ph-photo" src={p.photo} alt="" /> : <span className="ph-photo ph">{p.name.slice(0, 1).toUpperCase()}</span>}
        <div className="ph-id">
          <h1>{p.name}</h1>
          <p className="muted">{p.fullName && p.fullName !== p.name ? `${p.fullName} · ` : ''}{ROLE_LABEL[p.role]}{p.job ? ` · ${p.job}` : ''}{p.active ? '' : ' · inativo'}</p>
        </div>
        <div className="row wrap">
          {wa && <a className="btn" href={`https://wa.me/${wa.length <= 11 ? '55' + wa : wa}`} target="_blank" rel="noreferrer"><Icon name="phone" size={16} /> WhatsApp</a>}
          <button className="btn" onClick={() => setEdit(true)}><Icon name="pencil" size={16} /> Editar ficha</button>
          <button className="btn primary" onClick={() => setTx({ kind: p.role === 'cliente' ? 'in' : 'out', personId: p.id, entityId: p.entityId })}>{p.role === 'cliente' ? '+ Recebimento' : '+ Pagamento'}</button>
        </div>
      </section>
      <div className="stats">
        {p.role === 'cliente' ? <Stat label="Recebido" value={money(received)} tone="good" /> : <Stat label="Total pago" value={money(paidOut)} />}
        <Stat label="Em aberto" value={money(openOut + openDays.reduce((s, a) => s + a.rate * a.fraction + (a.extra ?? 0), 0))} tone={openOut || openDays.length ? 'warn' : undefined} sub={openDays.length ? `${num(openDays.reduce((s, a) => s + a.fraction, 0))} diária(s) sem pagar` : undefined} />
        {p.role === 'fixo' && <Stat label="Salário" value={money(p.salary ?? 0)} />}
        {p.role === 'diarista' && <Stat label="Diária" value={money(p.dailyRate ?? 0)} sub={`${num(att.reduce((s, a) => s + a.fraction, 0))} dias trabalhados`} />}
      </div>
      <div className="cols even">
        <section className="card">
          <div className="card-head"><h2>Pix e pagamento</h2></div>
          <div className="kv"><span>Chave Pix{p.pixType ? ` (${PIX[p.pixType]})` : ''}</span><Copy text={p.pix} /></div>
          <div className="kv"><span>Banco</span><Copy text={p.bank} /></div>
          {p.role === 'fixo' && <div className="kv"><span>Salário</span><b>{money(p.salary ?? 0)}</b></div>}
          {p.role === 'diarista' && <div className="kv"><span>Diária</span><b>{money(p.dailyRate ?? 0)}</b></div>}
          {p.admission && <div className="kv"><span>{p.role === 'fixo' ? 'Admissão' : 'Desde'}</span><b>{fmtDate(p.admission)}</b></div>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Dados pessoais</h2><button className="link" onClick={() => setEdit(true)}>editar</button></div>
          <div className="kv"><span>Nome completo</span><Copy text={p.fullName} /></div>
          <div className="kv"><span>Telefone</span><Copy text={p.phone} /></div>
          <div className="kv"><span>CPF / CNPJ</span><Copy text={p.doc} /></div>
          <div className="kv"><span>RG</span><Copy text={p.rg} /></div>
          {p.birth && <div className="kv"><span>Nascimento</span><b>{fmtDate(p.birth)}</b></div>}
          <div className="kv"><span>Endereço</span><Copy text={p.address} /></div>
          <div className="kv"><span>Emergência</span><Copy text={p.emergency} /></div>
          {p.notes && <p className="muted">{p.notes}</p>}
        </section>
      </div>
      <h3 className="section-t">Histórico</h3>
      <TxList txs={txs} hide={['person']} empty="Nenhum pagamento ainda" />
      {edit && <PersonForm initial={p} onClose={() => setEdit(false)} />}
      {tx && <TxForm initial={tx} onClose={() => setTx(null)} />}
    </div>
  )
}
