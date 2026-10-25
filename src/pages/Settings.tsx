import { useState } from 'react'
import { useStore, emptyData } from '../store'
import { importFromSupabase } from '../migrate'
import { aiConfig, rememberAi, DEFAULT_MODEL } from '../ai'
import { CLOUD } from '../cloud'
import { signOut } from '../App'
import { Field, Modal, NumInput, confirmDialog, toast, PageHead } from '../components/ui'
import { downloadFile, today } from '../utils'
import type { Data } from '../types'

export function SettingsPage() {
  const { data, setSettings, replaceAll, userEmail, demo, setDemo, resetDemo } = useStore()
  const s = data.settings

  const backup = () => downloadFile(`backup-gestao-${today()}.json`, JSON.stringify(data, null, 2), 'application/json')
  const restore = async (f?: File) => {
    if (!f) return
    try {
      const d = JSON.parse(await f.text()) as Data
      if (!Array.isArray(d.txs) || !Array.isArray(d.entities)) throw new Error()
      if (!(await confirmDialog('Restaurar este backup? Tudo o que está cadastrado agora será substituído.', 'Restaurar'))) return
      replaceAll(d)
      toast('Backup restaurado')
    } catch {
      toast('Arquivo de backup inválido', 'err')
    }
  }
  const reset = async () => {
    if (!(await confirmDialog('Apagar TODOS os dados e começar do zero? Faça um backup antes, se quiser guardar.', 'Apagar tudo'))) return
    replaceAll({ ...emptyData(), settings: { ...emptyData().settings, owner: s.owner } })
    toast('Tudo apagado')
  }
  const sample = () => setDemo(!demo)
  const [old, setOld] = useState<{ email: string; password: string; step: string } | null>(null)
  const importOld = async () => {
    if (!old) return
    if (!(await confirmDialog('Trazer os dados do sistema antigo? Tudo o que está cadastrado agora será substituído (faça um backup antes, se quiser guardar).', 'Trazer dados'))) return
    try {
      const d = await importFromSupabase(old.email.trim(), old.password, (step) => setOld((o) => (o ? { ...o, step } : o)))
      if (!d) { setOld((o) => (o ? { ...o, step: '' } : o)); return toast('Não há dados nesse login do sistema antigo', 'err') }
      replaceAll(d)
      setOld(null)
      toast('Dados do sistema antigo trazidos')
    } catch (e) {
      setOld((o) => (o ? { ...o, step: '' } : o))
      toast(String((e as Error).message), 'err')
    }
  }

  return (
    <div className="page narrow">
      <PageHead eyebrow="preferências" title="Ajustes" accent="e assistente" />
      <section className="card">
        <div className="card-head"><h2>Geral</h2></div>
        <div className="grid-form">
          <Field label="Seu nome (aparece na saudação)"><input value={s.owner} onChange={(e) => setSettings({ owner: e.target.value })} aria-label="Seu nome" /></Field>
          <Field label="Dia do pagamento dos fixos" hint="Salário do mês é lançado para esse dia do mês seguinte"><NumInput value={s.payday} min={1} onChange={(v) => setSettings({ payday: Math.max(1, Math.min(28, v)) })} ariaLabel="Dia do pagamento" /></Field>
          <Field label="Semana das diárias começa em">
            <select value={s.weekStart} onChange={(e) => setSettings({ weekStart: Number(e.target.value) })} aria-label="Início da semana">
              <option value={1}>Segunda-feira</option><option value={6}>Sábado</option><option value={0}>Domingo</option>
            </select>
          </Field>
        </div>
      </section>
      <AiSettings />
      <section className="card">
        <div className="card-head"><h2>Começar fácil</h2></div>
        <div className="row wrap">
          <a className="btn" href="#/importar">Importar planilha (Excel / CSV)</a>
          <button className="btn" onClick={() => setSettings({ onboarded: false })}>Ver o passo a passo de novo</button>
          {!!Object.keys(s.learned ?? {}).length && <button className="btn ghost" onClick={async () => { if (await confirmDialog('Esquecer o que aprendi sobre empresa/pessoal? Volto a adivinhar pelas palavras.', 'Esquecer', false)) setSettings({ learned: {} }) }}>Esquecer o que aprendi ({Object.keys(s.learned ?? {}).length})</button>}
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Seus dados</h2></div>
        <p className="muted">{CLOUD ? <>Conectado como <b>{userEmail}</b>. Os dados ficam salvos na nuvem e aparecem iguais no celular e no computador.</> : <>Os dados estão salvos <b>só neste aparelho</b>. Faça backup de vez em quando.</>}</p>
        <div className="row wrap">
          <button className="btn" onClick={backup}>Baixar backup</button>
          <label className="btn">Restaurar backup<input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} /></label>
          {CLOUD && !demo && <button className="btn" onClick={() => setOld({ email: userEmail ?? '', password: '', step: '' })}>Trazer dados do sistema antigo</button>}
          {CLOUD && <button className="btn" onClick={() => signOut()}>Sair</button>}
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Começar de novo</h2></div>
        <div className="row wrap">
          <button className="btn" onClick={sample}>{demo ? 'Esconder o exemplo (voltar aos meus dados)' : 'Ver exemplo preenchido'}</button>
          {demo && <button className="btn" onClick={resetDemo}>Recomeçar o exemplo</button>}
          {!demo && <button className="btn danger" onClick={reset}>Apagar tudo e começar do zero</button>}
        </div>
      </section>
      {old && (
        <Modal title="Trazer dados do sistema antigo" onClose={() => setOld(null)} footer={<><span style={{ flex: 1 }} /><button className="btn" onClick={() => setOld(null)}>Cancelar</button><button className="btn primary" disabled={!!old.step || !old.password} onClick={importOld}>{old.step || 'Trazer'}</button></>}>
          <p className="muted small" style={{ marginTop: 0 }}>Use o e-mail e a senha que você usava antes da mudança. Os dados e as notas anexadas são copiados para cá.</p>
          <div className="grid-form">
            <Field label="E-mail"><input type="email" value={old.email} onChange={(e) => setOld({ ...old, email: e.target.value })} aria-label="E-mail antigo" /></Field>
            <Field label="Senha"><input type="password" value={old.password} onChange={(e) => setOld({ ...old, password: e.target.value })} aria-label="Senha antiga" /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AiSettings() {
  const { data, setSettings } = useStore()
  const cfg = aiConfig(data)
  const [key, setKey] = useState(cfg.key)
  const [model, setModel] = useState(cfg.model)
  const saveAi = () => { setSettings({ ai: { key: key.trim(), model: model.trim() || DEFAULT_MODEL } }); rememberAi(key.trim(), model.trim() || DEFAULT_MODEL); toast(key.trim() ? 'Assistente salvo' : 'Assistente desligado') }
  return (
    <section className="card">
      <div className="card-head"><div><h2>Assistente (Google Gemini)</h2><small className="muted">{cfg.key ? 'ligado' : 'desligado'} · conversa sobre os seus dados, lê foto de nota e monta orçamentos</small></div></div>
      <div className="grid-form">
        <Field label="Chave do Gemini" hint={<>Crie grátis em <a className="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a></>}><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" aria-label="Chave do Gemini" /></Field>
        <Field label="Modelo" hint="deixe o padrão, a não ser que dê erro de modelo"><input value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modelo do Gemini" /></Field>
      </div>
      <div className="row wrap" style={{ marginTop: 12 }}><button className="btn primary" onClick={saveAi}>Salvar</button>{cfg.key && <button className="btn ghost" onClick={() => { setKey(''); setSettings({ ai: { key: '', model } }); rememberAi('', model); toast('Assistente desligado') }}>Desligar</button>}</div>
    </section>
  )
}
