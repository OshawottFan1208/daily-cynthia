const KEY = 'daily-cynthia-v1'

export type DayResult = { won: boolean; turns: number; myFaints: number; herFaints: number }
export type Save = {
  history: Record<string, DayResult>
  started: string | null // day of an official battle in progress
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { history: {}, started: null, ...JSON.parse(raw) }
  } catch {
    // storage unavailable or corrupted: start fresh
  }
  return { history: {}, started: null }
}

export function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // storage unavailable: ignore
  }
}

function fmt(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function computeStats(history: Record<string, DayResult>, today: string) {
  const days = Object.keys(history).sort()
  const played = days.length
  const wins = days.filter((d) => history[d].won).length

  let winStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (history[days[i]].won) winStreak++
    else break
  }

  let dayStreak = 0
  const cursor = new Date(`${today}T00:00:00`)
  if (!history[today]) cursor.setDate(cursor.getDate() - 1)
  while (history[fmt(cursor)]) {
    dayStreak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { played, winPct: played ? Math.round((wins / played) * 100) : 0, winStreak, dayStreak }
}

export function shareText(day: string, r: DayResult) {
  const mine = '🟩'.repeat(6 - r.myFaints) + '⬛'.repeat(r.myFaints)
  const hers = '🟥'.repeat(6 - r.herFaints) + '⬛'.repeat(r.herFaints)
  const summary = r.turns === 0 ? 'Forfeited' : `${r.turns} turns`
  return `Daily Cynthia ${day} ${r.won ? '🏆' : '💀'}\n${summary}\nYou     ${mine}\nCynthia ${hers}`
}