import { createContext, useContext } from 'react'

/** Qual layout está na tela: 'novo' (barra no topo + central de comando) ou 'classico' (menu lateral). Lembrado por aparelho. */
export type Layout = 'novo' | 'classico'
export const LayoutCtx = createContext<{ layout: Layout; setLayout: (l: Layout) => void }>({ layout: 'novo', setLayout: () => {} })
export const useLayout = () => useContext(LayoutCtx)

export function readLayout(): Layout {
  try { const v = localStorage.getItem('rogerio-layout'); if (v === 'classico' || v === 'novo') return v } catch { /* bloqueado */ }
  return 'novo'
}
export function saveLayout(l: Layout) {
  try { localStorage.setItem('rogerio-layout', l) } catch { /* bloqueado */ }
}
