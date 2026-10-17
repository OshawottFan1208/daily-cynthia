import { Teams } from '@pkmn/sim'
import { TeamGenerators } from '@pkmn/randoms'
import { Dex } from '@pkmn/dex'

Teams.setGeneratorFactory(TeamGenerators)

export type Team = ReturnType<typeof Teams.generate>

// Change this string any time you want to reshuffle every day's teams
const SALT = 'daily-cynthia-v1'

// Local date as YYYY-MM-DD, so the team changes at each player's midnight
export function todayKey(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Turns a string into four 16-bit numbers for the sim's random generator
function hashSeed(str: string): `gen5,${string}` {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762

  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)

  const words = [
    h1 >>> 0,
    h2 >>> 0,
    h3 >>> 0,
    h4 >>> 0
  ]

  return `gen5,${words.map(n => (n & 0xffff).toString(16).padStart(4, '0')).join('')}`
}

const MIN_EACH = 450 // weakest allowed Pokémon (base stat total)
const MIN_AVG = 500 // minimum team average
const dex = Dex.forGen(4)
const bst = (name: string) => {
  const b = dex.species.get(name).baseStats
  return b.hp + b.atk + b.def + b.spa + b.spd + b.spe
}

export function getDailyTeam(dayKey: string): Team {
  let team: Team = []
  // Re-roll (deterministically) until the team is strong enough
  for (let attempt = 0; attempt < 200; attempt++) {
    team = Teams.generate('gen4randombattle', { seed: hashSeed(`${SALT}:${dayKey}:${attempt}`) })
    const totals = team.map((s: any) => bst(s.species || s.name))
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length
    if (Math.min(...totals) >= MIN_EACH && avg >= MIN_AVG) break
  }
  for (const set of team) set.level = 100
  return team
}