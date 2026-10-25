import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, writeBatch } from 'firebase/firestore'
import { connectStorageEmulator, deleteObject, getStorage, listAll, ref, uploadString } from 'firebase/storage'
import type { Data } from './types'
import FIRESTORE_RULES from '../firebase/firestore.rules?raw'
import STORAGE_RULES from '../firebase/storage.rules?raw'
import { ARTIFACT } from './env'

/* Nuvem (Firebase): login com e-mail e senha + os dados do usuário no Firestore,
   protegidos pelas regras (só o dono lê e escreve). Veja FIREBASE.md.
   A variável de ambiente VITE_FIREBASE_CONFIG (JSON), se existir, tem prioridade. */
const fromEnv = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined
const config: Record<string, string> = fromEnv ? JSON.parse(fromEnv) : {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

// VITE_LOCAL=1 (testes) força o modo só no navegador
export const CLOUD = !ARTIFACT && import.meta.env.VITE_LOCAL !== '1' && !!config.apiKey
export const PROJECT_ID = config.projectId
const app = CLOUD ? initializeApp(config) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
const storage = app && config.storageBucket ? getStorage(app) : null
// testes automáticos: VITE_FIREBASE_EMULATOR=1 usa o Firebase local (emuladores)
const EMU = import.meta.env.VITE_FIREBASE_EMULATOR === '1'
if (EMU && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199)
}

/* Os dados ficam em engenharia/{usuário} (data da última gravação) e, em pedaços de texto,
   em engenharia/{usuário}/dados/{n}: assim não esbarra no limite de 1 MB por documento. */
const ROOT = 'engenharia'
const PART = 900_000
let knownParts = 0

export async function fetchRemote(userId: string): Promise<{ data: Data; updatedAt: string } | null> {
  const meta = await getDoc(doc(db!, ROOT, userId))
  if (!meta.exists()) return null
  const { parts, updatedAt } = meta.data() as { parts: number; updatedAt: string }
  const snap = await getDocs(collection(db!, ROOT, userId, 'dados'))
  const chunks: string[] = []
  snap.forEach((d) => { const i = Number(d.id); if (i < parts) chunks[i] = (d.data() as { s: string }).s })
  knownParts = Math.max(parts, snap.size)
  return { data: JSON.parse(chunks.join('')) as Data, updatedAt }
}

export async function pushRemote(userId: string, payload: Data): Promise<string> {
  const updatedAt = new Date().toISOString()
  const json = JSON.stringify(payload)
  const parts = Math.max(1, Math.ceil(json.length / PART))
  const b = writeBatch(db!)
  for (let i = 0; i < parts; i++) b.set(doc(db!, ROOT, userId, 'dados', String(i)), { s: json.slice(i * PART, (i + 1) * PART) })
  for (let i = parts; i < knownParts; i++) b.delete(doc(db!, ROOT, userId, 'dados', String(i)))
  b.set(doc(db!, ROOT, userId), { parts, updatedAt })
  await b.commit()
  knownParts = parts
  return updatedAt
}

/* Agenda do celular: arquivo .ics num endereço secreto (Firebase Storage, leitura pública só do arquivo). */
const agendaPath = (userId: string, token: string) => `agenda/${userId}/${token}.ics`
export const agendaUrl = (userId: string, token: string) =>
  `${EMU ? 'http://127.0.0.1:9199' : 'https://firebasestorage.googleapis.com'}/v0/b/${config.storageBucket}/o/${encodeURIComponent(agendaPath(userId, token))}?alt=media`

/** Publica (ou, sem token, apaga) a agenda do usuário, removendo links antigos. */
export async function publishAgenda(userId: string, token: string, ics: string) {
  if (!storage) throw new Error('Firebase Storage não configurado')
  const all = await listAll(ref(storage, `agenda/${userId}`))
  await Promise.all(all.items.filter((i) => i.name !== `${token}.ics`).map((i) => deleteObject(i)))
  if (!token) return
  await uploadString(ref(storage, agendaPath(userId, token)), ics, 'raw', { contentType: 'text/calendar; charset=utf-8', cacheControl: 'public, max-age=60' })
}

/** Regras para colar no console do Firebase (uma vez só); os mesmos arquivos servem aos testes. */
export { FIRESTORE_RULES, STORAGE_RULES }
