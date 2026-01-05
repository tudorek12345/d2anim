type BuildingWindow = {
  x: number
  y: number
  w: number
  h: number
  seed: number
}

type BuildingDetail = {
  x: number
  w: number
  h: number
}

type BuildingSegment = {
  x: number
  width: number
  height: number
  windows: BuildingWindow[]
  details: BuildingDetail[]
}

type BuildingLayer = {
  segments: BuildingSegment[]
  baseY: number
  color: string
  windowColor: string
  parallax: number
  detailAlpha: number
}

type ParticleMode = 'debris' | 'ember'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  mode: ParticleMode
}

type Impact = {
  x: number
  y: number
  strength: number
  start: number
  duration: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const lerp = (start: number, end: number, t: number) => start + (end - start) * t

const createRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Grit2D {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private running = false
  private rafId = 0
  private dpr = 1
  private width = 0
  private height = 0
  private seed: number
  private layers: BuildingLayer[] = []
  private particles: Particle[] = []
  private particleRng: () => number
  private pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    active: false,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
  }
  private wind = { x: 0 }
  private shake = { x: 0, y: 0 }
  private impact: Impact | null = null
  private lastTime = 0
  private manualMode = false

  constructor(canvas: HTMLCanvasElement, seed = 1337) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) {
      throw new Error('Grit canvas not supported.')
    }
    this.ctx = ctx
    this.seed = seed
    this.particleRng = createRng(seed + 77)

    this.handleResize = this.handleResize.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)

    window.addEventListener('resize', this.handleResize)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onPointerUp)

    this.handleResize()
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.lastTime = performance.now()
    this.manualMode = false
    this.loop(this.lastTime)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  renderAt(tMs: number) {
    this.manualMode = true
    const dt = Math.min(33, Math.max(16, tMs - this.lastTime || 16))
    this.lastTime = tMs
    this.update(tMs, dt)
    this.draw(tMs)
  }

  impactHit(strength: number, durationMs: number, x?: number, y?: number) {
    const now = performance.now()
    const originX = x ?? this.width * 0.5
    const originY = y ?? this.height * 0.62
    this.impact = {
      x: originX,
      y: originY,
      strength,
      start: now,
      duration: durationMs,
    }
    this.shake.x += (Math.random() * 2 - 1) * strength * 6
    this.shake.y += (Math.random() * 2 - 1) * strength * 4
    this.spawnBurst(originX, originY, Math.round(8 + strength * 12))
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('blur', this.onPointerUp)
  }

  private handleResize() {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.width = width
    this.height = height
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = width * this.dpr
    this.canvas.height = height * this.dpr
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.buildLayers()
    this.populateParticles()
  }

  private buildLayers() {
    const layerDefs = [
      {
        heightRange: [0.18, 0.35],
        widthRange: [120, 220],
        base: 0.78,
        color: 'rgba(10, 12, 14, 0.55)',
        windowColor: 'rgba(100, 140, 160, 0.2)',
        parallax: 0.12,
        detailAlpha: 0.35,
      },
      {
        heightRange: [0.24, 0.5],
        widthRange: [90, 200],
        base: 0.84,
        color: 'rgba(14, 16, 19, 0.7)',
        windowColor: 'rgba(140, 170, 185, 0.3)',
        parallax: 0.2,
        detailAlpha: 0.45,
      },
      {
        heightRange: [0.32, 0.62],
        widthRange: [80, 170],
        base: 0.9,
        color: 'rgba(18, 20, 22, 0.8)',
        windowColor: 'rgba(175, 190, 205, 0.35)',
        parallax: 0.32,
        detailAlpha: 0.55,
      },
    ]

    this.layers = layerDefs.map((layer, index) => {
      const rng = createRng(this.seed + index * 101)
      const segments: BuildingSegment[] = []
      let x = -80
      while (x < this.width + 120) {
        const width = lerp(layer.widthRange[0], layer.widthRange[1], rng())
        const height = lerp(layer.heightRange[0], layer.heightRange[1], rng()) * this.height
        const windows = this.createWindows(width, height, rng)
        const details = this.createDetails(width, rng)
        segments.push({ x, width, height, windows, details })
        x += width + rng() * 30
      }
      return {
        segments,
        baseY: this.height * layer.base,
        color: layer.color,
        windowColor: layer.windowColor,
        parallax: layer.parallax,
        detailAlpha: layer.detailAlpha,
      }
    })
  }

  private createWindows(width: number, height: number, rng: () => number) {
    const windows: BuildingWindow[] = []
    const count = Math.min(14, Math.max(5, Math.floor(width / 18)))
    for (let i = 0; i < count; i += 1) {
      const w = 4 + rng() * 4
      const h = 6 + rng() * 8
      windows.push({
        x: 6 + rng() * (width - w - 12),
        y: 12 + rng() * (height - h - 20),
        w,
        h,
        seed: rng() * 10,
      })
    }
    return windows
  }

  private createDetails(width: number, rng: () => number) {
    const details: BuildingDetail[] = []
    const count = Math.min(4, Math.max(1, Math.floor(width / 60)))
    for (let i = 0; i < count; i += 1) {
      details.push({
        x: rng() * (width - 8),
        w: 4 + rng() * 6,
        h: 6 + rng() * 18,
      })
    }
    return details
  }

  private populateParticles() {
    this.particles = []
    const rng = this.particleRng
    const total = 90
    for (let i = 0; i < total; i += 1) {
      const mode: ParticleMode = i % 3 === 0 ? 'ember' : 'debris'
      this.particles.push(this.createParticle(mode, rng))
    }
  }

  private createParticle(mode: ParticleMode, rng: () => number): Particle {
    if (mode === 'ember') {
      return {
        x: rng() * this.width,
        y: this.height * (0.65 + rng() * 0.35),
        vx: (rng() * 2 - 1) * 0.2,
        vy: -(0.3 + rng() * 0.4),
        size: 1 + rng() * 1.8,
        life: 40 + rng() * 60,
        mode,
      }
    }
    return {
      x: rng() * this.width,
      y: rng() * this.height * 0.6,
      vx: (rng() * 2 - 1) * 0.25,
      vy: 0.2 + rng() * 0.3,
      size: 1.2 + rng() * 2.8,
      life: 50 + rng() * 80,
      mode,
    }
  }

  private resetParticle(particle: Particle) {
    const rng = this.particleRng
    const fresh = this.createParticle(particle.mode, rng)
    particle.x = fresh.x
    particle.y = fresh.y
    particle.vx = fresh.vx
    particle.vy = fresh.vy
    particle.size = fresh.size
    particle.life = fresh.life
  }

  private loop = (now: number) => {
    if (!this.running) {
      return
    }
    const dt = Math.min(33, now - this.lastTime)
    this.lastTime = now
    this.update(now, dt)
    this.draw(now)
    this.rafId = requestAnimationFrame(this.loop)
  }

  private update(now: number, dt: number) {
    const dtScale = dt / 16.6
    const windTarget = this.pointer.active && !this.manualMode
      ? clamp((this.pointer.vx / 600) * 0.4, -0.35, 0.35)
      : 0
    this.wind.x = lerp(this.wind.x, windTarget, 0.06)
    this.shake.x = lerp(this.shake.x, 0, 0.12)
    this.shake.y = lerp(this.shake.y, 0, 0.12)

    const activeImpact = this.impact
    const impactProgress = activeImpact
      ? (now - activeImpact.start) / activeImpact.duration
      : 1
    const impactRadius = activeImpact ? 140 + activeImpact.strength * 160 : 0
    const impactForce = activeImpact ? (1 - clamp(impactProgress, 0, 1)) * activeImpact.strength : 0
    if (activeImpact && impactProgress >= 1) {
      this.impact = null
    }

    for (const particle of this.particles) {
      const gravity = particle.mode === 'ember' ? -0.03 : 0.08
      particle.vx += this.wind.x * dtScale * (particle.mode === 'ember' ? 0.4 : 0.9)
      particle.vy += gravity * dtScale

      if (activeImpact && impactForce > 0) {
        const dx = particle.x - activeImpact.x
        const dy = particle.y - activeImpact.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        if (dist < impactRadius) {
          const push = (1 - dist / impactRadius) * impactForce * 2.2
          particle.vx += (dx / dist) * push
          particle.vy += (dy / dist) * push
        }
      }

      particle.x += particle.vx * dtScale * 12
      particle.y += particle.vy * dtScale * 12
      particle.vx *= 0.98
      particle.vy *= 0.98
      particle.life -= dtScale

      if (particle.mode === 'debris') {
        const groundY = this.getGroundY(particle.x)
        if (particle.y > groundY - particle.size) {
          particle.y = groundY - particle.size
          particle.vy *= -0.45
          particle.vx *= 0.7
          particle.life -= 6
        }
        if (particle.y > this.height + 40 || particle.life <= 0) {
          this.resetParticle(particle)
        }
      } else {
        if (particle.y < -40 || particle.life <= 0) {
          this.resetParticle(particle)
        }
      }
    }
  }

  private draw(now: number) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    const time = now * 0.001
    const pointerOffsetX = this.pointer.active ? this.pointer.x / this.width - 0.5 : 0
    const pointerOffsetY = this.pointer.active ? this.pointer.y / this.height - 0.5 : 0

    for (const layer of this.layers) {
      const offsetX = pointerOffsetX * layer.parallax * 120 + this.shake.x * layer.parallax
      const offsetY = pointerOffsetY * layer.parallax * 40 + this.shake.y * layer.parallax
      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.fillStyle = layer.color
      for (const segment of layer.segments) {
        ctx.fillRect(segment.x, layer.baseY - segment.height, segment.width, segment.height)
        ctx.fillStyle = 'rgba(28, 30, 34, 0.4)'
        for (const detail of segment.details) {
          ctx.fillRect(
            segment.x + detail.x,
            layer.baseY - segment.height - detail.h,
            detail.w,
            detail.h
          )
        }
        ctx.fillStyle = layer.color
      }

      ctx.fillStyle = layer.windowColor
      for (const segment of layer.segments) {
        for (const win of segment.windows) {
          const flicker = Math.sin(time * 0.8 + win.seed)
          if (flicker > 0.15) {
            ctx.globalAlpha = (flicker - 0.15) * 0.6
            ctx.fillRect(segment.x + win.x, layer.baseY - win.y, win.w, win.h)
          }
        }
      }
      ctx.globalAlpha = 1

      ctx.strokeStyle = `rgba(40, 44, 48, ${layer.detailAlpha})`
      for (const segment of layer.segments) {
        if (segment.width < 120) {
          continue
        }
        ctx.beginPath()
        ctx.moveTo(segment.x + segment.width * 0.3, layer.baseY)
        ctx.lineTo(segment.x + segment.width * 0.3, layer.baseY - segment.height * 0.6)
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const particle of this.particles) {
      if (particle.mode === 'ember') {
        ctx.fillStyle = 'rgba(255, 165, 120, 0.35)'
      } else {
        ctx.fillStyle = 'rgba(210, 220, 230, 0.28)'
      }
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    if (this.pointer.active && !this.manualMode) {
      const radius = 220
      const gradient = ctx.createRadialGradient(
        this.pointer.x,
        this.pointer.y,
        20,
        this.pointer.x,
        this.pointer.y,
        radius
      )
      gradient.addColorStop(0, 'rgba(140, 170, 200, 0.12)')
      gradient.addColorStop(1, 'rgba(20, 24, 28, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, this.width, this.height)
    }

    if (this.impact) {
      const progress = clamp((now - this.impact.start) / this.impact.duration, 0, 1)
      const radius = 40 + progress * 220
      ctx.strokeStyle = `rgba(180, 210, 230, ${0.4 * (1 - progress)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(this.impact.x, this.impact.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private getGroundY(x: number) {
    const frontLayer = this.layers[this.layers.length - 1]
    if (!frontLayer) {
      return this.height * 0.9
    }
    const segment = frontLayer.segments.find(
      (seg) => x >= seg.x && x <= seg.x + seg.width
    )
    if (!segment) {
      return frontLayer.baseY
    }
    return frontLayer.baseY - segment.height
  }

  private spawnBurst(x: number, y: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const particle: Particle = {
        x: x + (Math.random() * 2 - 1) * 40,
        y: y + (Math.random() * 2 - 1) * 40,
        vx: (Math.random() * 2 - 1) * 0.9,
        vy: (Math.random() * 2 - 1) * 0.9,
        size: 1.2 + Math.random() * 1.6,
        life: 25 + Math.random() * 30,
        mode: Math.random() > 0.5 ? 'ember' : 'debris',
      }
      this.particles.push(particle)
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (this.manualMode) {
      return
    }
    const now = performance.now()
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const dt = Math.max(16, now - this.pointer.lastTime)
    const vx = (x - this.pointer.lastX) / dt
    const vy = (y - this.pointer.lastY) / dt
    this.pointer.x = x
    this.pointer.y = y
    this.pointer.vx = vx * 1000
    this.pointer.vy = vy * 1000
    this.pointer.lastX = x
    this.pointer.lastY = y
    this.pointer.lastTime = now
    this.pointer.active = true
  }

  private onPointerDown(event: PointerEvent) {
    if (this.manualMode) {
      return
    }
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    this.impactHit(0.7, 380, x, y)
  }

  private onPointerUp() {
    this.pointer.active = false
    this.pointer.vx = 0
    this.pointer.vy = 0
  }
}

export const createGrit2D = (canvas: HTMLCanvasElement) => new Grit2D(canvas)
