// Plays battle lines back one at a time with short pauses
const DELAYS: Record<string, number> = {
  switch: 800, drag: 800, move: 750, faint: 950,
  '-damage': 650, '-heal': 500, '-supereffective': 600, '-resisted': 600,
  '-immune': 600, '-crit': 600, '-miss': 600, '-fail': 600,
  '-status': 600, '-boost': 500, '-unboost': 500, turn: 250, win: 500,
}

export type Playback = {
  push: (line: string) => void
  whenIdle: (fn: () => void) => void
  setSpeed: (mult: number) => void
  stop: () => void
}

export function createPlayback(onLine: (line: string) => void): Playback {
  const queue: string[] = []
  const waiting: Array<() => void> = []
  let busy = false
  let stopped = false
  let speed = 1

  const pump = () => {
    if (busy || stopped) return
    while (queue.length) {
      const line = queue.shift() as string
      onLine(line)
      const ms = (DELAYS[line.split('|')[1]] ?? 0) * speed
      if (ms > 0) {
        busy = true
        setTimeout(() => {
          busy = false
          pump()
        }, ms)
        return
      }
    }
    while (waiting.length) (waiting.shift() as () => void)()
  }

  return {
    push(line) {
      if (stopped) return
      queue.push(line)
      pump()
    },
    whenIdle(fn) {
      if (stopped) return
      if (!busy && queue.length === 0) fn()
      else waiting.push(fn)
    },
    setSpeed(mult) {
      speed = mult
    },
    stop() {
      stopped = true
      queue.length = 0
      waiting.length = 0
    },
  }
}