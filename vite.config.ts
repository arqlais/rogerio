import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: funciona no GitHub Pages, Netlify, Vercel ou abrindo de qualquer subpasta
export default defineConfig({ base: './', plugins: [react()] })
