/* Teste de fumaça: abre cada tela e faz as ações do dia a dia no Chromium sem janela.
   Uso: npm run test:smoke  (gera a versão de teste, só no navegador, e roda). */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const PORT = 4299
const dir = process.argv[2] || 'dist-test'
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: dir, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 800))
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch(exe ? { executablePath: exe } : {})
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++ }

try {
  for (const vp of [{ width: 1400, height: 900, name: 'computador' }, { width: 390, height: 844, name: 'celular' }]) {
    const page = await browser.newPage({ viewport: vp, acceptDownloads: true })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('popup', async (p) => { if (shots) { await p.waitForLoadState(); await p.setViewportSize({ width: 900, height: 1250 }); await p.screenshot({ path: `${shots}/${vp.name}-popup-${Date.now()}.png`, fullPage: true }).catch(() => {}) } await p.close() })
    const go = async (h) => { await page.evaluate((h) => (location.hash = h), h); await page.waitForTimeout(250) }
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem(localStorage.getItem('rogerio-gestao-exemplo-ligado') === '1' ? 'rogerio-gestao-exemplo' : 'rogerio-gestao-v1') || 'null'))
    const shot = async (n) => shots && page.screenshot({ path: `${shots}/${vp.name}-${n}.png`, fullPage: true })
    const modalSave = async () => { await page.locator('.modal-foot .btn.primary').last().click(); await page.waitForTimeout(200) }

    await page.goto(`http://localhost:${PORT}/`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForTimeout(500)
    ok(await page.getByText('Vamos começar').count() > 0, `${vp.name}: tela de boas-vindas`)
    const names = await page.locator('.scope-seg button').allInnerTexts()
    ok(['Empresa', 'Pessoal', 'Tudo'].every((n) => names.includes(n)), `${vp.name}: topo Empresa / Pessoal / Tudo`)

    // exemplo
    await page.getByText('Ver a plataforma com dados de exemplo').click()
    await page.waitForTimeout(400)
    ok((await stored())?.projects.length === 2, `${vp.name}: exemplo preenchido aparece`)
    ok(JSON.parse(await page.evaluate(() => localStorage.getItem('rogerio-gestao-v1') || '{"projects":[]}')).projects.length === 0, `${vp.name}: dados reais continuam vazios e separados`)
    await shot('painel')

    for (const [h, n] of [['#/agenda', 'agenda'], ['#/financeiro', 'financeiro'], ['#/obras', 'obras'], ['#/orcamentos', 'orcamentos'], ['#/equipe/diarias', 'diarias'], ['#/equipe/folha', 'folha'], ['#/equipe/empreitadas', 'empreitadas'], ['#/equipe/pessoas', 'pessoas'], ['#/cadastros', 'empresas'], ['#/perfil', 'perfil'], ['#/cadastros/categorias', 'categorias'], ['#/config', 'ajustes']]) {
      await go(h)
      await shot(n)
    }
    ok(errors.length === 0, `${vp.name}: todas as telas abrem sem erro ${errors.join(' | ')}`)

    // financeiro: relatórios e extrato
    await go('#/financeiro')
    await page.getByRole('tab', { name: 'Relatórios' }).click(); await page.waitForTimeout(200); await shot('relatorios')
    await page.getByRole('tab', { name: 'Notas fiscais' }).click(); await page.waitForTimeout(200); await shot('notas')
    await page.getByRole('tab', { name: 'Extrato do mês' }).click(); await page.waitForTimeout(200)
    // perfil da empresa
    const rdl = (await stored() ?? {}).entities
    await go('#/cadastros'); await page.locator('.entity a.row').nth(1).click(); await page.waitForTimeout(300)
    ok(await page.getByText('48.624.017/0001-46').count() > 0, `${vp.name}: perfil da RDL com CNPJ`)
    await shot('perfil-rdl')
    void rdl

    // novo lançamento de saída
    const before = (await stored()).txs.length
    await page.getByRole('button', { name: 'Lançar', exact: true }).click()
    await page.getByText('Saída / conta a pagar').click()
    await page.getByLabel('Descrição', { exact: true }).fill('Cimento CP-II 50 sacos')
    await page.getByLabel('Valor', { exact: true }).fill('1.750,00')
    await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Material de construção' })
    await page.getByLabel('Repetir').selectOption('parcelas')
    await page.getByLabel('Quantidade').fill('3')
    await shot('form-saida')
    await modalSave()
    const d1 = await stored()
    ok(d1.txs.length === before + 3 && Math.abs(d1.txs.filter((t) => t.description.startsWith('Cimento')).reduce((s, t) => s + t.amount, 0) - 1750) < 0.01, `${vp.name}: saída parcelada em 3× soma o total`)

    // marcar como pago
    await go('#/financeiro')
    const payBtn = page.locator('.tx-actions button').first()
    await payBtn.click(); await page.waitForTimeout(200)
    ok((await stored()).txs.filter((t) => t.paid).length > d1.txs.filter((t) => t.paid).length, `${vp.name}: botão Paguei/Recebi`)

    // diárias: marca e paga
    await go('#/equipe/diarias')
    const cells = page.locator('button.day:not(.full):not(.half)')
    await cells.first().click(); await page.waitForTimeout(150)
    const att = (await stored()).attendance.length
    ok(att > 0, `${vp.name}: apontar diária com um toque`)
    const payW = page.locator('.daily .btn.primary').first()
    if (await payW.count()) {
      const tx0 = (await stored()).txs.length
      await payW.click(); await page.waitForTimeout(300)
      const d2 = await stored()
      ok(d2.txs.length > tx0 && d2.attendance.some((a) => a.txId), `${vp.name}: pagar semana gera lançamento e marca diárias`)
    }

    // salários
    await go('#/equipe/folha')
    const launch = page.getByRole('button', { name: /Lançar salários/ })
    if (await launch.count()) {
      await launch.click(); await page.waitForTimeout(200)
      const d3 = await stored()
      const sal = d3.txs.filter((t) => t.category === 'Salários')
      ok(sal.length === 2 && sal.some((t) => t.amount === 3700), `${vp.name}: salários lançados com vale descontado`)
    }

    // obra incorporação com 9 aptos
    await go('#/obras')
    await page.getByRole('button', { name: '+ Nova obra' }).click()
    await page.getByLabel('Nome da obra').fill('Prédio teste')
    await page.getByLabel('Tipo', { exact: true }).selectOption('incorporacao')
    await page.getByLabel('Preço', { exact: true }).fill('350000')
    await modalSave(); await page.waitForTimeout(300)
    const d4 = await stored()
    const pid = d4.projects.find((p) => p.name === 'Prédio teste')?.id
    ok(d4.units.filter((u) => u.projectId === pid).length === 9, `${vp.name}: prédio gera 9 apartamentos`)
    await shot('predio')
    // vender apto
    await page.locator('button.unit').first().click()
    await page.getByLabel('Situação', { exact: true }).selectOption('vendido')
    await page.getByLabel('Entrada').fill('50000')
    await page.getByLabel('Parcelas').fill('10')
    await page.getByRole('button', { name: 'Lançar plano de pagamento' }).click(); await page.waitForTimeout(200)
    await modalSave()
    const d5 = await stored()
    const sale = d5.txs.filter((t) => t.projectId === pid && t.unitId)
    ok(sale.length === 11 && Math.abs(sale.reduce((s, t) => s + t.amount, 0) - 350000) < 0.01, `${vp.name}: venda com entrada + 10 parcelas`)

    // orçamento de escola (PDDE) → obra
    await go('#/orcamentos')
    await page.getByRole('button', { name: '+ Orçamento para escola (PDDE)' }).click(); await page.waitForTimeout(200)
    await page.locator('.pick-co button', { hasText: 'Quira' }).click(); await page.waitForTimeout(300)
    await page.getByLabel('Nome da APM').fill('E.E. Teste')
    await page.getByLabel('CNPJ da APM').fill('11.111.111/0001-11')
    await page.getByLabel('Descrição do item').first().fill('Manutenção elétrica')
    await page.getByLabel('Valor total do item').first().fill('4000')
    await page.getByRole('button', { name: '+ Serviço' }).click(); await page.waitForTimeout(150)
    await page.getByLabel('Descrição do item').nth(1).fill('Troca de lâmpadas')
    await page.getByLabel('Quantidade').nth(1).fill('10')
    await page.getByLabel('Preço unitário').nth(1).fill('50')
    await page.waitForTimeout(200)
    await shot('orcamento')
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), page.getByRole('button', { name: 'Baixar PDF' }).first().click()])
    ok(dl && dl.suggestedFilename().endsWith('.pdf'), `${vp.name}: orçamento baixa em PDF (${dl?.suggestedFilename()})`)
    await page.getByRole('button', { name: 'Ver / imprimir' }).click(); await page.waitForTimeout(500)
    await shot('orcamento-pdf')
    if (await page.locator('.modal').count()) { await page.locator('.modal-foot .btn.primary').last().click(); await page.waitForTimeout(200) }
    await page.getByRole('button', { name: 'Aprovado → criar obra' }).click()
    await page.locator('.modal-foot .btn').last().click(); await page.waitForTimeout(300)
    const d6 = await stored()
    const np = d6.projects.find((p) => p.client === 'E.E. Teste')
    ok(np && np.contractValue === 4500 && np.kind === 'reforma_escola', `${vp.name}: orçamento PDDE (4.000 + 10×50) aprovado vira obra de escola de 4.500`)

    // agenda
    await go('#/agenda')
    await page.getByRole('button', { name: '+ Compromisso' }).click()
    await page.getByLabel('Título').fill('Vistoria teste')
    await modalSave()
    ok((await stored()).events.some((e) => e.title === 'Vistoria teste'), `${vp.name}: compromisso na agenda`)

    // carteira pessoal
    const pess = d6.entities.find((e) => e.kind === 'pessoal')
    await page.evaluate(() => (location.hash = '#/'))
    await page.locator('.scope-seg button', { hasText: 'Pessoal' }).click(); await page.waitForTimeout(250)
    await shot('pessoal')
    ok((await stored()).settings.scope === pess.id, `${vp.name}: filtro Pessoal`)

    // empresas sempre juntas (sem filtro de CNPJ no topo) e modo escuro
    await page.locator('.scope-seg button', { hasText: 'Empresa' }).click(); await page.waitForTimeout(150)
    ok((await stored()).settings.scope === 'empresa' && await page.locator('.cnpj-pick').count() === 0, `${vp.name}: Empresa junta todos os CNPJs`)
    // layout novo (padrão): central de comando e menu do usuário
    await page.evaluate(() => (location.hash = '#/')); await page.waitForTimeout(250)
    ok(await page.locator('.cmd-btn').count() === 6 && await page.locator('.todo').count() === 1, `${vp.name}: layout novo com central de comando`)
    if (vp.width < 800) { await page.locator('.bottomnav button').last().click(); await page.waitForTimeout(150); await page.locator('.sheet [aria-label="Modo escuro"]').click() }
    else { await page.locator('.nav2-me').click(); await page.getByRole('button', { name: 'Modo escuro' }).click() }
    await page.waitForTimeout(250)
    ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', `${vp.name}: modo escuro`)
    await shot('escuro')
    if (vp.width >= 800) {
      await page.locator('.nav2-me').click(); await page.getByRole('button', { name: 'Usar layout antigo' }).click(); await page.waitForTimeout(250)
      ok(await page.locator('.sidebar').count() === 1, `${vp.name}: troca para o layout antigo`)
      await page.locator('.sidebar [aria-label="Exemplo preenchido"]').click(); await page.waitForTimeout(250)
    } else {
      if (!(await page.locator('.sheet').count())) { await page.locator('.bottomnav button').last().click(); await page.waitForTimeout(150) }
      await page.locator('.sheet [aria-label="Exemplo preenchido"]').click(); await page.waitForTimeout(250)
    }
    ok(await page.getByText('Vamos começar').count() > 0, `${vp.name}: olho volta para a versão vazia`)
    ok(errors.length === 0, `${vp.name}: nenhum erro de página ${errors.join(' | ')}`)
    await page.close()
  }
} catch (e) {
  console.error(e)
  fails++
} finally {
  await browser.close()
  server.kill()
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo')
process.exit(fails ? 1 : 0)
