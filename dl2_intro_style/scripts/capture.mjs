import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const [key, value] = process.argv[i].split('=')
  args.set(key, value ?? true)
}

const url = args.get('--url') || 'http://localhost:4173/'
const fps = Number(args.get('--fps') || 30)
const durationMs = Number(args.get('--duration') || 60000)
const outDir = args.get('--out') || 'captures'

const frameMs = 1000 / fps
const frameCount = Math.floor(durationMs / frameMs)

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

await page.goto(`${url}?t=0`, { waitUntil: 'networkidle' })

for (let i = 0; i < frameCount; i += 1) {
  const t = Math.round(i * frameMs)
  await page.evaluate((timeMs) => window.__INTRO_SET_TIME__?.(timeMs), t)
  const filename = `frame_${String(i + 1).padStart(6, '0')}.png`
  await page.screenshot({ path: join(outDir, filename) })
}

await browser.close()

console.log(`Captured ${frameCount} frames to ${outDir}`)
console.log(
  `Assemble: ffmpeg -framerate ${fps} -i ${outDir}/frame_%06d.png -c:v libx264 -pix_fmt yuv420p intro.mp4`
)
