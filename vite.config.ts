import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: funciona no GitHub Pages, Netlify, Vercel ou abrindo de qualquer subpasta
// na prévia (Artifact) tudo vai dentro de um único HTML, fontes inclusas
export default defineConfig({ base: './', plugins: [react()], build: { assetsInlineLimit: process.env.VITE_ARTIFACT === '1' ? 100_000_000 : 4096 } })
