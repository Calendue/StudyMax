import { specializations } from '../specializations.ts'
import { courseTitles } from '../courseTitles.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../transcript.ts'
import type { Program } from './types.ts'
import { computerScienceDegree } from './computerScienceDegree.ts'

export const computerScience: Program = {
  id: 'computer-science',
  name: 'Computer Science',
  specializations,
  degree: computerScienceDegree,
  courseTitles,
  sampleTranscript: completedCourses,
  sampleInProgress: inProgressCourses,
  sampleInProgressTerms: inProgressTerms,
}
