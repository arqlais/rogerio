import { useStore, emptyData, sampleData } from '../store'
import { CLOUD } from '../cloud'
import { signOut } from '../App'
import { Field, NumInput, confirmDialog, toast } from '../components/ui'
import { downloadFile, today } from '../utils'
import type { Data } from '../types'

export function SettingsPage() {
  const { data, setSettings, replaceAll, userEmail } = useStore()
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
  const sample = async () => {
    if (!(await confirmDialog('Carregar dados de exemplo? Eles substituem o que está cadastrado agora.', 'Carregar exemplo'))) return
    replaceAll(sampleData())
  }

  return (
    <div className="page narrow">
      <div className="page-head"><h1>Ajustes</h1></div>
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
      <section className="card">
        <div className="card-head"><h2>Seus dados</h2></div>
        <p className="muted">{CLOUD ? <>Conectado como <b>{userEmail}</b>. Os dados ficam salvos na nuvem e aparecem iguais no celular e no computador.</> : <>Os dados estão salvos <b>só neste aparelho</b>. Faça backup de vez em quando.</>}</p>
        <div className="row wrap">
          <button className="btn" onClick={backup}>Baixar backup</button>
          <label className="btn">Restaurar backup<input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} /></label>
          {CLOUD && <button className="btn" onClick={() => signOut()}>Sair</button>}
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Começar de novo</h2></div>
        <div className="row wrap">
          <button className="btn" onClick={sample}>Carregar dados de exemplo</button>
          <button className="btn danger" onClick={reset}>Apagar tudo e começar do zero</button>
        </div>
      </section>
    </div>
  )
}
