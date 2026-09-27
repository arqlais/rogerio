import { useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { signed, accountName, entityName, fmtDateShort, isLate, money, personName, projectName, today } from '../utils'
import { TxForm } from './TxForm'
import { Badge, Empty, toast } from './ui'
import { printReceipt } from './Receipt'

/** Lista de lançamentos com "pagar/receber" em um toque. */
export function TxList({ txs, hide = [], empty, scope = 'all' }: { txs: Tx[]; hide?: ('project' | 'entity' | 'person')[]; empty?: string; scope?: string }) {
  const { data, save } = useStore()
  const [edit, setEdit] = useState<Tx | null>(null)
  if (!txs.length) return <Empty title={empty ?? 'Nenhum lançamento'} />

  const settle = (t: Tx) => {
    save('txs', { ...t, paid: today() })
    toast(t.kind === 'in' ? 'Marcado como recebido' : 'Marcado como pago')
  }
  const sign = (t: Tx) => Math.sign(signed(t, scope))

  return (
    <>
      <div className="txlist">
        {txs.map((t) => {
          const s = sign(t)
          const late = isLate(t)
          return (
            <div key={t.id} className={`tx ${t.paid ? 'paid' : ''} ${late ? 'late' : ''}`} onClick={() => setEdit(t)} role="button" tabIndex={0}>
              <div className="tx-date">
                <span>{fmtDateShort(t.paid ?? t.due)}</span>
                {!t.paid && <small>{late ? 'vencido' : 'vence'}</small>}
              </div>
              <div className="tx-main">
                <strong>{t.description}</strong>
                <span className="tx-meta">
                  {t.kind === 'transfer' ? `${entityName(data, t.entityId)} → ${entityName(data, t.toEntityId)}` : t.category}
                  {!hide.includes('project') && t.projectId && <> · {projectName(data, t.projectId)}</>}
                  {!hide.includes('person') && t.personId && <> · {personName(data, t.personId)}</>}
                  {!hide.includes('entity') && t.kind !== 'transfer' && data.entities.length > 1 && <> · {entityName(data, t.entityId)}</>}
                  {t.accountId && <> · {accountName(data, t.accountId)}</>}
                  {t.docNo && <> · {t.docNo}</>}
                  {!!t.files?.length && <> · <span className="nf-tag">anexo</span></>}
                </span>
              </div>
              <div className="tx-right">
                <span className={`tx-amount ${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}`}>{s > 0 ? '+' : s < 0 ? '−' : ''}{money(t.amount)}</span>
                <span className="tx-actions" onClick={(e) => e.stopPropagation()}>
                  {t.paid ? (
                    <>
                      <Badge tone="good">{t.kind === 'in' ? 'recebido' : t.kind === 'out' ? 'pago' : 'feito'}</Badge>
                      {t.kind === 'out' && t.personId && <button className="link small" onClick={() => printReceipt(data, t)}>recibo</button>}
                    </>
                  ) : (
                    <button className={`btn small ${t.kind === 'in' ? 'good' : 'primary'}`} onClick={() => settle(t)}>{t.kind === 'in' ? 'Recebi' : 'Paguei'}</button>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {edit && <TxForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
