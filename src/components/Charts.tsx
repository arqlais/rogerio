import { useEffect, useRef, useState } from 'react'
import { fmtDateShort, money, moneyShort } from '../utils'

/** Cores de categoria em ordem fixa (validadas para daltonismo). A 6ª posição é sempre "Outros". */
export const CAT = ['#3563b8', '#f08a2c', '#1f9e8f', '#8a5cc2', '#c9951a']
export const OTHER = '#a3acbb'

/** Área do saldo previsto dia a dia, com linha de hoje e dica ao passar o dedo/mouse. */
export function ForecastChart({ points, height = 190 }: { points: { date: string; value: number; ins: number; outs: number }[]; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [cw, setCw] = useState(640)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(Math.max(280, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (points.length < 2) return null
  const W = cw, H = height, padL = 8, padR = 8, padT = 16, padB = 26
  const vals = points.map((p) => p.value)
  let min = Math.min(0, ...vals), max = Math.max(...vals, 1)
  const span = max - min || 1
  min -= span * 0.08; max += span * 0.12
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = `${line}L${x(points.length - 1)},${y(min)}L${x(0)},${y(min)}Z`
  const zero = min < 0 ? y(0) : null
  const low = points.reduce((m, p, i) => (p.value < points[m].value ? i : m), 0)
  const last = points.length - 1
  const ticks = [0, Math.round(last / 3), Math.round((2 * last) / 3), last]
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.round((((e.clientX - r.left) / r.width) * W - padL) / ((W - padL - padR) / last))
    setHover(Math.max(0, Math.min(last, i)))
  }
  const h = hover !== null ? points[hover] : null
  return (
    <div className="chart-wrap" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Saldo previsto para os próximos dias">
        <defs>
          <linearGradient id="fc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={padL} x2={W - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} className="grid" />)}
        {zero !== null && <line x1={padL} x2={W - padR} y1={zero} y2={zero} className="zero" />}
        <path d={area} fill="url(#fc-fill)" />
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(0)} cy={y(points[0].value)} r="5" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2" />
        <circle cx={x(low)} cy={y(points[low].value)} r="4.5" fill={points[low].value < 0 ? 'var(--bad)' : 'var(--card)'} stroke={points[low].value < 0 ? 'var(--card)' : 'var(--chart-1)'} strokeWidth="2" />
        <circle cx={x(last)} cy={y(points[last].value)} r="5" fill="var(--card)" stroke="var(--chart-1)" strokeWidth="2.5" />
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="axis">{i === 0 ? 'hoje' : fmtDateShort(points[i].date)}</text>)}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="cross" />
            <circle cx={x(hover)} cy={y(h.value)} r="6" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{hover === 0 ? 'Hoje' : fmtDateShort(h.date)}</b>
          <span>Saldo: <b className={h.value < 0 ? 'neg' : ''}>{money(h.value)}</b></span>
          {h.ins > 0 && <span className="pos">+ {money(h.ins)} entra</span>}
          {h.outs > 0 && <span className="neg">− {money(h.outs)} sai</span>}
        </div>
      )}
    </div>
  )
}

/** Barras entradas × saídas por mês, com dica ao passar o mouse. */
export function MonthBars({ data }: { data: { label: string; a: number; b: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  return (
    <div className="mbars">
      <div className="mbars-plot">
        {data.map((d, i) => (
          <div key={d.label} className={`mbar ${hover === i ? 'on' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <div className="mbar-pair">
              <div className="b in" style={{ height: `${Math.max(1.5, (d.a / max) * 100)}%` }} />
              <div className="b out" style={{ height: `${Math.max(1.5, (d.b / max) * 100)}%` }} />
            </div>
            <span className="mbar-l">{d.label}</span>
            {hover === i && (
              <div className="tip up">
                <b>{d.label}</b>
                <span className="pos">Entrou {money(d.a)}</span>
                <span className="neg">Saiu {money(d.b)}</span>
                <span>Sobrou <b>{money(d.a - d.b)}</b></span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="legend"><span className="lg in" />Entradas <span className="lg out" />Saídas</div>
    </div>
  )
}

/** Rosca de gastos por categoria com legenda e valores (nunca só cor). */
export function Donut({ rows, total, center }: { rows: [string, number][]; total: number; center?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = rows.slice(0, 5)
  const rest = rows.slice(5).reduce((s, r) => s + r[1], 0)
  const parts: [string, number, string][] = top.map(([l, v], i) => [l, v, CAT[i]])
  if (rest > 0) parts.push(['Outros', rest, OTHER])
  const R = 60, C = 2 * Math.PI * R, gap = parts.length > 1 ? 3 : 0
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" className="donut-svg" role="img" aria-label="Gastos por categoria">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" strokeWidth="20" />
        {parts.map(([l, v, c], i) => {
          const len = total ? (v / total) * C : 0
          const el = <circle key={l} cx="80" cy="80" r={R} fill="none" stroke={c} strokeWidth={hover === i ? 24 : 20} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} style={{ transition: 'stroke-width .15s' }} />
          acc += len
          return el
        })}
        <text x="80" y="76" textAnchor="middle" className="donut-v">{(hover !== null ? moneyShort(parts[hover][1]) : center ?? moneyShort(total)).replace('R$ ', '')}</text>
        <text x="80" y="96" textAnchor="middle" className="donut-l">{hover !== null ? `R$ · ${Math.round((parts[hover][1] / total) * 100)}%` : 'reais no mês'}</text>
      </svg>
      <ul className="donut-legend">
        {parts.map(([l, v, c], i) => (
          <li key={l} className={hover === i ? 'on' : ''} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="sw" style={{ background: c }} />
            <span className="dl">{l}</span>
            <b>{money(v)}</b>
            <em>{total ? Math.round((v / total) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Minigráfico de linha (resultado dos últimos meses). */
export function Sparkline({ values, color = 'var(--chart-1)', height = 36 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null
  const W = 120, H = height
  const min = Math.min(0, ...values), max = Math.max(0, ...values)
  const span = max - min || 1
  const x = (i: number) => 3 + (i / (values.length - 1)) * (W - 6)
  const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none" aria-hidden="true">
      {min < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" />}
      <path d={`${d}L${x(values.length - 1)},${y(min)}L${x(0)},${y(min)}Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={color} />
    </svg>
  )
}

/** Anel de progresso (ex.: quanto do orçamento da obra já foi gasto). */
export function Ring({ value, size = 64, label, tone }: { value: number; size?: number; label?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const v = Math.max(0, Math.min(100, value))
  const t = tone ?? (value > 100 ? 'bad' : value > 85 ? 'warn' : 'good')
  const R = 26, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`ring ${t}`} role="img" aria-label={`${Math.round(value)}%`}>
      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 32 32)" className="ring-v" />
      <text x="32" y="36" textAnchor="middle" className="ring-t">{label ?? `${Math.round(value)}%`}</text>
    </svg>
  )
}
