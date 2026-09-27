// Cross-checks every course code the programs reference against the scraped catalogue.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-course-codes.ts
//
// A code that no longer appears in catalogue.usask.ca is a course the app would tell a student to
// register for that USask doesn't list any more — usually because the program page it came from is
// stale. We can't silently fix those (the replacement is a judgement call), so we pin the known set
// and fail the moment a new one appears.
import assert from 'node:assert/strict'
import { programs } from '../src/data/programs/index.ts'
import { courseInfo } from '../src/data/prereqs.ts'

/** Verified against catalogue.usask.ca on 2026-08-20: each appears only in prose, not as a course. */
const KNOWN_NOT_IN_CATALOGUE = new Set([
  'BINF451', // computational-modelling
  'GEOG125', // applied-computing-geomatics
  'MATH123', // applied-mathematics-major — survives only in "credit for only one of" notes
  'MATH124', // applied-mathematics-major — same
  'MATH325', // applied-computing-data-analytics, mathematical-modelling-certificate
  'MATH452', // applied-mathematics-major
  'MATH465', // applied-mathematics-major
  'MATH485', // applied-mathematics-major
])

const referenced = new Map<string, string[]>()
for (const program of programs) {
  for (const spec of program.specializations) {
    for (const group of spec.requirements) {
      for (const course of group.courses) {
        referenced.set(course, [...(referenced.get(course) ?? []), spec.id])
      }
    }
  }
}

const unlisted = [...referenced.keys()].filter((code) => !courseInfo[code]).sort()

for (const code of unlisted) {
  assert.ok(
    KNOWN_NOT_IN_CATALOGUE.has(code),
    `${code} is required by ${referenced.get(code)!.join(', ')} but is not in the scraped catalogue. ` +
      `Either the program data is stale, or the scraper missed it — check catalogue.usask.ca/?subj_code=${code.match(/^[A-Z]+/)![0]}&cnum=%25`,
  )
}

const resolved = [...KNOWN_NOT_IN_CATALOGUE].filter((code) => !unlisted.includes(code))
assert.deepEqual(resolved, [], `these are no longer missing — drop them from KNOWN_NOT_IN_CATALOGUE: ${resolved.join(', ')}`)

// Everything else must carry usable catalogue data.
for (const [code] of referenced) {
  if (KNOWN_NOT_IN_CATALOGUE.has(code)) continue
  const info = courseInfo[code]
  assert.ok(info.title.length > 0, `${code}: catalogue title must not be empty`)
  // Zero is legitimate — PHYS 490.0 (Physics Seminars) is a real non-credit requirement.
  assert.ok(Number.isFinite(info.creditUnits) && info.creditUnits >= 0, `${code}: credit units must be a number`)
  assert.ok(
    info.requires.every((group) => group.length > 0),
    `${code}: a prerequisite group must never be empty`,
  )
}

console.log(
  `check-course-codes.ts: all assertions passed ` +
    `(${referenced.size} referenced, ${unlisted.length} known-stale, ${Object.keys(courseInfo).length} in catalogue data)`,
)
