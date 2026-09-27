import { CLOUD, supabase } from './cloud'
import type { FileRef } from './types'
import { uid } from './utils'

/* Anexos (notas fiscais, contratos, orçamentos assinados, fotos).
   Com a nuvem: Supabase Storage, pasta do usuário no bucket "documentos" (privado).
   Sem a nuvem: IndexedDB do navegador. O dado da plataforma guarda só a referência. */

const BUCKET = 'documentos'
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

const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)

export async function uploadFile(file: File): Promise<FileRef> {
  const id = uid()
  const ref: FileRef = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, at: new Date().toISOString() }
  if (CLOUD && userId) {
    const path = `${userId}/${id}-${safe(file.name)}`
    const { error } = await supabase!.storage.from(BUCKET).upload(path, file, { contentType: ref.type })
    if (error) throw error
    ref.path = path
  } else {
    await idbDo('readwrite', (s) => s.put(file, id))
  }
  return ref
}

/** Endereço temporário para abrir/baixar o arquivo. */
export async function fileUrl(ref: FileRef): Promise<string> {
  if (ref.path) {
    const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(ref.path, 3600)
    if (error) throw error
    return data.signedUrl
  }
  const blob = await idbDo<Blob | undefined>('readonly', (s) => s.get(ref.id))
  if (!blob) throw new Error('Arquivo não está neste aparelho')
  return URL.createObjectURL(blob)
}

export async function deleteFile(ref: FileRef) {
  try {
    if (ref.path) await supabase!.storage.from(BUCKET).remove([ref.path])
    else await idbDo('readwrite', (s) => s.delete(ref.id))
  } catch { /* se já não existir, tudo bem */ }
}

export const fileSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
