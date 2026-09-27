// Sanity check for transcriptParse. Run: node --experimental-strip-types scripts/check-transcript-parse.ts
import assert from 'node:assert/strict'
import {
  buildTranscriptParsePrompt,
  parseTermLabel,
  parseTranscriptProgram,
  parseTranscriptResponse,
  parseTranscriptTimeline,
} from '../src/lib/transcriptParse.ts'
import { takingNow, termLabels, termsAfterUpload } from '../src/lib/currentTerms.ts'
import { inProgressCourses as sampleInProgress, inProgressTerms as sampleTerms } from '../src/data/transcript.ts'

// A small fixture catalogue spanning several subjects — proves extraction isn't narrowed to one
// program's course list, without needing to import the real 3000+-course catalogue here.
const catalogue = ['CMPT145', 'CMPT214', 'CMPT280', 'CMPT332', 'CMPT360', 'MATH110', 'ECON111', 'PHYS115', 'ASTR113', 'ENG113', 'LING111', 'PSY120']

const prompt = buildTranscriptParsePrompt()
assert.ok(prompt.toLowerCase().includes('every course'), 'prompt asks for every course, not a filtered subset')
assert.ok(prompt.toLowerCase().includes('do not filter by'), 'prompt explicitly bans filtering by department/program')
assert.ok(prompt.toLowerCase().includes('completed'), 'prompt defines the completed bucket')
assert.ok(prompt.toLowerCase().includes('inprogress') || prompt.toLowerCase().includes('in progress'), 'prompt defines the in-progress bucket')
assert.ok(prompt.toLowerCase().includes('appears more than once'), 'prompt covers repeated/retaken courses')
assert.ok(prompt.toLowerCase().includes('retake'), 'prompt covers the pass-then-retake-for-a-better-grade case')
assert.ok(prompt.includes('Look-Ahead'), 'prompt leaves out DegreeWorks Look-Ahead courses')
assert.ok(prompt.includes('"Plans"') && /planned/.test(prompt), 'prompt leaves out Plans and planned courses')
assert.ok(/transfer credit/i.test(prompt) && /credit by exam/i.test(prompt), 'prompt counts transfer and credit-by-exam courses')
assert.ok(prompt.includes('completedTerms') && prompt.includes('documentDate'), 'prompt asks for completed terms and the document date')
assert.ok(/never drop the year/i.test(prompt), 'prompt keeps the year on every term')

// --- clean JSON, across subjects outside any one program ---
assert.deepEqual(
  parseTranscriptResponse('{"completed":["CMPT145","MATH110","ECON111","PHYS115"],"inProgress":[]}', catalogue).completed.sort(),
  ['CMPT145', 'ECON111', 'MATH110', 'PHYS115'],
  'extracts real courses across multiple subjects, not just one program',
)

// --- in-progress bucket ---
assert.deepEqual(
  parseTranscriptResponse('{"completed":["CMPT280"],"inProgress":["CMPT332","CMPT360"]}', catalogue),
  { completed: ['CMPT280'], inProgress: ['CMPT332', 'CMPT360'] },
  'captures in-progress courses separately from completed',
)

// --- embedded in prose, case/space normalization ---
const embedded = parseTranscriptResponse(
  'Sure! Here you go:\n{"completed":["cmpt 145","math 110.3"],"inProgress":[]}\nHope that helps.',
  catalogue,
)
assert.deepEqual(embedded.completed.sort(), ['CMPT145', 'MATH110'], 'normalizes case, spaces, and credit-unit suffixes')

// --- never invents a code, but validates against the FULL catalogue passed in, not one program's list ---
const filtered = parseTranscriptResponse('{"completed":["CMPT145","ZZZZ999"],"inProgress":[]}', catalogue)
assert.deepEqual(filtered.completed, ['CMPT145'], 'drops codes that do not exist in the catalogue')
assert.equal(
  parseTranscriptResponse('{"completed":["ASTR113","ENG113","LING111","PSY120"],"inProgress":[]}', catalogue).completed.length,
  4,
  'accepts real courses outside CS/Math/Stat (astronomy, English, linguistics, psychology)',
)

// --- repeats: same code deduplicated within a bucket, but dual-membership is legitimate ---
assert.deepEqual(
  parseTranscriptResponse('{"completed":["CMPT214","CMPT214"],"inProgress":[]}', catalogue).completed,
  ['CMPT214'],
  'deduplicates a repeated code within one bucket (fail-then-pass retake)',
)
// Already passed once and being retaken for a better grade: completed, and never also in progress,
// so the Courses list, the plan and the tree all agree on it.
assert.deepEqual(
  parseTranscriptResponse('{"completed":["MATH110"],"inProgress":["MATH110","CMPT332"]}', catalogue),
  { completed: ['MATH110'], inProgress: ['CMPT332'] },
  'a completed course also listed in progress is dropped from in progress',
)

// --- malformed input never throws ---
assert.deepEqual(parseTranscriptResponse('not json at all', catalogue), { completed: [], inProgress: [] })
assert.deepEqual(parseTranscriptResponse('{}', catalogue), { completed: [], inProgress: [] })
assert.deepEqual(parseTranscriptResponse('', catalogue), { completed: [], inProgress: [] })

// --- stated major/minor: short text or null, never throws ---
assert.deepEqual(
  parseTranscriptProgram('{"completed":[],"inProgress":[],"major":" Computer Science ","minor":null}'),
  { major: 'Computer Science', minor: null },
)
assert.deepEqual(parseTranscriptProgram('{"completed":[],"major":{"x":1},"minor":""}'), { major: null, minor: null })
assert.deepEqual(parseTranscriptProgram('not json'), { major: null, minor: null })

// --- term labels, to the "Season YYYY" the plan and the tree use ---
const termCases: [string, string | null][] = [
  ['2026 Fall Term', 'Fall 2026'],
  ['Fall 2026', 'Fall 2026'],
  ['Winter 2027', 'Winter 2027'],
  ['2027 Winter Term', 'Winter 2027'],
  ['Spring 2027', 'Spring/Summer 2027'],
  ['2026 Summer Term', 'Spring/Summer 2026'],
  ['Autumn 2025', 'Fall 2025'],
  ['2026-27 Winter Term', 'Winter 2027'],
  ['2026-2027 Fall Term', 'Fall 2026'],
  ['2025-26 Regular Session', null],
  ['Fall', null],
  ['Fall 2025 - Winter 2026', null],
  ['', null],
]
for (const [label, want] of termCases) assert.equal(parseTermLabel(label), want, `parseTermLabel(${JSON.stringify(label)})`)

// --- completed terms, in-progress terms and the document date pass through for the kept courses ---
const answer = JSON.stringify({
  completed: ['CMPT145', 'MATH 110.3', 'ZZZZ999'],
  completedTerms: { CMPT145: '2025 Winter Term', 'MATH 110': 'Fall 2024', ZZZZ999: 'Fall 2024', CMPT280: 'Fall 2025' },
  inProgress: ['CMPT332', 'CMPT360', 'MATH110'],
  inProgressTerms: { CMPT332: '2026 Fall Term', CMPT360: 'Winter', MATH110: 'Winter 2027' },
  documentDate: '2026-08-06',
  major: 'Computer Science',
  minor: null,
})
const courses = parseTranscriptResponse(answer, catalogue)
assert.deepEqual(courses, { completed: ['CMPT145', 'MATH110'], inProgress: ['CMPT332', 'CMPT360'] })
const timeline = parseTranscriptTimeline(answer, courses)
assert.deepEqual(
  timeline.completedTerms,
  { CMPT145: 'Winter 2025', MATH110: 'Fall 2024' },
  'completed terms are normalised, and kept only for courses in the completed list',
)
assert.deepEqual(
  timeline.inProgressTerms,
  { CMPT332: 'Fall', CMPT360: 'Winter' },
  'inProgressTerms stays season-valued (installed apps read it), even for a label with no year',
)
assert.deepEqual(timeline.inProgressTermLabels, { CMPT332: 'Fall 2026' }, 'in-progress labels carry the year, where there is one')
assert.equal(timeline.documentDate, '2026-08-06', 'the document date passes through')
for (const bad of ['August 6, 2026', '06/08/2026', 7, null, '2026-13-45']) {
  assert.equal(
    parseTranscriptTimeline(JSON.stringify({ completed: [], inProgress: [], documentDate: bad }), { completed: [], inProgress: [] }).documentDate,
    null,
    `documentDate ${JSON.stringify(bad)} is not a YYYY-MM-DD date`,
  )
}
assert.deepEqual(parseTranscriptTimeline('not json', { completed: [], inProgress: [] }), {
  inProgressTerms: {},
  inProgressTermLabels: {},
  completedTerms: {},
  documentDate: null,
})

// --- what the app does with an answer: Taking now, and the terms it keeps ---
// A course is never both completed and in progress, whether a transcript or the student listed it.
assert.deepEqual(
  takingNow(['CMPT332', 'CMPT360', 'MATH110'], ['CMPT360', 'CMPT370'], new Set(['MATH110'])),
  ['CMPT332', 'CMPT360', 'CMPT370'],
  'Taking now is the union of uploaded and registered courses, once each, minus completed ones',
)
// A re-upload replaces the last transcript's terms; a course added by hand keeps the term it was given.
assert.deepEqual(
  termsAfterUpload({ CMPT332: 'Fall', CMPT340: 'Winter', CMPT381: 'Winter' }, { CMPT370: 'Fall' }, ['CMPT381']),
  { CMPT381: 'Winter', CMPT370: 'Fall' },
  'a re-upload replaces in-progress terms instead of merging them',
)
// The sample's seven, placed in their own terms on 2026-09-26: 4 in Fall 2026, 3 in Winter 2027.
const sampleByTerm = (['Fall', 'Winter', 'Spring/Summer'] as const)
  .map((season) => ({ season, courses: sampleInProgress.filter((c) => sampleTerms[c] === season) }))
  .filter((g) => g.courses.length > 0)
const sampleLabels = termLabels(sampleByTerm, new Date(2026, 8, 26))
assert.equal(Object.keys(sampleLabels).length, 7, 'the sample takes seven courses')
for (const code of ['CMPT332', 'CMPT360', 'CMPT370', 'MATH266']) assert.equal(sampleLabels[code], 'Fall 2026', `${code} runs in Fall 2026`)
for (const code of ['CMPT340', 'CMPT353', 'CMPT434']) assert.equal(sampleLabels[code], 'Winter 2027', `${code} runs in Winter 2027`)

console.log('check-transcript-parse.ts: all assertions passed')
