/* Junta o build da prévia num único arquivo (dist-artifact/artifact.html) para publicar como Artifact no claude.ai:
   só o conteúdo (título, estilo, raiz e script), sem <html>/<head>/<body> — o Artifact coloca o esqueleto. */
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'dist-artifact'
const html = readFileSync(`${dir}/index.html`, 'utf8')
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => readFileSync(`${dir}/${m[1]}`, 'utf8')).join('\n')
const js = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"/g)].map((m) => readFileSync(`${dir}/${m[1]}`, 'utf8')).join('\n')
const out = `<title>Gestão Rogério</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`
writeFileSync(`${dir}/artifact.html`, out)
console.log(`${dir}/artifact.html: ${(out.length / 1024).toFixed(0)} KB`)
