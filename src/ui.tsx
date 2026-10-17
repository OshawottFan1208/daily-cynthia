import { spriteUrl, typeColor } from './battleView'

export function Sprite({ species, back = false, className = 'sprite' }: {
  species: string
  back?: boolean
  className?: string
}) {
  return (
    <img
      key={species + back}
      className={className}
      src={spriteUrl(species, back)}
      alt={species}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const color = pct > 50 ? '#4caf50' : pct > 20 ? '#f5c518' : '#e53935'
  return (
    <div className="hp-track">
      <div className="hp-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="badge" style={{ background: typeColor(type) }}>
      {type}
    </span>
  )
}