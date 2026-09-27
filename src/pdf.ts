import { ARTIFACT } from './env'

/** Transforma uma página A4 (HTML do papel timbrado) em PDF e baixa o arquivo.
 *  A página é desenhada num quadro escondido, fotografada em alta resolução e colocada no PDF. */
export async function downloadPdf(html: string, fileName: string): Promise<void> {
  const [{ jsPDF }, { toCanvas }] = await Promise.all([import('jspdf'), import('html-to-image')])
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;visibility:hidden'
  document.body.appendChild(frame)
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve()
      frame.srcdoc = html
    })
    const doc = frame.contentDocument!
    // versão "limpa" para o PDF: sem botão, sem sombra e sem a moldura-guia do carimbo
    const st = doc.createElement('style')
    st.textContent = '.bar{display:none!important}body{background:#fff!important}.sheet{margin:0!important;box-shadow:none!important}.stamp{border-color:transparent!important;color:transparent!important}'
    doc.head.appendChild(st)
    await Promise.all(Array.from(doc.images).map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined))))
    await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
    const sheet = doc.querySelector('.sheet') as HTMLElement
    const canvas = await toCanvas(sheet, { pixelRatio: 2.5, backgroundColor: '#ffffff', cacheBust: false })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const pageH = Math.round((canvas.width * 297) / 210) // altura de uma página A4 em pixels do desenho
    for (let y = 0, page = 0; y < canvas.height - 4; y += pageH, page++) {
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.min(pageH, canvas.height - y)
      const g = slice.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, slice.width, slice.height)
      g.drawImage(canvas, 0, -y)
      if (page) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, (slice.height * 210) / slice.width)
    }
    if (ARTIFACT) throw new Error('preview')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(pdf.output('blob'))
    a.download = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|º]+/g, '-')
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
  } finally {
    frame.remove()
  }
}
