import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { analyzeChainV2State } from './chain-v2/analyze'
import type { ChainV2State } from './chain-v2/types'
import { renderChainV2ReportHtml } from './render/chain-v2-report-html'

const defaultStatePath = '/Users/tristanfischer/Downloads/bess-iter/iter-49d-all-fixes-bess/container/state.json'

main().catch(error => {
  console.error(error)
  throw error
})

async function main(): Promise<void> {
  const statePath = resolve(process.argv[2] ?? defaultStatePath)
  const outDir = resolve('report-compiler-prototype/out/chain-v2-adapted')
  await mkdir(outDir, { recursive: true })

  const state = JSON.parse(await readFile(statePath, 'utf8')) as ChainV2State
  const analysis = analyzeChainV2State(state)
  const html = renderChainV2ReportHtml(state)
  const stem = basename(statePath, '.json') === 'state' ? 'chain-v2-adapted-bess' : basename(statePath, '.json')
  const htmlPath = join(outDir, `${stem}.html`)
  const pdfPath = join(outDir, `${stem}.pdf`)
  const jsonPath = join(outDir, `${stem}.analysis.json`)
  const previewPath = join(outDir, `${stem}.preview.png`)

  await writeFile(htmlPath, html, 'utf8')
  await writeFile(jsonPath, JSON.stringify({ source: statePath, analysis }, null, 2), 'utf8')
  await writePdfAndPreview(htmlPath, pdfPath, previewPath)

  console.log(`Source: ${statePath}`)
  console.log(`HTML: ${htmlPath}`)
  console.log(`PDF: ${pdfPath}`)
  console.log(`Preview: ${previewPath}`)
  console.log(`Analysis: ${jsonPath}`)
  console.log(JSON.stringify(analysis, null, 2))
}

async function writePdfAndPreview(htmlPath: string, pdfPath: string, previewPath: string): Promise<void> {
  const playwright = await import('playwright')
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 })
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
    await page.screenshot({ path: previewPath, fullPage: false })
    await page.close()
  } finally {
    await browser.close()
  }
}
