import { useState } from 'react'
import type { FileRef } from '../types'
import { deleteFile, fileSize, fileUrl, uploadFile } from '../files'
import { fmtDate } from '../utils'
import { Modal, confirmDialog, toast } from './ui'

/** Lista de anexos com botão para adicionar (PDF, foto do celular, imagem escaneada). */
export function Attachments({ files = [], onChange, label = 'Anexar arquivo', hint }: { files?: FileRef[]; onChange: (f: FileRef[]) => void; label?: string; hint?: string }) {
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<{ ref: FileRef; url: string } | null>(null)

  const add = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    const added: FileRef[] = []
    for (const f of Array.from(list)) {
      if (f.size > 20e6) { toast(`${f.name}: arquivo maior que 20 MB`, 'err'); continue }
      try { added.push(await uploadFile(f)) } catch (e) { console.error(e); toast(`Não consegui anexar ${f.name}`, 'err') }
    }
    setBusy(false)
    if (added.length) { onChange([...files, ...added]); toast(added.length > 1 ? `${added.length} arquivos anexados` : 'Arquivo anexado') }
  }
  const open = async (ref: FileRef) => {
    try { setView({ ref, url: await fileUrl(ref) }) } catch (e) { toast(String((e as Error).message || 'Não consegui abrir o arquivo'), 'err') }
  }
  const del = async (ref: FileRef) => {
    if (!(await confirmDialog(`Remover o anexo "${ref.name}"?`, 'Remover'))) return
    await deleteFile(ref)
    onChange(files.filter((f) => f.id !== ref.id))
  }

  return (
    <div className="attach">
      {files.map((f) => (
        <div key={f.id} className="attach-item">
          <span className="attach-ic">{f.type.includes('pdf') ? 'PDF' : f.type.startsWith('image') ? 'IMG' : 'ARQ'}</span>
          <button className="attach-name" onClick={() => open(f)}>{f.name}<small>{fileSize(f.size)} · {fmtDate(f.at.slice(0, 10))}</small></button>
          <button className="icon-btn" onClick={() => del(f)} aria-label={`Remover ${f.name}`}>✕</button>
        </div>
      ))}
      <label className={`btn small ${busy ? 'disabled' : ''}`}>
        {busy ? 'Enviando…' : `+ ${label}`}
        <input type="file" multiple accept="application/pdf,image/*,.xml,.doc,.docx,.xls,.xlsx" hidden disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </label>
      {hint && <small className="muted">{hint}</small>}
      {view && (
        <Modal wide title={view.ref.name} onClose={() => setView(null)} footer={<><a className="btn" href={view.url} target="_blank" rel="noreferrer" download={view.ref.name}>Abrir / baixar</a><span style={{ flex: 1 }} /><button className="btn primary" onClick={() => setView(null)}>Fechar</button></>}>
          {view.ref.type.startsWith('image') ? <img src={view.url} alt={view.ref.name} style={{ width: '100%' }} /> : view.ref.type.includes('pdf') ? <iframe className="doc-frame" src={view.url} title={view.ref.name} /> : <p className="muted">Use "Abrir / baixar" para ver este arquivo.</p>}
        </Modal>
      )}
    </div>
  )
}
