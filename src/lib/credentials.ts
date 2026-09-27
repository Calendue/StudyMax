import type { Program } from '../data/programs/types.js'
import type { Specialization } from '../data/specializations.js'
import { computeMatches, type SpecializationMatch } from './match.js'

export interface CredentialMatch extends SpecializationMatch {
  program: Program
}

/**
 * Certificates and minors a student is partway through without having declared them.
 *
 * A major's requirements overlap heavily with the standalone credentials in the same faculty — a CS
 * student taking CMPT 214/270/280 is most of the way through the Certificate in Computing already
 * and has no reason to know it. This runs the existing match engine over those credentials so the
 * near-misses surface next to the specializations.
 *
 * The student's own program is excluded: it isn't an add-on to itself.
 */
export function computeCredentials(
  programs: Program[],
  completed: Set<string>,
  currentProgramId: string | undefined,
): CredentialMatch[] {
  return programs
    .filter(
      (program) =>
        (program.kind === 'certificate' || program.kind === 'minor') &&
        program.id !== currentProgramId &&
        program.specializations.length > 0,
    )
    .flatMap((program) =>
      computeMatches(program.specializations, completed).map((match) => ({ ...match, program })),
    )
    .sort((a, b) => a.remaining - b.remaining || a.spec.name.localeCompare(b.spec.name))
}

/** Every credential requirement group, for overlap scoring alongside the program's own. */
export function credentialSpecializations(credentials: CredentialMatch[]): Specialization[] {
  return credentials.map((c) => c.spec)
}
