import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { CLOUD, db } from './cloud'
import type { FileRef } from './types'
import { uid } from './utils'

/* Anexos (notas fiscais, contratos, orçamentos assinados, fotos).
   Com a nuvem: Firestore, em pedaços, em engenharia/{usuário}/arquivos/{id}/partes (só o dono lê).
   Sem a nuvem: IndexedDB do navegador. O dado da plataforma guarda só a referência. */

const CHUNK = 700_000 // caracteres base64 por pedaço (documento < 1 MB)
export const MAX_FILE = 25e6
const DB = 'rogerio-anexos'
let userId = ''
export const setFilesUser = (id: string) => { userId = id }

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('files', mode).objectStore('files'))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}


const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})
const filesCol = (id: string) => collection(db!, 'engenharia', userId, 'arquivos', id, 'partes')

/** Grava o arquivo na nuvem (em pedaços) e devolve o caminho "fb:{id}". */
export async function putCloudFile(id: string, blob: Blob, ref: Pick<FileRef, 'name' | 'type' | 'size'>) {
  const b64 = await toBase64(blob)
  const parts = Math.max(1, Math.ceil(b64.length / CHUNK))
  // até 8 pedaços por gravação (fica bem abaixo do limite de 10 MB por envio)
  for (let i = 0; i < parts; i += 8) {
    const b = writeBatch(db!)
    for (let j = i; j < Math.min(parts, i + 8); j++) b.set(doc(filesCol(id), String(j)), { b: b64.slice(j * CHUNK, (j + 1) * CHUNK) })
    await b.commit()
  }
  const b = writeBatch(db!)
  b.set(doc(db!, 'engenharia', userId, 'arquivos', id), { name: ref.name, type: ref.type, size: ref.size, parts, at: new Date().toISOString() })
  await b.commit()
  return `fb:${id}`
}

export async function uploadFile(file: File): Promise<FileRef> {
  if (file.size > MAX_FILE) throw new Error(`O arquivo ${file.name} passa de 25 MB`)
  const id = uid()
  const ref: FileRef = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, at: new Date().toISOString() }
  if (CLOUD && userId) ref.path = await putCloudFile(id, file, ref)
  else await idbDo('readwrite', (s) => s.put(file, id))
  return ref
}

/** Endereço temporário para abrir/baixar o arquivo. */
export async function fileUrl(ref: FileRef): Promise<string> {
  if (ref.path?.startsWith('fb:')) {
    const snap = await getDocs(filesCol(ref.path.slice(3)))
    if (snap.empty) throw new Error('Arquivo não encontrado na nuvem')
    const chunks: string[] = []
    snap.forEach((d) => { chunks[Number(d.id)] = (d.data() as { b: string }).b })
    const bin = atob(chunks.join(''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: ref.type }))
  }
  if (ref.path) throw new Error('Este anexo ficou no sistema antigo (Supabase). Use Ajustes → Trazer dados do sistema antigo.')
  const blob = await idbDo<Blob | undefined>('readonly', (s) => s.get(ref.id))
  if (!blob) throw new Error('Arquivo não está neste aparelho')
  return URL.createObjectURL(blob)
}

export async function deleteFile(ref: FileRef) {
  try {
    if (ref.path?.startsWith('fb:')) {
      const id = ref.path.slice(3)
      const snap = await getDocs(filesCol(id))
      const b = writeBatch(db!)
      snap.forEach((d) => b.delete(d.ref))
      b.delete(doc(db!, 'engenharia', userId, 'arquivos', id))
      await b.commit()
    } else if (!ref.path) await idbDo('readwrite', (s) => s.delete(ref.id))
  } catch { /* se já não existir, tudo bem */ }
}

export const fileSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
