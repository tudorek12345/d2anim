import type { IntroMarker } from './types'
import type { Director } from './director'

type DebugOptions = {
  element: HTMLElement
  director: Director
  markers: IntroMarker[]
}

export const createDebugOverlay = ({ element, director, markers }: DebugOptions) => {
  element.innerHTML = `
    <div class="row"><span>TIME</span><span data-field="time">0</span></div>
    <div class="row"><span>BEAT</span><span data-field="beat">-</span></div>
    <div class="row"><span>NEXT</span><span data-field="next">-</span></div>
    <div class="row"><span>FPS</span><span data-field="fps">0</span></div>
    <button data-action="replay">Replay</button>
    <button data-action="soft">Soft Hit</button>
    <button data-action="hard">Hard Hit</button>
  `

  const fieldTime = element.querySelector('[data-field="time"]') as HTMLElement
  const fieldBeat = element.querySelector('[data-field="beat"]') as HTMLElement
  const fieldNext = element.querySelector('[data-field="next"]') as HTMLElement
  const fieldFps = element.querySelector('[data-field="fps"]') as HTMLElement

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement
    if (!target) {
      return
    }
    const action = target.getAttribute('data-action')
    if (action === 'replay') {
      director.replay()
    }
    if (action === 'soft') {
      director.hit('soft')
    }
    if (action === 'hard') {
      director.hit('hard')
    }
  }

  element.addEventListener('click', onClick)

  let rafId = 0
  let lastFrame = performance.now()
  let fpsEstimate = 60

  const update = (now: number) => {
    const delta = now - lastFrame
    lastFrame = now
    if (delta > 0) {
      const instant = 1000 / delta
      fpsEstimate = fpsEstimate * 0.9 + instant * 0.1
    }
    const state = director.getState()
    const nextMarker = markers.find((marker) => marker.at > state.tMs)
    if (!element.hidden) {
      fieldTime.textContent = `${Math.round(state.tMs)}ms`
      fieldBeat.textContent = state.beatId
        ? `${state.beatIndex} / ${state.beatId}`
        : '-'
      fieldNext.textContent = nextMarker ? `${nextMarker.name}` : 'END'
      fieldFps.textContent = `${fpsEstimate.toFixed(0)}`
    }
    rafId = requestAnimationFrame(update)
  }

  rafId = requestAnimationFrame(update)

  const toggle = () => {
    element.hidden = !element.hidden
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.code === 'KeyD') {
      toggle()
    }
  }

  window.addEventListener('keydown', onKey)

  return {
    destroy: () => {
      cancelAnimationFrame(rafId)
      element.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    },
  }
}
