import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { CalEvent, Tx } from '../types'
import { Icon } from './Icon'
import { toast } from './ui'
import { actionTx, aiConfig, ask, rememberAi, DEFAULT_MODEL, type AiAction, type ChatMsg } from '../ai'
import { classify, fallbackCategory, learn, placeFor, type Scope } from '../classify'
import { buildQuote } from '../pages/Quotes'
import { fmtDate, money, today, uid } from '../utils'

type Msg = ChatMsg & { id: string; actions?: (AiAction & { done?: 'ok' | 'skip' })[]; error?: boolean }

const SUGGEST = [
  'O que vence esta semana?',
  'Quanto gastei este mês na empresa e no pessoal?',
  'Paguei 450 de cimento hoje para a obra do prédio',
  'Monta um orçamento de pintura de 3 salas para a escola Calvitti',
  'Marca visita na obra amanhã às 8h',
]

/** Assistente: conversa com o Gemini sobre os dados e faz lançamentos, compromissos e orçamentos com um toque. */
export function Assistant({ onClose, onEditTx }: { onClose: () => void; onEditTx: (t: Partial<Tx>) => void }) {
  const { data, save, setSettings } = useStore()
  const cfg = aiConfig(data)
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(sessionStorage.getItem('rogerio-chat') || '[]') } catch { return [] } })
  const [text, setText] = useState('')
  const [img, setImg] = useState<{ mime: string; data: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); try { sessionStorage.setItem('rogerio-chat', JSON.stringify(msgs.map((m) => ({ ...m, image: undefined })).slice(-30))) } catch { /* cheio */ } }, [msgs, busy])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.classList.add('modal-open')
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('modal-open') }
  }, [onClose])

  const send = async (q?: string) => {
    const t = (q ?? text).trim()
    if ((!t && !img) || busy) return
    const user: Msg = { id: uid(), role: 'user', text: t, image: img ? { mime: img.mime, data: img.data } : undefined }
    const history = [...msgs, user]
    setMsgs(history.map((m) => (m.id === user.id ? { ...m } : m)))
    setText(''); setImg(null); setBusy(true)
    try {
      const r = await ask(data, history.filter((m) => !m.error))
      setMsgs((l) => [...l, { id: uid(), role: 'model', text: r.reply, actions: r.actions }])
    } catch (e) {
      const m = String((e as Error).message)
      setMsgs((l) => [...l, { id: uid(), role: 'model', text: m === 'sem-chave' ? 'Falta a chave do Gemini.' : `Não consegui responder agora: ${m}`, error: true }])
    }
    setBusy(false)
  }

  const pickImage = (f?: File) => {
    if (!f) return
    if (f.size > 8e6) return toast('Foto muito grande (máximo 8 MB)', 'err')
    const r = new FileReader()
    r.onload = () => { const url = String(r.result); setImg({ mime: f.type || 'image/jpeg', data: url.split(',')[1] ?? '', url }) }
    r.readAsDataURL(f)
  }

  const mark = (msgId: string, i: number, done: 'ok' | 'skip') => setMsgs((l) => l.map((m) => (m.id === msgId ? { ...m, actions: m.actions?.map((a, k) => (k === i ? { ...a, done } : a)) } : m)))

  const run = (msgId: string, i: number, a: AiAction) => {
    if (a.type === 'lancar') {
      if (!a.amount) return toast('Falta o valor. Toque em Ajustar.', 'err')
      const base = actionTx(a)
      const g = classify(data, { kind: base.kind!, description: base.description ?? '', projectId: base.projectId, personId: base.personId })
      const scope: Scope = a.scope ?? g.scope ?? 'empresa'
      const category = (a.category && data.categories.some((c) => c.name === a.category) ? a.category : g.category) || fallbackCategory(base.kind!, scope)
      const tx: Tx = { id: uid(), kind: base.kind!, category, description: base.description || category, amount: base.amount!, due: base.due!, paid: base.paid, projectId: base.projectId, personId: base.personId, notes: 'Lançado pelo assistente', createdAt: new Date().toISOString(), ...placeFor(data, scope, base.projectId) }
      save('txs', tx)
      if (base.description) setSettings({ learned: learn(data.settings.learned, tx.kind, base.description, category, scope) })
      toast(`Lançado em ${scope === 'pessoal' ? 'Pessoal' : 'Empresa'}`)
    } else if (a.type === 'compromisso') {
      const ev: CalEvent = { id: uid(), title: a.title || a.description || 'Compromisso', date: a.date || today(), time: a.time || undefined, place: a.place || undefined, projectId: a.projectId || undefined, kind: a.projectId ? 'visita' : 'compromisso' }
      save('events', ev)
      toast('Compromisso na agenda')
    } else if (a.type === 'pagar') {
      const t = data.txs.find((x) => x.id === a.txId)
      if (!t) return toast('Não achei essa conta', 'err')
      save('txs', { ...t, paid: a.date || today() })
      toast(t.kind === 'in' ? 'Marcado como recebido' : 'Marcado como pago')
    } else if (a.type === 'orcamento') {
      const companies = data.entities.filter((e) => e.kind === 'empresa')
      const ent = companies.find((e) => a.company && e.name.toLowerCase() === a.company.toLowerCase()) ?? companies.find((e) => e.id === data.settings.lastEntity) ?? companies.find((e) => e.id === data.settings.mainCompany) ?? companies[0]
      const model = a.model ?? 'padrao'
      const items = (a.items ?? []).map((it) => ({ id: uid(), description: it.description, unit: it.unit || 'un', qty: it.qty ?? 1, price: Math.round((it.price ?? 0) * 100) / 100 }))
      const q = buildQuote(data, model, ent.id, items.length ? items : undefined, a.title ?? '')
      const nm = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(e\.?\s?e\.?|emef|emei)\s*/, '').replace(/prof(a|ª)?\.?\s*/g, '').trim()
      const c = data.clients.find((x) => x.id === a.clientId) ?? (a.clientName ? data.clients.find((x) => nm(x.name).includes(nm(a.clientName)) || nm(a.clientName).includes(nm(x.name))) : undefined)
      const filled = c ? (model === 'pdde' ? { clientId: c.id, apmName: c.apm || c.name.toUpperCase(), apmCnpj: c.doc, client: c.name } : { clientId: c.id, client: c.name, clientDoc: c.doc, address: c.address }) : { client: a.clientName ?? '', apmName: model === 'pdde' ? a.clientName : undefined }
      save('quotes', { ...q, ...filled, items: model === 'padrao' ? q.items.map((i) => ({ ...i, group: i.group ?? '1. Serviços' })) : q.items })
      toast('Orçamento criado — confira e baixe o PDF')
      mark(msgId, i, 'ok')
      onClose()
      go(`/orcamentos/${q.id}`)
      return
    }
    mark(msgId, i, 'ok')
  }

  const saveKey = () => {
    const k = key.trim()
    if (k.length < 20) return toast('Cole a chave inteira (começa com AIza…)', 'err')
    setSettings({ ai: { key: k, model: cfg.model || DEFAULT_MODEL } })
    rememberAi(k, cfg.model || DEFAULT_MODEL)
    toast('Assistente ligado')
  }

  const actionLabel = (a: AiAction) => {
    if (a.type === 'lancar') return { icon: a.kind === 'in' ? 'arrowUp' : 'arrowDown', title: `${a.kind === 'in' ? 'Entrou' : 'Saiu'} ${money(a.amount ?? 0)}`, sub: [a.description, a.scope === 'pessoal' ? 'Pessoal' : a.scope === 'empresa' ? 'Empresa' : '', data.projects.find((p) => p.id === a.projectId)?.name, a.date ? fmtDate(a.date) : '', a.paid === false ? 'a pagar' : 'pago'].filter(Boolean).join(' · ') }
    if (a.type === 'compromisso') return { icon: 'calendar', title: a.title || 'Compromisso', sub: [a.date ? fmtDate(a.date) : '', a.time, a.place].filter(Boolean).join(' · ') }
    if (a.type === 'pagar') { const t = data.txs.find((x) => x.id === a.txId); return { icon: 'check', title: `Marcar como ${t?.kind === 'in' ? 'recebido' : 'pago'}`, sub: t ? `${t.description} · ${money(t.amount)}` : 'conta não encontrada' } }
    return { icon: 'file', title: `Orçamento ${a.model === 'pdde' ? 'para escola' : 'comum'}`, sub: `${a.clientName || data.clients.find((c) => c.id === a.clientId)?.name || 'cliente'} · ${a.items?.length ?? 0} itens · ${money((a.items ?? []).reduce((s, i) => s + (i.qty ?? 1) * (i.price ?? 0), 0))}` }
  }

  return (
    <div className="ai-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ai-panel" role="dialog" aria-label="Assistente">
        <header className="ai-head">
          <span className="ai-logo"><Icon name="sparkle" size={20} /></span>
          <div><b>Assistente</b><small>Gemini · entende suas obras, contas e agenda</small></div>
          <span style={{ flex: 1 }} />
          {msgs.length > 0 && <button className="icon-btn" onClick={() => setMsgs([])} title="Nova conversa" aria-label="Nova conversa"><Icon name="undo" size={18} /></button>}
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} /></button>
        </header>

        {!cfg.key ? (
          <div className="ai-setup">
            <span className="eyebrow">ligar uma vez</span>
            <h2 className="duo">Ligue o <em>assistente</em></h2>
            <p>Ele conversa com você sobre os seus dados, lança gastos falando normal ("paguei 300 de areia"), lê foto de nota fiscal e monta orçamentos.</p>
            <ol>
              <li>Abra <a className="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> e entre com uma conta Google.</li>
              <li>Toque em <b>Criar chave de API</b> (é gratuito) e copie.</li>
              <li>Cole aqui embaixo e salve.</li>
            </ol>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" aria-label="Chave do Gemini" />
            <button className="pill-btn" onClick={saveKey}><span>Salvar e ligar</span><i><Icon name="chevron" size={18} /></i></button>
            <small className="muted">Para responder, o resumo dos seus dados (obras, contas, agenda, preços) vai para o Google Gemini junto com a pergunta. Nada é feito sem você confirmar.</small>
          </div>
        ) : (
          <>
            <div className="ai-msgs">
              {!msgs.length && (
                <div className="ai-hello">
                  <h2 className="duo">Como posso <em>ajudar?</em></h2>
                  <p className="muted">Escreva do seu jeito. Eu entendo, organizo e só faço algo quando você confirmar.</p>
                  <div className="ai-sugg">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)}>{s}<Icon name="chevron" size={14} /></button>)}</div>
                </div>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={`ai-msg ${m.role} ${m.error ? 'err' : ''}`}>
                  {m.image && <img src={`data:${m.image.mime};base64,${m.image.data}`} alt="" />}
                  {m.text && <p>{m.text}</p>}
                  {m.actions?.map((a, i) => {
                    const l = actionLabel(a)
                    return (
                      <div key={i} className={`ai-act ${a.done ?? ''}`}>
                        <span className="ai-act-ic"><Icon name={l.icon} size={18} /></span>
                        <span className="ai-act-t"><b>{l.title}</b><small>{l.sub}</small></span>
                        {a.done === 'ok' ? <span className="ai-done"><Icon name="check" size={16} /> feito</span> : a.done === 'skip' ? <span className="muted small">ignorado</span> : (
                          <span className="ai-act-b">
                            {a.type === 'lancar' && <button className="btn small" onClick={() => { mark(m.id, i, 'skip'); onEditTx(actionTx(a)) }}>Ajustar</button>}
                            <button className="btn small ghost" onClick={() => mark(m.id, i, 'skip')} aria-label="Ignorar"><Icon name="x" size={14} /></button>
                            <button className="btn small primary" onClick={() => run(m.id, i, a)}>{a.type === 'orcamento' ? 'Criar' : 'Confirmar'}</button>
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {m.error && /chave/i.test(m.text) && <button className="link small" onClick={() => { setSettings({ ai: { key: '', model: cfg.model } }); rememberAi('', cfg.model) }}>trocar a chave</button>}
                </div>
              ))}
              {busy && <div className="ai-msg model typing"><span /><span /><span /></div>}
              <div ref={end} />
            </div>
            <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send() }}>
              {img && <div className="ai-img"><img src={img.url} alt="" /><button type="button" onClick={() => setImg(null)} aria-label="Tirar foto"><Icon name="x" size={14} /></button></div>}
              <label className="icon-btn" title="Foto de nota ou recibo" aria-label="Foto de nota ou recibo"><Icon name="image" size={20} /><input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = '' }} /></label>
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Escreva ou peça algo…" aria-label="Mensagem para o assistente" />
              <button className="ai-send" disabled={busy || (!text.trim() && !img)} aria-label="Enviar"><Icon name="send" size={18} /></button>
            </form>
          </>
        )}
      </aside>
    </div>
  )
}
