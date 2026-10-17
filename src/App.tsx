import { useMemo, useRef, useState } from 'react'
import { Dex } from '@pkmn/dex'
import { startBattle } from './battle'
import { getDailyTeam, todayKey } from './daily'

const dex = Dex.forGen(4)
const SHOW = ['|move|', '|switch|', '|faint|', '|turn|', '|win|', '|-supereffective|', '|-resisted|', '|-immune|']

export default function App() {
  const dayKey = todayKey()
  const dailyTeam = useMemo(() => getDailyTeam(dayKey), [dayKey])

  const [log, setLog] = useState<string[]>([])
  const [request, setRequest] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const choose = useRef<(c: string) => void>(() => {})

  function start(leadIndex: number) {
    const ordered = [dailyTeam[leadIndex], ...dailyTeam.filter((_, j) => j !== leadIndex)]
    setLog([])
    setRequest(null)
    setRunning(true)
    const battle = startBattle(
      ordered,
      (line) => {
        if (SHOW.some((s) => line.startsWith(s))) {
          setLog((prev) => [...prev, line.slice(1).split('|').join(' · ')])
        }
      },
      (req) => setRequest(req),
      () => {
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

  const team: any[] = request?.side?.pokemon ?? []
  const moves: any[] = !request?.forceSwitch ? request?.active?.[0]?.moves ?? [] : []

  return (
    <div style={{ padding: 24, textAlign: 'left' }}>
      <h1>Daily Cynthia</h1>
      <p>Team for {dayKey}</p>

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
    </div>
  )
}