import { BattleStreams, Teams } from '@pkmn/sim'
import { CYNTHIA, cynthiaPlayer, pack } from '../src/battle'
import { getDailyTeam } from '../src/daily'

const DAYS = Number(process.argv[2]) || 200
const MAX_TURNS = 150

type Outcome = { won: boolean; tie: boolean; turns: number }

async function playBattle(team: any[], seed: number[]): Promise<Outcome> {
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream())
  const botAbilities = Object.fromEntries(team.map((s: any) => [s.species || s.name, s.ability]))
  const herAbilities = Object.fromEntries(CYNTHIA.map((m) => [m.name, m.ability]))

  // The bot plays your side using the same logic as Cynthia
  cynthiaPlayer(streams.p1, herAbilities, 'p2').catch(() => {})
  cynthiaPlayer(streams.p2, botAbilities, 'p1').catch(() => {})

  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: 'gen4customgame', seed })}\n` +
      `>player p1 ${JSON.stringify({ name: 'You', team: Teams.pack(team) })}\n` +
      `>player p2 ${JSON.stringify({ name: 'Cynthia', team: pack(CYNTHIA) })}`
  )

  let turns = 0
  let forced = false
  try {
    for await (const chunk of streams.omniscient as AsyncIterable<string>) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('|turn|')) {
          turns = Number(line.split('|')[2])
          if (turns > MAX_TURNS && !forced) {
            forced = true
            void streams.omniscient.write('>forcetie') // stalemate guard
          }
        } else if (line.startsWith('|win|')) {
          return { won: line.split('|')[2] === 'You', tie: false, turns }
        } else if (line === '|tie') {
          return { won: false, tie: true, turns }
        }
      }
    }
  } catch {
    // stream errors count as a stalemate
  }
  return { won: false, tie: true, turns }
}

async function main() {
  const t0 = Date.now()
  const hist = [0, 0, 0, 0, 0, 0, 0] // days by number of winning leads (0-6)
  const hardest: string[] = []
  const easiest: string[] = []
  let battles = 0, wins = 0, ties = 0, totalTurns = 0

  console.log(`Simulating ${DAYS} days x 6 leads...`)
  for (let d = 0; d < DAYS; d++) {
    const team = getDailyTeam(`sim-${d}`)
    const names = team.map((s: any) => s.species || s.name).join(', ')
    let dayWins = 0

    for (let lead = 0; lead < 6; lead++) {
      const ordered = [team[lead], ...team.filter((_, j) => j !== lead)]
      const r = await playBattle(ordered, [d + 1, lead + 1, 17, 91])
      battles++
      totalTurns += r.turns
      if (r.tie) ties++
      if (r.won) {
        wins++
        dayWins++
      }
    }

    hist[dayWins]++
    if (dayWins === 0 && hardest.length < 5) hardest.push(names)
    if (dayWins === 6 && easiest.length < 3) easiest.push(names)
    if (d % 10 === 9) process.stdout.write('.')
  }

  const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`
  console.log('\n')
  console.log(`Battles played:            ${battles}`)
  console.log(`Bot win rate (all leads):  ${pct(wins, battles)}`)
  console.log(`Avg battle length:         ${(totalTurns / battles).toFixed(1)} turns`)
  console.log(`Stalemates (turn cap):     ${ties}`)
  console.log(`Days with 0 winning leads: ${hist[0]} (${pct(hist[0], DAYS)})`)
  console.log(`Days with 6 winning leads: ${hist[6]} (${pct(hist[6], DAYS)})`)
  console.log('\nDays by number of winning leads (out of 6):')
  hist.forEach((n, i) => console.log(`  ${i}: ${'#'.repeat(Math.round((n / DAYS) * 50))} ${n}`))
  console.log('\nExample unwinnable days (no lead won):')
  hardest.forEach((t) => console.log(`  ${t}`))
  console.log('\nExample easy days (every lead won):')
  easiest.forEach((t) => console.log(`  ${t}`))
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

main()