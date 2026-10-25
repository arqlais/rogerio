import { useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Account, Person, PersonRole, Project, ProjectKind, Tx } from '../types'
import { Icon } from '../components/Icon'
import { MoneyInput, toast } from '../components/ui'
import { KIND_LABEL, addMonths, money, today, uid } from '../utils'
import { homeEntities } from '../classify'

/* Passo a passo do primeiro acesso: deixa a plataforma pronta em poucos minutos.
   Cada passo grava na hora; dá para pular qualquer um e voltar depois (botão "?" no menu). */

const STEPS = ['Boas-vindas', 'Empresas', 'Saldo de hoje', 'Equipe', 'Obras', 'Contas do mês', 'Planilhas', 'Pronto']

type Fixed = { id: string; name: string; category: string; scope: 'empresa' | 'pessoal'; on: boolean; value: number; day: number }
const FIXED = (): Fixed[] => [
  ...([['Aluguel ou condomínio de casa', 'Casa e contas'], ['Luz de casa', 'Casa e contas'], ['Água de casa', 'Casa e contas'], ['Internet e celular', 'Casa e contas'], ['Plano de saúde', 'Saúde e plano'], ['Escola / faculdade', 'Educação'], ['Cartão de crédito', 'Cartão de crédito']] as const).map(([name, category]) => ({ id: uid(), name, category, scope: 'pessoal' as const, on: false, value: 0, day: 10 })),
  ...([['Contador', 'Contador'], ['Imposto (DAS / Simples)', 'Impostos da empresa'], ['INSS / FGTS dos funcionários', 'Encargos (INSS/FGTS)'], ['Aluguel do escritório / depósito', 'Escritório e despesas fixas'], ['Tarifa do banco', 'Tarifas bancárias']] as const).map(([name, category]) => ({ id: uid(), name, category, scope: 'empresa' as const, on: false, value: 0, day: 20 })),
]

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { data, saveMany, setSettings } = useStore()
  const [step, setStep] = useState(0)
  const [owner, setOwner] = useState(data.settings.owner || 'Rogério')
  const companies = data.entities.filter((e) => e.kind === 'empresa')
  const [main, setMain] = useState(homeEntities(data).main?.id ?? '')
  const [accounts, setAccounts] = useState<Account[]>(() => data.accounts.filter((a) => !a.archived).map((a) => ({ ...a })))
  const [people, setPeople] = useState<{ id: string; name: string; role: PersonRole; value: number; phone: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string; kind: ProjectKind; client: string; value: number }[]>([])
  const [fixed, setFixed] = useState<Fixed[]>(FIXED)
  const pessoal = data.entities.find((e) => e.kind === 'pessoal')

  const finishStep = () => {
    if (step === 0) setSettings({ owner: owner.trim() || 'Rogério' })
    if (step === 1 && main) setSettings({ mainCompany: main })
    if (step === 2) saveMany('accounts', accounts.filter((a) => a.name.trim()).map((a) => ({ ...a, initialDate: a.initial !== data.accounts.find((x) => x.id === a.id)?.initial ? today() : a.initialDate })))
    if (step === 3) {
      const list: Person[] = people.filter((p) => p.name.trim()).map((p) => ({ id: p.id, name: p.name.trim(), role: p.role, phone: p.phone || undefined, active: true, entityId: main, ...(p.role === 'fixo' ? { salary: p.value } : p.role === 'diarista' ? { dailyRate: p.value } : {}) }))
      if (list.length) { saveMany('people', list); toast(`${list.length} pessoa(s) cadastrada(s)`) }
    }
    if (step === 4) {
      const list: Project[] = projects.filter((p) => p.name.trim()).map((p) => ({ id: p.id, name: p.name.trim(), kind: p.kind, client: p.client || undefined, entityId: main || companies[0]?.id || '', status: 'andamento', contractValue: p.value, budget: 0, start: today() }))
      if (list.length) { saveMany('projects', list); toast(`${list.length} obra(s) cadastrada(s)`) }
    }
    if (step === 5) {
      const txs: Tx[] = []
      for (const f of fixed.filter((x) => x.on && x.value > 0)) {
        const ent = f.scope === 'pessoal' ? pessoal?.id : main
        if (!ent) continue
        const acc = data.accounts.find((a) => a.entityId === ent && !a.archived)?.id
        const now = today()
        let first = `${now.slice(0, 8)}${String(Math.min(28, Math.max(1, f.day))).padStart(2, '0')}`
        if (first < now) first = addMonths(first, 1)
        const g = uid()
        for (let i = 0; i < 12; i++) txs.push({ id: uid(), kind: 'out', entityId: ent, accountId: acc, category: f.category, description: f.name, amount: f.value, due: addMonths(first, i), group: g, installment: `${i + 1}/12`, createdAt: new Date().toISOString() })
      }
      if (txs.length) { saveMany('txs', txs); toast(`${txs.length / 12} conta(s) fixa(s) lançada(s) para os próximos 12 meses`) }
    }
  }
  const next = () => { finishStep(); if (step < STEPS.length - 1) setStep(step + 1); else onClose() }
  const back = () => setStep(Math.max(0, step - 1))
  const skip = () => (step < STEPS.length - 1 ? setStep(step + 1) : onClose())

  const roleValue: Record<string, string> = { fixo: 'salário', diarista: 'diária', empreiteiro: '', fornecedor: '', cliente: '', outro: '' }

  return (
    <div className="onb" role="dialog" aria-label="Passo a passo do primeiro acesso">
      <div className="onb-card">
        <header className="onb-head">
          <div className="onb-progress" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i < step ? 'done' : i === step ? 'on' : ''} />)}</div>
          <div className="onb-meta"><span>passo {step + 1} de {STEPS.length} · {STEPS[step].toLowerCase()}</span><button className="link small" onClick={onClose}>fazer depois</button></div>
        </header>

        <div className="onb-body">
          {step === 0 && (
            <>
              <span className="eyebrow">primeiro acesso</span>
              <h1 className="duo">Vamos deixar tudo <em>pronto pra usar</em></h1>
              <p className="onb-lead">São 6 passos rápidos. Pode pular qualquer um e voltar depois pelo botão <b>?</b> do menu.</p>
              <div className="onb-promise">
                <div><Icon name="plus" size={20} /><b>Você só lança</b><span>quanto foi, o que foi e quando</span></div>
                <div><Icon name="sparkle" size={20} /><b>Eu separo sozinho</b><span>empresa ou pessoal, pela descrição</span></div>
                <div><Icon name="alert" size={20} /><b>Eu aviso</b><span>contas vencendo, diárias, cobranças</span></div>
              </div>
              <label className="onb-field"><span>Como você quer ser chamado?</span><input value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Seu nome" autoFocus /></label>
            </>
          )}

          {step === 1 && (
            <>
              <span className="eyebrow">suas empresas</span>
              <h1 className="duo">Qual é a <em>empresa principal?</em></h1>
              <p className="onb-lead">Os gastos da empresa que não são de nenhuma obra caem nela. Os de obra vão para a empresa da obra. Os dados de cada uma (CNPJ, logo, endereço) já estão cadastrados.</p>
              <div className="onb-cos">
                {companies.map((e) => (
                  <button key={e.id} className={main === e.id ? 'on' : ''} onClick={() => setMain(e.id)}>
                    {e.logo ? <img src={e.logo} alt="" /> : <span className="ph" style={{ background: e.color }}>{e.name.slice(0, 2)}</span>}
                    <b>{e.name}</b>
                    <small>{e.doc || 'CNPJ não informado'}</small>
                    {main === e.id && <em><Icon name="check" size={14} /> principal</em>}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <span className="eyebrow">saldo de hoje</span>
              <h1 className="duo">Quanto tem <em>em cada conta hoje?</em></h1>
              <p className="onb-lead">É o ponto de partida. Daqui pra frente o saldo se atualiza sozinho com o que você lança. Pode deixar em branco a conta que não usa.</p>
              <div className="onb-rows">
                {accounts.map((a) => {
                  const ent = data.entities.find((e) => e.id === a.entityId)
                  return (
                    <div key={a.id} className="onb-row acc">
                      <span className={`onb-tag ${ent?.kind}`}>{ent?.kind === 'pessoal' ? 'pessoal' : ent?.name}</span>
                      <input value={a.name} onChange={(e) => setAccounts((l) => l.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} aria-label="Nome da conta" placeholder="Nome da conta (ex.: Nubank PJ)" />
                      <MoneyInput value={a.initial} onChange={(v) => setAccounts((l) => l.map((x) => (x.id === a.id ? { ...x, initial: v } : x)))} ariaLabel={`Saldo ${a.name}`} />
                    </div>
                  )
                })}
              </div>
              <div className="row wrap">
                <button className="btn small" onClick={() => setAccounts((l) => [...l, { id: uid(), entityId: main, name: 'Outra conta da empresa', initial: 0, initialDate: today() }])}>+ conta da empresa</button>
                {pessoal && <button className="btn small" onClick={() => setAccounts((l) => [...l, { id: uid(), entityId: pessoal.id, name: 'Dinheiro / outra conta pessoal', initial: 0, initialDate: today() }])}>+ conta pessoal</button>}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <span className="eyebrow">equipe</span>
              <h1 className="duo">Quem trabalha <em>com você?</em></h1>
              <p className="onb-lead">Só o básico agora. Pix, documentos e foto você completa depois na ficha de cada um. {data.people.length ? `Já tem ${data.people.length} cadastrado(s).` : ''}</p>
              <div className="onb-rows">
                {people.map((p) => (
                  <div key={p.id} className="onb-row ppl">
                    <input value={p.name} onChange={(e) => setPeople((l) => l.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} placeholder="Nome (como é chamado)" aria-label="Nome" />
                    <select value={p.role} onChange={(e) => setPeople((l) => l.map((x) => (x.id === p.id ? { ...x, role: e.target.value as PersonRole } : x)))} aria-label="Tipo">
                      <option value="diarista">Diarista</option><option value="fixo">Fixo (salário)</option><option value="empreiteiro">Empreiteiro</option>
                    </select>
                    {roleValue[p.role] ? <MoneyInput value={p.value} onChange={(v) => setPeople((l) => l.map((x) => (x.id === p.id ? { ...x, value: v } : x)))} ariaLabel={roleValue[p.role]} placeholder={roleValue[p.role]} /> : <span />}
                    <input value={p.phone} onChange={(e) => setPeople((l) => l.map((x) => (x.id === p.id ? { ...x, phone: e.target.value } : x)))} placeholder="Telefone" inputMode="tel" aria-label="Telefone" />
                    <button className="icon-btn" onClick={() => setPeople((l) => l.filter((x) => x.id !== p.id))} aria-label="Remover"><Icon name="x" size={16} /></button>
                  </div>
                ))}
              </div>
              <button className="btn small" onClick={() => setPeople((l) => [...l, { id: uid(), name: '', role: 'diarista', value: 0, phone: '' }])}>+ pessoa</button>
            </>
          )}

          {step === 4 && (
            <>
              <span className="eyebrow">obras</span>
              <h1 className="duo">Quais obras estão <em>em andamento?</em></h1>
              <p className="onb-lead">Assim você liga cada gasto à obra certa e vê quanto cada uma está custando. {data.projects.length ? `Já tem ${data.projects.length} cadastrada(s).` : ''}</p>
              <div className="onb-rows">
                {projects.map((p) => (
                  <div key={p.id} className="onb-row obr">
                    <input value={p.name} onChange={(e) => setProjects((l) => l.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} placeholder="Nome (ex.: Reforma E.E. Calvitti)" aria-label="Nome da obra" />
                    <select value={p.kind} onChange={(e) => setProjects((l) => l.map((x) => (x.id === p.id ? { ...x, kind: e.target.value as ProjectKind } : x)))} aria-label="Tipo de obra">
                      {(Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <input value={p.client} onChange={(e) => setProjects((l) => l.map((x) => (x.id === p.id ? { ...x, client: e.target.value } : x)))} placeholder="Cliente" aria-label="Cliente" />
                    <MoneyInput value={p.value} onChange={(v) => setProjects((l) => l.map((x) => (x.id === p.id ? { ...x, value: v } : x)))} ariaLabel="Valor do contrato" placeholder="valor do contrato" />
                    <button className="icon-btn" onClick={() => setProjects((l) => l.filter((x) => x.id !== p.id))} aria-label="Remover"><Icon name="x" size={16} /></button>
                  </div>
                ))}
              </div>
              <button className="btn small" onClick={() => setProjects((l) => [...l, { id: uid(), name: '', kind: 'reforma_escola', client: '', value: 0 }])}>+ obra</button>
              <p className="muted small">O prédio de 9 apartamentos: cadastre como “Incorporação”. Na página da obra você gera os apartamentos.</p>
            </>
          )}

          {step === 5 && (
            <>
              <span className="eyebrow">contas que se repetem</span>
              <h1 className="duo">Quais contas você paga <em>todo mês?</em></h1>
              <p className="onb-lead">Marque, coloque o valor e o dia. Eu lanço os próximos 12 meses e aviso quando estiver vencendo. Valor que muda (como a luz)? Coloque uma média e ajuste quando chegar.</p>
              <div className="onb-fixed">
                {(['pessoal', 'empresa'] as const).map((sc) => (
                  <div key={sc} className="onb-fixed-col">
                    <h3><Icon name={sc === 'pessoal' ? 'user' : 'briefcase'} size={16} /> {sc === 'pessoal' ? 'Pessoal / casa' : 'Empresa'}</h3>
                    {fixed.filter((f) => f.scope === sc).map((f) => (
                      <div key={f.id} className={`onb-fx ${f.on ? 'on' : ''}`}>
                        <label className="check"><input type="checkbox" checked={f.on} onChange={(e) => setFixed((l) => l.map((x) => (x.id === f.id ? { ...x, on: e.target.checked } : x)))} /> {f.name}</label>
                        {f.on && (
                          <div className="onb-fx-v">
                            <MoneyInput value={f.value} onChange={(v) => setFixed((l) => l.map((x) => (x.id === f.id ? { ...x, value: v } : x)))} ariaLabel={`Valor ${f.name}`} />
                            <label>dia <input type="number" min={1} max={28} value={f.day} onChange={(e) => setFixed((l) => l.map((x) => (x.id === f.id ? { ...x, day: Number(e.target.value) } : x)))} aria-label={`Dia ${f.name}`} /></label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {fixed.some((f) => f.on && f.value) && <p className="small">Total por mês: <b>{money(fixed.filter((f) => f.on).reduce((s, f) => s + f.value, 0))}</b></p>}
            </>
          )}

          {step === 6 && (
            <>
              <span className="eyebrow">planilhas</span>
              <h1 className="duo">Você anota em <em>planilhas?</em></h1>
              <p className="onb-lead">Dá para trazer tudo o que já está no Excel ou no Google Planilhas. Você escolhe as colunas (data, descrição, valor) e eu separo empresa e pessoal sozinho.</p>
              <div className="onb-import">
                <Icon name="upload" size={28} />
                <div><b>Importar planilha</b><span>Excel (.xlsx) ou .csv</span></div>
                <button className="pill-btn" onClick={() => { finishStep(); onClose(); go('/importar') }}><span>Importar agora</span><i><Icon name="chevron" size={18} /></i></button>
              </div>
              <p className="muted small">Também fica em Ajustes → Importar planilha.</p>
            </>
          )}

          {step === 7 && (
            <>
              <span className="eyebrow">pronto</span>
              <h1 className="duo">Tudo certo, <em>{owner || 'Rogério'}!</em></h1>
              <p className="onb-lead">No dia a dia, é só isso:</p>
              <ol className="onb-tips">
                <li><span>1</span><div><b>Gastou ou recebeu? Toque em Lançar.</b><small>O botão laranja fica sempre no alto (no celular, o + no meio da barra de baixo).</small></div></li>
                <li><span>2</span><div><b>Abra o Início todo dia.</b><small>Ele mostra o que vence, o que receber, a agenda e o saldo da empresa e o pessoal.</small></div></li>
                <li><span>3</span><div><b>Errei a separação?</b><small>Toque em “é pessoal” / “é da empresa” no lançamento. Eu aprendo e não erro de novo.</small></div></li>
              </ol>
            </>
          )}
        </div>

        <footer className="onb-foot">
          {step > 0 ? <button className="btn ghost" onClick={back}>Voltar</button> : <span />}
          <span style={{ flex: 1 }} />
          {step > 0 && step < STEPS.length - 1 && <button className="btn ghost" onClick={skip}>Pular</button>}
          <button className="pill-btn" onClick={next}><span>{step === 0 ? 'Começar' : step === STEPS.length - 1 ? 'Ir para o Início' : 'Continuar'}</span><i><Icon name="chevron" size={18} /></i></button>
        </footer>
      </div>
    </div>
  )
}
