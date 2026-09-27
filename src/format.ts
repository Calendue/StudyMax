import { electiveLabel, isElective } from './lib/plan.ts'

export type TargetKind = 'specialization' | 'certificate' | 'minor'

/** The one-line version, with the full sentence a tap away. */
export const WHY_SHORT: Record<TargetKind, string> = {
  specialization: 'It goes on your official transcript.',
  certificate: 'Its own line on your transcript.',
  minor: 'Its own line on your transcript.',
}

export const WHY_IT_MATTERS: Record<TargetKind, string> = {
  specialization:
    'Specializations appear on your official transcript and signal focused expertise to employers, beyond the base degree.',
  certificate:
    'A certificate is a separate credential with its own line on your transcript, earned alongside your degree rather than instead of part of it.',
  minor:
    'A minor is a separate credential with its own line on your transcript, earned alongside your degree rather than instead of part of it.',
}

export const KIND_LABEL: Record<TargetKind, string> = {
  specialization: 'Specialization',
  certificate: 'Certificate',
  minor: 'Minor',
}

/** "CMPT280" → "CMPT 280" */
export function courseCode(code: string) {
  // An unnamed elective in a plan shows what kind of course it is ("Breadth elective").
  if (isElective(code)) return electiveLabel(code)
  return code.replace(/([A-Z]+)(\d+)/, '$1 $2')
}

/** "cmpt 214", "CMPT214" and "cmpt-214" all read as CMPT214: a subject then a three-digit number. */
export function registeredCode(text: string): string | null {
  const match = text.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/^([A-Z]{2,5})(\d{3})$/)
  return match ? `${match[1]}${match[2]}` : null
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}
