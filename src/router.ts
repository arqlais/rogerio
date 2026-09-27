import { useEffect, useState } from 'react'

/** Rotas por hash (#/obras/abc): funciona no GitHub Pages sem configurar servidor. */
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  const [r, setR] = useState(read)
  useEffect(() => {
    const f = () => { setR(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}

export const go = (path: string) => { location.hash = path }
