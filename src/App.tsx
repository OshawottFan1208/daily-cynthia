import { useMemo, useRef, useState } from 'react'
import { Dex } from '@pkmn/dex'
import { startBattle } from './battle'
import { getDailyTeam, todayKey } from './daily'
import { computeStats, loadSave, shareText, writeSave } from './storage'
import type { DayResult, Save } from './storage'

const dex = Dex.forGen(4)
const SHOW = ['|move|', '|switch|', '|faint|', '|turn|', '|win|', '|-supereffective|', '|-resisted|', '|-immune|']

export default function App() {
  const dayKey = todayKey()
  const dailyTeam = useMemo(() => getDailyTeam(dayKey), [dayKey])

  const [save, setSave] = useState<Save>(() => {
    const s = loadSave()
    if (s.started) {
      // Left an official battle unfinished: counts as a forfeited loss
      if (!s.history[s.started]) {
        s.history[s.started] = { won: false, turns: 0, myFaints: 6, herFaints: 0 }
      }
      s.started = null
      writeSave(s)
    }
    return s
  })
  const [log, setLog] = useState<string[]>([])
  const [request, setRequest] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [official, setOfficial] = useState(false)
  const [last, setLast] = useState<DayResult | null>(null)
  const [copied, setCopied] = useState(false)
  const choose = useRef<(c: string) => void>(() => {})
  const tally = useRef({ turns: 0, myFaints: 0, herFaints: 0, winner: '' })

  function start(leadIndex: number) {
    const isOfficial = !save.history[dayKey]
    const ordered = [dailyTeam[leadIndex], ...dailyTeam.filter((_, j) => j !== leadIndex)]

    if (isOfficial) {
      const next: Save = { ...save, started: dayKey }
      writeSave(next)
      setSave(next)
    }
    tally.current = { turns: 0, myFaints: 0, herFaints: 0, winner: '' }
    setOfficial(isOfficial)
    setLast(null)
    setLog([])
    setRequest(null)
    setRunning(true)

    const battle = startBattle(
      ordered,
      (line) => {
        const t = tally.current
        if (line.startsWith('|turn|')) t.turns = Number(line.split('|')[2])
        else if (line.startsWith('|faint|p1a')) t.myFaints++
        else if (line.startsWith('|faint|p2a')) t.herFaints++
        else if (line.startsWith('|win|')) t.winner = line.split('|')[2]

        if (SHOW.some((s) => line.startsWith(s))) {
          setLog((prev) => [...prev, line.slice(1).split('|').join(' · ')])
        }
      },
      (req) => setRequest(req),
      () => {
        const t = tally.current
        const result: DayResult = {
          won: t.winner === 'You',
          turns: t.turns,
          myFaints: t.myFaints,
          herFaints: t.herFaints,
        }
        setLast(result)
        if (isOfficial) {
          setSave((prev) => {
            const next: Save = { started: null, history: { ...prev.history, [dayKey]: result } }
            writeSave(next)
            return next
          })
        }
        setRunning(false)
        setRequest(null)
      }
    )
    choose.current = battle.choose
  }

  function pick(choice: string) {
    setRequest(null)
    choose.current(choice)
  }

  async function copyResult() {
    const r = save.history[dayKey]
    if (!r) return
    try {
      await navigator.clipboard.writeText(shareText(dayKey, r))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked
    }
  }

  function resetAll() {
    const fresh: Save = { history: {}, started: null }
    writeSave(fresh)
    setSave(fresh)
    setLast(null)
    setLog([])
  }

  const stats = computeStats(save.history, dayKey)
  const todayResult = save.history[dayKey]
  const team: any[] = request?.side?.pokemon ?? []
  const moves: any[] = !request?.forceSwitch ? request?.active?.[0]?.moves ?? [] : []

  return (
    <div style={{ padding: 24, textAlign: 'left' }}>
      <h1>Daily Cynthia</h1>
      <p>Team for {dayKey}</p>

      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div><strong>{stats.played}</strong> played</div>
        <div><strong>{stats.winPct}%</strong> win</div>
        <div><strong>{stats.winStreak}</strong> win streak</div>
        <div><strong>{stats.dayStreak}</strong> day streak</div>
      </div>

      {running ? (
        <p><strong>{official ? 'OFFICIAL BATTLE' : 'PRACTICE RUN'}</strong></p>
      ) : todayResult ? (
        <div style={{ marginBottom: 12 }}>
          <p>Today's official battle is done. Practice runs below don't count.</p>
          <pre>{shareText(dayKey, todayResult)}</pre>
          <button onClick={copyResult}>{copied ? 'Copied!' : 'Copy result'}</button>
        </div>
      ) : (
        <p>Your official battle for today is ready. Pick a lead to begin. Leaving mid-battle counts as a loss.</p>
      )}

      {last && !official && (
        <p>Practice result: {last.won ? 'You won' : 'Cynthia won'} in {last.turns} turns.</p>
      )}

      {!running && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {dailyTeam.map((s: any, i: number) => {
            const species = dex.species.get(s.species || s.name)
            return (
              <div key={i} style={{ border: '1px solid #888', borderRadius: 8, padding: 12 }}>
                <strong>{species.name}</strong> ({species.types.join('/')})
                <div>Ability: {s.ability}</div>
                <div>Item: {s.item || 'none'}</div>
                <div>{s.moves.map((m: string) => dex.moves.get(m).name).join(', ')}</div>
                <button style={{ marginTop: 8 }} onClick={() => start(i)}>
                  Lead with {species.name}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {request && (
        <div style={{ marginTop: 16 }}>
          <h3>{request.forceSwitch ? 'Choose your next Pokémon' : 'Choose a move'}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {moves.map((m, i) => (
              <button key={i} disabled={m.disabled} onClick={() => pick(`move ${i + 1}`)}>
                {m.move}
              </button>
            ))}
          </div>
          <h4>Your team</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {team.map((p, i) => {
              const fainted = p.condition.endsWith(' fnt')
              return (
                <button key={i} disabled={p.active || fainted} onClick={() => pick(`switch ${i + 1}`)}>
                  {p.details.split(',')[0]} ({fainted ? 'fainted' : p.condition})
                </button>
              )
            })}
          </div>
        </div>
      )}

      <pre style={{ marginTop: 16 }}>{log.join('\n')}</pre>

      {!running && (
        <button style={{ marginTop: 24 }} onClick={resetAll}>
          Reset all stats (testing only)
        </button>
      )}
    </div>
  )
}