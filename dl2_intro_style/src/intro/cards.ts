export type CardConfig = {
  headline: string
  sub?: string
}

export type CardInstance = {
  root: HTMLDivElement
  headlineEl: HTMLDivElement
  subEl?: HTMLDivElement
  enter: () => Animation
  exit: () => Animation
  setHeadlineText: (text: string) => void
  setHeadlineOpacity: (value: number) => void
  triggerGlitchBurst: (ms: number, strength: number) => void
  cancelAnimations: () => void
  destroy: () => void
}

export const createCard = (stage: HTMLElement, config: CardConfig): CardInstance => {
  const root = document.createElement('div')
  root.className = 'card'

  const headlineEl = document.createElement('div')
  headlineEl.className = 'headline glitchable'
  headlineEl.dataset.text = config.headline
  headlineEl.textContent = ''

  root.appendChild(headlineEl)

  let subEl: HTMLDivElement | undefined
  if (config.sub) {
    subEl = document.createElement('div')
    subEl.className = 'sub'
    subEl.textContent = config.sub
    root.appendChild(subEl)
  }

  stage.appendChild(root)

  const animations: Animation[] = []

  const safeAnimate = (
    element: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    fallbackStyles: Partial<CSSStyleDeclaration>
  ) => {
    if (typeof element.animate !== 'function') {
      Object.assign(element.style, fallbackStyles)
      return {
        cancel: () => {},
        finished: Promise.resolve(),
      } as Animation
    }
    return element.animate(keyframes, options)
  }

  const enter = () => {
    const anim = safeAnimate(
      root,
      [
        { opacity: 0, transform: 'translateY(12px)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' },
      ],
      { duration: 750, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
      {
        opacity: '1',
        transform: 'translateY(0px)',
        filter: 'blur(0px)',
      }
    )
    animations.push(anim)
    return anim
  }

  const exit = () => {
    const anim = safeAnimate(
      root,
      [
        { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'translateY(-8px)', filter: 'blur(6px)' },
      ],
      { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
      {
        opacity: '0',
        transform: 'translateY(-8px)',
        filter: 'blur(6px)',
      }
    )
    animations.push(anim)
    return anim
  }

  const setHeadlineText = (text: string) => {
    headlineEl.textContent = text
    headlineEl.dataset.text = text
  }

  const setHeadlineOpacity = (value: number) => {
    headlineEl.style.opacity = value.toFixed(2)
  }

  const triggerGlitchBurst = (ms: number, strength: number) => {
    const start = performance.now()
    headlineEl.classList.add('glitching')
    const update = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / ms, 1)
      const top = Math.floor(Math.random() * 70)
      const bottom = Math.floor(Math.random() * 70)
      headlineEl.style.setProperty('--glitch-top', `${top}%`)
      headlineEl.style.setProperty('--glitch-bottom', `${bottom}%`)
      headlineEl.style.textShadow = `${strength * 6}px 0 rgba(134, 183, 255, 0.6), -${
        strength * 5
      }px 0 rgba(255, 143, 143, 0.6)`
      if (progress < 1) {
        requestAnimationFrame(update)
      } else {
        headlineEl.classList.remove('glitching')
        headlineEl.style.removeProperty('--glitch-top')
        headlineEl.style.removeProperty('--glitch-bottom')
        headlineEl.style.textShadow = ''
      }
    }
    requestAnimationFrame(update)
  }

  const cancelAnimations = () => {
    animations.forEach((anim) => anim.cancel())
    animations.length = 0
  }

  const destroy = () => {
    cancelAnimations()
    root.remove()
  }

  return {
    root,
    headlineEl,
    subEl,
    enter,
    exit,
    setHeadlineText,
    setHeadlineOpacity,
    triggerGlitchBurst,
    cancelAnimations,
    destroy,
  }
}
