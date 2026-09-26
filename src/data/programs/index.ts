import type { Program } from './types.ts'
import { computerScience } from './computerScience.ts'
import { appliedMathematics } from './appliedMathematics.ts'
import { physics } from './physics.ts'
import { appliedComputing } from './appliedComputing.ts'
import { computingCertificate } from './computingCertificate.ts'
import { mathematicalModellingCertificate } from './mathematicalModellingCertificate.ts'
import { formalReasoningCertificate } from './formalReasoningCertificate.ts'
import { astronomyCertificate } from './astronomyCertificate.ts'
import { statisticsMinor } from './statisticsMinor.ts'
import { math } from './math.ts'
import { statistics } from './statistics.ts'
import { biology } from './biology.ts'
import { psychology } from './psychology.ts'
import { engineering } from './engineering.ts'
import { nursing } from './nursing.ts'
import { agriculture } from './agriculture.ts'
import { commerce } from './commerce.ts'
import { kinesiology } from './kinesiology.ts'
import { education } from './education.ts'

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
