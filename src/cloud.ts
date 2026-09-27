import { createClient } from '@supabase/supabase-js'
import type { Data } from './types'
import { ARTIFACT } from './env'

/* Nuvem (Supabase): login com e-mail e senha + todos os dados numa linha por usuário,
   protegida por RLS (só o dono lê e escreve). Veja o README e supabase/schema.sql.
   Usa o mesmo projeto Supabase do Controle da Laís (tabela separada "engenharia");
   as variáveis de ambiente, se existirem, têm prioridade. */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://lbggvjebkhdcybpkxzxs.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_uqo6nAVMS7iZsidCPNQRhg_YA9RNaYA'

// VITE_LOCAL=1 (testes) força o modo só no navegador
/** Identificador do projeto no Supabase (para abrir o SQL Editor certo). */
export const PROJECT_REF = url.replace(/^https?:\/\//, '').split('.')[0]
export const CLOUD = !ARTIFACT && import.meta.env.VITE_LOCAL !== '1' && !!url && !!key
export const supabase = CLOUD ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

const TABLE = 'engenharia'

export async function fetchRemote(userId: string): Promise<{ data: Data; updatedAt: string } | null> {
  const { data, error } = await supabase!.from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? { data: data.data as Data, updatedAt: data.updated_at as string } : null
}

export async function pushRemote(userId: string, payload: Data): Promise<string> {
  const updatedAt = new Date().toISOString()
  const { error } = await supabase!.from(TABLE).upsert({ user_id: userId, data: payload, updated_at: updatedAt })
  if (error) throw error
  return updatedAt
}

/* Agenda do celular: arquivo .ics num endereço secreto do bucket público "agenda". */
const AG = 'agenda'
export const SUPABASE_URL = url.replace(/\/$/, '')
const agendaPath = (userId: string, token: string) => `${userId}/${token}.ics`
export const agendaUrl = (userId: string, token: string) => `${SUPABASE_URL}/storage/v1/object/public/${AG}/${agendaPath(userId, token)}`

/** Publica (ou, sem token, apaga) a agenda do usuário, removendo links antigos. */
export async function publishAgenda(userId: string, token: string, ics: string) {
  const st = supabase!.storage.from(AG)
  const { data: files, error } = await st.list(userId)
  if (error) throw error
  const old = (files ?? []).filter((f) => f.name !== `${token}.ics`).map((f) => `${userId}/${f.name}`)
  if (old.length) await st.remove(old)
  if (!token) return
  const { error: e2 } = await st.upload(agendaPath(userId, token), new Blob([ics], { type: 'text/calendar' }), { upsert: true, contentType: 'text/calendar; charset=utf-8', cacheControl: '60' })
  if (e2) throw e2
}
