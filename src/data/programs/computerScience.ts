import { specializations } from '../specializations.js'
import { courseTitles } from '../courseTitles.js'
import { completedCourses, inProgressCourses, inProgressTerms } from '../transcript.js'
import type { Program } from './types.js'
import { computerScienceDegree } from './computerScienceDegree.js'

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
