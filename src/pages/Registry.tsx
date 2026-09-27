import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Account, Category, Entity } from '../types'
import { Field, Modal, MoneyInput, Tabs, confirmDialog, toast } from '../components/ui'
import { accountBalance, money, today, uid } from '../utils'

export function Registry({ tab }: { tab?: string }) {
  const t = tab === 'categorias' ? 'categorias' : 'empresas'
  return (
    <div className="page">
      <div className="page-head"><h1>Cadastros</h1></div>
      <Tabs value={t} onChange={(v) => go(`/cadastros/${v}`)} items={[['empresas', 'Empresas, pessoal e contas'], ['categorias', 'Categorias']]} />
      {t === 'empresas' ? <Entities /> : <Categories />}
    </div>
  )
}

/** Reduz a imagem do logo para no máximo 480px (fica leve para salvar e sincronizar). */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = reject
    r.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const s = Math.min(1, 480 / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * s)
        c.height = Math.round(img.height * s)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/png'))
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  })
}

function Entities() {
  const { data } = useStore()
  const [edit, setEdit] = useState<Partial<Entity> | null>(null)
  const [acc, setAcc] = useState<Partial<Account> | null>(null)
  return (
    <>
      <div className="help">Cada empresa (CNPJ) e o seu <b>pessoal</b> têm o próprio caixa. No topo da tela você escolhe qual quer ver — ou <b>Tudo</b>. O pró-labore e a distribuição de lucros são lançados como <b>transferência</b> da empresa para o pessoal.</div>
      <div className="entities">
        {data.entities.map((e) => {
          const accounts = data.accounts.filter((a) => a.entityId === e.id)
          return (
            <section key={e.id} className="card entity" style={{ borderTopColor: e.color }}>
              <div className="card-head">
                <div className="row">
                  {e.logo ? <img className="logo-sm" src={e.logo} alt="" /> : <span className="logo-sm ph" style={{ background: e.color }}>{e.name.slice(0, 2)}</span>}
                  <div><h2>{e.name}</h2><small className="muted">{e.kind === 'pessoal' ? 'Pessoa física' : 'Empresa'}{e.doc ? ` · ${e.doc}` : ''}</small></div>
                </div>
                <button className="btn small" onClick={() => setEdit(e)}>Editar</button>
              </div>
              {accounts.map((a) => (
                <div key={a.id} className={`kv clickable ${a.archived ? 'muted' : ''}`} onClick={() => setAcc(a)}>
                  <span>{a.name}{a.archived ? ' (arquivada)' : ''}</span><b>{money(accountBalance(data, a.id))}</b>
                </div>
              ))}
              <button className="link" onClick={() => setAcc({ entityId: e.id })}>+ conta / caixa / cartão</button>
            </section>
          )
        })}
      </div>
      <button className="btn" onClick={() => setEdit({})}>+ Nova empresa</button>
      {edit && <EntityForm initial={edit} onClose={() => setEdit(null)} />}
      {acc && <AccountForm initial={acc} onClose={() => setAcc(null)} />}
    </>
  )
}

const COLORS = ['#e8772e', '#2f6fb0', '#2f9e6b', '#8a4fbf', '#c0392b', '#d4a017', '#16a2b8', '#5b6573']

function EntityForm({ initial, onClose }: { initial: Partial<Entity>; onClose: () => void }) {
  const { data, save, saveMany, remove } = useStore()
  const editing = !!initial.id
  const [e, setE] = useState<Entity>(() => ({ id: uid(), name: '', kind: 'empresa', color: COLORS[data.entities.length % COLORS.length], ...initial }))
  const set = (x: Partial<Entity>) => setE((o) => ({ ...o, ...x }))
  const submit = () => {
    if (!e.name.trim()) return toast('Informe o nome', 'err')
    save('entities', { ...e, name: e.name.trim() })
    if (!editing) saveMany('accounts', [{ id: uid(), entityId: e.id, name: e.kind === 'pessoal' ? 'Conta pessoal' : `Conta ${e.name.trim()}`, initial: 0, initialDate: today() }])
    onClose()
  }
  const del = async () => {
    const used = data.txs.some((t) => t.entityId === e.id || t.toEntityId === e.id) || data.projects.some((p) => p.entityId === e.id)
    if (used) return toast('Esta carteira tem lançamentos ou obras. Não é possível excluir.', 'err')
    if (data.entities.length <= 1) return
    if (!(await confirmDialog(`Excluir ${e.name}?`, 'Excluir'))) return
    remove('entities', e.id)
    data.accounts.filter((a) => a.entityId === e.id).forEach((a) => remove('accounts', a.id))
    onClose()
  }
  const upload = async (f?: File) => {
    if (!f) return
    try { set({ logo: await readLogo(f) }) } catch { toast('Não consegui ler a imagem', 'err') }
  }
  return (
    <Modal title={editing ? `Editar ${e.name}` : 'Nova empresa'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Nome" span={2}><input value={e.name} onChange={(x) => set({ name: x.target.value })} autoFocus aria-label="Nome da empresa" /></Field>
        <Field label="Tipo"><select value={e.kind} onChange={(x) => set({ kind: x.target.value as Entity['kind'] })} aria-label="Tipo"><option value="empresa">Empresa (CNPJ)</option><option value="pessoal">Pessoal (CPF)</option></select></Field>
        <Field label={e.kind === 'empresa' ? 'CNPJ' : 'CPF'}><input value={e.doc ?? ''} onChange={(x) => set({ doc: x.target.value })} aria-label="CNPJ ou CPF" /></Field>
        <Field label="Cor"><div className="colors">{COLORS.map((c) => <button key={c} className={c === e.color ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Cor ${c}`} />)}</div></Field>
        <Field label="Logotipo" hint="Aparece nos orçamentos e recibos">
          <div className="row">
            {e.logo && <img className="logo-sm" src={e.logo} alt="Logo" />}
            <label className="btn small">Escolher imagem<input type="file" accept="image/*" hidden onChange={(x) => upload(x.target.files?.[0])} /></label>
            {e.logo && <button className="link small" onClick={() => set({ logo: undefined })}>remover</button>}
          </div>
        </Field>
        {e.kind === 'empresa' && <>
          <Field label="Endereço" span={2}><input value={e.address ?? ''} onChange={(x) => set({ address: x.target.value })} aria-label="Endereço" /></Field>
          <Field label="Telefone"><input value={e.phone ?? ''} onChange={(x) => set({ phone: x.target.value })} aria-label="Telefone" /></Field>
          <Field label="E-mail"><input value={e.email ?? ''} onChange={(x) => set({ email: x.target.value })} aria-label="E-mail" /></Field>
          <Field label="Responsável técnico (nome e CREA)" span={2}><input value={e.responsible ?? ''} onChange={(x) => set({ responsible: x.target.value })} placeholder="Eng. Civil Rogério … – CREA …" aria-label="Responsável técnico" /></Field>
          <Field label="Chave Pix / dados bancários" span={2}><input value={e.pix ?? ''} onChange={(x) => set({ pix: x.target.value })} aria-label="Pix" /></Field>
        </>}
      </div>
    </Modal>
  )
}

function AccountForm({ initial, onClose }: { initial: Partial<Account>; onClose: () => void }) {
  const { data, save, remove } = useStore()
  const editing = !!initial.id
  const [a, setA] = useState<Account>(() => ({ id: uid(), entityId: data.entities[0].id, name: '', initial: 0, initialDate: today(), ...initial }))
  const set = (x: Partial<Account>) => setA((o) => ({ ...o, ...x }))
  const submit = () => {
    if (!a.name.trim()) return toast('Dê um nome para a conta', 'err')
    save('accounts', { ...a, name: a.name.trim() })
    onClose()
  }
  const del = async () => {
    if (data.txs.some((t) => t.accountId === a.id || t.toAccountId === a.id)) {
      if (await confirmDialog('Esta conta tem lançamentos. Arquivar (some das listas, mas o histórico fica)?', 'Arquivar', false)) { save('accounts', { ...a, archived: true }); onClose() }
      return
    }
    if (await confirmDialog(`Excluir a conta ${a.name}?`, 'Excluir')) { remove('accounts', a.id); onClose() }
  }
  return (
    <Modal title={editing ? 'Editar conta' : 'Nova conta'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Nome" span={2}><input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Itaú PJ, Caixa (dinheiro), Sicoob" autoFocus aria-label="Nome da conta" /></Field>
        <Field label="De quem"><select value={a.entityId} onChange={(e) => set({ entityId: e.target.value })} aria-label="Carteira">{data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Saldo em" hint="Data em que você conferiu o saldo"><input type="date" value={a.initialDate} onChange={(e) => set({ initialDate: e.target.value })} aria-label="Data do saldo" /></Field>
        <Field label="Saldo nessa data" span={2} hint="Olhe no extrato do banco e coloque aqui. Pagamentos a partir dessa data mexem no saldo."><MoneyInput value={a.initial} onChange={(v) => set({ initial: v })} ariaLabel="Saldo inicial" /></Field>
        {editing && <Field label="Saldo atual calculado" span={2}><b>{money(accountBalance(data, a.id))}</b></Field>}
        {a.archived && <label className="check span-2"><input type="checkbox" checked={!a.archived} onChange={() => set({ archived: false })} /> Reativar conta</label>}
      </div>
    </Modal>
  )
}

function Categories() {
  const { data, save, remove } = useStore()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Category['kind']>('out')
  const [scope, setScope] = useState<Category['scope']>('empresa')
  const add = () => {
    if (!name.trim()) return
    save('categories', { id: uid(), name: name.trim(), kind, scope })
    setName('')
  }
  const groups: [string, Category[]][] = [
    ['Saídas das empresas', data.categories.filter((c) => c.kind === 'out' && c.scope === 'empresa')],
    ['Entradas das empresas', data.categories.filter((c) => c.kind === 'in' && c.scope === 'empresa')],
    ['Saídas pessoais', data.categories.filter((c) => c.kind === 'out' && c.scope === 'pessoal')],
    ['Entradas pessoais', data.categories.filter((c) => c.kind === 'in' && c.scope === 'pessoal')],
    ['Servem para as duas', data.categories.filter((c) => c.scope === 'ambos')],
  ]
  return (
    <>
      <div className="filters">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Nova categoria" />
        <select value={kind} onChange={(e) => setKind(e.target.value as Category['kind'])} aria-label="Tipo"><option value="out">Saída</option><option value="in">Entrada</option></select>
        <select value={scope} onChange={(e) => setScope(e.target.value as Category['scope'])} aria-label="Uso"><option value="empresa">Empresas</option><option value="pessoal">Pessoal</option><option value="ambos">Ambos</option></select>
        <button className="btn primary" onClick={add}>Adicionar</button>
      </div>
      <div className="cols even">
        {groups.map(([title, list]) => (
          <section key={title} className="card">
            <div className="card-head"><h2>{title}</h2></div>
            <div className="chips">
              {list.map((c) => (
                <span key={c.id} className="chip">{c.name}<button onClick={async () => (await confirmDialog(`Remover a categoria "${c.name}"? Lançamentos antigos mantêm o nome.`, 'Remover')) && remove('categories', c.id)} aria-label={`Remover ${c.name}`}>×</button></span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
