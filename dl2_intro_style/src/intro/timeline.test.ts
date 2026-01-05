import { describe, expect, it } from 'vitest'
import { Timeline } from './timeline'

describe('Timeline', () => {
  it('executes callbacks in time order', () => {
    const calls: number[] = []
    const timeline = new Timeline({ durationMs: 1000 })

    timeline.schedule(400, () => calls.push(400))
    timeline.schedule(200, () => calls.push(200))
    timeline.schedule(600, () => calls.push(600))

    timeline.updateAt(150)
    expect(calls).toEqual([])
    timeline.updateAt(250)
    expect(calls).toEqual([200])
    timeline.updateAt(450)
    expect(calls).toEqual([200, 400])
    timeline.updateAt(700)
    expect(calls).toEqual([200, 400, 600])
  })

  it('skipToEnd sets completed and flushes events', () => {
    const calls: number[] = []
    const timeline = new Timeline({ durationMs: 1000 })

    timeline.schedule(200, () => calls.push(1))
    timeline.schedule(800, () => calls.push(2))
    timeline.skipToEnd()

    expect(calls).toEqual([1, 2])
    expect(timeline.getState().completed).toBe(true)
  })

  it('pause/resume preserves durations', () => {
    const timeline = new Timeline({ durationMs: 1000 })

    timeline.play(0)
    timeline.updateFromNow(300)
    expect(Math.round(timeline.getTime())).toBe(300)

    timeline.pause(300)
    timeline.resume(800)
    timeline.updateFromNow(900)
    expect(Math.round(timeline.getTime())).toBe(400)
  })
})
