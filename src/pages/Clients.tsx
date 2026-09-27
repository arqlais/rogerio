import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Client, ClientKind } from '../types'
import { Icon } from '../components/Icon'
import { Empty, Field, Modal, confirmDialog, toast } from '../components/ui'
import { daysBetween, money, today, uid } from '../utils'
import { quoteTotals } from './Quotes'

export const CLIENT_KIND: Record<ClientKind, string> = { escola: 'escola (APM)', prefeitura: 'prefeitura / órgão', empresa: 'empresa', particular: 'particular' }

export function Clients() {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'' | 'escola' | 'outros'>('')
  const [archived, setArchived] = useState(false)
  const [edit, setEdit] = useState<Partial<Client> | null>(null)
  const quotesOf = (c: Client) => data.quotes.filter((x) => x.clientId === c.id || (!!c.apm && x.apmName === c.apm) || (!!c.name && (x.apmName === c.name || x.client === c.name)))
  const rows = data.clients
    .filter((c) => (archived || !c.archived) && (!kind || (kind === 'escola' ? c.kind === 'escola' : c.kind !== 'escola')))
    .filter((c) => !q || `${c.name} ${c.apm ?? ''} ${c.doc ?? ''} ${c.city ?? ''} ${c.contact ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .map((c) => {
      const qs = quotesOf(c)
      const last = qs.map((x) => x.date).sort().pop()
      const approved = qs.filter((x) => x.status === 'aprovado').reduce((s, x) => s + quoteTotals(x).total, 0)
      const obras = data.projects.filter((p) => p.client === c.name || p.client === c.apm).length
      return { c, qs, last, approved, obras }
    })
    .sort((a, b) => Number(!!b.c.favorite) - Number(!!a.c.favorite) || (b.last ?? '').localeCompare(a.last ?? '') || a.c.name.localeCompare(b.c.name))
  const active = data.clients.filter((c) => !c.archived).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{active} cliente{active === 1 ? '' : 's'} ativo{active === 1 ? '' : 's'}</span>
          <h1>Clientes e escolas</h1>
        </div>
        <button className="btn primary" onClick={() => setEdit({ kind: 'escola' })}><Icon name="plus" size={16} /> Novo cliente</button>
      </div>
      <div className="filters">
        <input type="search" placeholder="Buscar por nome, CNPJ, cidade, diretor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
        <div className="seg compact">
          <button className={kind === '' ? 'on' : ''} onClick={() => setKind('')}>todos</button>
          <button className={kind === 'escola' ? 'on' : ''} onClick={() => setKind('escola')}>escolas</button>
          <button className={kind === 'outros' ? 'on' : ''} onClick={() => setKind('outros')}>outros</button>
        </div>
        <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> arquivados</label>
      </div>
      {!rows.length ? <Empty title="Nenhum cliente encontrado" text="Cadastre as escolas (com o CNPJ da APM) e os clientes para escolher direto no orçamento." action={<button className="btn primary" onClick={() => setEdit({ kind: 'escola' })}>Cadastrar cliente</button>} /> : (
        <div className="card flush">
          <div className="client-table">
            <div className="ct-row head"><span>cliente</span><span>tipo</span><span>último orçamento</span><span className="r">orçamentos</span><span className="r">aprovado</span><span /></div>
            {rows.map(({ c, qs, last, approved, obras }) => {
              const wa = c.phone?.replace(/\D/g, '')
              return (
                <div key={c.id} className={`ct-row ${c.archived ? 'archived' : ''}`} onClick={() => setEdit(c)} role="button" tabIndex={0}>
                  <span className="ct-name">
                    <span className="ct-av">{c.name.replace(/^((E\.?\s?E\.?|EMEF|EMEI|Profª?|Prof\.?|Professora?)\s*)+/gi, '').slice(0, 1).toUpperCase()}</span>
                    <span><b>{c.favorite && <span className="star-mini">★</span>}{c.name}</b><small>{[c.doc && `CNPJ ${c.doc}`, c.city].filter(Boolean).join(' · ')}</small></span>
                  </span>
                  <span><span className={`badge ${c.kind === 'escola' ? 'info' : 'muted'}`}>{CLIENT_KIND[c.kind]}</span></span>
                  <span className={last && daysBetween(last, today()) > 120 ? 'warn-t' : 'muted'}>{last ? (daysBetween(last, today()) === 0 ? 'hoje' : `há ${daysBetween(last, today())} dias`) : 'nenhum ainda'}{obras ? ` · ${obras} obra${obras > 1 ? 's' : ''}` : ''}</span>
                  <span className="r">{qs.length}</span>
                  <span className="r"><b>{money(approved)}</b></span>
                  <span className="r" onClick={(e) => e.stopPropagation()}>
                    {wa && <a className="icon-btn" href={`https://wa.me/${wa.length <= 11 ? '55' + wa : wa}`} target="_blank" rel="noreferrer" title="WhatsApp"><Icon name="phone" size={16} /></a>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {edit && <ClientForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

export function ClientForm({ initial, onClose, onSaved }: { initial: Partial<Client>; onClose: () => void; onSaved?: (c: Client) => void }) {
  const { data, save, remove } = useStore()
  const editing = !!initial.id && data.clients.some((c) => c.id === initial.id)
  const [c, setC] = useState<Client>(() => ({ id: uid(), kind: 'escola', name: '', ...initial }))
  const set = (x: Partial<Client>) => setC((o) => ({ ...o, ...x }))
  const school = c.kind === 'escola'
  const submit = () => {
    if (!c.name.trim()) return toast('Informe o nome', 'err')
    const saved = { ...c, name: c.name.trim(), apm: school ? (c.apm?.trim() || c.name.trim().toUpperCase()) : c.apm }
    save('clients', saved)
    toast(editing ? 'Cadastro atualizado' : 'Cliente cadastrado')
    onClose()
    onSaved?.(saved)
  }
  const del = async () => {
    const used = data.quotes.some((q) => q.clientId === c.id)
    if (used) {
      if (await confirmDialog('Este cliente tem orçamentos. Arquivar (some das listas, o histórico fica)?', 'Arquivar', false)) { save('clients', { ...c, archived: true }); onClose() }
      return
    }
    if (await confirmDialog(`Excluir ${c.name}?`, 'Excluir')) { remove('clients', c.id); onClose() }
  }
  return (
    <Modal title={editing ? c.name : 'Novo cliente'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} />{editing && <button className="btn" onClick={() => { onClose(); go('/orcamentos') }}>Ver orçamentos</button>}<button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="seg" style={{ marginBottom: 16 }}>
        {(Object.keys(CLIENT_KIND) as ClientKind[]).map((k) => <button key={k} className={c.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>{CLIENT_KIND[k]}</button>)}
      </div>
      <div className="grid-form">
        <Field label={school ? 'Nome da escola' : 'Nome'} span={2}><input value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={school ? 'Ex.: E.E. Prof. José Calvitti Filho' : ''} autoFocus aria-label="Nome do cliente" /></Field>
        {school && <Field label="Nome da APM (como vai no orçamento)" span={2} hint="Se deixar vazio, usa o nome da escola em maiúsculas"><input value={c.apm ?? ''} onChange={(e) => set({ apm: e.target.value })} aria-label="Nome da APM" /></Field>}
        <Field label={school ? 'CNPJ da APM' : 'CNPJ / CPF'}><input value={c.doc ?? ''} onChange={(e) => set({ doc: e.target.value })} placeholder="00.000.000/0001-00" aria-label="CNPJ do cliente" /></Field>
        <Field label={school ? 'Diretor(a) / responsável' : 'Contato'}><input value={c.contact ?? ''} onChange={(e) => set({ contact: e.target.value })} aria-label="Contato" /></Field>
        <Field label="Telefone"><input value={c.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" aria-label="Telefone do cliente" /></Field>
        <Field label="E-mail"><input value={c.email ?? ''} onChange={(e) => set({ email: e.target.value })} aria-label="E-mail do cliente" /></Field>
        <Field label="Endereço" span={2}><input value={c.address ?? ''} onChange={(e) => set({ address: e.target.value })} aria-label="Endereço do cliente" /></Field>
        <Field label="Cidade"><input value={c.city ?? ''} onChange={(e) => set({ city: e.target.value })} aria-label="Cidade" /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!c.favorite} onChange={(e) => set({ favorite: e.target.checked })} /> favorito (aparece primeiro)</label>
        <Field label="Observações" span={2}><textarea rows={2} value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações do cliente" /></Field>
        {c.archived && <label className="check span-2"><input type="checkbox" checked={false} onChange={() => set({ archived: false })} /> Reativar cliente</label>}
      </div>
    </Modal>
  )
}
