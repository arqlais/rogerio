import { createClient } from '@supabase/supabase-js'
import type { Data, FileRef } from './types'
import { putCloudFile } from './files'

/* Mudança Supabase → Firebase: entra no projeto antigo com o mesmo e-mail e senha,
   copia os dados e os anexos para o Firebase. Roda no primeiro acesso (ou em Ajustes). */
const OLD_URL = 'https://aygrqbzuqdnjxoaywhhw.supabase.co'
const OLD_KEY = 'sb_publishable_7Y9p9PEmxyTYAiUOL8ermQ_ktMUNmM7'

// senha digitada no login, guardada só na memória para a cópia do primeiro acesso
let pending: { email: string; password: string } | null = null
export const rememberLogin = (email: string, password: string) => { pending = { email, password } }
export const takeLogin = () => { const p = pending; pending = null; return p }

const isFile = (v: unknown): v is FileRef => !!v && typeof v === 'object' && 'id' in v && 'name' in v && 'size' in v && 'at' in v

/** Devolve os dados do sistema antigo (com anexos já copiados) ou null se não houver. */
export async function importFromSupabase(email: string, password: string, onStep?: (s: string) => void): Promise<Data | null> {
  const sb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !auth.user) throw new Error(error?.message.includes('Invalid') ? 'E-mail ou senha não conferem com o sistema antigo' : `Sistema antigo indisponível: ${error?.message ?? ''}`)
  try {
    const { data: row, error: e2 } = await sb.from('engenharia').select('data').eq('user_id', auth.user.id).maybeSingle()
    if (e2) throw e2
    if (!row) return null
    const data = row.data as Data
    // procura todos os anexos (lançamentos, orçamentos, contratos…) e copia cada um
    const refs: FileRef[] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') {
        if (isFile(v) && v.path && !v.path.startsWith('fb:')) refs.push(v)
        else Object.values(v).forEach(walk)
      }
    }
    walk(data)
    for (const [i, f] of refs.entries()) {
      onStep?.(`Copiando anexos ${i + 1} de ${refs.length}…`)
      try {
        const { data: blob, error: e3 } = await sb.storage.from('documentos').download(f.path!)
        if (e3 || !blob) throw e3
        f.path = await putCloudFile(f.id, blob, f)
      } catch (e) { console.error('anexo não copiado', f.name, e) }
    }
    return data
  } finally {
    await sb.auth.signOut().catch(() => {})
  }
}
