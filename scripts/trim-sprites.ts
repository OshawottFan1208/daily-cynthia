import { PNG } from 'pngjs'
import { readdir, readFile, writeFile } from 'node:fs/promises'

// Crops the transparent padding off every sprite so the bottom edge of the image is the Pokémon's feet
async function main() {
  let trimmed = 0
  let untouched = 0
  for (const dir of ['public/sprites/gen4', 'public/sprites/gen4-back']) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png'))
    for (const f of files) {
      const path = `${dir}/${f}`
      const png = PNG.sync.read(await readFile(path))
      const { width: w, height: h, data } = png
      let minX = w, minY = h, maxX = -1, maxY = -1
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 10) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < 0 || (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1)) {
        untouched++
        continue
      }
      const nw = maxX - minX + 1
      const nh = maxY - minY + 1
      const out = new PNG({ width: nw, height: nh })
      PNG.bitblt(png, out, minX, minY, nw, nh, 0, 0)
      await writeFile(path, PNG.sync.write(out))
      trimmed++
    }
  }
  console.log(`Trimmed ${trimmed} sprites, ${untouched} already tight.`)
}
main()