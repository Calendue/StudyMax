import type { Specialization } from '../specializations.ts'

export interface Program {
  id: string
  name: string
  /**
   * A credential a student can earn alongside a major. Defaults to 'major' when absent — only the
   * certificates and minors set it, and only those are offered as add-on credentials in the UI.
   */
  kind?: 'major' | 'certificate' | 'minor'
  /** Empty when no verified specialization data exists yet for this program — never invented. */
  specializations: Specialization[]
  courseTitles: Record<string, string>
  /**
   * Starting value for the plan's courses-per-term control. Set for full-degree programs, where the
   * default of 2 (sized for a CS specialization) would stretch the plan over a decade.
   */
  coursesPerTerm?: number
  /** Its specializations are whole majors or degree paths (Commerce's Accounting), not add-on concentrations. */
  specializationsAreMajors?: boolean
  /** Only populated where a real sample transcript exists. */
  sampleTranscript?: string[]
  /** Courses the sample student is registered in but has not finished. */
  sampleInProgress?: string[]
}
