/* Teste da nuvem (Firebase) com os emuladores locais: login, gravar, anexos, agenda e regras.
   Uso: npm run test:cloud  (precisa do firebase-tools e de Java; veja FIREBASE.md). */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const PORT = 4298
const dir = process.argv[2] || 'dist-cloud'
const PROJECT = 'demo-rogerio'
const KEY = 'demo-key'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++ }
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
const asOwner = (path) => fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json())

// limpa o emulador e cria dois usuários
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
const u1 = await post(`${AUTH}/accounts:signUp?key=${KEY}`, { email: 'rogerio@teste.com', password: 'senha123', returnSecureToken: true })
const u2 = await post(`${AUTH}/accounts:signUp?key=${KEY}`, { email: 'outro@teste.com', password: 'senha123', returnSecureToken: true })

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: dir, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 800))
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch(exe ? { executablePath: exe } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForSelector('.auth-form')
  ok(true, 'tela de login aparece')

  await page.fill('input[type=email]', 'rogerio@teste.com')
  await page.fill('input[type=password]', 'errada1')
  await page.locator('.auth-submit').click()
  await page.waitForSelector('.auth-msg.err')
  ok((await page.locator('.auth-msg.err').innerText()).includes('incorretos'), 'senha errada mostra aviso em português')

  await page.fill('input[type=password]', 'senha123')
  await page.locator('.auth-submit').click()
  await page.waitForSelector('.hdr', { timeout: 30000 })
  ok(true, 'entra com e-mail e senha')
  if (await page.locator('.onb').count()) { await page.getByRole('button', { name: 'fazer depois' }).click(); await page.waitForTimeout(300) }
  await page.waitForTimeout(1500)
  const meta = await asOwner(`engenharia/${u1.localId}`)
  ok(meta.fields?.parts?.integerValue >= 1, 'primeiro acesso grava os dados no Firestore')

  // grava uma alteração e confere depois de recarregar
  await page.evaluate(() => (location.hash = '#/config'))
  await page.waitForTimeout(300)
  await page.fill('input[aria-label="Seu nome"]', 'Rogério Nuvem')
  await page.waitForTimeout(2000)
  await page.reload()
  await page.waitForSelector('.hdr')
  await page.evaluate(() => (location.hash = '#/config'))
  await page.waitForTimeout(500)
  ok(await page.inputValue('input[aria-label="Seu nome"]') === 'Rogério Nuvem', 'alteração fica salva na nuvem (continua logado ao recarregar)')
  // o que vale é a nuvem: apaga o navegador e confere de novo
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('rogerio-gestao')) localStorage.removeItem(k) })
  await page.reload()
  await page.waitForSelector('.hdr')
  await page.evaluate(() => (location.hash = '#/config'))
  await page.waitForTimeout(500)
  ok(await page.inputValue('input[aria-label="Seu nome"]') === 'Rogério Nuvem', 'dados vêm da nuvem mesmo sem nada no navegador')

  // anexo de 2 MB (vários pedaços) num orçamento
  await page.evaluate(() => (location.hash = '#/orcamentos'))
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Orçamento para escola', exact: true }).click()
  await page.locator('.pick-co button').first().click()
  await page.waitForTimeout(500)
  const big = Buffer.alloc(2_000_000, 7)
  await page.locator('input[type=file]').first().setInputFiles({ name: 'nota-fiscal.pdf', mimeType: 'application/pdf', buffer: big })
  await page.waitForSelector('.attach-name', { timeout: 30000 })
  const files = await asOwner(`engenharia/${u1.localId}/arquivos`)
  const fdoc = files.documents?.[0]
  ok(fdoc && Number(fdoc.fields.parts.integerValue) >= 3 && Number(fdoc.fields.size.integerValue) === 2_000_000, `anexo grande gravado em pedaços (${fdoc?.fields.parts.integerValue})`)
  const back = await page.evaluate(async () => {
    const btn = document.querySelector('.attach-name')
    btn.click()
    await new Promise((r) => setTimeout(r, 1500))
    const a = [...document.querySelectorAll('.modal a')].find((x) => x.textContent.includes('Abrir'))
    if (!a) return -1
    const b = await fetch(a.href).then((r) => r.arrayBuffer())
    const u = new Uint8Array(b)
    return u.length === 2_000_000 && u.every((x) => x === 7) ? u.length : -2
  })
  ok(back === 2_000_000, 'anexo abre de volta idêntico')
  await page.locator('.modal-foot').getByRole('button', { name: 'Fechar', exact: true }).click()
  await page.waitForTimeout(300)
  await page.locator('.attach-item .icon-btn').first().click()
  await page.getByRole('button', { name: 'Remover', exact: true }).click()
  await page.waitForTimeout(1500)
  const after = await asOwner(`engenharia/${u1.localId}/arquivos`)
  ok(!after.documents?.length, 'remover anexo apaga da nuvem')

  // agenda do celular (Storage)
  await page.evaluate(() => (location.hash = '#/agenda'))
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'ligar' }).click()
  await page.getByRole('button', { name: 'Ligar agenda do celular' }).click()
  await page.waitForSelector('.link-box input', { timeout: 15000 })
  const url = await page.inputValue('.link-box input')
  const ics = await fetch(url).then((r) => r.text())
  ok(ics.includes('BEGIN:VCALENDAR'), 'link da agenda abre o calendário sem login')
  const list = await fetch(`http://127.0.0.1:9199/v0/b/${PROJECT}.appspot.com/o?prefix=agenda/`).then((r) => r.status)
  ok(list === 403, 'ninguém consegue listar as agendas (link secreto)')

  // regras: outro usuário não lê os dados do Rogério
  const r = await fetch(`${FS}/engenharia/${u1.localId}`, { headers: { Authorization: `Bearer ${u2.idToken}` } })
  ok(r.status === 403, 'outro login não consegue ler os dados')
  const anon = await fetch(`${FS}/engenharia/${u1.localId}/dados/0`)
  ok(anon.status === 403, 'sem login não consegue ler os dados')

  await page.locator('.hdr-me').click(); await page.locator('.me-menu [aria-label="Sair"]').click()
  await page.getByRole('button', { name: 'Sair', exact: true }).last().click()
  await page.waitForSelector('.auth-form')
  ok(true, 'sair volta para o login')
  ok(!errors.length, `nenhum erro de página ${errors.join(' | ')}`)
} catch (e) {
  console.error(e)
  fails++
} finally {
  await browser.close()
  server.kill()
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo')
process.exit(fails ? 1 : 0)
