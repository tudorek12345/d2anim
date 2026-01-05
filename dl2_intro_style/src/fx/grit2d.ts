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

type Billboard = {
  x: number
  y: number
  w: number
  h: number
  glow: number
  flickerSeed: number
  textSeed: number
}

type BuildingSegment = {
  x: number
  width: number
  height: number
  windows: BuildingWindow[]
  details: BuildingDetail[]
  billboards: Billboard[]
  collapseOffset: number
  collapseVelocity: number
  collapseTarget: number
  antennaHeight: number
  crackSeed: number
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

type DriftPiece = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  spin: number
  alpha: number
}

type RainDrop = {
  x: number
  y: number
  length: number
  speed: number
  drift: number
  alpha: number
}

type Cable = {
  y: number
  sag: number
  sway: number
  speed: number
  phase: number
}

type Searchlight = {
  x: number
  y: number
  baseAngle: number
  swing: number
  speed: number
  length: number
  spread: number
  intensity: number
  phase: number
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
  private driftPieces: DriftPiece[] = []
  private rainDrops: RainDrop[] = []
  private cables: Cable[] = []
  private searchlights: Searchlight[] = []
  private particleRng: () => number
  private rng: () => number
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
  private collapseTimer = 0
  private collapseNext = 4200

  constructor(canvas: HTMLCanvasElement, seed = 1337) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) {
      throw new Error('Grit canvas not supported.')
    }
    this.ctx = ctx
    this.seed = seed
    this.particleRng = createRng(seed + 77)
    this.rng = createRng(seed + 999)

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
    const shakeX = (this.rng() * 2 - 1) * strength * 7
    const shakeY = (this.rng() * 2 - 1) * strength * 5
    this.shake.x += shakeX
    this.shake.y += shakeY
    this.spawnBurst(originX, originY, Math.round(10 + strength * 14))
    this.triggerLocalizedCollapse(originX, originY, strength)
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
    this.populateDrift()
    this.populateRain()
    this.buildCables()
    this.buildSearchlights()
  }

  private buildLayers() {
    const layerDefs = [
      {
        heightRange: [0.12, 0.24],
        widthRange: [160, 260],
        base: 0.72,
        color: 'rgba(9, 11, 13, 0.45)',
        windowColor: 'rgba(90, 120, 140, 0.16)',
        parallax: 0.08,
        detailAlpha: 0.25,
      },
      {
        heightRange: [0.2, 0.36],
        widthRange: [120, 230],
        base: 0.8,
        color: 'rgba(11, 13, 15, 0.55)',
        windowColor: 'rgba(100, 140, 160, 0.22)',
        parallax: 0.14,
        detailAlpha: 0.35,
      },
      {
        heightRange: [0.24, 0.5],
        widthRange: [90, 200],
        base: 0.86,
        color: 'rgba(14, 16, 19, 0.7)',
        windowColor: 'rgba(140, 170, 185, 0.32)',
        parallax: 0.22,
        detailAlpha: 0.48,
      },
      {
        heightRange: [0.32, 0.62],
        widthRange: [80, 180],
        base: 0.92,
        color: 'rgba(18, 20, 22, 0.84)',
        windowColor: 'rgba(175, 190, 205, 0.4)',
        parallax: 0.32,
        detailAlpha: 0.6,
      },
    ]

    this.layers = layerDefs.map((layer, index) => {
      const rng = createRng(this.seed + index * 101)
      const segments: BuildingSegment[] = []
      let x = -100
      while (x < this.width + 140) {
        const width = lerp(layer.widthRange[0], layer.widthRange[1], rng())
        const height = lerp(layer.heightRange[0], layer.heightRange[1], rng()) * this.height
        const windows = this.createWindows(width, height, rng)
        const details = this.createDetails(width, rng)
        const billboards = this.createBillboards(width, height, rng, index)
        segments.push({
          x,
          width,
          height,
          windows,
          details,
          billboards,
          collapseOffset: 0,
          collapseVelocity: 0,
          collapseTarget: 0,
          antennaHeight: rng() > 0.68 ? 10 + rng() * 40 : 0,
          crackSeed: rng() * 10,
        })
        x += width + rng() * 34
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
    const count = Math.min(16, Math.max(5, Math.floor(width / 18)))
    for (let i = 0; i < count; i += 1) {
      const w = 4 + rng() * 4
      const h = 6 + rng() * 8
      windows.push({
        x: 6 + rng() * (width - w - 12),
        y: 12 + rng() * (height - h - 22),
        w,
        h,
        seed: rng() * 10,
      })
    }
    return windows
  }

  private createDetails(width: number, rng: () => number) {
    const details: BuildingDetail[] = []
    const count = Math.min(5, Math.max(1, Math.floor(width / 60)))
    for (let i = 0; i < count; i += 1) {
      details.push({
        x: rng() * (width - 8),
        w: 4 + rng() * 6,
        h: 8 + rng() * 22,
      })
    }
    return details
  }

  private createBillboards(
    width: number,
    height: number,
    rng: () => number,
    layerIndex: number
  ) {
    const billboards: Billboard[] = []
    if (layerIndex >= 1 && rng() > 0.4) {
      const w = 40 + rng() * 60
      const h = 18 + rng() * 24
      billboards.push({
        x: rng() * (width - w),
        y: height * (0.08 + rng() * 0.28),
        w,
        h,
        glow: 0.25 + rng() * 0.5,
        flickerSeed: rng() * 10,
        textSeed: rng() * 10,
      })
    }
    if (layerIndex >= 2 && width > 150 && rng() > 0.65) {
      const w = 60 + rng() * 80
      const h = 22 + rng() * 26
      billboards.push({
        x: rng() * (width - w),
        y: height * (0.1 + rng() * 0.2),
        w,
        h,
        glow: 0.3 + rng() * 0.5,
        flickerSeed: rng() * 10,
        textSeed: rng() * 10,
      })
    }
    return billboards
  }

  private populateParticles() {
    this.particles = []
    const rng = this.particleRng
    const total = 110
    for (let i = 0; i < total; i += 1) {
      const mode: ParticleMode = i % 3 === 0 ? 'ember' : 'debris'
      this.particles.push(this.createParticle(mode, rng))
    }
  }

  private populateDrift() {
    this.driftPieces = []
    const count = Math.min(90, Math.max(60, Math.floor(this.width / 16)))
    for (let i = 0; i < count; i += 1) {
      this.driftPieces.push(this.createDriftPiece())
    }
  }

  private populateRain() {
    this.rainDrops = []
    const count = Math.min(220, Math.max(140, Math.floor(this.width / 6)))
    for (let i = 0; i < count; i += 1) {
      this.rainDrops.push(this.createRainDrop(true))
    }
  }

  private buildCables() {
    const count = 4
    this.cables = Array.from({ length: count }).map((_, index) => ({
      y: this.height * (0.18 + index * 0.06),
      sag: 12 + index * 6,
      sway: 6 + index * 2,
      speed: 0.35 + index * 0.12,
      phase: index * 1.6,
    }))
  }

  private buildSearchlights() {
    this.searchlights = [
      {
        x: this.width * 0.18,
        y: this.height * 0.62,
        baseAngle: -0.5,
        swing: 0.4,
        speed: 0.4,
        length: this.width * 0.9,
        spread: 0.25,
        intensity: 0.75,
        phase: 0.2,
      },
      {
        x: this.width * 0.55,
        y: this.height * 0.58,
        baseAngle: -0.2,
        swing: 0.35,
        speed: 0.28,
        length: this.width * 0.8,
        spread: 0.22,
        intensity: 0.6,
        phase: 1.7,
      },
      {
        x: this.width * 0.82,
        y: this.height * 0.6,
        baseAngle: -0.35,
        swing: 0.5,
        speed: 0.32,
        length: this.width * 0.95,
        spread: 0.28,
        intensity: 0.7,
        phase: 2.4,
      },
    ]
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

  private createDriftPiece(): DriftPiece {
    return {
      x: this.rng() * this.width,
      y: this.rng() * this.height,
      vx: (this.rng() * 2 - 1) * 22,
      vy: 16 + this.rng() * 34,
      size: 2 + this.rng() * 5,
      rot: this.rng() * Math.PI * 2,
      spin: (this.rng() * 2 - 1) * 0.6,
      alpha: 0.2 + this.rng() * 0.25,
    }
  }

  private createRainDrop(fromTop = false): RainDrop {
    return {
      x: this.rng() * this.width,
      y: fromTop ? -this.rng() * this.height : this.rng() * this.height,
      length: 8 + this.rng() * 20,
      speed: 480 + this.rng() * 360,
      drift: (this.rng() * 2 - 1) * 0.4,
      alpha: 0.12 + this.rng() * 0.2,
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
    const dtSec = dt / 1000
    const time = now * 0.001

    const ambientWind = Math.sin(time * 0.35 + this.seed) * 0.15
    const pointerWind =
      this.pointer.active && !this.manualMode
        ? clamp((this.pointer.vx / 700) * 0.4, -0.45, 0.45)
        : 0
    const windTarget = clamp(ambientWind + pointerWind, -0.6, 0.6)
    this.wind.x = lerp(this.wind.x, windTarget, 0.06)
    this.shake.x = lerp(this.shake.x, 0, 0.12)
    this.shake.y = lerp(this.shake.y, 0, 0.12)

    const activeImpact = this.impact
    const impactProgress = activeImpact
      ? (now - activeImpact.start) / activeImpact.duration
      : 1
    const impactRadius = activeImpact ? 140 + activeImpact.strength * 200 : 0
    const impactForce = activeImpact ? (1 - clamp(impactProgress, 0, 1)) * activeImpact.strength : 0
    if (activeImpact && impactProgress >= 1) {
      this.impact = null
    }

    if (!this.manualMode) {
      this.collapseTimer += dt
      if (this.collapseTimer > this.collapseNext) {
        this.collapseTimer = 0
        this.collapseNext = 3200 + this.rng() * 5200
        this.triggerRandomCollapse()
      }
    }

    for (const layer of this.layers) {
      for (const segment of layer.segments) {
        if (activeImpact && impactForce > 0) {
          const center = segment.x + segment.width * 0.5
          const dx = center - activeImpact.x
          const dist = Math.abs(dx)
          if (dist < impactRadius) {
            const push = (1 - dist / impactRadius) * impactForce * 12
            segment.collapseTarget = clamp(
              segment.collapseTarget + push,
              0,
              segment.height * 0.4
            )
          }
        }
        segment.collapseVelocity +=
          (segment.collapseTarget - segment.collapseOffset) * 0.0025 * dtScale
        segment.collapseVelocity *= 0.92
        segment.collapseOffset = clamp(
          segment.collapseOffset + segment.collapseVelocity * dtScale,
          0,
          segment.height * 0.45
        )
      }
    }

    for (const drop of this.rainDrops) {
      drop.x += (this.wind.x * 180 + drop.drift * 40) * dtSec
      drop.y += drop.speed * dtSec
      if (drop.y > this.height + 60) {
        const reset = this.createRainDrop(true)
        drop.x = reset.x
        drop.y = reset.y
        drop.length = reset.length
        drop.speed = reset.speed
        drop.drift = reset.drift
        drop.alpha = reset.alpha
      }
      if (drop.x < -50) {
        drop.x = this.width + 50
      } else if (drop.x > this.width + 50) {
        drop.x = -50
      }
    }

    for (const piece of this.driftPieces) {
      piece.x += (piece.vx + this.wind.x * 120) * dtSec
      piece.y += piece.vy * dtSec
      piece.rot += piece.spin * dtSec
      if (
        piece.y > this.height + 60 ||
        piece.x < -80 ||
        piece.x > this.width + 80
      ) {
        const fresh = this.createDriftPiece()
        piece.x = fresh.x
        piece.y = -this.rng() * this.height * 0.3
        piece.vx = fresh.vx
        piece.vy = fresh.vy
        piece.size = fresh.size
        piece.rot = fresh.rot
        piece.spin = fresh.spin
        piece.alpha = fresh.alpha
      }
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

    const sky = ctx.createLinearGradient(0, 0, 0, this.height)
    sky.addColorStop(0, 'rgba(6, 7, 9, 0.85)')
    sky.addColorStop(0.5, 'rgba(10, 12, 14, 0.75)')
    sky.addColorStop(1, 'rgba(12, 14, 16, 0.9)')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, this.width, this.height)

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const light of this.searchlights) {
      const angle =
        light.baseAngle +
        Math.sin(time * light.speed + light.phase) * light.swing +
        this.wind.x * 0.2
      ctx.save()
      ctx.translate(light.x, light.y)
      ctx.rotate(angle)
      const gradient = ctx.createLinearGradient(0, 0, light.length, 0)
      gradient.addColorStop(0, `rgba(160, 190, 210, ${0.18 * light.intensity})`)
      gradient.addColorStop(1, 'rgba(20, 25, 30, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(light.length, -light.spread * light.length)
      ctx.lineTo(light.length, light.spread * light.length)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()

    for (const layer of this.layers) {
      const offsetX = pointerOffsetX * layer.parallax * 120 + this.shake.x * layer.parallax
      const offsetY = pointerOffsetY * layer.parallax * 40 + this.shake.y * layer.parallax
      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.fillStyle = layer.color
      for (const segment of layer.segments) {
        const collapsedHeight = Math.max(16, segment.height - segment.collapseOffset)
        const topY = layer.baseY - collapsedHeight
        ctx.fillRect(segment.x, topY, segment.width, collapsedHeight)
        if (segment.collapseOffset > 6) {
          ctx.fillStyle = 'rgba(8, 9, 10, 0.6)'
          ctx.beginPath()
          ctx.moveTo(segment.x, topY)
          ctx.lineTo(segment.x + segment.width, topY + segment.collapseOffset * 0.2)
          ctx.lineTo(segment.x + segment.width, topY + 6)
          ctx.lineTo(segment.x, topY + 6)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = layer.color
        }

        ctx.fillStyle = 'rgba(28, 30, 34, 0.5)'
        for (const detail of segment.details) {
          ctx.fillRect(
            segment.x + detail.x,
            topY - detail.h,
            detail.w,
            detail.h
          )
        }
        ctx.fillStyle = layer.color

        if (segment.antennaHeight > 0) {
          ctx.strokeStyle = 'rgba(70, 80, 90, 0.5)'
          ctx.beginPath()
          ctx.moveTo(segment.x + segment.width * 0.5, topY)
          ctx.lineTo(
            segment.x + segment.width * 0.5,
            topY - segment.antennaHeight
          )
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(segment.x + segment.width * 0.5 - 6, topY - segment.antennaHeight * 0.6)
          ctx.lineTo(segment.x + segment.width * 0.5 + 6, topY - segment.antennaHeight * 0.6)
          ctx.stroke()
        }

        if (segment.width > 110) {
          ctx.strokeStyle = `rgba(40, 44, 48, ${layer.detailAlpha})`
          ctx.beginPath()
          ctx.moveTo(segment.x + segment.width * 0.2, topY)
          ctx.lineTo(segment.x + segment.width * 0.2, topY + collapsedHeight * 0.6)
          ctx.moveTo(segment.x + segment.width * 0.7, topY)
          ctx.lineTo(segment.x + segment.width * 0.7, topY + collapsedHeight * 0.5)
          ctx.stroke()
        }

        ctx.strokeStyle = `rgba(60, 70, 80, ${0.25 + Math.abs(Math.sin(time + segment.crackSeed)) * 0.2})`
        ctx.beginPath()
        ctx.moveTo(segment.x + segment.width * 0.35, topY + collapsedHeight * 0.3)
        ctx.lineTo(segment.x + segment.width * 0.4, topY + collapsedHeight * 0.7)
        ctx.stroke()
      }

      ctx.fillStyle = layer.windowColor
      for (const segment of layer.segments) {
        const collapsedHeight = Math.max(16, segment.height - segment.collapseOffset)
        const topY = layer.baseY - collapsedHeight
        for (const win of segment.windows) {
          const flicker = Math.sin(time * 0.8 + win.seed)
          if (flicker > 0.12) {
            ctx.globalAlpha = (flicker - 0.12) * 0.7
            ctx.fillRect(segment.x + win.x, topY + win.y, win.w, win.h)
          }
        }
      }
      ctx.globalAlpha = 1

      for (const segment of layer.segments) {
        if (segment.billboards.length === 0) {
          continue
        }
        const collapsedHeight = Math.max(16, segment.height - segment.collapseOffset)
        const topY = layer.baseY - collapsedHeight
        for (const board of segment.billboards) {
          const flicker = 0.6 + Math.sin(time * 2.1 + board.flickerSeed) * 0.4
          ctx.save()
          ctx.globalAlpha = 0.6
          ctx.fillStyle = 'rgba(14, 16, 18, 0.9)'
          ctx.fillRect(segment.x + board.x, topY + board.y, board.w, board.h)
          ctx.strokeStyle = 'rgba(60, 90, 110, 0.4)'
          ctx.strokeRect(segment.x + board.x, topY + board.y, board.w, board.h)
          ctx.globalCompositeOperation = 'screen'
          ctx.globalAlpha = board.glow * flicker
          ctx.fillStyle = 'rgba(120, 170, 200, 0.6)'
          ctx.fillRect(
            segment.x + board.x + 2,
            topY + board.y + 2,
            board.w - 4,
            board.h - 4
          )
          ctx.globalAlpha = 0.35 + 0.35 * flicker
          ctx.fillStyle = 'rgba(240, 240, 240, 0.45)'
          for (let i = 0; i < 3; i += 1) {
            const lineW = board.w * (0.35 + Math.sin(board.textSeed + i) * 0.2)
            ctx.fillRect(
              segment.x + board.x + 6,
              topY + board.y + 6 + i * 6,
              lineW,
              2
            )
          }
          ctx.restore()
        }
      }
      ctx.restore()
    }

    ctx.save()
    ctx.strokeStyle = 'rgba(60, 70, 80, 0.45)'
    ctx.lineWidth = 1
    for (const cable of this.cables) {
      ctx.beginPath()
      const startX = -80
      const endX = this.width + 80
      for (let x = startX; x <= endX; x += 80) {
        const t = (x - startX) / (endX - startX)
        const sag = Math.sin(Math.PI * t) * cable.sag
        const sway = Math.sin(time * cable.speed + cable.phase + t * 3) * cable.sway
        const windShift = this.wind.x * 18
        const y = cable.y + sag + sway + windShift
        if (x === startX) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const drop of this.rainDrops) {
      ctx.strokeStyle = `rgba(170, 190, 210, ${drop.alpha})`
      ctx.beginPath()
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x + this.wind.x * 14, drop.y + drop.length)
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const piece of this.driftPieces) {
      ctx.save()
      ctx.translate(piece.x, piece.y)
      ctx.rotate(piece.rot)
      ctx.fillStyle = `rgba(190, 200, 210, ${piece.alpha})`
      ctx.fillRect(-piece.size * 0.5, -piece.size * 0.2, piece.size, piece.size * 0.4)
      ctx.restore()
    }
    ctx.restore()

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
      const radius = 240
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
      const radius = 40 + progress * 240
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
    const collapsedHeight = Math.max(16, segment.height - segment.collapseOffset)
    return frontLayer.baseY - collapsedHeight
  }

  private spawnBurst(x: number, y: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const particle: Particle = {
        x: x + (this.rng() * 2 - 1) * 40,
        y: y + (this.rng() * 2 - 1) * 40,
        vx: (this.rng() * 2 - 1) * 0.9,
        vy: (this.rng() * 2 - 1) * 0.9,
        size: 1.2 + this.rng() * 1.6,
        life: 25 + this.rng() * 30,
        mode: this.rng() > 0.5 ? 'ember' : 'debris',
      }
      this.particles.push(particle)
    }
  }

  private triggerRandomCollapse() {
    const frontLayer = this.layers[this.layers.length - 1]
    if (!frontLayer) {
      return
    }
    const count = Math.min(2, frontLayer.segments.length)
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(this.rng() * frontLayer.segments.length)
      const segment = frontLayer.segments[index]
      const amount = 6 + this.rng() * 18
      segment.collapseTarget = clamp(
        segment.collapseTarget + amount,
        0,
        segment.height * 0.35
      )
    }
  }

  private triggerLocalizedCollapse(x: number, y: number, strength: number) {
    const frontLayer = this.layers[this.layers.length - 1]
    if (!frontLayer) {
      return
    }
    for (const segment of frontLayer.segments) {
      const center = segment.x + segment.width * 0.5
      const dist = Math.abs(center - x)
      if (dist < 200) {
        const boost = (1 - dist / 200) * strength * 18
        segment.collapseTarget = clamp(
          segment.collapseTarget + boost,
          0,
          segment.height * 0.4
        )
      }
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
