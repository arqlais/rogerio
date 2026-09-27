import type { Data } from './types'

/* Agenda no formato iCalendar (.ics). Com a nuvem ligada, o sistema publica este arquivo
   num endereço secreto do Supabase Storage e o iPhone/iPad/Google Agenda "assina" o link. */

const KIND: Record<string, string> = { visita: 'Visita à obra', reuniao: 'Reunião', compromisso: 'Compromisso', entrega: 'Entrega / prazo', pessoal: 'Pessoal', outro: 'Compromisso' }
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ymd = (s: string) => s.replace(/-/g, '')
const nextDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
}
const fold = (line: string) => {
  const chars = Array.from(line)
  if (chars.length <= 60) return line
  const out: string[] = []
  for (let i = 0; i < chars.length; i += 60) out.push((i ? ' ' : '') + chars.slice(i, i + 60).join(''))
  return out.join('\r\n')
}

interface Entry { uid: string; date: string; time?: string; title: string; description: string; alarm?: string; rrule?: string }

export function calendarEntries(d: Data): Entry[] {
  const sync = { compromissos: true, contas: true, obras: true, ...(d.settings.calendarSync ?? {}) }
  const out: Entry[] = []
  const project = (id?: string) => d.projects.find((p) => p.id === id)?.name
  if (sync.compromissos)
    for (const e of d.events) {
      if (e.done) continue
      out.push({
        uid: `evento-${e.id}`, date: e.date, time: e.time, title: e.title,
        description: [KIND[e.kind], project(e.projectId), e.place, e.notes].filter(Boolean).join('\n'),
        alarm: e.time ? '-PT1H' : '-PT15H',
        rrule: e.repeat === 'semanal' ? 'FREQ=WEEKLY' : e.repeat === 'mensal' ? 'FREQ=MONTHLY' : undefined,
      })
    }
  if (sync.contas)
    for (const t of d.txs) {
      if (t.paid || t.kind === 'transfer') continue
      const ent = d.entities.find((e) => e.id === t.entityId)?.name
      out.push({
        uid: `conta-${t.id}`, date: t.due,
        title: `${t.kind === 'in' ? 'Receber' : 'Pagar'} ${brl(t.amount)} · ${t.description}`,
        description: [t.category, project(t.projectId), ent].filter(Boolean).join('\n'),
        alarm: '-PT15H',
      })
    }
  if (sync.obras)
    for (const p of d.projects) if (p.end && p.status !== 'concluida') out.push({ uid: `obra-${p.id}`, date: p.end, title: `Término previsto: ${p.name}`, description: p.client ?? '' })
  return out
}

export function buildICS(d: Data, name = 'Obras e compromissos') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gestao-rogerio//PT-BR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:America/Sao_Paulo', 'X-APPLE-CALENDAR-COLOR:#F08A2C', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H']
  for (const e of calendarEntries(d)) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@gestao-rogerio`, `DTSTAMP:${stamp}`)
    if (e.time) lines.push(`DTSTART;TZID=America/Sao_Paulo:${ymd(e.date)}T${e.time.replace(':', '')}00`, 'DURATION:PT1H')
    else lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`)
    if (e.rrule) lines.push(`RRULE:${e.rrule}`)
    lines.push(`SUMMARY:${esc(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${e.alarm}`, 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}
