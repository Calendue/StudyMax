// Offering and prerequisite data the planner leans on (src/lib/catalog.ts). Fails when:
// - a course a CS degree or specialization requires with no alternative (or its only prerequisite
//   option, followed down the chain) had no Banner section in the last three years, unless that
//   specialization is marked `atRisk` in src/data/specializations.ts;
// - a src/data/prereqOverrides.ts entry names a code courseInfo doesn't have;
// - the known facts from the live Banner check drift (CMPT 440 at risk, CMPT 400 runs, ...).
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-offerings.ts
import { computerScience } from '../src/data/programs/computerScience.ts'
import { courseInfo } from '../src/data/prereqs.ts'
import { prereqOverrides } from '../src/data/prereqOverrides.ts'
import { defaultCatalog } from '../src/lib/catalog.ts'
import { courseCu } from '../src/lib/degree.ts'

const catalog = defaultCatalog()
const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const pretty = (code: string) => code.replace(/(\d)/, ' $1')

// ---- required courses with no alternative, and their only-option prerequisite chains ----

/** The course and every prerequisite it can't avoid (a group with one option), transitively. */
function unavoidable(code: string, seen = new Set<string>()): string[] {
  if (seen.has(code) || !catalog[code]) return []
  seen.add(code)
  const out = [code]
  const c = catalog[code]
  for (const group of [...c.requires, ...c.concurrent]) {
    const known = group.filter((o) => catalog[o])
    if (known.length === 1) out.push(...unavoidable(known[0], seen))
  }
  return out
}

function checkRequired(owner: string, codes: string[], exempt: string | undefined) {
  for (const code of [...codes].sort()) {
    for (const needed of unavoidable(code)) {
      if (!catalog[needed].atRisk) continue
      if (exempt) continue
      const via = needed === code ? '' : ` (a prerequisite of ${pretty(code)})`
      fail(`${owner} needs ${pretty(needed)}${via}, which had no section in the last three years; mark it atRisk or give it an alternative`)
    }
  }
}

const degrees = computerScience.degrees ?? (computerScience.degree ? [computerScience.degree] : [])
for (const degree of degrees) {
  const required: string[] = []
  for (const g of degree.groups) {
    if (g.open || g.matches || g.oneOf) continue
    const listed = g.courses.filter((c) => courseInfo[c])
    const cu = listed.reduce((sum, c) => sum + courseCu(c), 0)
    if (listed.length > 0 && cu <= g.needCu) required.push(...listed)
  }
  checkRequired(degree.name, required, undefined)
}
for (const spec of computerScience.specializations) {
  if (spec.unavailable) continue
  const required = spec.requirements.filter((g) => g.need >= g.courses.length).flatMap((g) => g.courses)
  checkRequired(`Specialization ${spec.name}`, required, spec.atRisk)
}

// A specialization marked at risk should still have a reason: at least one required course with
// little Banner history.
for (const spec of computerScience.specializations) {
  if (spec.atRisk && spec.atRisk.trim().length < 10) fail(`${spec.name}: atRisk needs a plain note`)
}

// ---- prereqOverrides only names real courses ----
for (const [code, fix] of Object.entries(prereqOverrides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  if (!courseInfo[code]) fail(`prereqOverrides.${code}: not in courseInfo`)
  const named = [...(fix.requires ?? []).flat(), ...(fix.concurrent ?? []).flat(), ...Object.keys(fix.minGrade ?? {})]
  for (const n of named) if (!courseInfo[n]) fail(`prereqOverrides.${code}: ${n} is not in courseInfo`)
  for (const g of [...(fix.requires ?? []), ...(fix.concurrent ?? [])]) if (g.length === 0) fail(`prereqOverrides.${code}: an empty OR-group`)
  if (!fix.note) fail(`prereqOverrides.${code}: needs a note`)
}

// ---- the live Banner facts the catalog must keep ----
const expect = (ok: boolean, msg: string) => {
  if (!ok) fail(msg)
}
for (const code of ['CMPT440', 'MATH314', 'MATH436', 'MATH438']) expect(catalog[code]?.atRisk === true, `${code} should be atRisk`)
for (const code of ['CMPT400', 'CMPT405', 'CMPT407']) {
  expect(catalog[code]?.seasons.join() === 'Fall,Winter', `${code} runs every Fall and Winter`)
  expect(catalog[code]?.confidence === 'published', `${code} is published`)
}
for (const code of ['CMPT401', 'CMPT402', 'CMPT403', 'CMPT404']) expect(catalog[code]?.seasons.length === 3, `${code} runs every term`)
expect(catalog.CMPT498?.seasons.join() === 'Winter', 'CMPT498 ran Winter 2026')
expect(catalog.CMPT400?.fullYear === true, 'CMPT400 is full-year')
expect(catalog.KIN382?.fullYear === false && catalog.KIN451?.fullYear === false, 'a one-term Banner course is not full-year')
expect(catalog.CMPT432?.confidence === 'alternating-pattern', 'CMPT432 ran once (alternating-pattern)')
expect(catalog.CMPT394?.confidence === 'annual-pattern', 'CMPT394 ran 2024-25 and 2025-26 (annual-pattern)')
expect(catalog.CMPT439?.confidence === 'published', 'CMPT439 is published for Winter 2027')
expect(catalog.CMPT489?.antirequisites.includes('CMPT498') === false, 'CMPT489 no longer bars CMPT498')
expect(JSON.stringify(catalog.MATH361?.requires) === '[["MATH163","MATH266"],["MATH164","MATH266"]]', 'MATH361 is (163 and 164) or 266')
expect(catalog.CMPT145?.minGrade?.CMPT141 === 60, 'CMPT145 needs 60% in CMPT141')
const summerOnly = Object.entries(catalog).filter(([, c]) => c.seasons.length === 1 && c.seasons[0] === 'Spring/Summer')
expect(summerOnly.length > 0, 'Spring/Summer-only courses keep ["Spring/Summer"]')
expect(!summerOnly.some(([, c]) => c.fullYear), 'no Spring/Summer-only course is full-year')

// ---- summary ----
const counts: Record<string, number> = {}
for (const c of Object.values(catalog)) counts[c.confidence] = (counts[c.confidence] ?? 0) + 1
const atRisk = Object.keys(catalog).filter((c) => catalog[c].atRisk)
const fullYear = Object.keys(catalog).filter((c) => catalog[c].fullYear)
if (failures.length > 0) {
  for (const f of failures) console.error('FAIL', f)
  console.error(`check-offerings.ts: ${failures.length} failure(s)`)
  process.exit(1)
}
console.log(
  `check-offerings.ts: ok — ${Object.keys(catalog).length} courses (${Object.entries(counts)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}); at risk ${atRisk.length} (${atRisk.join(' ')}); full-year ${fullYear.length}; ${Object.keys(prereqOverrides).length} prerequisite overrides`,
)
