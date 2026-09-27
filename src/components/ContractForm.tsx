import { useState } from 'react'
import { useStore } from '../store'
import type { Contract, Tx } from '../types'
import { contractPaid, money, today, uid } from '../utils'
import { TxForm } from './TxForm'
import { TxList } from './TxList'
import { Field, Modal, MoneyInput, confirmDialog, toast } from './ui'

/** Empreitada: valor fechado, % executado e pagamentos feitos. */
export function ContractForm({ initial, onClose }: { initial: Partial<Contract>; onClose: () => void }) {
  const { data, save, remove } = useStore()
  const editing = !!initial.id && data.contracts.some((c) => c.id === initial.id)
  const [c, setC] = useState<Contract>(() => ({
    id: uid(), personId: '', projectId: data.projects.find((p) => p.status === 'andamento')?.id ?? '', entityId: '', service: '', total: 0, progress: 0, status: 'andamento', start: today(),
    ...initial,
  }))
  const [pay, setPay] = useState<Partial<Tx> | null>(null)
  const set = (x: Partial<Contract>) => setC((o) => ({ ...o, ...x }))
  const contractors = data.people.filter((p) => (p.role === 'empreiteiro' || p.role === 'fornecedor' || p.role === 'outro') && (p.active || p.id === c.personId))
  const paid = contractPaid(data, c.id)
  const payments = data.txs.filter((t) => t.contractId === c.id).sort((a, b) => b.due.localeCompare(a.due))
  const executed = (c.total * c.progress) / 100

  const valid = () => {
    if (!c.service.trim()) return toast('Descreva o serviço', 'err'), false
    if (!c.personId) return toast('Escolha o empreiteiro (cadastre em Equipe → Pessoas)', 'err'), false
    if (!c.projectId) return toast('Escolha a obra', 'err'), false
    return true
  }
  const entityOf = () => c.entityId || data.projects.find((p) => p.id === c.projectId)?.entityId || data.entities[0].id
  const submit = () => {
    if (!valid()) return
    save('contracts', { ...c, entityId: entityOf() })
    toast('Empreitada salva')
    onClose()
  }
  const newPayment = () => {
    if (!valid()) return
    const entityId = entityOf()
    save('contracts', { ...c, entityId })
    const suggested = Math.max(0, Math.min(c.total - paid, executed - paid))
    setPay({ kind: 'out', entityId, projectId: c.projectId, personId: c.personId, contractId: c.id, category: 'Empreitada', description: `Empreitada – ${c.service}`, amount: suggested, paid: today() })
  }
  const del = async () => {
    if (payments.length) return toast('Há pagamentos nesta empreitada. Cancele-a em vez de excluir.', 'err')
    if (await confirmDialog('Excluir esta empreitada?', 'Excluir')) { remove('contracts', c.id); onClose() }
  }

  return (
    <>
      <Modal wide title={editing ? 'Empreitada' : 'Nova empreitada'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
        <div className="grid-form">
          <Field label="Serviço contratado" span={2}><input value={c.service} onChange={(e) => set({ service: e.target.value })} placeholder="Ex.: reboco interno 2º pavimento, instalação hidráulica" aria-label="Serviço" /></Field>
          <Field label="Empreiteiro">
            <select value={c.personId} onChange={(e) => set({ personId: e.target.value })} aria-label="Empreiteiro">
              <option value="">Escolha…</option>
              {contractors.map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Obra">
            <select value={c.projectId} onChange={(e) => set({ projectId: e.target.value, entityId: data.projects.find((p) => p.id === e.target.value)?.entityId ?? c.entityId })} aria-label="Obra">
              <option value="">Escolha…</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Valor total combinado"><MoneyInput value={c.total} onChange={(v) => set({ total: v })} ariaLabel="Valor total" /></Field>
          <Field label="Situação">
            <select value={c.status} onChange={(e) => set({ status: e.target.value as Contract['status'], progress: e.target.value === 'concluida' ? 100 : c.progress })} aria-label="Situação">
              <option value="andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
            </select>
          </Field>
          <Field label={`Quanto do serviço já foi feito: ${c.progress}%`} span={2} hint={`Vale ${money(executed)} do total — use para não pagar adiantado`}>
            <input type="range" min={0} max={100} step={5} value={c.progress} onChange={(e) => set({ progress: Number(e.target.value) })} aria-label="Percentual executado" />
          </Field>
          <Field label="Observações" span={2}><textarea rows={2} value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" /></Field>
        </div>
        <div className="box">
          <div className="row between">
            <div><b>Pagamentos</b><br /><small className="muted">Pago {money(paid)} · falta {money(c.total - paid)}{paid > executed + 0.5 ? ` · ⚠ adiantado ${money(paid - executed)}` : ''}</small></div>
            <button className="btn primary small" onClick={newPayment}>+ Registrar pagamento</button>
          </div>
          {payments.length > 0 && <TxList txs={payments} hide={['project', 'person', 'entity']} />}
        </div>
      </Modal>
      {pay && <TxForm initial={pay} onClose={() => setPay(null)} />}
    </>
  )
}
