import { describe, expect, it, vi } from 'vitest'
import type { IntroScript } from './types'
import { Director } from './director'
import type { WebGLBackground } from '../webgl/renderer'
import type { FxCanvas } from '../fx/fxCanvas'

describe('Director', () => {
  it('skipToEnd marks completed synchronously', () => {
    document.body.innerHTML = `
      <div id="app">
        <div id="ui"></div>
        <div id="stage"></div>
      </div>
    `

    const app = document.querySelector('#app') as HTMLElement
    const ui = document.querySelector('#ui') as HTMLElement
    const stage = document.querySelector('#stage') as HTMLElement

    const script: IntroScript = {
      durationMs: 1000,
      markers: [],
      beats: [
        {
          id: 'test',
          at: 0,
          headline: 'Test',
        },
      ],
    }

    const webgl = {
      burstFlash: vi.fn(),
      burstGlitch: vi.fn(),
      burstAberration: vi.fn(),
    } as unknown as WebGLBackground

    const fx = {
      start: vi.fn(),
      stop: vi.fn(),
      setIntensity: vi.fn(),
      burstFlicker: vi.fn(),
    } as unknown as FxCanvas

    const director = new Director({ app, stage, ui, script, webgl, fx })
    director.skipToEnd()

    expect(app.dataset.state).toBe('completed')
    expect(director.getState().completed).toBe(true)
  })
})
