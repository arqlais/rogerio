import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { go } from '../router'
import type { Tx } from '../types'
import { Icon } from '../components/Icon'
import { Empty, toast } from '../components/ui'
import { classify, fallbackCategory, learn, placeFor, type Scope } from '../classify'
import { fmtDate, money, today, uid } from '../utils'

/* Importar planilha: o Rogério escolhe o arquivo, diz qual coluna é data, descrição e valor,
   confere a prévia (com empresa/pessoal já separados) e importa. */

type Cell = string | number | boolean | Date | null
type Sheet = { name: string; rows: Cell[][] }
type Map = { header: number; date: number; desc: number; value: number; inCol: number; outCol: number; mode: 'valor' | 'colunas' }

function parseCSV(text: string): Cell[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) >= (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** "R$ 1.234,56", "-50", "(80,00)", 1234.5 → número */
export function toNumber(v: Cell): number | null {
  if (typeof v === 'number') return v
  if (v == null || typeof v === 'boolean' || v instanceof Date) return null
  let s = String(v).trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /\bD$/i.test(s)
  s = s.replace(/[^\d,.]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if ((s.match(/\./g)?.length ?? 0) > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

/** Date, "25/10/2026", "25/10/26", "2026-10-25", número de série do Excel → "2026-10-25" */
export function toISODate(v: Cell): string | null {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (v instanceof Date && !isNaN(v.getTime())) return iso(new Date(v.getTime() + v.getTimezoneOffset() * 60000))
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(new Date(Date.UTC(1899, 11, 30) + v * 864e5 + new Date().getTimezoneOffset() * 60000))
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}

const txt = (v: Cell) => (v instanceof Date ? fmtDate(toISODate(v) ?? '') : v == null ? '' : String(v).trim())
const findCol = (head: Cell[], words: string[]) => head.findIndex((h) => words.some((w) => txt(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(w)))

function guessMap(rows: Cell[][]): Map {
  // o cabeçalho é a primeira linha com pelo menos 2 textos nas primeiras 10 linhas
  const header = Math.max(0, rows.slice(0, 10).findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim() && toNumber(c) === null && !toISODate(c)).length >= 2))
  const head = rows[header] ?? []
  const inCol = findCol(head, ['entrada', 'receita', 'recebido', 'credito'])
  const outCol = findCol(head, ['saida', 'despesa', 'gasto', 'pago', 'debito'])
  return {
    header,
    date: Math.max(0, findCol(head, ['data', 'dia', 'vencimento', 'venc'])),
    desc: Math.max(0, findCol(head, ['descri', 'historico', 'item', 'o que', 'servico', 'produto', 'nome'])),
    value: Math.max(0, findCol(head, ['valor', 'total', 'quantia', 'r$'])),
    inCol, outCol,
    mode: inCol >= 0 && outCol >= 0 ? 'colunas' : 'valor',
  }
}

type Row = { key: number; date: string; description: string; amount: number; kind: 'in' | 'out'; category?: string; scope?: Scope; sure: boolean; skip: boolean }

export function ImportPage() {
  const { data, saveMany, setSettings } = useStore()
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheet, setSheet] = useState(0)
  const [map, setMap] = useState<Map | null>(null)
  const [fileName, setFileName] = useState('')
  const [signOut, setSignOut] = useState<'negativo' | 'tudo-saida' | 'tudo-entrada'>('negativo')
  const [over, setOver] = useState<Record<number, Partial<Row>>>({})
  const [busy, setBusy] = useState(false)

  const open = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try {
      let list: Sheet[]
      if (/\.csv$|\.txt$/i.test(f.name)) list = [{ name: f.name, rows: parseCSV(await f.text()) }]
      else {
        const { default: readXlsxFile } = await import('read-excel-file/browser')
        list = (await readXlsxFile(f)).map((s) => ({ name: s.sheet, rows: s.data as Cell[][] }))
      }
      list = list.filter((s) => s.rows.length)
      if (!list.length) throw new Error('vazia')
      setSheets(list); setSheet(0); setMap(guessMap(list[0].rows)); setFileName(f.name); setOver({})
    } catch (e) {
      console.error(e)
      toast('Não consegui ler esse arquivo. Use Excel (.xlsx) ou .csv', 'err')
    }
    setBusy(false)
  }
  const pickSheet = (i: number) => { setSheet(i); setMap(guessMap(sheets[i].rows)); setOver({}) }

  const rows: Row[] = useMemo(() => {
    if (!map || !sheets[sheet]) return []
    const out: Row[] = []
    sheets[sheet].rows.slice(map.header + 1).forEach((r, i) => {
      const date = toISODate(r[map.date] ?? null)
      const description = txt(r[map.desc] ?? null)
      let amount: number | null
      let kind: 'in' | 'out'
      if (map.mode === 'colunas') {
        const vin = toNumber(r[map.inCol] ?? null) ?? 0, vout = toNumber(r[map.outCol] ?? null) ?? 0
        kind = Math.abs(vin) > 0 ? 'in' : 'out'
        amount = Math.abs(vin) > 0 ? Math.abs(vin) : Math.abs(vout)
      } else {
        const v = toNumber(r[map.value] ?? null)
        amount = v === null ? null : Math.abs(v)
        kind = signOut === 'tudo-entrada' ? 'in' : signOut === 'tudo-saida' ? 'out' : v !== null && v < 0 ? 'out' : 'in'
      }
      if (!date || !amount || /^total|^saldo|^soma/i.test(description)) return
      const g = classify(data, { kind, description })
      const o = over[i] ?? {}
      out.push({ key: i, date, description: description || '(sem descrição)', amount, kind: o.kind ?? kind, category: o.category ?? g.category, scope: o.scope ?? g.scope, sure: !!(o.scope || g.sure), skip: !!o.skip })
    })
    return out
  }, [map, sheets, sheet, signOut, over, data])

  const toImport = rows.filter((r) => !r.skip)
  const unsure = toImport.filter((r) => !r.scope)
  const setRow = (key: number, p: Partial<Row>) => setOver((o) => ({ ...o, [key]: { ...(o[key] ?? {}), ...p } }))
  const allUnsure = (scope: Scope) => setOver((o) => { const n = { ...o }; unsure.forEach((r) => { n[r.key] = { ...(n[r.key] ?? {}), scope } }); return n })

  const doImport = () => {
    if (unsure.length) return toast(`Faltam ${unsure.length} linha(s): diga se é Empresa ou Pessoal`, 'err')
    const now = today()
    let learned = data.settings.learned
    const txs: Tx[] = toImport.map((r) => {
      const { entityId, accountId } = placeFor(data, r.scope!)
      const category = r.category || fallbackCategory(r.kind, r.scope!)
      learned = learn(learned, r.kind, r.description, category, r.scope!)
      return { id: uid(), kind: r.kind, entityId, accountId, category, description: r.description, amount: Math.round(r.amount * 100) / 100, due: r.date, paid: r.date <= now ? r.date : undefined, notes: `Importado de ${fileName}`, createdAt: new Date().toISOString() }
    })
    saveMany('txs', txs)
    setSettings({ learned })
    toast(`${txs.length} lançamentos importados`)
    go('/financeiro')
  }

  const cols = map && sheets[sheet] ? (sheets[sheet].rows[map.header] ?? []).map((h, i) => `${String.fromCharCode(65 + (i % 26))} · ${txt(h) || 'sem título'}`) : []
  const colSel = (label: string, value: number, on: (v: number) => void, optional = false) => (
    <label className="imp-col"><span>{label}</span>
      <select value={value} onChange={(e) => on(Number(e.target.value))} aria-label={label}>
        {optional && <option value={-1}>—</option>}
        {cols.map((c, i) => <option key={i} value={i}>{c}</option>)}
      </select>
    </label>
  )
  const sum = (k: 'in' | 'out', s?: Scope) => toImport.filter((r) => r.kind === k && (!s || r.scope === s)).reduce((t, r) => t + r.amount, 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">trazer o que já está anotado</span>
          <h1 className="duo">Importar <em>planilha</em></h1>
        </div>
      </div>

      <label className={`imp-drop ${busy ? 'busy' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); open(e.dataTransfer.files[0]) }}>
        <Icon name="upload" size={28} />
        <span><b>{fileName || 'Escolher a planilha'}</b><small>{busy ? 'Lendo…' : fileName ? 'toque para escolher outra' : 'Excel (.xlsx) ou .csv — do computador ou do celular'}</small></span>
        <input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
      </label>

      {!sheets.length && (
        <div className="imp-help">
          <div><span>1</span><b>Escolha o arquivo</b><small>No Google Planilhas: Arquivo → Fazer download → Microsoft Excel.</small></div>
          <div><span>2</span><b>Diga as colunas</b><small>Qual é a data, a descrição e o valor. Eu já tento adivinhar.</small></div>
          <div><span>3</span><b>Confira e importe</b><small>Empresa e pessoal já vêm separados. Você só corrige o que eu não souber.</small></div>
        </div>
      )}

      {map && sheets[sheet] && (
        <>
          <section className="card">
            <div className="card-head"><h2>Colunas da planilha</h2>{sheets.length > 1 && <select value={sheet} onChange={(e) => pickSheet(Number(e.target.value))} aria-label="Aba da planilha">{sheets.map((s, i) => <option key={i} value={i}>aba: {s.name}</option>)}</select>}</div>
            <div className="imp-cols">
              <label className="imp-col"><span>Títulos na linha</span><input type="number" min={1} value={map.header + 1} onChange={(e) => setMap({ ...map, header: Math.max(0, Number(e.target.value) - 1) })} aria-label="Linha dos títulos" /></label>
              {colSel('Data', map.date, (v) => setMap({ ...map, date: v }))}
              {colSel('Descrição', map.desc, (v) => setMap({ ...map, desc: v }))}
              <label className="imp-col"><span>Valores</span>
                <select value={map.mode} onChange={(e) => setMap({ ...map, mode: e.target.value as Map['mode'] })} aria-label="Como estão os valores">
                  <option value="valor">numa coluna só</option>
                  <option value="colunas">entrada e saída separadas</option>
                </select>
              </label>
              {map.mode === 'valor' ? (
                <>
                  {colSel('Valor', map.value, (v) => setMap({ ...map, value: v }))}
                  <label className="imp-col"><span>Os valores são</span>
                    <select value={signOut} onChange={(e) => setSignOut(e.target.value as typeof signOut)} aria-label="Sinal">
                      <option value="negativo">negativo = saída</option>
                      <option value="tudo-saida">tudo saída (gastos)</option>
                      <option value="tudo-entrada">tudo entrada</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  {colSel('Entrada', map.inCol, (v) => setMap({ ...map, inCol: v }), true)}
                  {colSel('Saída', map.outCol, (v) => setMap({ ...map, outCol: v }), true)}
                </>
              )}
            </div>
          </section>

          {!rows.length ? <Empty title="Não achei linhas com data e valor" text="Confira as colunas acima e a linha dos títulos." /> : (
            <>
              <div className="imp-sum">
                <div><small>linhas</small><b>{toImport.length}</b></div>
                <div className="emp"><small>empresa</small><b>{money(sum('out', 'empresa'))}</b><em>saídas · entradas {money(sum('in', 'empresa'))}</em></div>
                <div className="pes"><small>pessoal</small><b>{money(sum('out', 'pessoal'))}</b><em>saídas · entradas {money(sum('in', 'pessoal'))}</em></div>
                {unsure.length > 0 && <div className="ask"><small>para você dizer</small><b>{unsure.length}</b><span className="row"><button className="btn small" onClick={() => allUnsure('empresa')}>todas empresa</button><button className="btn small" onClick={() => allUnsure('pessoal')}>todas pessoal</button></span></div>}
              </div>
              <section className="card flush">
                <div className="imp-table">
                  <div className="imp-row head"><span>data</span><span>descrição</span><span>separação</span><span className="r">valor</span><span /></div>
                  {rows.slice(0, 500).map((r) => (
                    <div key={r.key} className={`imp-row ${r.skip ? 'skip' : ''} ${!r.scope ? 'unsure' : ''}`}>
                      <span className="muted">{fmtDate(r.date)}</span>
                      <span className="imp-desc"><b>{r.description}</b><small>{r.category || fallbackCategory(r.kind, r.scope ?? 'empresa')}</small></span>
                      <span className="imp-scope">
                        <button className={r.scope === 'empresa' ? 'on emp' : ''} onClick={() => setRow(r.key, { scope: 'empresa' })}>Empresa</button>
                        <button className={r.scope === 'pessoal' ? 'on pes' : ''} onClick={() => setRow(r.key, { scope: 'pessoal' })}>Pessoal</button>
                      </span>
                      <button className={`r imp-val ${r.kind}`} onClick={() => setRow(r.key, { kind: r.kind === 'in' ? 'out' : 'in' })} title="tocar para trocar entrada/saída">{r.kind === 'in' ? '+' : '−'}{money(r.amount)}</button>
                      <button className="icon-btn" onClick={() => setRow(r.key, { skip: !r.skip })} aria-label={r.skip ? 'Incluir linha' : 'Ignorar linha'}>{r.skip ? '↺' : '✕'}</button>
                    </div>
                  ))}
                  {rows.length > 500 && <p className="muted small pad">Mostrando 500 de {rows.length} linhas (todas serão importadas).</p>}
                </div>
              </section>
              <div className="imp-foot">
                <small className="muted">Linhas com data até hoje entram como pagas; datas futuras ficam “a pagar / a receber”.</small>
                <button className="pill-btn" onClick={doImport} disabled={!toImport.length}><span>Importar {toImport.length} lançamentos</span><i><Icon name="check" size={18} /></i></button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
