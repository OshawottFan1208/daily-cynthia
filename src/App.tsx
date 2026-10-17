import { useEffect, useMemo, useRef, useState } from 'react'
import { Dex } from '@pkmn/dex'
import { CYNTHIA, startBattle } from './battle'
import { applyLine, describeLine, emptyView, parseHp, typeColor } from './battleView'
import type { View } from './battleView'
import { getDailyTeam, todayKey } from './daily'
import { computeStats, loadSave, shareText, writeSave } from './storage'
import type { DayResult, Save } from './storage'
import { HpBar, Sprite, TypeBadge } from './ui'

const dex = Dex.forGen(4)

function Panel({ mon, showNumbers }: { mon: View['p1']; showNumbers?: boolean }) {
  if (!mon) return <div className="panel">&nbsp;</div>
  return (
    <div className="panel">
      <div className="panel-top">
        <strong>{mon.species}</strong>
        <span>Lv100</span>
      </div>
      <HpBar hp={mon.hp} maxHp={mon.maxHp} />
      <div className="panel-bottom">
        <span>{mon.status && <span className="status">{mon.status.toUpperCase()}</span>}</span>
        {showNumbers && (
          <span>
            {mon.hp}/{mon.maxHp}
          </span>
        )}
      </div>
    </div>
  )
}

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
  const [view, setView] = useState<View>(emptyView)
  const [messages, setMessages] = useState<string[]>([])
  const [request, setRequest] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [official, setOfficial] = useState(false)
  const [last, setLast] = useState<DayResult | null>(null)
  const [copied, setCopied] = useState(false)
  const choose = useRef<(c: string) => void>(() => {})
  const tally = useRef({ turns: 0, myFaints: 0, herFaints: 0, winner: '' })
  const msgBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (msgBox.current) msgBox.current.scrollTop = msgBox.current.scrollHeight
  }, [messages])

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
    setView(emptyView)
    setMessages([])
    setRequest(null)
    setFinished(false)
    setRunning(true)

    const battle = startBattle(
      ordered,
      (line) => {
        const t = tally.current
        if (line.startsWith('|turn|')) t.turns = Number(line.split('|')[2])
        else if (line.startsWith('|faint|p1a')) t.myFaints++
        else if (line.startsWith('|faint|p2a')) t.herFaints++
        else if (line.startsWith('|win|')) t.winner = line.split('|')[2]

        setView((prev) => applyLine(prev, line))
        const text = describeLine(line)
        if (text) setMessages((prev) => [...prev, text])
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
        setFinished(true)
        setRequest(null)
      }
    )
    choose.current = battle.choose
  }

  function pick(choice: string) {
    setRequest(null)
    choose.current(choice)
  }

  function backToTeam() {
    setFinished(false)
    setView(emptyView)
    setMessages([])
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
    setMessages([])
  }

  const stats = computeStats(save.history, dayKey)
  const todayResult = save.history[dayKey]
  const team: any[] = request?.side?.pokemon ?? []
  const moves: any[] = !request?.forceSwitch ? request?.active?.[0]?.moves ?? [] : []
  const showArena = running || finished

  return (
    <div>
      <h1>Daily Cynthia</h1>
      <div className="date">Team for {dayKey}</div>

      <div className="stats">
        <div className="stat"><strong>{stats.played}</strong>Played</div>
        <div className="stat"><strong>{stats.winPct}%</strong>Win</div>
        <div className="stat"><strong>{stats.winStreak}</strong>Win streak</div>
        <div className="stat"><strong>{stats.dayStreak}</strong>Day streak</div>
      </div>

      <div className="strip">
        <span className="label">Cynthia's team</span>
        {CYNTHIA.map((m) => (
          <div key={m.name} className={view.p2Fainted.includes(m.name) ? 'fainted' : ''} title={m.name}>
            <Sprite species={m.name} className="mini" />
          </div>
        ))}
      </div>

      {running && (
        <p>
          <strong>{official ? 'OFFICIAL BATTLE' : 'PRACTICE RUN'}</strong>
        </p>
      )}

      {!running && todayResult && (
        <div className="result">
          <div>Today's official battle is done. Practice runs don't count.</div>
          <pre>{shareText(dayKey, todayResult)}</pre>
          <button onClick={copyResult}>{copied ? 'Copied!' : 'Copy result'}</button>
        </div>
      )}
      {!running && !todayResult && !finished && (
        <p className="hint">
          Your official battle for today is ready. Pick a lead to begin. Leaving mid-battle counts as a loss.
        </p>
      )}

      {showArena && (
        <>
          <div className="arena">
            <div className="foe-panel"><Panel mon={view.p2} /></div>
            <div className="foe-sprite">{view.p2 && <Sprite species={view.p2.species} />}</div>
            <div className="you-sprite">{view.p1 && <Sprite species={view.p1.species} back />}</div>
            <div className="you-panel"><Panel mon={view.p1} showNumbers /></div>
          </div>

          <div className="messages" ref={msgBox}>
            {messages.map((m, i) => (
              <p key={i} className={m.startsWith('—') ? 'turn' : ''}>{m}</p>
            ))}
          </div>

          {request && (
            <div className="commands">
              <h3>{request.forceSwitch ? 'Choose your next Pokémon' : 'Choose a move'}</h3>
              {moves.length > 0 && (
                <div className="moves">
                  {moves.map((m, i) => {
                    const type = dex.moves.get(m.id).type
                    return (
                      <button
                        key={i}
                        className="move"
                        style={{ background: typeColor(type) }}
                        disabled={m.disabled}
                        onClick={() => pick(`move ${i + 1}`)}
                      >
                        <span>{m.move}</span>
                        <small>{type}{m.maxpp ? ` · ${m.pp}/${m.maxpp}` : ''}</small>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="switches">
                {team.map((p, i) => {
                  const species = p.details.split(',')[0]
                  const c = parseHp(p.condition, 1)
                  const fainted = p.condition.endsWith(' fnt')
                  return (
                    <button
                      key={i}
                      className="switch"
                      disabled={p.active || fainted}
                      onClick={() => pick(`switch ${i + 1}`)}
                    >
                      <Sprite species={species} className="icon" />
                      <span>{species}</span>
                      <HpBar hp={c.hp} maxHp={c.maxHp} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {finished && (
            <div className="result">
              <div>
                {official ? 'Official battle' : 'Practice run'}: {last?.won ? 'You won!' : 'Cynthia won.'}
              </div>
              <button style={{ marginTop: 8 }} onClick={backToTeam}>
                Back to team
              </button>
            </div>
          )}
        </>
      )}

      {!showArena && (
        <div className="cards">
          {dailyTeam.map((s: any, i: number) => {
            const species = dex.species.get(s.species || s.name)
            return (
              <div key={i} className="card">
                <div className="card-head">
                  <Sprite species={species.name} />
                  <div>
                    <strong>{species.name}</strong>
                    <div>{species.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                  </div>
                </div>
                <div className="card-meta">
                  {s.ability} · {s.item || 'No item'}
                </div>
                <div className="chips">
                  {s.moves.map((id: string) => {
                    const mv = dex.moves.get(id)
                    return (
                      <span key={id} className="chip" style={{ background: typeColor(mv.type) }}>
                        {mv.name}
                      </span>
                    )
                  })}
                </div>
                <button onClick={() => start(i)}>Lead with {species.name}</button>
              </div>
            )
          })}
        </div>
      )}

      {!running && (
        <button style={{ marginTop: 24 }} onClick={resetAll}>
          Reset all stats (testing only)
        </button>
      )}
    </div>
  )
}