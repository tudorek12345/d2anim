export type TransitionPreset = 'soft' | 'hard'

export type TypewriterConfig = {
  cps: number
  flicker: number
  scanline: boolean
}

export type GlitchConfig = {
  atOffsets: number[]
  strength: number
  ms: number
}

export type IntroBeat = {
  id: string
  at: number
  headline: string
  sub?: string
  typewriter?: TypewriterConfig
  glitch?: GlitchConfig
  transitionIn?: TransitionPreset
  holdMs?: number
  transitionOut?: TransitionPreset
}

export type IntroMarker = {
  name: string
  at: number
}

export type IntroScript = {
  durationMs: number
  markers: IntroMarker[]
  beats: IntroBeat[]
}
