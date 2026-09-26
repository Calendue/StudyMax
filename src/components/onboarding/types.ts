export type StudentType = 'first-year' | 'existing'

export interface OnboardingProfile {
  studentType: StudentType
  universityId: 'usask'
  degree: string
  majorProgramId: string
  minorProgramId: string | null
  concentrationIds: string[]
}

// Degrees offered across the College of Arts & Science programs StudyMax currently covers. Purely
// descriptive right now — it shows on the profile but doesn't drive matching or planning.
export const DEGREE_OPTIONS = [
  'Bachelor of Science (BSc)',
  'Bachelor of Science, Honours (BSc Honours)',
  'Bachelor of Arts (BA)',
  'Bachelor of Arts, Honours (BA Honours)',
] as const
