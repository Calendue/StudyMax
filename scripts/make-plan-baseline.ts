// Snapshots the graduation term (termOrd) of every matrix case into scripts/plan-baseline.json.
// Taken on origin/main 1dcb8c6's greedy planner BEFORE the exact engine replaced it: the new
// planner may finish earlier, never later (check-plan-properties.ts gates on it). Don't regenerate
// it from the new engine. Run:
//   node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/make-plan-baseline.ts
import { writeFileSync } from 'node:fs'
import { buildCase, graduationOrd, matrixCases } from './_plan-matrix.ts'

const out: Record<string, number> = {}
for (const c of matrixCases()) {
  const r = buildCase(c)
  out[c.key] = graduationOrd(r.plan, r.booked)
}
writeFileSync(new URL('./plan-baseline.json', import.meta.url), JSON.stringify(out, null, 0).replace(/,"/g, ',\n"') + '\n')
console.log(`plan-baseline: ${Object.keys(out).length} cases written`)
