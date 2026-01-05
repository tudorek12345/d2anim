type SkipControllerOptions = {
  element: HTMLElement
  holdMs: number
  onSkip: () => void
}

export const createSkipController = ({
  element,
  holdMs,
  onSkip,
}: SkipControllerOptions) => {
  let holding = false
  let holdStart = 0
  let rafId = 0

  const setProgress = (progress: number) => {
    const clamped = Math.min(Math.max(progress, 0), 1)
    element.style.setProperty('--skip-progress', clamped.toFixed(3))
  }

  const reset = () => {
    cancelAnimationFrame(rafId)
    holding = false
    holdStart = 0
    setProgress(0)
  }

  const update = (now: number) => {
    if (!holding) {
      return
    }
    const progress = (now - holdStart) / holdMs
    if (progress >= 1) {
      setProgress(1)
      holding = false
      onSkip()
      return
    }
    setProgress(progress)
    rafId = requestAnimationFrame(update)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || holding) {
      return
    }
    holding = true
    holdStart = performance.now()
    rafId = requestAnimationFrame(update)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code !== 'Space') {
      return
    }
    if (holding) {
      cancelAnimationFrame(rafId)
      reset()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', reset)

  return {
    destroy: () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
    },
  }
}
