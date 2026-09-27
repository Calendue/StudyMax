// Sanity check for transcriptParse. Run: node --experimental-strip-types scripts/check-transcript-parse.ts
import assert from 'node:assert/strict'
import { buildTranscriptParsePrompt, parseTranscriptProgram, parseTranscriptResponse } from '../src/lib/transcriptParse.ts'

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
assert.deepEqual(
  parseTranscriptResponse('{"completed":["MATH110"],"inProgress":["MATH110"]}', catalogue),
  { completed: ['MATH110'], inProgress: ['MATH110'] },
  'a code can legitimately sit in both buckets — already passed once, currently being retaken for a better grade',
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

console.log('check-transcript-parse.ts: all assertions passed')
