import type { Program } from './types.js'
import { computerScience } from './computerScience.js'
import { appliedMathematics } from './appliedMathematics.js'
import { physics } from './physics.js'
import { appliedComputing } from './appliedComputing.js'
import { computingCertificate } from './computingCertificate.js'
import { mathematicalModellingCertificate } from './mathematicalModellingCertificate.js'
import { formalReasoningCertificate } from './formalReasoningCertificate.js'
import { astronomyCertificate } from './astronomyCertificate.js'
import { statisticsMinor } from './statisticsMinor.js'
import { math } from './math.js'
import { statistics } from './statistics.js'
import { biology } from './biology.js'
import { psychology } from './psychology.js'
import { engineering } from './engineering.js'
import { nursing } from './nursing.js'
import { agriculture } from './agriculture.js'
import { commerce } from './commerce.js'
import { kinesiology } from './kinesiology.js'
import { education } from './education.js'

// Adding a program = adding a data file + one line here.
//
// math / statistics stay as empty stubs on purpose: their USask Four-year majors (and, for math,
// its minor) rely on an open-ended "any 300/400-level course in the subject" bucket as most of the
// major. Biology and Psychology have the same kind of bucket for a small part of theirs, which is
// enumerated from the scraped catalogue instead (see subjectAtLevels in helpers.ts).
export const programs: Program[] = [
  computerScience,
  appliedMathematics,
  physics,
  appliedComputing,
  computingCertificate,
  mathematicalModellingCertificate,
  formalReasoningCertificate,
  astronomyCertificate,
  statisticsMinor,
  math,
  statistics,
  biology,
  psychology,
  engineering,
  nursing,
  agriculture,
  commerce,
  kinesiology,
  education,
]
