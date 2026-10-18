import { useState } from 'react'
import { spriteUrl, typeColor } from './battleView'

export function Sprite({
  species,
  back = false,
  className = 'sprite',
  px,
}: {
  species: string
  back?: boolean
  className?: string
  px?: string
}) {
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  // With px set (arena only), draw the sprite at its natural pixel size times a scale
  const sized = px && dim ? { width: `calc(${dim.w} * ${px})`, height: `calc(${dim.h} * ${px})` } : undefined
  return (
    <img
      key={species + back}
      className={`${className}${dim ? ' loaded' : ''}`}
      src={spriteUrl(species, back)}
      alt={species}
      style={sized}
      onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
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