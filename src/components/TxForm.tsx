import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Tx } from '../types'
import { METHODS, addMonths, fmtDate, money, today, uid } from '../utils'
import { classify, fallbackCategory, learn, placeFor, type Scope } from '../classify'
import { Field, Modal, MoneyInput, confirmDialog, toast } from './ui'
import { Attachments } from './Attachments'
import { Icon } from './Icon'

type Repeat = 'none' | 'parcelas' | 'mensal'

/** Lançar: o Rogério diz quanto, o que foi e quando. Categoria, empresa/pessoal, CNPJ e conta saem sozinhos
    (e dá para mudar em "Mais detalhes"). */
export function TxForm({ initial, onClose }: { initial?: Partial<Tx>; onClose: () => void }) {
  const { data, save, saveMany, remove, setSettings } = useStore()
  const editing = !!initial?.id && data.txs.some((t) => t.id === initial.id)
  const [t, setT] = useState<Tx>(() => {
    const kind = initial?.kind ?? 'out'
    const place = initial?.entityId ? { entityId: initial.entityId, accountId: initial.accountId ?? data.accounts.find((a) => a.entityId === initial.entityId && !a.archived)?.id } : placeFor(data, 'empresa', initial?.projectId)
    return { id: uid(), kind, category: '', description: '', amount: 0, due: today(), paid: editing ? undefined : today(), createdAt: new Date().toISOString(), ...place, ...initial }
  })
  const entityKind = (id?: string) => data.entities.find((e) => e.id === id)?.kind
  // escolhas feitas à mão não são trocadas pela adivinhação
  const [manual, setManual] = useState({ category: editing, scope: editing || !!initial?.entityId, entity: editing || !!initial?.entityId })
  const [scope, setScope] = useState<Scope | undefined>(initial?.entityId ? (entityKind(initial.entityId) === 'pessoal' ? 'pessoal' : 'empresa') : undefined)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [times, setTimes] = useState(2)
  const [more, setMore] = useState(editing && t.kind === 'transfer')
  const [showGross, setShowGross] = useState(!!initial?.gross)

  const guess = useMemo(() => classify(data, t), [data, t.kind, t.description, t.projectId, t.personId]) // eslint-disable-line react-hooks/exhaustive-deps
  const effScope: Scope | undefined = manual.scope ? scope : guess.scope ?? scope
  const category = manual.category ? t.category : guess.category ?? t.category
  const place = manual.entity ? { entityId: t.entityId, accountId: t.accountId } : effScope ? placeFor(data, effScope, t.projectId) : { entityId: t.entityId, accountId: t.accountId }

  const set = (p: Partial<Tx>) => setT((x) => ({ ...x, ...p }))
  const pickScope = (s: Scope) => { setScope(s); setManual((m) => ({ ...m, scope: true, entity: false })) }
  const entity = data.entities.find((e) => e.id === place.entityId)
  const accounts = data.accounts.filter((a) => a.entityId === place.entityId && (!a.archived || a.id === place.accountId))
  const toAccounts = data.accounts.filter((a) => a.entityId === t.toEntityId && !a.archived)
  const cats = data.categories.filter((c) => c.kind === (t.kind === 'in' ? 'in' : 'out'))
  const projects = data.projects.filter((p) => p.status !== 'concluida' || p.id === t.projectId)
  const people = data.people.filter((p) => p.active || p.id === t.personId)
  const pastDescriptions = useMemo(() => [...new Set(data.txs.filter((x) => x.kind === t.kind).map((x) => x.description.replace(/\s*\(\d+\/\d+\)$/, '')))].slice(-200), [data.txs, t.kind])
  const isTransfer = t.kind === 'transfer'
  const paidNow = !!t.paid

  const submit = () => {
    if (!t.amount || t.amount <= 0) return toast('Digite o valor', 'err')
    if (isTransfer) {
      if (!t.toEntityId || !t.toAccountId) return toast('Escolha para onde vai o dinheiro', 'err')
      if (t.toAccountId === place.accountId) return toast('Origem e destino são a mesma conta', 'err')
    } else if (!effScope && !manual.entity) {
      return toast('Toque em Empresa ou Pessoal para eu saber onde guardar', 'err')
    }
    const finalScope: Scope = effScope ?? (entityKind(place.entityId) === 'pessoal' ? 'pessoal' : 'empresa')
    const cat = category || (isTransfer ? 'Transferência' : fallbackCategory(t.kind, finalScope))
    const description = t.description.trim() || cat
    const base: Tx = { ...t, ...place, category: cat, description }
    if (base.kind !== 'in' || !showGross) { delete base.gross; delete base.retention }
    if (!isTransfer && t.description.trim()) setSettings({ learned: learn(data.settings.learned, t.kind, t.description, cat, finalScope) })
    if (editing || repeat === 'none') {
      save('txs', base)
      toast(editing ? 'Lançamento atualizado' : `Salvo em ${finalScope === 'pessoal' ? 'Pessoal' : 'Empresa'} · ${cat}`)
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
      files: i === 0 ? base.files : undefined,
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

  const title = editing ? 'Editar lançamento' : isTransfer ? 'Transferir entre contas' : 'Lançar'

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
      <div className="qtx">
        {!isTransfer ? (
          <div className="qtx-kind" role="radiogroup" aria-label="Tipo">
            <button className={`out ${t.kind === 'out' ? 'on' : ''}`} onClick={() => set({ kind: 'out' })} role="radio" aria-checked={t.kind === 'out'}><Icon name="arrowDown" size={18} /> Saiu dinheiro</button>
            <button className={`in ${t.kind === 'in' ? 'on' : ''}`} onClick={() => set({ kind: 'in' })} role="radio" aria-checked={t.kind === 'in'}><Icon name="arrowUp" size={18} /> Entrou dinheiro</button>
          </div>
        ) : null}

        <label className="qtx-amount">
          <span>{repeat === 'parcelas' ? 'valor total' : 'quanto?'}</span>
          <MoneyInput value={t.amount} onChange={(v) => set({ amount: v })} ariaLabel="Valor" autoFocus={!editing} />
        </label>

        {!isTransfer && (
          <>
            <Field label={t.kind === 'in' ? 'De onde veio?' : 'Com o quê?'}>
              <input list="qtx-desc" value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={t.kind === 'in' ? 'Ex.: medição da escola, sinal do apto 202' : 'Ex.: cimento, mercado, conta de luz de casa'} aria-label="Descrição" />
              <datalist id="qtx-desc">{pastDescriptions.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>

            <div className={`qtx-auto ${effScope ?? 'ask'}`}>
              {effScope ? (
                <>
                  <span className="qtx-auto-ic"><Icon name={effScope === 'pessoal' ? 'user' : 'briefcase'} size={18} /></span>
                  <span className="qtx-auto-t">
                    <b>{effScope === 'pessoal' ? 'Pessoal' : `Empresa${entity && entity.kind === 'empresa' ? ` · ${entity.name}` : ''}`}</b>
                    <small>{category || fallbackCategory(t.kind, effScope)}{!manual.scope && guess.why ? ` · ${guess.why}` : ''}</small>
                  </span>
                  <button className="link small" onClick={() => pickScope(effScope === 'pessoal' ? 'empresa' : 'pessoal')}>é {effScope === 'pessoal' ? 'da empresa' : 'pessoal'}</button>
                </>
              ) : (
                <>
                  <span className="qtx-auto-t"><b>{t.description.trim() ? 'É da empresa ou pessoal?' : 'Escreva o que foi'}</b><small>{t.description.trim() ? `${guess.why}. Eu aprendo e da próxima vez já sei.` : 'eu separo sozinho entre empresa e pessoal'}</small></span>
                  {t.description.trim() && (
                    <span className="qtx-pick">
                      <button onClick={() => pickScope('empresa')}><Icon name="briefcase" size={16} /> Empresa</button>
                      <button onClick={() => pickScope('pessoal')}><Icon name="user" size={16} /> Pessoal</button>
                    </span>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {isTransfer && (
          <div className="grid-form">
            <Field label="Sai de">
              <select value={place.entityId} onChange={(e) => { set({ entityId: e.target.value, accountId: data.accounts.find((a) => a.entityId === e.target.value && !a.archived)?.id }); setManual((m) => ({ ...m, entity: true })) }} aria-label="Sai de">
                {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Conta">
              <select value={place.accountId ?? ''} onChange={(e) => { set({ entityId: place.entityId, accountId: e.target.value || undefined }); setManual((m) => ({ ...m, entity: true })) }} aria-label="Conta">
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
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
            <Field label="Motivo" span={2}>
              <select value={t.category || 'Transferência'} onChange={(e) => { set({ category: e.target.value }); setManual((m) => ({ ...m, category: true })) }} aria-label="Categoria">
                {['Transferência', 'Pró-labore', 'Distribuição de lucros', 'Empréstimo entre empresas', 'Aporte'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        )}

        <div className="qtx-when">
          <div className="qtx-paid" role="radiogroup" aria-label="Situação">
            <button className={paidNow ? 'on' : ''} onClick={() => set({ paid: t.paid ?? (t.due <= today() ? t.due : today()) })}>{t.kind === 'in' ? 'Já recebi' : 'Já paguei'}</button>
            <button className={!paidNow ? 'on' : ''} onClick={() => set({ paid: undefined })}>{t.kind === 'in' ? 'Vou receber' : 'Vou pagar'}</button>
          </div>
          <label className="qtx-date">
            <span>{paidNow ? 'em' : 'vence em'}</span>
            <input type="date" value={paidNow ? t.paid : t.due} onChange={(e) => set(paidNow ? (editing ? { paid: e.target.value } : { paid: e.target.value, due: e.target.value }) : { due: e.target.value })} aria-label={paidNow ? 'Data do pagamento' : 'Vencimento'} />
          </label>
        </div>

        {!isTransfer && projects.length > 0 && (
          <div className="qtx-chips">
            <span className="qtx-label">É de alguma obra?</span>
            <div className="chips">
              <button className={!t.projectId ? 'on' : ''} onClick={() => set({ projectId: undefined })}>não</button>
              {projects.slice(0, 8).map((p) => <button key={p.id} className={t.projectId === p.id ? 'on' : ''} onClick={() => set({ projectId: p.id })}>{p.name}</button>)}
            </div>
          </div>
        )}

        <button className="qtx-more" onClick={() => setMore(!more)} aria-expanded={more}>
          <Icon name="chevron" size={16} className={more ? 'rot' : ''} /> {more ? 'Menos detalhes' : 'Mais detalhes'} <small>categoria, CNPJ, conta, pessoa, nota fiscal, parcelas…</small>
        </button>

        {more && (
          <div className="grid-form">
            {!isTransfer && (
              <>
                <Field label="Categoria">
                  <select value={category} onChange={(e) => { const c = data.categories.find((x) => x.name === e.target.value); set({ category: e.target.value }); setManual((m) => ({ ...m, category: true })); if (c && c.scope !== 'ambos' && !manual.scope) { setScope(c.scope); setManual((m) => ({ ...m, scope: true, category: true })) } }} aria-label="Categoria">
                    <option value="">Escolha…</option>
                    <optgroup label="Empresa">{cats.filter((c) => c.scope !== 'pessoal').map((c) => <option key={c.id}>{c.name}</option>)}</optgroup>
                    <optgroup label="Pessoal">{cats.filter((c) => c.scope === 'pessoal').map((c) => <option key={c.id}>{c.name}</option>)}</optgroup>
                    {category && !cats.some((c) => c.name === category) && <option>{category}</option>}
                  </select>
                </Field>
                <Field label="Empresa (CNPJ) ou pessoal">
                  <select value={place.entityId} onChange={(e) => { const id = e.target.value; set({ entityId: id, accountId: data.accounts.find((a) => a.entityId === id && !a.archived)?.id }); setScope(entityKind(id) === 'pessoal' ? 'pessoal' : 'empresa'); setManual((m) => ({ ...m, entity: true, scope: true })) }} aria-label="Carteira">
                    {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}{e.kind === 'empresa' && e.doc ? ` · ${e.doc}` : ''}</option>)}
                  </select>
                </Field>
                <Field label="Conta">
                  <select value={place.accountId ?? ''} onChange={(e) => { set({ entityId: place.entityId, accountId: e.target.value || undefined }); setManual((m) => ({ ...m, entity: true })) }} aria-label="Conta">
                    <option value="">—</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
                <Field label={t.kind === 'in' ? 'Quem pagou' : 'Pago a (equipe, fornecedor…)'}>
                  <select value={t.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })} aria-label="Pessoa">
                    <option value="">—</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ''}</option>)}
                  </select>
                </Field>
                {projects.length > 8 && (
                  <Field label="Obra">
                    <select value={t.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })} aria-label="Obra">
                      <option value="">— sem obra</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                )}
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
            {paidNow && <Field label="Vencimento original"><input type="date" value={t.due} onChange={(e) => set({ due: e.target.value })} aria-label="Vencimento" /></Field>}
            {t.kind === 'in' && (
              <div className="span-2">
                <label className="check">
                  <input type="checkbox" checked={showGross} onChange={(e) => setShowGross(e.target.checked)} /> Nota com retenções (ISS, INSS, IR…)
                </label>
                {showGross && (
                  <div className="grid-form inner">
                    <Field label="Valor bruto da nota"><MoneyInput value={t.gross ?? 0} onChange={(v) => set({ gross: v, amount: Math.max(0, v - (t.retention ?? 0)) })} ariaLabel="Valor bruto" /></Field>
                    <Field label="Retenções" hint={t.gross ? `Líquido: ${money((t.gross ?? 0) - (t.retention ?? 0))}` : undefined}><MoneyInput value={t.retention ?? 0} onChange={(v) => set({ retention: v, amount: Math.max(0, (t.gross ?? 0) - v) })} ariaLabel="Retenções" /></Field>
                  </div>
                )}
              </div>
            )}
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
                      <span className="muted small">{repeat === 'parcelas' ? `${times}× de ${money(t.amount / Math.max(2, times))}` : `${times} meses, a partir de ${fmtDate(t.due)}`}</span>
                    </>
                  )}
                </div>
              </Field>
            )}
            <Field label="Nota fiscal / boleto / comprovante" span={2}>
              <Attachments files={t.files} onChange={(files) => set({ files })} label="Anexar NF ou comprovante" hint="PDF ou foto tirada no celular" />
            </Field>
            <Field label="Observações" span={2}>
              <textarea rows={2} value={t.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" />
            </Field>
            {!isTransfer && !editing && <button className="link small span-2" onClick={() => set({ kind: 'transfer', category: 'Transferência' })}>É uma transferência entre contas (ex.: pró-labore da empresa para o pessoal)</button>}
          </div>
        )}
      </div>
    </Modal>
  )
}
