import { linear } from './easing'

type ScheduleEvent = {
  atMs: number
  fn: () => void
  called: boolean
  order: number
}

type TweenEvent = {
  fromMs: number
  toMs: number
  update: (progress: number, tMs: number) => void
  easing: (t: number) => number
  done: boolean
  order: number
}

export class Timeline {
  private events: ScheduleEvent[] = []
  private tweens: TweenEvent[] = []
  private rafId = 0
  private orderCounter = 0
  private running = false
  private paused = false
  private completed = false
  private startStamp = 0
  private pauseStamp = 0
  private t = 0

  readonly durationMs: number
  onComplete?: () => void

  constructor(options: { durationMs: number }) {
    this.durationMs = options.durationMs
  }

  schedule(atMs: number, fn: () => void) {
    const event: ScheduleEvent = {
      atMs,
      fn,
      called: false,
      order: this.orderCounter++,
    }
    this.events.push(event)
    this.events.sort((a, b) => (a.atMs - b.atMs) || (a.order - b.order))
  }

  tween(
    fromMs: number,
    toMs: number,
    update: (progress: number, tMs: number) => void,
    easing: (t: number) => number = linear
  ) {
    const tween: TweenEvent = {
      fromMs,
      toMs,
      update,
      easing,
      done: false,
      order: this.orderCounter++,
    }
    this.tweens.push(tween)
    this.tweens.sort((a, b) => (a.fromMs - b.fromMs) || (a.order - b.order))
  }

  play(startAtMs: number = performance.now()) {
    this.stop()
    this.reset()
    this.running = true
    this.completed = false
    this.startStamp = startAtMs
    this.loop()
  }

  pause(nowMs: number = performance.now()) {
    if (!this.running || this.paused) {
      return
    }
    this.paused = true
    this.pauseStamp = nowMs
    cancelAnimationFrame(this.rafId)
  }

  resume(nowMs: number = performance.now()) {
    if (!this.running || !this.paused) {
      return
    }
    this.paused = false
    this.startStamp += nowMs - this.pauseStamp
    this.loop()
  }

  stop() {
    this.running = false
    this.paused = false
    cancelAnimationFrame(this.rafId)
  }

  skipToEnd() {
    this.updateAt(this.durationMs, true)
    this.complete()
  }

  updateFromNow(nowMs: number) {
    if (!this.running || this.paused) {
      return
    }
    const nextT = nowMs - this.startStamp
    this.updateAt(nextT)
    if (this.durationMs && nextT >= this.durationMs) {
      this.complete()
    }
  }

  updateAt(tMs: number, force = false) {
    this.t = Math.max(0, tMs)

    for (const event of this.events) {
      if (!event.called && (force || event.atMs <= this.t)) {
        event.called = true
        event.fn()
      }
    }

    for (const tween of this.tweens) {
      if (tween.done) {
        continue
      }
      if (force || this.t >= tween.fromMs) {
        const span = tween.toMs - tween.fromMs
        const rawProgress = span <= 0 ? 1 : (this.t - tween.fromMs) / span
        const clamped = Math.min(Math.max(rawProgress, 0), 1)
        tween.update(tween.easing(clamped), this.t)
        if (force || clamped >= 1) {
          tween.done = true
        }
      }
    }
  }

  getTime() {
    return this.t
  }

  getState() {
    return {
      running: this.running,
      paused: this.paused,
      completed: this.completed,
      t: this.t,
    }
  }

  reset() {
    this.t = 0
    this.events.forEach((event) => (event.called = false))
    this.tweens.forEach((tween) => (tween.done = false))
  }

  private loop = () => {
    if (!this.running || this.paused) {
      return
    }
    this.rafId = requestAnimationFrame((now) => {
      this.updateFromNow(now)
      if (this.running && !this.paused) {
        this.loop()
      }
    })
  }

  private complete() {
    if (this.completed) {
      return
    }
    this.completed = true
    this.running = false
    this.paused = false
    cancelAnimationFrame(this.rafId)
    this.onComplete?.()
  }
}
