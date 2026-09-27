import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { METHODS, addMonths, money, today, uid } from '../utils'
import { Field, Modal, MoneyInput, confirmDialog, toast } from './ui'

type Repeat = 'none' | 'parcelas' | 'mensal'

/** Formulário de lançamento: saída, entrada ou transferência (ex.: pró-labore da empresa para o pessoal). */
export function TxForm({ initial, onClose }: { initial?: Partial<Tx>; onClose: () => void }) {
  const { data, save, saveMany, remove } = useStore()
  const editing = !!initial?.id && data.txs.some((t) => t.id === initial.id)
  const scope = data.settings.scope
  const defEntity = initial?.entityId ?? (scope !== 'all' ? scope : data.entities[0]?.id) ?? ''
  const [t, setT] = useState<Tx>(() => ({
    id: uid(),
    kind: 'out',
    entityId: defEntity,
    accountId: data.accounts.find((a) => a.entityId === defEntity && !a.archived)?.id,
    category: '',
    description: '',
    amount: 0,
    due: today(),
    createdAt: new Date().toISOString(),
    ...initial,
  }))
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [times, setTimes] = useState(2)
  const [showGross, setShowGross] = useState(!!initial?.gross)
  const set = (p: Partial<Tx>) => setT((x) => ({ ...x, ...p }))

  const entity = data.entities.find((e) => e.id === t.entityId)
  const accounts = data.accounts.filter((a) => a.entityId === t.entityId && (!a.archived || a.id === t.accountId))
  const toAccounts = data.accounts.filter((a) => a.entityId === t.toEntityId && !a.archived)
  const cats = useMemo(() => {
    const kind = t.kind === 'in' ? 'in' : 'out'
    const sc = entity?.kind ?? 'empresa'
    return data.categories.filter((c) => c.kind === kind && (c.scope === 'ambos' || c.scope === sc))
  }, [data.categories, t.kind, entity?.kind])
  const projects = data.projects.filter((p) => p.status !== 'concluida' || p.id === t.projectId)
  const people = data.people.filter((p) => p.active || p.id === t.personId)

  const changeEntity = (id: string) => set({ entityId: id, accountId: data.accounts.find((a) => a.entityId === id && !a.archived)?.id, category: '' })

  const submit = () => {
    if (!t.entityId) return toast('Escolha a empresa ou o pessoal', 'err')
    if (!t.amount || t.amount <= 0) return toast('Informe o valor', 'err')
    if (t.kind === 'transfer' && (!t.toEntityId || !t.toAccountId)) return toast('Escolha a conta de destino', 'err')
    if (t.kind === 'transfer' && t.toAccountId === t.accountId) return toast('Origem e destino são a mesma conta', 'err')
    const category = t.category || (t.kind === 'transfer' ? 'Transferência' : t.kind === 'in' ? 'Outras receitas' : 'Outras despesas')
    const description = t.description.trim() || category
    const base: Tx = { ...t, category, description }
    if (base.kind !== 'in') { delete base.gross; delete base.retention }
    if (!showGross) { delete base.gross; delete base.retention }
    if (editing || repeat === 'none') {
      save('txs', base)
      toast(editing ? 'Lançamento atualizado' : 'Lançamento salvo')
      return onClose()
    }
    const n = Math.max(2, Math.min(120, times))
    const g = uid()
    const each = repeat === 'parcelas' ? Math.floor((base.amount / n) * 100) / 100 : base.amount
    const items: Tx[] = Array.from({ length: n }, (_, i) => ({
      ...base,
      id: uid(),
      group: g,
      installment: `${i + 1}/${n}`,
      description: `${description} (${i + 1}/${n})`,
      amount: repeat === 'parcelas' && i === n - 1 ? Math.round((base.amount - each * (n - 1)) * 100) / 100 : each,
      due: addMonths(base.due, i),
      paid: i === 0 ? base.paid : undefined,
    }))
    saveMany('txs', items)
    toast(`${n} lançamentos criados`)
    onClose()
  }

  const del = async () => {
    const siblings = t.group ? data.txs.filter((x) => x.group === t.group && !x.paid && x.id !== t.id) : []
    if (!(await confirmDialog('Excluir este lançamento?', 'Excluir'))) return
    remove('txs', t.id)
    if (siblings.length && (await confirmDialog(`Excluir também as outras ${siblings.length} parcelas em aberto deste grupo?`, 'Excluir parcelas'))) siblings.forEach((s) => remove('txs', s.id))
    // diárias pagas por este lançamento voltam a ficar em aberto
    data.attendance.filter((a) => a.txId === t.id).forEach((a) => save('attendance', { ...a, txId: undefined }))
    data.txs.filter((x) => x.settledBy === t.id).forEach((x) => save('txs', { ...x, settledBy: undefined }))
    onClose()
  }

  const title = editing ? 'Editar lançamento' : t.kind === 'in' ? 'Nova entrada' : t.kind === 'out' ? 'Nova saída' : 'Nova transferência'

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={submit}>Salvar</button>
        </>
      }
    >
      <div className="seg" role="radiogroup">
        {([['out', 'Saída / pagamento'], ['in', 'Entrada / recebimento'], ['transfer', 'Transferência']] as const).map(([k, l]) => (
          <button key={k} className={`${t.kind === k ? 'on' : ''} ${k}`} onClick={() => set({ kind: k, category: '' })}>{l}</button>
        ))}
      </div>
      <div className="grid-form">
        <Field label={t.kind === 'transfer' ? 'Sai de (empresa / pessoal)' : 'Empresa / pessoal'}>
          <select value={t.entityId} onChange={(e) => changeEntity(e.target.value)} aria-label="Carteira">
            {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Conta">
          <select value={t.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })} aria-label="Conta">
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {t.kind === 'transfer' && (
          <>
            <Field label="Vai para">
              <select value={t.toEntityId ?? ''} onChange={(e) => set({ toEntityId: e.target.value, toAccountId: data.accounts.find((a) => a.entityId === e.target.value && !a.archived)?.id })} aria-label="Destino">
                <option value="">Escolha…</option>
                {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Conta de destino">
              <select value={t.toAccountId ?? ''} onChange={(e) => set({ toAccountId: e.target.value })} aria-label="Conta de destino">
                <option value="">—</option>
                {toAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Descrição" span={2}>
          <input value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={t.kind === 'in' ? 'Ex.: 3ª medição, parcela apto 202' : t.kind === 'out' ? 'Ex.: cimento, conta de luz' : 'Ex.: pró-labore, distribuição de lucros'} aria-label="Descrição" />
        </Field>
        <Field label="Categoria">
          {t.kind === 'transfer' ? (
            <select value={t.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">
              {['Transferência', 'Pró-labore', 'Distribuição de lucros', 'Empréstimo entre empresas', 'Aporte'].map((c) => <option key={c}>{c}</option>)}
            </select>
          ) : (
            <select value={t.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">
              <option value="">Escolha…</option>
              {cats.map((c) => <option key={c.id}>{c.name}</option>)}
              {t.category && !cats.some((c) => c.name === t.category) && <option>{t.category}</option>}
            </select>
          )}
        </Field>
        <Field label={repeat === 'parcelas' ? 'Valor total' : 'Valor'}>
          <MoneyInput value={t.amount} onChange={(v) => set({ amount: v })} ariaLabel="Valor" />
        </Field>
        {t.kind === 'in' && (
          <div className="span-2">
            <label className="check">
              <input type="checkbox" checked={showGross} onChange={(e) => setShowGross(e.target.checked)} /> Nota com retenções (ISS, INSS, IR…) — informar valor bruto
            </label>
            {showGross && (
              <div className="grid-form inner">
                <Field label="Valor bruto da nota">
                  <MoneyInput value={t.gross ?? 0} onChange={(v) => set({ gross: v, amount: Math.max(0, v - (t.retention ?? 0)) })} ariaLabel="Valor bruto" />
                </Field>
                <Field label="Retenções" hint={t.gross ? `Líquido: ${money((t.gross ?? 0) - (t.retention ?? 0))}` : undefined}>
                  <MoneyInput value={t.retention ?? 0} onChange={(v) => set({ retention: v, amount: Math.max(0, (t.gross ?? 0) - v) })} ariaLabel="Retenções" />
                </Field>
              </div>
            )}
          </div>
        )}
        <Field label="Vencimento">
          <input type="date" value={t.due} onChange={(e) => set({ due: e.target.value })} aria-label="Vencimento" />
        </Field>
        <Field label={t.kind === 'in' ? 'Recebido em' : 'Pago em'} hint="Deixe vazio se ainda está em aberto">
          <div className="row">
            <input type="date" value={t.paid ?? ''} onChange={(e) => set({ paid: e.target.value || undefined })} aria-label="Data do pagamento" />
            {!t.paid && <button className="btn small" onClick={() => set({ paid: today() })}>Hoje</button>}
          </div>
        </Field>
        {t.kind !== 'transfer' && (
          <>
            <Field label="Obra">
              <select value={t.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })} aria-label="Obra">
                <option value="">— sem obra (despesa geral)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={t.kind === 'in' ? 'Cliente / pagador' : 'Pago a (funcionário, fornecedor…)'}>
              <select value={t.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })} aria-label="Pessoa">
                <option value="">—</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ''}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Forma de pagamento">
          <select value={t.method ?? ''} onChange={(e) => set({ method: e.target.value || undefined })} aria-label="Forma de pagamento">
            <option value="">—</option>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Nº da nota / boleto">
          <input value={t.docNo ?? ''} onChange={(e) => set({ docNo: e.target.value })} aria-label="Número do documento" />
        </Field>
        {!editing && (
          <Field label="Repetir" span={2}>
            <div className="row wrap">
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} aria-label="Repetir">
                <option value="none">Não repetir</option>
                <option value="parcelas">Parcelar o valor total</option>
                <option value="mensal">Repetir todo mês (mesmo valor)</option>
              </select>
              {repeat !== 'none' && (
                <>
                  <input type="number" min={2} max={120} value={times} onChange={(e) => setTimes(Number(e.target.value))} style={{ width: 80 }} aria-label="Quantidade" />
                  <span className="muted small">{repeat === 'parcelas' ? `${times}× de ${money(t.amount / Math.max(2, times))}` : `${times} meses`}</span>
                </>
              )}
            </div>
          </Field>
        )}
        <Field label="Observações" span={2}>
          <textarea rows={2} value={t.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" />
        </Field>
      </div>
    </Modal>
  )
}
