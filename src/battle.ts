import { BattleStreams, Teams } from '@pkmn/sim'
import { Dex } from '@pkmn/dex'

type MonSet = { name: string; item: string; ability: string; moves: string[] }



// Cynthia (Platinum). Moves are placeholders; verify against Bulbapedia later.
const CYNTHIA: MonSet[] = [
  { name: 'Spiritomb', item: 'Leftovers', ability: 'Pressure', moves: ['Shadow Ball', 'Dark Pulse', 'Psychic', 'Sucker Punch'] },
  { name: 'Roserade', item: 'Leftovers', ability: 'Natural Cure', moves: ['Sludge Bomb', 'Energy Ball', 'Shadow Ball', 'Sleep Powder'] },
  { name: 'Togekiss', item: 'Leftovers', ability: 'Serene Grace', moves: ['Air Slash', 'Aura Sphere', 'Roost', 'Thunder Wave'] },
  { name: 'Lucario', item: 'Leftovers', ability: 'Inner Focus', moves: ['Aura Sphere', 'Dragon Pulse', 'Earthquake', 'Shadow Ball'] },
  { name: 'Milotic', item: 'Leftovers', ability: 'Marvel Scale', moves: ['Surf', 'Ice Beam', 'Mirror Coat', 'Recover'] },
  { name: 'Garchomp', item: 'Leftovers', ability: 'Sand Veil', moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Blast'] },
]

const toPaste = (mons: MonSet[]) =>
  mons
    .map(
      (m) =>
        `${m.name} @ ${m.item}\nAbility: ${m.ability}\nLevel: 100\nEVs: 85 HP / 85 Atk / 85 Def / 85 SpA / 85 SpD / 85 Spe\n` +
        m.moves.map((mv) => `- ${mv}`).join('\n')
    )
    .join('\n\n')

const pack = (mons: MonSet[]) => Teams.pack(Teams.import(toPaste(mons)))

// Picks a random legal move or switch every time the sim asks for a decision

const dex = Dex.forGen(4)

// Abilities that make a Pokémon immune to a move type (Gen 4)
const IMMUNE_ABILITY: Record<string, string> = {
  Levitate: 'Ground',
  'Volt Absorb': 'Electric',
  'Motor Drive': 'Electric',
  'Water Absorb': 'Water',
  'Dry Skin': 'Water',
  'Flash Fire': 'Fire',
}

function moveScore(moveId: string, mon: any, oppTypes: any, oppAbility: string): number {
  const move = dex.moves.get(moveId)
  if (!move.exists) return 0
  if (!move.basePower) return 1 // status and fixed-damage moves: low priority for now
  if (!dex.getImmunity(move.type, oppTypes)) return 0
  if (IMMUNE_ABILITY[oppAbility] === move.type) return 0
  const stab = dex.species.get(mon.details.split(',')[0]).types.includes(move.type) ? 1.5 : 1
  const eff = Math.pow(2, dex.getEffectiveness(move.type, oppTypes))
  if (oppAbility === 'Wonder Guard' && eff <= 1) return 0
  const stat = mon.stats[move.category === 'Physical' ? 'atk' : 'spa']
  const acc = move.accuracy === true ? 1 : move.accuracy / 100
  return move.basePower * stab * eff * acc * (stat / 100)
}

async function cynthiaPlayer(stream: any, oppAbilities: Record<string, string>) {
  let oppTypes: any = ['Normal']
  let oppAbility = ''
  let pending: any = null

  const decide = () => {
    const req = pending
    pending = null
    if (!req) return

    if (req.forceSwitch) {
      let best = -1
      let bestScore = -1
      req.side.pokemon.forEach((p: any, i: number) => {
        if (p.active || p.condition.endsWith(' fnt')) return
        const s = Math.max(...p.moves.map((id: string) => moveScore(id, p, oppTypes, oppAbility)))
        if (s > bestScore) {
          best = i
          bestScore = s
        }
      })
      stream.write(`switch ${best + 1}`)
    } else if (req.active) {
      const me = req.side.pokemon.find((p: any) => p.active)
      let best = 0
      let bestScore = -1
      req.active[0].moves.forEach((m: any, i: number) => {
        if (m.disabled || m.pp === 0) return
        const s = moveScore(m.id, me, oppTypes, oppAbility)
        if (s > bestScore) {
          best = i
          bestScore = s
        }
      })
      stream.write(`move ${best + 1}`)
    }
  }

  for await (const chunk of stream as AsyncIterable<string>) {
    for (const line of chunk.split('\n')) {
      if (line.startsWith('|switch|p1a:') || line.startsWith('|drag|p1a:')) {
        const species = line.split('|')[3].split(',')[0]
        oppTypes = dex.species.get(species).types
        oppAbility = oppAbilities[species] ?? ''
      } else if (line.startsWith('|request|')) {
        const req = JSON.parse(line.slice('|request|'.length))
        if (req.wait) continue
        pending = req
        setTimeout(decide, 0)
      }
    }
  }
}

export function startBattle(
  playerTeam: any[],
  onLog: (line: string) => void,
  onRequest: (req: any) => void,
  onEnd: () => void
) {
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream())
  const oppAbilities = Object.fromEntries(
    playerTeam.map((s: any) => [s.species || s.name, s.ability])
)
  void cynthiaPlayer(streams.p2, oppAbilities)

  // You: listen for decision requests and hand them to the UI
  let lastRequest: any = null
  void (async () => {
    for await (const chunk of streams.p1 as AsyncIterable<string>) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('|request|')) {
          const req = JSON.parse(line.slice('|request|'.length))
          if (req.wait) continue
          lastRequest = req
          onRequest(req)
        } else if (line.startsWith('|error|') && lastRequest) {
          onRequest(lastRequest) // invalid choice: ask again
        }
      }
    }
  })()

  // Battle log
  void (async () => {
    for await (const chunk of streams.omniscient as AsyncIterable<string>) {
      for (const line of chunk.split('\n')) {
        onLog(line)
        if (line.startsWith('|win|')) {
          onEnd()
          return
        }
      }
    }
  })()

  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: 'gen4customgame' })}\n` +
      `>player p1 ${JSON.stringify({ name: 'You', team: Teams.pack(playerTeam) })}\n` +
      `>player p2 ${JSON.stringify({ name: 'Cynthia', team: pack(CYNTHIA) })}`
  )

  return { choose: (choice: string) => void streams.p1.write(choice) }
}