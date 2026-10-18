import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dex } from '@pkmn/dex'
import { CYNTHIA, startBattle } from './battle'
import { applyLine, describeLine, emptyView, parseHp, typeColor } from './battleView'
import type { View } from './battleView'
import { getDailyTeam, todayKey } from './daily'
import { createPlayback } from './playback'
import type { Playback } from './playback'
import { computeStats, loadSave, shareText, writeSave } from './storage'
import type { DayResult, Save } from './storage'
import { HpBar, Sprite, TypeBadge } from './ui'

const dex = Dex.forGen(4)

const SPEEDS = { Normal: 1, Fast: 0.35, Instant: 0 } as const
type SpeedName = keyof typeof SPEEDS

const STATUS_LABEL: Record<string, string> = {
  par: 'Paralyzed',
  psn: 'Poisoned',
  tox: 'Badly poisoned',
  brn: 'Burned',
  slp: 'Asleep',
  frz: 'Frozen',
}

function Panel({ mon, showNumbers }: { mon: View['p1']; showNumbers?: boolean }) {
  if (!mon) return <div className="panel">&nbsp;</div>
  return (
    <div className="panel">
      <div className="panel-top">
        <strong>{mon.species}</strong>
        <span>Lv100</span>
      </div>
      <div className="hp-row">
        <span className="hp-label">HP</span>
        <HpBar hp={mon.hp} maxHp={mon.maxHp} />
      </div>
      <div className="panel-bottom">
        <span>
          {mon.status && (
            <span className={`status status-${mon.status}`}>{STATUS_LABEL[mon.status] ?? mon.status.toUpperCase()}</span>
          )}
        </span>
        {showNumbers && (
          <span>
            {mon.hp}/{mon.maxHp}
          </span>
        )}
      </div>
    </div>
  )
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Flash and shake the sprite standing on this stand
function playHit(stand: HTMLElement | null) {
  const sprite = stand?.querySelector('.sprite')
  if (!sprite || reduceMotion()) return
  sprite.animate(
    [
      { translate: '-50% 0', filter: 'brightness(1)' },
      { translate: 'calc(-50% - 10px) 0', filter: 'brightness(3) saturate(0)', offset: 0.15 },
      { translate: 'calc(-50% + 8px) 0', filter: 'brightness(1)', offset: 0.35 },
      { translate: 'calc(-50% - 6px) 0', filter: 'brightness(2) saturate(0)', offset: 0.55 },
      { translate: 'calc(-50% + 3px) 0', filter: 'brightness(1)', offset: 0.8 },
      { translate: '-50% 0', filter: 'brightness(1)' },
    ],
    { duration: 420, easing: 'ease-out' }
  )
}

// Sink and fade the sprite when it faints (it stays hidden until the next Pokémon replaces it)
function playFaint(stand: HTMLElement | null) {
  const sprite = stand?.querySelector('.sprite')
  if (!sprite || reduceMotion()) return
  sprite.animate(
    [
      { translate: '-50% 0', opacity: 1 },
      { translate: '-50% 35%', opacity: 0 },
    ],
    { duration: 650, easing: 'ease-in', fill: 'forwards' }
  )
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 20) / 10,
  duration: 2.4 + ((i * 29) % 15) / 10,
  color: ['#e5c76b', '#a78bfa', '#38bdf8', '#f472b6'][i % 4],
}))

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </div>
  )
}

function msUntilMidnight() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}

function Countdown({ onNewDay }: { onNewDay: () => void }) {
  const [left, setLeft] = useState(msUntilMidnight)
  useEffect(() => {
    let prev = msUntilMidnight()
    const id = setInterval(() => {
      const ms = msUntilMidnight()
      setLeft(ms)
      if (ms > prev) onNewDay() // the clock rolled past midnight
      prev = ms
    }, 1000)
    return () => clearInterval(id)
  }, [onNewDay])
  const s = Math.floor(left / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span>
      Next team in {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
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
  const [speed, setSpeed] = useState<SpeedName>('Normal')
  const choose = useRef<(c: string) => void>(() => {})
  const playback = useRef<Playback | null>(null)
  const tally = useRef({ turns: 0, myFaints: 0, herFaints: 0, winner: '' })
  const msgBox = useRef<HTMLDivElement>(null)
  const foeStand = useRef<HTMLDivElement>(null)
  const youStand = useRef<HTMLDivElement>(null)
  const [intro, setIntro] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [, setTick] = useState(0)
  const bumpDay = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (msgBox.current) msgBox.current.scrollTop = msgBox.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!(running && official)) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running, official])

  function changeSpeed(name: SpeedName) {
    setSpeed(name)
    playback.current?.setSpeed(SPEEDS[name])
  }

  function start(leadIndex: number) {
    playback.current?.stop()
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
    setShowEnd(false)
    setIntro(false)
    setRunning(true)

    // Lines are queued and played back one at a time
    const pb = createPlayback((line) => {
      const t = tally.current
      if (line.startsWith('|turn|')) t.turns = Number(line.split('|')[2])
      else if (line.startsWith('|faint|p1a')) t.myFaints++
      else if (line.startsWith('|faint|p2a')) t.herFaints++
      else if (line.startsWith('|win|')) t.winner = line.split('|')[2]

      if (line.startsWith('|intro|')) setIntro(true)
      else if (line.startsWith('|-damage|') && !line.includes('[from]')) {
        playHit(line.split('|')[2].startsWith('p1') ? youStand.current : foeStand.current)
      } else if (line.startsWith('|faint|')) {
        playFaint(line.split('|')[2].startsWith('p1') ? youStand.current : foeStand.current)
      }

      setView((prev) => applyLine(prev, line))
      const text = describeLine(line)
      if (text) setMessages((prev) => [...prev, text])
    })
    pb.setSpeed(SPEEDS[speed])
    playback.current = pb
    if (speed === 'Normal') pb.push('|intro|') // "Cynthia wants to battle!" banner

    const battle = startBattle(
      ordered,
      (line) => pb.push(line),
      (req) => {
        // wait a tick so this turn's log lines are queued first, then wait for them to finish playing
        setTimeout(() => pb.whenIdle(() => setRequest(req)), 0)
      },
      () => {
        pb.whenIdle(() => {
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
          setShowEnd(true)
          setRequest(null)
        })
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
    setShowEnd(false)
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
      <a
        className="lab-banner"
        href="https://oshawatts-pokemon-lab.oshawattjj.workers.dev"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>
          More Pokémon projects at <strong>Oshawatt's Pokémon Lab</strong>
        </span>
        <span className="arrow">Visit the Lab ↗</span>
      </a>
      <h1>Daily Cynthia</h1>
      <div className="date">
        Team for {dayKey} · <Countdown onNewDay={bumpDay} />
      </div>

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

      <div className="toolbar">
        {running ? <strong>{official ? 'OFFICIAL BATTLE' : 'PRACTICE RUN'}</strong> : <span />}
        <label className="speed">
          Battle speed{' '}
          <select value={speed} onChange={(e) => changeSpeed(e.target.value as SpeedName)}>
            {Object.keys(SPEEDS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>

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
            <div className="stars" />
            <div className="beam" />
            <div className="floor" />
            <div className="champ-tag">Sinnoh Champion · Cynthia</div>
            <div className="foe-panel"><Panel mon={view.p2} /></div>
            <div ref={foeStand} className={`stand foe-stand${view.p2?.status ? ` st-${view.p2.status}` : ''}`}>
              <div className="platform" />
              {view.p2 && <Sprite key={view.p2.species} species={view.p2.species} px="0.3cqw" />}
            </div>
            <div ref={youStand} className={`stand you-stand${view.p1?.status ? ` st-${view.p1.status}` : ''}`}>
              <div className="platform" />
              {view.p1 && <Sprite key={view.p1.species} species={view.p1.species} back px="0.46cqw" />}
            </div>
            <div className="you-panel"><Panel mon={view.p1} showNumbers /></div>

            {intro && (
              <div
                className="intro-card"
                onAnimationEnd={(e) => {
                  if (e.target === e.currentTarget) setIntro(false)
                }}
              >
                <div className="intro-kicker">Sinnoh Champion</div>
                <div className="intro-name">Cynthia</div>
                <div className="intro-sub">wants to battle!</div>
              </div>
            )}

            {finished && showEnd && last && (
              <div className={`end-card ${last.won ? 'victory' : 'defeat'}`}>
                {last.won && <Confetti />}
                <div className="end-kicker">{official ? 'Official battle' : 'Practice run'}</div>
                <div className="end-title">{last.won ? 'Victory!' : 'Defeated'}</div>
                <div className="end-sub">
                  {last.won
                    ? `You beat Cynthia in ${last.turns} turns with ${6 - last.myFaints} of your Pokémon still standing.`
                    : `Cynthia wins this round. You knocked out ${last.herFaints} of her 6 Pokémon.`}
                </div>
                <div className="end-actions">
                  {official && todayResult && (
                    <button onClick={copyResult}>{copied ? 'Copied!' : 'Copy result'}</button>
                  )}
                  <button onClick={backToTeam}>Back to team</button>
                  <button onClick={() => setShowEnd(false)}>View board</button>
                </div>
              </div>
            )}
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

          {finished && !showEnd && (
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

      {import.meta.env.DEV && !running && (
        <button style={{ marginTop: 24 }} onClick={resetAll}>
          Reset all stats (testing only)
        </button>
      )}

      <details className="info">
        <summary>How to play</summary>
        <ol>
          <li>Every day, everyone gets the same six random level 100 Pokémon (Generations 1-4).</li>
          <li>Pick which one leads, then battle Cynthia, the Sinnoh Champion. Her team never changes.</li>
          <li>You get one official battle a day. Leaving mid-battle counts as a loss. After that, practice runs are unlimited.</li>
          <li>Copy your spoiler-free result and share it. Wins and streaks are saved in your browser on this device.</li>
        </ol>
      </details>

      <footer className="footer">
        Daily Cynthia is a free, unofficial fan project inspired by Daily Red by amoi.builds. It is not affiliated
        with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company. Pokémon, Pokémon
        character names and sprites are © Nintendo, Creatures Inc. and GAME FREAK inc. Battles run on the Pokémon
        Showdown simulator.
      </footer>
    </div>
  )
}