// Cross-checks every course code the app's data names against the 2026-27 catalogue.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-course-codes.ts
//
// Liveness comes from src/data/activeCourses.ts, the committed snapshot of
// https://catalogue.usask.ca/api/course_titles; the course data from src/data/prereqs.ts. Both are
// written by scripts/scrape-catalogue.ts. A code that isn't active is a course the app would tell a
// student to register for that USask doesn't offer any more — usually because the program page it
// came from is stale. We can't silently fix those (the replacement is a judgement call), so we pin
// the known set and fail the moment a new one appears.
import assert from 'node:assert/strict'
import { courseInfo } from '../src/data/prereqs.ts'
import { activeCourses } from '../src/data/activeCourses.ts'
import { namedCourses } from './scrape-catalogue.ts'

/**
 * Named by program data but not in the 2026-27 catalogue. Each needs a decision, not a data fix:
 * drop it from the list it's in, or mark the credential it belongs to as not finishable.
 */
const KNOWN_NOT_IN_CATALOGUE = new Set([
  'BINF451', // computational-modelling: the page still lists it, so the specialization is marked unavailable
  'CMPT116', // the CS degree pages' "CMPT 116.3 or CMPT 141.3": kept so an older transcript counts; never planned
  'CMPT117', // "CMPT 117.3 or CMPT 145.3": the same
  'GEOG125', // applied-computing-geomatics
  'MATH123', // applied-mathematics-major — survives only in "credit for only one of" notes
  'MATH124', // applied-mathematics-major — same
  'MATH325', // applied-computing-data-analytics, mathematical-modelling-certificate
  'MATH452', // applied-mathematics-major
  'MATH465', // applied-mathematics-major
  'MATH485', // applied-mathematics-major
])

const named = await namedCourses({ samples: false })

const dead = [...named.keys()].filter((code) => !activeCourses.has(code)).sort()
for (const code of dead) {
  assert.ok(
    KNOWN_NOT_IN_CATALOGUE.has(code),
    `${code} is named by ${named.get(code)!.join(', ')} but is not in the 2026-27 catalogue ` +
      `(src/data/activeCourses.ts). Either the program data is stale or the snapshot is — check ` +
      `https://catalogue.usask.ca/api?subj_code=${code.match(/^[A-Z]+/)![0]}`,
  )
}

const resolved = [...KNOWN_NOT_IN_CATALOGUE].filter((code) => !dead.includes(code))
assert.deepEqual(
  resolved,
  [],
  `these are no longer named, or are active again — drop them from KNOWN_NOT_IN_CATALOGUE: ${resolved.join(', ')}`,
)

// Everything named and active must carry usable catalogue data.
for (const [code] of named) {
  if (!activeCourses.has(code)) continue
  const info = courseInfo[code]
  assert.ok(info, `${code} (named by ${named.get(code)!.join(', ')}) is active but missing from prereqs.ts — rerun scripts/scrape-catalogue.ts`)
  assert.ok(info.title.length > 0, `${code}: catalogue title must not be empty`)
  // Zero is legitimate — PHYS 490.0 (Physics Seminars) is a real non-credit requirement.
  assert.ok(Number.isFinite(info.creditUnits) && info.creditUnits >= 0, `${code}: credit units must be a number`)
  assert.ok(info.offered, `${code}: every scraped course carries its 2026-27 offered term`)
}

// The whole file: shaped right, all live, and closed under prerequisites.
for (const [code, info] of Object.entries(courseInfo)) {
  assert.ok(activeCourses.has(code), `${code} is in prereqs.ts but not in the active course list`)
  for (const group of [...info.requires, ...(info.concurrent ?? [])]) {
    assert.ok(group.length > 0, `${code}: a prerequisite group must never be empty`)
    for (const option of group) {
      assert.ok(
        courseInfo[option] || !activeCourses.has(option),
        `${code} cites ${option}, an active course missing from prereqs.ts — the closure is incomplete`,
      )
    }
  }
  for (const r of info.creditRequires ?? []) assert.ok(r.cu >= 0, `${code}: credit requirement must be a count`)
}

// What the CS demo's sequencing depends on, read from the catalogue text (not hand-typed).
assert.equal(courseInfo.CMPT214.offered, 'fall')
assert.equal(courseInfo.CMPT215.offered, 'winter')
assert.equal(courseInfo.CMPT270.offered, 'fall')
assert.equal(courseInfo.CMPT280.offered, 'winter')
assert.equal(courseInfo.CMPT370.offered, 'fall')
assert.equal(courseInfo.CMPT263.offered, 'either')
assert.equal(courseInfo.CMPT489.offered, 'none', 'CMPT 489 has no 2026-27 offering')
assert.deepEqual(courseInfo.CMPT371.concurrent, [['CMPT280']], '"Prerequisite(s) or Corequisite(s): CMPT 280.3"')
assert.deepEqual(courseInfo.CMPT141.requires, [], 'CMPT 141 needs only high-school courses or a concurrent MATH')
assert.deepEqual(courseInfo.MATH110.requires, [], 'MATH 110 needs only Pre-Calculus 30')
assert.deepEqual(courseInfo.STAT242.requires, [['STAT241']])
assert.deepEqual(courseInfo.PHIL232.creditRequires, [{ cu: 6, subjects: ['CMPT'], level: 100 }])
assert.deepEqual(courseInfo.CMPT360.creditRequires, [{ cu: 9, subjects: ['MATH', 'STAT'] }])
assert.deepEqual(courseInfo.CMPT485.creditRequires, [{ cu: 6, subjects: ['CMPT'], level: 300 }])
assert.equal(courseInfo.ENG110.creditUnits, 6)
assert.equal(courseInfo.MATH133.creditUnits, 4)
assert.deepEqual(courseInfo.CMPT215.antirequisites, ['CME331', 'EE331'])

console.log(
  `check-course-codes.ts: all assertions passed ` +
    `(${named.size} named, ${dead.length} known-stale, ${Object.keys(courseInfo).length} in catalogue data, ` +
    `${activeCourses.size} active codes)`,
)
