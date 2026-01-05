type FxIntensity = {
  grain: number
  dust: number
  flicker: number
}

type DustParticle = {
  x: number
  y: number
  radius: number
  speed: number
  drift: number
}

export class FxCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private running = false
  private rafId = 0
  private lastTime = 0
  private noiseCanvas: HTMLCanvasElement
  private dust: DustParticle[] = []
  private intensity: FxIntensity = { grain: 0.22, dust: 0.6, flicker: 0.4 }
  private flickerUntil = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) {
      throw new Error('FX canvas not supported.')
    }
    this.ctx = ctx
    this.noiseCanvas = this.createNoiseCanvas()
    this.populateDust()
    this.handleResize = this.handleResize.bind(this)
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.lastTime = performance.now()
    this.loop(this.lastTime)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  renderAt(nowMs: number) {
    this.draw(nowMs, 16.6)
  }

  setIntensity(values: Partial<FxIntensity>) {
    this.intensity = { ...this.intensity, ...values }
  }

  burstFlicker(strength: number, durationMs: number) {
    this.intensity.flicker = Math.max(this.intensity.flicker, strength)
    this.flickerUntil = performance.now() + durationMs
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
  }

  private createNoiseCanvas() {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return canvas
    }
    const image = ctx.createImageData(size, size)
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.floor(Math.random() * 255)
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  private populateDust() {
    this.dust = Array.from({ length: 60 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.5 + Math.random() * 1.4,
      speed: 0.015 + Math.random() * 0.05,
      drift: (Math.random() * 2 - 1) * 0.02,
    }))
  }

  private handleResize() {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private loop = (now: number) => {
    if (!this.running) {
      return
    }
    const dt = Math.min(32, now - this.lastTime)
    this.lastTime = now
    this.draw(now, dt)
    this.rafId = requestAnimationFrame(this.loop)
  }

  private draw(now: number, dt: number) {
    const ctx = this.ctx
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    ctx.clearRect(0, 0, width, height)

    if (this.intensity.grain > 0) {
      ctx.globalAlpha = this.intensity.grain
      ctx.drawImage(this.noiseCanvas, 0, 0, width, height)
      ctx.globalAlpha = 1
    }

    if (this.intensity.dust > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      this.dust.forEach((particle) => {
        particle.y += particle.speed * (dt / 16.6)
        particle.x += particle.drift * (dt / 16.6)
        if (particle.y > 1) {
          particle.y = -0.1
          particle.x = Math.random()
        }
        if (particle.x > 1) {
          particle.x = 0
        }
        if (particle.x < 0) {
          particle.x = 1
        }
        ctx.globalAlpha = this.intensity.dust * 0.5
        ctx.beginPath()
        ctx.arc(
          particle.x * width,
          particle.y * height,
          particle.radius,
          0,
          Math.PI * 2
        )
        ctx.fill()
      })
      ctx.globalAlpha = 1
    }

    if (now < this.flickerUntil || Math.random() < 0.004) {
      ctx.globalAlpha = this.intensity.flicker * 0.2
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
    }
  }
}

export const createFxCanvas = (canvas: HTMLCanvasElement) => new FxCanvas(canvas)
