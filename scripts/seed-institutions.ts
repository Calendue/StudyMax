// Seeds the Institution table from the Canadian institutions list, upserted by name.
// Run: node --experimental-strip-types --env-file=.env.local scripts/seed-institutions.ts
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

interface InstitutionSeed {
  name: string
  province: string
  city: string
  country: string
  timezone: string
}

const institutions = JSON.parse(
  readFileSync(new URL('./canadian-institutions-seed.json', import.meta.url), 'utf8'),
) as InstitutionSeed[]

const prisma = new PrismaClient()

let succeeded = 0
let failed = 0

for (const institution of institutions) {
  try {
    await prisma.institution.upsert({
      where: { name: institution.name },
      update: {
        province: institution.province,
        city: institution.city,
        country: institution.country,
        timezone: institution.timezone,
      },
      create: { ...institution, isCustom: false },
    })
    succeeded++
  } catch (e) {
    failed++
    console.error(`Failed to seed "${institution.name}":`, e)
  }
}

console.log(`seed-institutions.ts: upserted ${succeeded} institutions (${failed} failed)`)
await prisma.$disconnect()
