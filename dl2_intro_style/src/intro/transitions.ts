import type { TransitionPreset } from './types'
import type { WebGLBackground } from '../webgl/renderer'

type TransitionOptions = {
  ui: HTMLElement
  webgl: WebGLBackground
  onTextGlitch?: (ms: number, strength: number) => void
  onImpact?: (strength: number, durationMs: number) => void
}

export const createTransitions = ({
  ui,
  webgl,
  onTextGlitch,
  onImpact,
}: TransitionOptions) => {
  const stageShake = (durationMs: number, intensityPx: number) => {
    const steps = 7
    const frames: Keyframe[] = []
    for (let i = 0; i < steps; i += 1) {
      const x = (Math.random() * 2 - 1) * intensityPx
      const y = (Math.random() * 2 - 1) * intensityPx
      frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` })
    }
    frames.push({ transform: 'translate(0px, 0px)' })
    ui.animate(frames, {
      duration: durationMs,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
  }

  const exposureFlash = (durationMs: number, strength: number) => {
    webgl.burstFlash(strength, durationMs)
  }

  const aberrationHit = (durationMs: number, strength: number) => {
    webgl.burstAberration(strength, durationMs)
  }

  const glitchHit = (durationMs: number, strength: number) => {
    webgl.burstGlitch(strength, durationMs)
    onTextGlitch?.(durationMs, strength)
  }

  const runPreset = (preset: TransitionPreset) => {
    if (preset === 'soft') {
      stageShake(420, 2.5)
      exposureFlash(280, 0.45)
      aberrationHit(260, 0.25)
      onImpact?.(0.4, 320)
    }
    if (preset === 'hard') {
      stageShake(520, 5)
      exposureFlash(340, 0.75)
      aberrationHit(380, 0.55)
      glitchHit(220, 0.8)
      onImpact?.(0.75, 420)
    }
  }

  return {
    stageShake,
    exposureFlash,
    aberrationHit,
    glitchHit,
    runPreset,
  }
}
