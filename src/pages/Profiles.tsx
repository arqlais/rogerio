import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Entity, Profile } from '../types'
import { Field, Modal, Stat, confirmDialog, toast } from '../components/ui'
import { readLogo } from './Registry'
import { letterhead, quoteTotals } from './Quotes'
import { openDocument } from '../components/ui'
import { KIND_LABEL, accountBalance, inScope, isLate, money, month, monthSummary, projectStats, today, uid } from '../utils'

const COLORS = ['#f08a2c', '#1f3a68', '#4caf50', '#8a4fbf', '#c0392b', '#d4a017', '#16a2b8', '#5b6573']

function Copy({ text }: { text?: string }) {
  if (!text) return <b className="muted">—</b>
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copiado') } catch { toast('Selecione e copie o texto', 'err') }
  }
  return <span className="copy"><b>{text}</b><button className="link small" onClick={copy}>copiar</button></span>
}

export function EntityProfile({ id }: { id: string }) {
  const { data, save, setSettings } = useStore()
  const e = data.entities.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  if (!e) return <div className="page"><p>Empresa não encontrada. <a href="#/cadastros">Voltar</a></p></div>
  const accounts = data.accounts.filter((a) => a.entityId === e.id && !a.archived)
  const balance = accounts.reduce((s, a) => s + accountBalance(data, a.id), 0)
  const open = data.txs.filter((t) => !t.paid && inScope(t, e.id))
  const toReceive = open.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0)
  const toPay = open.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0)
  const m = monthSummary(data, month(today()), e.id)
  const projects = data.projects.filter((p) => p.entityId === e.id && p.status !== 'concluida')
  const quotes = data.quotes.filter((q) => q.entityId === e.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const nfs = data.txs.filter((t) => t.entityId === e.id && (t.files?.length || t.docNo)).sort((a, b) => (b.paid ?? b.due).localeCompare(a.paid ?? a.due)).slice(0, 6)
  const company = e.kind === 'empresa'

  const sample = () => openDocument(letterhead(e, `<h2><span>1.</span> Exemplo de papel timbrado</h2><table class="info"><tr><td>CNPJ</td><td>${e.doc ?? ''}</td></tr><tr><td>Razão Social</td><td>${e.legalName ?? e.name}</td></tr><tr><td>Endereço</td><td>${[e.address, e.district].filter(Boolean).join(' - ')}</td></tr><tr><td>Telefone</td><td>${e.phone ?? ''}</td></tr></table>`, `Papel timbrado ${e.name}`), `Papel timbrado · ${e.name}`)

  return (
    <div className="page">
      <a className="back" href="#/cadastros">‹ Empresas</a>
      <section className="card profile-head" style={{ borderTopColor: e.color }}>
        {e.logo ? <img className="logo-lg" src={e.logo} alt={e.name} /> : <span className="logo-lg ph" style={{ background: e.color }}>{e.name.slice(0, 2)}</span>}
        <div className="profile-id">
          <h1>{e.name}</h1>
          <p className="muted">{company ? e.legalName || 'Empresa' : 'Finanças pessoais'}{e.doc ? ` · ${company ? 'CNPJ' : 'CPF'} ${e.doc}` : ''}</p>
        </div>
        <div className="row wrap">
          <button className={`btn ${e.favorite ? 'star-on' : ''}`} onClick={() => save('entities', { ...e, favorite: !e.favorite })} aria-pressed={!!e.favorite}>{e.favorite ? '★ Principal' : '☆ Marcar como principal'}</button>
          <button className="btn" onClick={() => { setSettings({ scope: e.id }); go('/') }}>Ver finanças</button>
          <button className="btn primary" onClick={() => setEdit(true)}>Editar dados</button>
        </div>
      </section>

      <div className="stats">
        <Stat label="Saldo nas contas" value={money(balance)} tone={balance < 0 ? 'bad' : undefined} />
        <Stat label="A receber" value={money(toReceive)} tone="good" sub={open.filter((t) => t.kind === 'in' && isLate(t)).length ? `${open.filter((t) => t.kind === 'in' && isLate(t)).length} atrasado(s)` : undefined} />
        <Stat label="A pagar" value={money(toPay)} tone="warn" />
        <Stat label="Resultado do mês" value={money(m.result)} tone={m.result < 0 ? 'bad' : 'good'} />
      </div>

      <div className="cols even">
        <section className="card">
          <div className="card-head"><h2>{company ? 'Dados da empresa' : 'Dados'}</h2><button className="link" onClick={() => setEdit(true)}>editar</button></div>
          {company && <div className="kv"><span>Razão social</span><Copy text={e.legalName} /></div>}
          <div className="kv"><span>{company ? 'CNPJ' : 'CPF'}</span><Copy text={e.doc} /></div>
          {company && e.municipalReg && <div className="kv"><span>Inscrição municipal</span><Copy text={e.municipalReg} /></div>}
          {company && e.stateReg && <div className="kv"><span>Inscrição estadual</span><Copy text={e.stateReg} /></div>}
          <div className="kv"><span>Endereço</span><Copy text={[e.address, e.district, e.city, e.cep && `CEP ${e.cep}`].filter(Boolean).join(' – ')} /></div>
          <div className="kv"><span>Telefone</span><Copy text={e.phone} /></div>
          <div className="kv"><span>E-mail</span><Copy text={e.email} /></div>
          {company && <div className="kv"><span>Pessoa responsável</span><Copy text={e.contactName} /></div>}
          {company && <div className="kv"><span>Responsável técnico</span><Copy text={e.responsible} /></div>}
          <div className="kv"><span>Banco</span><Copy text={e.bank} /></div>
          <div className="kv"><span>Pix</span><Copy text={e.pix} /></div>
          {e.notes && <p className="muted">{e.notes}</p>}
        </section>
        <div className="stack">
          {company && (
            <section className="card">
              <div className="card-head"><h2>Papel timbrado</h2><button className="link" onClick={sample}>ver como fica</button></div>
              <div className="brand-assets">
                <div><small className="muted">Logotipo</small>{e.logo ? <img src={e.logo} alt="" /> : <span className="muted small">sem logo</span>}</div>
                <div><small className="muted">Rodapé</small>{e.footer ? <img src={e.footer} alt="" /> : <span className="muted small">{e.tagline ? 'texto: ' + e.tagline : 'CNPJ, telefone e e-mail'}</span>}</div>
                <div><small className="muted">Marca-d'água</small>{e.watermark ? <img src={e.watermark} alt="" className="wm-prev" /> : <span className="muted small">nenhuma</span>}</div>
              </div>
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>Contas</h2><a className="link" href="#/cadastros/empresas">gerenciar</a></div>
            {accounts.map((a) => <div key={a.id} className="kv"><span>{a.name}</span><b>{money(accountBalance(data, a.id))}</b></div>)}
          </section>
        </div>
      </div>

      {company && (
        <div className="cols even">
          <section className="card">
            <div className="card-head"><h2>Obras ativas</h2><a className="link" href="#/obras">ver obras</a></div>
            {projects.length ? projects.map((p) => {
              const s = projectStats(data, p.id)
              return <a key={p.id} className="kv clickable" href={`#/obras/${p.id}`}><span>{p.name}<br /><small className="muted">{KIND_LABEL[p.kind]}</small></span><b>{money(s.cost)}</b></a>
            }) : <p className="muted">Nenhuma obra ativa.</p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Orçamentos recentes</h2><a className="link" href="#/orcamentos">ver todos</a></div>
            {quotes.length ? quotes.map((q) => <a key={q.id} className="kv clickable" href={`#/orcamentos/${q.id}`}><span>{q.apmName || q.client || 'Sem cliente'}<br /><small className="muted">nº {q.number} · {q.status}</small></span><b>{money(quoteTotals(q).total)}</b></a>) : <p className="muted">Nenhum orçamento.</p>}
          </section>
        </div>
      )}
      {nfs.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Notas fiscais recentes</h2><a className="link" href="#/financeiro">ver no financeiro</a></div>
          {nfs.map((t) => <div key={t.id} className="kv"><span>{t.docNo ? `${t.docNo} · ` : ''}{t.description}<br /><small className="muted">{t.files?.length ? `${t.files.length} anexo(s)` : 'sem anexo'}</small></span><b className={t.kind === 'in' ? 'pos' : 'neg'}>{money(t.amount)}</b></div>)}
        </section>
      )}
      {edit && <EntityForm initial={e} onClose={() => setEdit(false)} />}
    </div>
  )
}

export function EntityForm({ initial, onClose, onSaved }: { initial: Partial<Entity>; onClose: () => void; onSaved?: (e: Entity) => void }) {
  const { data, save, saveMany, remove } = useStore()
  const editing = !!initial.id && data.entities.some((x) => x.id === initial.id)
  const [e, setE] = useState<Entity>(() => ({ id: uid(), name: '', kind: 'empresa', color: COLORS[data.entities.length % COLORS.length], favorite: true, ...initial }))
  const set = (x: Partial<Entity>) => setE((o) => ({ ...o, ...x }))
  const company = e.kind === 'empresa'
  const submit = () => {
    if (!e.name.trim()) return toast('Informe o nome', 'err')
    save('entities', { ...e, name: e.name.trim() })
    if (!editing) saveMany('accounts', [{ id: uid(), entityId: e.id, name: company ? `Conta ${e.name.trim()}` : 'Conta pessoal', initial: 0, initialDate: today() }])
    toast(editing ? 'Dados salvos' : 'Empresa cadastrada')
    onClose()
    if (onSaved) onSaved({ ...e, name: e.name.trim() })
    else if (!editing) go(`/empresa/${e.id}`)
  }
  const del = async () => {
    const used = data.txs.some((t) => t.entityId === e.id || t.toEntityId === e.id) || data.projects.some((p) => p.entityId === e.id) || data.quotes.some((q) => q.entityId === e.id)
    if (used) return toast('Esta empresa tem lançamentos, obras ou orçamentos. Deixe-a fora das principais em vez de excluir.', 'err')
    if (!(await confirmDialog(`Excluir ${e.name}?`, 'Excluir'))) return
    remove('entities', e.id)
    data.accounts.filter((a) => a.entityId === e.id).forEach((a) => remove('accounts', a.id))
    onClose()
    go('/cadastros')
  }
  const upload = async (key: 'logo' | 'footer' | 'watermark', f?: File) => {
    if (!f) return
    try { set({ [key]: await readLogo(f, key === 'footer' ? 1400 : 700) }) } catch { toast('Não consegui ler a imagem', 'err') }
  }
  const img = (key: 'logo' | 'footer' | 'watermark', label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <div className="row wrap">
        {e[key] && <img className="asset-sm" src={e[key]} alt="" />}
        <label className="btn small">{e[key] ? 'Trocar' : 'Escolher imagem'}<input type="file" accept="image/*" hidden onChange={(x) => upload(key, x.target.files?.[0])} /></label>
        {e[key] && <button className="link small" onClick={() => set({ [key]: undefined })}>remover</button>}
      </div>
    </Field>
  )
  return (
    <Modal wide title={editing ? `Dados de ${e.name}` : 'Nova empresa'} onClose={onClose} footer={<>{editing && <button className="btn danger ghost" onClick={del}>Excluir</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={submit}>Salvar</button></>}>
      <div className="grid-form">
        <Field label="Nome curto (como aparece no sistema)"><input value={e.name} onChange={(x) => set({ name: x.target.value })} autoFocus aria-label="Nome curto" /></Field>
        <Field label="Tipo"><select value={e.kind} onChange={(x) => set({ kind: x.target.value as Entity['kind'] })} aria-label="Tipo"><option value="empresa">Empresa (CNPJ)</option><option value="pessoal">Pessoal (CPF)</option></select></Field>
        {company && <Field label="Razão social" span={2}><input value={e.legalName ?? ''} onChange={(x) => set({ legalName: x.target.value })} aria-label="Razão social" /></Field>}
        <Field label={company ? 'CNPJ' : 'CPF'}><input value={e.doc ?? ''} onChange={(x) => set({ doc: x.target.value })} aria-label="CNPJ ou CPF" /></Field>
        {company && <Field label="Inscrição municipal"><input value={e.municipalReg ?? ''} onChange={(x) => set({ municipalReg: x.target.value })} aria-label="Inscrição municipal" /></Field>}
        <Field label="Endereço (rua e número)"><input value={e.address ?? ''} onChange={(x) => set({ address: x.target.value })} aria-label="Endereço" /></Field>
        <Field label="Bairro"><input value={e.district ?? ''} onChange={(x) => set({ district: x.target.value })} aria-label="Bairro" /></Field>
        <Field label="Cidade – UF"><input value={e.city ?? ''} onChange={(x) => set({ city: x.target.value })} aria-label="Cidade" /></Field>
        <Field label="CEP"><input value={e.cep ?? ''} onChange={(x) => set({ cep: x.target.value })} aria-label="CEP" /></Field>
        <Field label="Telefone"><input value={e.phone ?? ''} onChange={(x) => set({ phone: x.target.value })} aria-label="Telefone" /></Field>
        <Field label="E-mail"><input value={e.email ?? ''} onChange={(x) => set({ email: x.target.value })} aria-label="E-mail" /></Field>
        {company && <Field label="Pessoa responsável (nos orçamentos)"><input value={e.contactName ?? ''} onChange={(x) => set({ contactName: x.target.value })} aria-label="Pessoa responsável" /></Field>}
        {company && <Field label="Responsável técnico (nome e CREA)"><input value={e.responsible ?? ''} onChange={(x) => set({ responsible: x.target.value })} aria-label="Responsável técnico" /></Field>}
        <Field label="Banco, agência e conta" span={2}><input value={e.bank ?? ''} onChange={(x) => set({ bank: x.target.value })} aria-label="Banco" /></Field>
        <Field label="Chave Pix"><input value={e.pix ?? ''} onChange={(x) => set({ pix: x.target.value })} aria-label="Pix" /></Field>
        <Field label="Cor"><div className="colors">{COLORS.map((c) => <button key={c} className={c === e.color ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Cor ${c}`} />)}</div></Field>
        <label className="check span-2"><input type="checkbox" checked={!!e.favorite} onChange={(x) => set({ favorite: x.target.checked })} /> Empresa principal (aparece em destaque no topo)</label>
        {company && <>
          <div className="span-2 section-t">Papel timbrado dos orçamentos</div>
          {img('logo', 'Logotipo (topo)', 'PNG com fundo transparente fica melhor')}
          {img('footer', 'Rodapé (imagem)', 'Opcional. Sem imagem, usa CNPJ, telefone e e-mail')}
          {img('watermark', "Marca-d'água (fundo)", 'Opcional. Use uma versão bem clara do logo')}
          <Field label="Frase do rodapé (se não tiver imagem)"><input value={e.tagline ?? ''} onChange={(x) => set({ tagline: x.target.value })} aria-label="Frase do rodapé" /></Field>
        </>}
        <Field label="Observações" span={2}><textarea rows={2} value={e.notes ?? ''} onChange={(x) => set({ notes: x.target.value })} aria-label="Observações" /></Field>
      </div>
    </Modal>
  )
}

export function OwnerProfile() {
  const { data, setSettings } = useStore()
  const p: Profile = data.settings.profile ?? {}
  const set = (x: Partial<Profile>) => setSettings({ profile: { ...p, ...x } })
  const photo = async (f?: File) => { if (f) try { set({ photo: await readLogo(f, 300) }) } catch { toast('Não consegui ler a imagem', 'err') } }
  const companies = data.entities.filter((e) => e.kind === 'empresa')
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Meu perfil</h1></div>
      <section className="card profile-head">
        {p.photo ? <img className="logo-lg round" src={p.photo} alt="" /> : <span className="logo-lg ph round">{(p.fullName || data.settings.owner || 'R').slice(0, 1)}</span>}
        <div className="profile-id">
          <h1>{p.fullName || data.settings.owner}</h1>
          <p className="muted">{[p.profession, p.crea].filter(Boolean).join(' · ')}</p>
        </div>
        <label className="btn small">{p.photo ? 'Trocar foto' : 'Colocar foto'}<input type="file" accept="image/*" hidden onChange={(x) => photo(x.target.files?.[0])} /></label>
      </section>
      <section className="card">
        <div className="card-head"><h2>Dados pessoais</h2><small className="muted">salva sozinho</small></div>
        <div className="grid-form">
          <Field label="Como quer ser chamado (saudação)"><input value={data.settings.owner} onChange={(x) => setSettings({ owner: x.target.value })} aria-label="Apelido" /></Field>
          <Field label="Nome completo"><input value={p.fullName ?? ''} onChange={(x) => set({ fullName: x.target.value })} aria-label="Nome completo" /></Field>
          <Field label="CPF"><input value={p.cpf ?? ''} onChange={(x) => set({ cpf: x.target.value })} aria-label="CPF" /></Field>
          <Field label="RG"><input value={p.rg ?? ''} onChange={(x) => set({ rg: x.target.value })} aria-label="RG" /></Field>
          <Field label="Profissão"><input value={p.profession ?? ''} onChange={(x) => set({ profession: x.target.value })} aria-label="Profissão" /></Field>
          <Field label="CREA"><input value={p.crea ?? ''} onChange={(x) => set({ crea: x.target.value })} aria-label="CREA" /></Field>
          <Field label="Telefone"><input value={p.phone ?? ''} onChange={(x) => set({ phone: x.target.value })} aria-label="Telefone" /></Field>
          <Field label="E-mail"><input value={p.email ?? ''} onChange={(x) => set({ email: x.target.value })} aria-label="E-mail" /></Field>
          <Field label="Endereço" span={2}><input value={p.address ?? ''} onChange={(x) => set({ address: x.target.value })} aria-label="Endereço residencial" /></Field>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Minhas empresas</h2><a className="link" href="#/cadastros">gerenciar</a></div>
        {companies.map((e) => (
          <a key={e.id} className="kv clickable" href={`#/empresa/${e.id}`}>
            <span className="row">{e.logo ? <img className="logo-sm" src={e.logo} alt="" /> : <span className="logo-sm ph" style={{ background: e.color }}>{e.name.slice(0, 2)}</span>}<span>{e.name}{e.favorite ? ' ★' : ''}<br /><small className="muted">{e.doc || 'CNPJ não informado'}</small></span></span>
            <b>›</b>
          </a>
        ))}
      </section>
    </div>
  )
}
