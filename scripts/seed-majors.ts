// Seeds the Major table (dropdown/autocomplete source) from a flat list of major names.
// Run: node --experimental-strip-types --env-file=.env.local scripts/seed-majors.ts
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const majors = JSON.parse(readFileSync(new URL('./institution-majors.json', import.meta.url), 'utf8')) as string[]

const prisma = new PrismaClient()

let succeeded = 0
let failed = 0

for (const name of majors) {
  try {
    await prisma.major.upsert({
      where: { name },
      update: {},
      create: { name, isCustom: false },
    })
    succeeded++
  } catch (e) {
    failed++
    console.error(`Failed to seed "${name}":`, e)
  }
}

console.log(`seed-majors.ts: upserted ${succeeded} majors (${failed} failed)`)
await prisma.$disconnect()
