import { specializations } from '../specializations.ts'
import { courseTitles } from '../courseTitles.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../transcript.ts'
import type { Program } from './types.ts'

export const computerScience: Program = {
  id: 'computer-science',
  name: 'Computer Science',
  specializations,
  courseTitles,
  sampleTranscript: completedCourses,
  sampleInProgress: inProgressCourses,
  sampleInProgressTerms: inProgressTerms,
}
