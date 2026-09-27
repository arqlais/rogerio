import type { Data, Tx } from '../types'
import { openDocument } from './ui'
import { letterhead } from '../pages/Quotes'
import { entityName, extenso, fmtDate, money, personName, today } from '../utils'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Abre o recibo pronto para imprimir ou salvar em PDF (o funcionário assina). */
export function printReceipt(d: Data, t: Tx, detail?: string) {
  const ent = d.entities.find((e) => e.id === t.entityId)
  const person = d.people.find((p) => p.id === t.personId)
  const doc = ent?.kind === 'empresa' ? 'CNPJ' : 'CPF'
  const body = `
<h2 style="display:flex;justify-content:space-between;align-items:center"><span>Recibo</span><span style="border:2px solid #111;color:#111;padding:4px 12px;border-radius:6px;font-size:16px">${money(t.amount)}</span></h2>
<p style="font-size:14px;line-height:1.8">Recebi de <b>${esc(ent?.legalName || entityName(d, t.entityId))}</b>${ent?.doc ? `, ${doc} ${esc(ent.doc)}` : ''}, a importância de <b>${money(t.amount)}</b> (${esc(extenso(t.amount))}), referente a <b>${esc(t.description)}</b>${t.projectId ? ` na obra <b>${esc(d.projects.find((p) => p.id === t.projectId)?.name ?? '')}</b>` : ''}.</p>
${detail ? `<table class="info">${detail.split('\n').map((l) => `<tr><td colspan="2" style="font-weight:400">${esc(l)}</td></tr>`).join('')}</table>` : ''}
<p style="font-size:14px">Pagamento em ${fmtDate(t.paid ?? today())}${t.method ? ` via ${esc(t.method)}` : ''}. Dou plena e geral quitação do valor acima.</p>
<div style="margin-top:28mm;text-align:center"><div style="border-top:1px solid #111;width:90mm;margin:0 auto;padding-top:6px">${esc(person?.fullName || person?.name || '')}${person?.doc ? `<br><small>CPF/CNPJ ${esc(person.doc)}</small>` : ''}</div></div>`
  const html = letterhead(ent, body, `Recibo – ${personName(d, t.personId)}`)
  openDocument(html, `Recibo – ${personName(d, t.personId)}`)
}
