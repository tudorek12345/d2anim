import { Timeline } from './timeline'
import { easeOutExpo } from './easing'
import { createCard, type CardInstance } from './cards'
import { createTransitions } from './transitions'
import type { IntroBeat, IntroScript, TransitionPreset } from './types'
import type { WebGLBackground } from '../webgl/renderer'
import type { FxCanvas } from '../fx/fxCanvas'
import type { Grit2D } from '../fx/grit2d'

type DirectorOptions = {
  app: HTMLElement
  stage: HTMLElement
  ui: HTMLElement
  script: IntroScript
  webgl: WebGLBackground
  grit?: Grit2D
  fx: FxCanvas
}

export class Director {
  private app: HTMLElement
  private stage: HTMLElement
  private ui: HTMLElement
  private script: IntroScript
  private webgl: WebGLBackground
  private grit?: Grit2D
  private fx: FxCanvas
  private timeline: Timeline
  private transitions: ReturnType<typeof createTransitions>
  private currentCard: CardInstance | null = null
  private endCard: CardInstance | null = null
  private activeCards = new Map<string, CardInstance>()
  private beatIndex = -1
  private completed = false
  private manualMode = false
  private readonly entryDelayMs = 120

  constructor(options: DirectorOptions) {
    this.app = options.app
    this.stage = options.stage
    this.ui = options.ui
    this.script = options.script
    this.webgl = options.webgl
    this.grit = options.grit
    this.fx = options.fx

    this.transitions = createTransitions({
      ui: this.ui,
      webgl: this.webgl,
      onTextGlitch: (ms, strength) => {
        this.currentCard?.triggerGlitchBurst(ms, strength)
      },
      onImpact: (strength, durationMs) => {
        this.grit?.impactHit(strength, durationMs)
      },
    })

    this.timeline = this.createTimeline()
  }

  start() {
    this.completed = false
    this.manualMode = false
    this.app.removeAttribute('data-state')
    this.timeline.play()
  }

  replay() {
    this.timeline.stop()
    this.clearStage()
    this.completed = false
    this.beatIndex = -1
    this.manualMode = false
    this.app.removeAttribute('data-state')
    this.timeline = this.createTimeline()
    this.timeline.play()
  }

  skipToEnd() {
    if (this.completed) {
      return
    }
    this.timeline.stop()
    this.clearStage()
    this.finish()
  }

  seekTo(tMs: number) {
    this.timeline.stop()
    this.clearStage()
    this.completed = false
    this.beatIndex = -1
    this.manualMode = true
    this.app.removeAttribute('data-state')
    this.timeline = this.createTimeline()
    this.timeline.updateAt(tMs)
    if (tMs >= this.script.durationMs) {
      this.finish()
    }
  }

  hit(preset: TransitionPreset) {
    this.transitions.runPreset(preset)
  }

  getState() {
    const beat = this.script.beats[this.beatIndex]
    return {
      tMs: this.timeline.getTime(),
      beatIndex: this.beatIndex,
      beatId: beat?.id,
      completed: this.completed,
    }
  }

  destroy() {
    this.timeline.stop()
    this.clearStage()
  }

  private createTimeline() {
    const timeline = new Timeline({ durationMs: this.script.durationMs })
    timeline.onComplete = () => this.finish()
    this.timeline = timeline
    this.buildTimeline()
    return timeline
  }

  private buildTimeline() {
    this.script.beats.forEach((beat, index) => {
      this.timeline.schedule(beat.at, () => {
        this.beatIndex = index
        this.showBeat(beat)
      })

      if (beat.glitch) {
        beat.glitch.atOffsets.forEach((offset) => {
          this.timeline.schedule(beat.at + offset, () => {
            this.triggerGlitch(beat, beat.glitch!.ms, beat.glitch!.strength)
          })
        })
      }

      const typeDuration = this.getTypewriterDuration(beat)
      const holdMs = beat.holdMs ?? 2400
      const exitAt = beat.at + this.entryDelayMs + typeDuration + holdMs
      this.timeline.schedule(exitAt, () => {
        this.exitBeat(beat)
      })
    })
  }

  private showBeat(beat: IntroBeat) {
    const card = createCard(this.stage, {
      headline: beat.headline,
      sub: beat.sub,
    })
    this.currentCard = card
    this.activeCards.set(beat.id, card)

    if (this.manualMode) {
      card.root.style.opacity = '1'
      card.root.style.transform = 'translateY(0px)'
      card.root.style.filter = 'blur(0px)'
    } else {
      card.enter()
    }
    if (!this.manualMode && beat.transitionIn) {
      this.transitions.runPreset(beat.transitionIn)
    }

    const typeStart = beat.at + this.entryDelayMs
    const typeDuration = this.getTypewriterDuration(beat)
    this.runTypewriter(card, beat, typeStart, typeDuration)
  }

  private runTypewriter(
    card: CardInstance,
    beat: IntroBeat,
    startMs: number,
    durationMs: number
  ) {
    const config = beat.typewriter ?? { cps: 18, flicker: 0.2, scanline: false }
    const totalChars = beat.headline.length

    card.root.classList.toggle('scanline', config.scanline)
    card.setHeadlineText('')

    this.timeline.tween(
      startMs,
      startMs + durationMs,
      (progress, tMs) => {
        const count = Math.max(0, Math.floor(totalChars * progress))
        card.setHeadlineText(beat.headline.slice(0, count))
        if (config.flicker > 0) {
          const flicker = 1 - config.flicker * 0.4 * Math.abs(Math.sin(tMs * 0.02))
          card.setHeadlineOpacity(flicker)
        }
      },
      easeOutExpo
    )

    return durationMs
  }

  private triggerGlitch(beat: IntroBeat, ms: number, strength: number) {
    if (this.manualMode) {
      return
    }
    this.webgl.burstGlitch(strength, ms)
    const card = this.activeCards.get(beat.id) ?? this.currentCard
    card?.triggerGlitchBurst(ms, strength)
  }

  private exitBeat(beat: IntroBeat) {
    const card = this.activeCards.get(beat.id)
    if (!card) {
      return
    }
    if (this.manualMode) {
      card.destroy()
    } else {
      const anim = card.exit()
      anim.finished
        .then(() => {
          card.destroy()
        })
        .catch(() => {
          card.destroy()
        })
    }
    if (this.currentCard === card) {
      this.currentCard = null
    }
    this.activeCards.delete(beat.id)
    if (!this.manualMode && beat.transitionOut) {
      this.transitions.runPreset(beat.transitionOut)
    }
  }

  private getTypewriterDuration(beat: IntroBeat) {
    const config = beat.typewriter ?? { cps: 18, flicker: 0.2, scanline: false }
    const totalChars = beat.headline.length
    return Math.max(400, (totalChars / config.cps) * 1000)
  }

  private finish() {
    this.completed = true
    this.app.dataset.state = 'completed'
    this.showEndCard()
  }

  private showEndCard() {
    if (this.endCard) {
      return
    }
    const card = createCard(this.stage, {
      headline: 'END',
      sub: 'Press any key',
    })
    card.root.classList.add('end-card')
    card.setHeadlineText('END')
    if (this.manualMode) {
      card.root.style.opacity = '1'
      card.root.style.transform = 'translateY(0px)'
      card.root.style.filter = 'blur(0px)'
    } else {
      card.enter()
    }
    this.endCard = card
  }

  private clearStage() {
    this.currentCard?.cancelAnimations()
    this.currentCard?.destroy()
    this.currentCard = null
    this.activeCards.forEach((card) => card.destroy())
    this.activeCards.clear()
    this.endCard?.destroy()
    this.endCard = null
    this.stage.innerHTML = ''
  }
}
