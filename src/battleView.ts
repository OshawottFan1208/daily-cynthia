export type Mon = { species: string; hp: number; maxHp: number; status: string }
export type View = { p1: Mon | null; p2: Mon | null; p2Fainted: string[] }
export const emptyView: View = { p1: null, p2: null, p2Fainted: [] }

const TYPE_COLORS: Record<string, string> = {
  Normal: '#A8A878', Fire: '#F08030', Water: '#6890F0', Electric: '#F8D030',
  Grass: '#78C850', Ice: '#98D8D8', Fighting: '#C03028', Poison: '#A040A0',
  Ground: '#E0C068', Flying: '#A890F0', Psychic: '#F85888', Bug: '#A8B820',
  Rock: '#B8A038', Ghost: '#705898', Dragon: '#7038F8', Dark: '#705848',
  Steel: '#B8B8D0', '???': '#68A090',
}
export const typeColor = (t: string) => TYPE_COLORS[t] ?? '#777'

// Sprite files are named like the species, lowercase, with only letters, digits and hyphens
export const spriteUrl = (species: string, back = false) =>
  `/sprites/gen4${back ? '-back' : ''}/${species.toLowerCase().replace(/[^a-z0-9-]/g, '')}.png`
// Reads "261/261", "120/261 brn" or "0 fnt"
export function parseHp(s: string, prevMax = 0) {
  const [frac, tag = ''] = s.split(' ')
  if (tag === 'fnt') return { hp: 0, maxHp: prevMax, status: '' }
  const [hp, maxHp] = frac.split('/').map(Number)
  return { hp, maxHp: maxHp || prevMax, status: tag }
}

const sideOf = (s?: string): 'p1' | 'p2' | null =>
  s?.startsWith('p1') ? 'p1' : s?.startsWith('p2') ? 'p2' : null

export function applyLine(v: View, line: string): View {
  const p = line.split('|')
  const key = sideOf(p[2])
  const cur = key ? v[key] : null
  const put = (mon: Mon | null): View => (key === 'p1' ? { ...v, p1: mon } : { ...v, p2: mon })

  switch (p[1]) {
    case 'switch':
    case 'drag':
      if (!key) return v
      return put({ species: p[3].split(',')[0], ...parseHp(p[4]) })
    case '-damage':
    case '-heal':
    case '-sethp':
      if (!key || !cur) return v
      return put({ ...cur, ...parseHp(p[3], cur.maxHp) })
    case 'faint': {
      if (!key || !cur) return v
      const next = put({ ...cur, hp: 0, status: '' })
      return key === 'p2' ? { ...next, p2Fainted: [...v.p2Fainted, cur.species] } : next
    }
    case '-status':
      return key && cur ? put({ ...cur, status: p[3] }) : v
    case '-curestatus':
      return key && cur ? put({ ...cur, status: '' }) : v
    default:
      return v
  }
}

const nameOf = (s?: string) => (s ?? '').split(': ')[1] ?? ''
const who = (s?: string) => (s?.startsWith('p2') ? `Cynthia's ${nameOf(s)}` : nameOf(s))
const STATUS_TEXT: Record<string, string> = {
  brn: 'was burned!', par: 'is paralyzed!', psn: 'was poisoned!',
  tox: 'was badly poisoned!', slp: 'fell asleep!', frz: 'was frozen solid!',
}
const STAT_TEXT: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def',
  spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
}

export function describeLine(line: string): string | null {
  const p = line.split('|')
  switch (p[1]) {
    case 'switch':
    case 'drag':
      return `${p[2].startsWith('p1') ? 'You send out' : 'Cynthia sends out'} ${p[3].split(',')[0]}!`
    case 'move':
      return `${who(p[2])} used ${p[3]}!`
    case '-supereffective':
      return "It's super effective!"
    case '-resisted':
      return "It's not very effective..."
    case '-immune':
      return `It doesn't affect ${who(p[2])}...`
    case '-crit':
      return 'A critical hit!'
    case '-miss':
      return `${who(p[2])}'s attack missed!`
    case '-fail':
      return 'But it failed!'
    case 'faint':
      return `${who(p[2])} fainted!`
    case '-status':
      return `${who(p[2])} ${STATUS_TEXT[p[3]] ?? 'has a status problem!'}`
    case '-boost':
    case '-unboost':
      return `${who(p[2])}'s ${STAT_TEXT[p[3]] ?? p[3]} ${p[1] === '-boost' ? 'rose' : 'fell'}!`
    case 'turn':
      return `— Turn ${p[2]} —`
    case 'win':
      return p[2] === 'You' ? 'You defeated Cynthia!' : 'Cynthia wins...'
    default:
      return null
  }
}