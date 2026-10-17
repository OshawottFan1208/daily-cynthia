import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'
import { mkdir, writeFile } from 'node:fs/promises'

const gen = new Generations(Dex).get(4)
const ids = new Set<string>()
for (const s of gen.species) ids.add(s.name.toLowerCase().replace(/[^a-z0-9-]/g, ''))

async function get(dir: string, id: string): Promise<boolean> {
  const res = await fetch(`https://play.pokemonshowdown.com/sprites/${dir}/${id}.png`)
  if (!res.ok) return false
  await writeFile(`public/sprites/${dir}/${id}.png`, Buffer.from(await res.arrayBuffer()))
  return true
}

async function main() {
  for (const dir of ['gen4', 'gen4-back']) await mkdir(`public/sprites/${dir}`, { recursive: true })
  const list = [...ids]
  let ok = 0
  const missing: string[] = []
  for (let i = 0; i < list.length; i += 10) {
    const batch = list.slice(i, i + 10)
    const results = await Promise.all(
      batch.flatMap((id) => ['gen4', 'gen4-back'].map(async (dir) => ((await get(dir, id)) ? 1 : (missing.push(`${dir}/${id}`), 0))))
    )
    ok += results.reduce<number>((a, b) => a + b, 0)
  }
  console.log(`Downloaded ${ok} sprites. Missing ${missing.length}.`)
  if (missing.length) console.log(missing.slice(0, 30).join('\n'))
}
main()