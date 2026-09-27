import type { Data, Tx } from '../types'
import { entityName, extenso, fmtDate, money, personName, today } from '../utils'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Abre o recibo pronto para imprimir ou salvar em PDF (o funcionário assina). */
export function printReceipt(d: Data, t: Tx, detail?: string) {
  const ent = d.entities.find((e) => e.id === t.entityId)
  const person = d.people.find((p) => p.id === t.personId)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo – ${esc(personName(d, t.personId))}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1d2530;max-width:720px;margin:40px auto;padding:0 24px}
h1{font-size:22px;letter-spacing:.08em;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d2530;padding-bottom:12px;margin-bottom:24px}
.val{font-size:22px;font-weight:700;border:2px solid #1d2530;padding:6px 14px;border-radius:6px}
p{line-height:1.7;font-size:15px}
pre{font-family:inherit;background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:13px}
.sign{margin-top:70px;text-align:center}
.sign div{border-top:1px solid #1d2530;width:320px;margin:0 auto;padding-top:6px}
small{color:#666}
@media print{button{display:none}body{margin:10mm auto}}
button{margin-top:30px;padding:10px 18px;font-size:15px;border-radius:8px;border:0;background:#1d2530;color:#fff;cursor:pointer}
</style></head><body>
<div class="top"><div><h1>RECIBO</h1><small>${esc(ent?.name ?? '')}${ent?.doc ? ' · ' + esc(ent.doc) : ''}</small></div><div class="val">${money(t.amount)}</div></div>
<p>Recebi de <b>${esc(entityName(d, t.entityId))}</b>${ent?.doc ? `, ${ent.kind === 'empresa' ? 'CNPJ' : 'CPF'} ${esc(ent.doc)}` : ''}, a importância de <b>${money(t.amount)}</b> (${esc(extenso(t.amount))}), referente a <b>${esc(t.description)}</b>${t.projectId ? ` na obra <b>${esc(d.projects.find((p) => p.id === t.projectId)?.name ?? '')}</b>` : ''}.</p>
${detail ? `<pre>${esc(detail)}</pre>` : ''}
<p>Pagamento em ${fmtDate(t.paid ?? today())}${t.method ? ` via ${esc(t.method)}` : ''}. Dou plena e geral quitação do valor acima.</p>
<div class="sign"><div>${esc(person?.name ?? '')}${person?.doc ? `<br><small>CPF/CNPJ ${esc(person.doc)}</small>` : ''}</div></div>
<button onclick="print()">Imprimir / salvar PDF</button>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
