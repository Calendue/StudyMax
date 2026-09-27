import { specializations } from '../specializations.js'
import { courseTitles } from '../courseTitles.js'
import { completedCourses, inProgressCourses, inProgressTerms } from '../transcript.js'
import type { Program } from './types.js'
import { computerScienceBsc4 } from '../degrees/computerScience.js'

export const computerScience: Program = {
  id: 'computer-science',
  name: 'Computer Science',
  specializations,
  degree: computerScienceBsc4,
  courseTitles,
  sampleTranscript: completedCourses,
  sampleInProgress: inProgressCourses,
  sampleInProgressTerms: inProgressTerms,
}
