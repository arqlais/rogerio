import { useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { money, moneyShort, parseMoney } from '../utils'

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.classList.add('modal-open')
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('modal-open') }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, span }: { label: string; children: ReactNode; hint?: ReactNode; span?: 2 | 3 }) {
  return (
    <label className={`field ${span ? `span-${span}` : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** Campo de valor em reais: digita livre ("1.500,00" ou "1500") e formata ao sair. */
export function MoneyInput({ value, onChange, placeholder, autoFocus, ariaLabel }: { value: number; onChange: (v: number) => void; placeholder?: string; autoFocus?: boolean; ariaLabel?: string }) {
  const fmt = (v: number) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
  const [text, setText] = useState(fmt(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(fmt(value)) }, [value, focus])
  return (
    <div className="money-input">
      <span>R$</span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder ?? '0,00'}
        autoFocus={autoFocus}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setText(fmt(parseMoney(text))) }}
        onChange={(e) => { setText(e.target.value); onChange(parseMoney(e.target.value)) }}
      />
    </div>
  )
}

export function NumInput({ value, onChange, step, min, suffix, ariaLabel }: { value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; suffix?: string; ariaLabel?: string }) {
  return (
    <div className="money-input">
      <input type="number" aria-label={ariaLabel} value={value ?? ''} step={step ?? 1} min={min} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span>{suffix}</span>}
    </div>
  )
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info'; onClick?: () => void }) {
  return (
    <div className={`stat ${tone ?? ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, number?][] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([v, l, n]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
          {!!n && <span className="tab-n">{n}</span>}
        </button>
      ))}
    </div>
  )
}

export const Badge = ({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' | 'muted' }) => <span className={`badge ${tone ?? ''}`}>{children}</span>

export function Progress({ value, tone }: { value: number; tone?: 'good' | 'bad' | 'warn' }) {
  const v = Math.max(0, Math.min(100, value))
  const t = tone ?? (value > 100 ? 'bad' : value > 85 ? 'warn' : 'good')
  return <div className={`progress ${t}`}><div style={{ width: `${v}%` }} /></div>
}

/** Barras agrupadas (entradas × saídas) por mês */
export function BarsChart({ data }: { data: { label: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...data.flatMap((x) => [x.a, x.b]))
  return (
    <div className="bars">
      <div className="bars-grid">
        {data.map((x) => (
          <div key={x.label} className="bars-col" title={`${x.label}\nEntradas: ${money(x.a)}\nSaídas: ${money(x.b)}`}>
            <div className="bars-pair">
              <div className="bar in" style={{ height: `${(x.a / max) * 100}%` }} />
              <div className="bar out" style={{ height: `${(x.b / max) * 100}%` }} />
            </div>
            <span className="bars-label">{x.label}</span>
            <span className={`bars-res ${x.a - x.b < 0 ? 'neg' : ''}`}>{x.a || x.b ? moneyShort(x.a - x.b).replace('R$ ', '').replace('mil', 'k') : ''}</span>
          </div>
        ))}
      </div>
      <div className="legend"><span className="dot in" />Entradas <span className="dot out" />Saídas</div>
    </div>
  )
}

/** Barras horizontais (ex.: custo por categoria) */
export function HBars({ rows, total }: { rows: [string, number][]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  const sum = total ?? rows.reduce((s, r) => s + r[1], 0)
  return (
    <div className="hbars">
      {rows.map(([l, v]) => (
        <div key={l} className="hbar">
          <div className="hbar-top"><span>{l}</span><span>{money(v)} <em>{sum ? Math.round((v / sum) * 100) : 0}%</em></span></div>
          <div className="hbar-track"><div style={{ width: `${(v / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

// ---------- avisos e confirmações ----------
let toastHost: HTMLDivElement | null = null
export function toast(msg: string, tone: 'ok' | 'err' = 'ok') {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toasts'; document.body.appendChild(toastHost) }
  const el = document.createElement('div')
  el.className = `toast ${tone}`
  el.textContent = msg
  toastHost.appendChild(el)
  setTimeout(() => el.classList.add('out'), 2600)
  setTimeout(() => el.remove(), 3000)
}

export function confirmDialog(message: string, ok = 'Confirmar', danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v) }
    root.render(
      <Modal title="Confirmar" onClose={() => done(false)} footer={<><button className="btn" onClick={() => done(false)}>Cancelar</button><button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{ok}</button></>}>
        <p>{message}</p>
      </Modal>,
    )
  })
}
