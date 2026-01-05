import './style.css'
import { WebGLBackground } from './webgl/renderer'
import { createFxCanvas } from './fx/fxCanvas'
import { createGrit2D } from './fx/grit2d'
import { introScript } from './intro/script'
import { Director } from './intro/director'
import { createSkipController } from './intro/skip'
import { createDebugOverlay } from './intro/debug'

declare global {
  interface Window {
    __INTRO_SET_TIME__?: (tMs: number) => void
  }
}

const app = document.querySelector<HTMLDivElement>('#app')
const webglCanvas = document.querySelector<HTMLCanvasElement>('#webgl')
const gritCanvas = document.querySelector<HTMLCanvasElement>('#grit')
const fxCanvas = document.querySelector<HTMLCanvasElement>('#fx')
const stage = document.querySelector<HTMLDivElement>('#stage')
const ui = document.querySelector<HTMLDivElement>('#ui')
const skipHint = document.querySelector<HTMLDivElement>('#skipHint')
const debug = document.querySelector<HTMLDivElement>('#debug')

if (
  !app ||
  !webglCanvas ||
  !gritCanvas ||
  !fxCanvas ||
  !stage ||
  !ui ||
  !skipHint ||
  !debug
) {
  throw new Error('Intro DOM is missing required elements.')
}

const webgl = new WebGLBackground(webglCanvas)
const grit = createGrit2D(gritCanvas)
const fx = createFxCanvas(fxCanvas)

const director = new Director({
  app,
  stage,
  ui,
  script: introScript,
  webgl,
  grit,
  fx,
})

webgl.start()
grit.start()
fx.start()

const skipController = createSkipController({
  element: skipHint,
  holdMs: 600,
  onSkip: () => director.skipToEnd(),
})

const debugOverlay = createDebugOverlay({
  element: debug,
  director,
  markers: introScript.markers,
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR') {
    director.replay()
  }
})

director.start()

const params = new URLSearchParams(window.location.search)
const staticTime = params.get('t')
if (staticTime) {
  const tMs = Number(staticTime)
  if (!Number.isNaN(tMs)) {
    director.seekTo(tMs)
    webgl.stop()
    grit.stop()
    fx.stop()
    webgl.renderAt(tMs)
    grit.renderAt(tMs)
    fx.renderAt(tMs)
  }
}

window.__INTRO_SET_TIME__ = (tMs: number) => {
  director.seekTo(tMs)
  webgl.stop()
  grit.stop()
  fx.stop()
  webgl.renderAt(tMs)
  grit.renderAt(tMs)
  fx.renderAt(tMs)
}

window.addEventListener('beforeunload', () => {
  skipController.destroy()
  debugOverlay.destroy()
  director.destroy()
  fx.stop()
  grit.dispose()
  webgl.stop()
})
