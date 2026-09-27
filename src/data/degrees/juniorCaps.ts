// Arts & Science "Maximum Junior Credit Units by Subject": how many credit units of junior (100-level)
// courses in each subject count toward a degree. Academic Policies, University Catalogue 2026-27
// (effective May 1, 2026 to April 30, 2027), pages 32-33 of the printable version:
// https://programs.usask.ca/arts-and-science/policies.php
// ("Students may only count a specified amount of credit units of junior (100-level; JR) courses toward
// their degree requirements. The list below indicates the maximum for each Arts and Science subject.")
//
// Transcribed as printed. Notes on what the page says around the list:
// - ENG: "6 credit units of ENG 110, 111, 112, 113, 114, ENG JR.3; ENG 120.3 may be taken in addition."
// - BIOL 102.1, CHEM 142.1, GEOL 102.1 and PHYS 152.1 "may be taken in addition" to their subject's
//   cap. The footnote that they give 3 cu of elective credit only when all four are passed (and none
//   otherwise) is not modelled here.
// - ANTH: 9 cu ("prior to 2024-25: 3 credit units in ANTH plus 6 credit units in ARCH"); the older
//   split is not modelled.
// - CTST: "none". Catholic Studies has no 100-level courses in the 2026-27 catalogue.
// - ART, DRAM, INCC, INTS, MUS, MUAP: unlimited. The "Junior and Senior Courses" note that some of
//   their 100-level credit counts as senior for some students is not modelled.
// - A subject missing from the list (COMM, GE, KIN, ...) has no cap from this rule; the degree's own
//   limit on junior credit (54 of a 120-cu B.Sc.) still applies.

export interface JuniorCap {
  /** Credit units of 100-level courses in the subject that count; null is unlimited. */
  cu: number | null
  /** 100-level courses the page lets a student take "in addition": they never count against `cu`. */
  extra?: string[]
}

const cap = (cu: number | null, ...extra: string[]): JuniorCap => (extra.length > 0 ? { cu, extra } : { cu })

export const juniorCaps: Record<string, JuniorCap> = {
  ANTH: cap(9),
  ARBC: cap(6),
  ART: cap(null),
  ARTH: cap(6),
  ASTR: cap(9),
  BIOL: cap(12, 'BIOL102'),
  BINF: cap(3),
  CTST: cap(0),
  CHEM: cap(9, 'CHEM142'),
  CHIN: cap(6),
  CMRS: cap(6),
  CPSJ: cap(3),
  CLAS: cap(18),
  CMPT: cap(12),
  CREE: cap(6),
  DRAM: cap(null),
  ECON: cap(6),
  ENG: cap(6, 'ENG120'),
  FREN: cap(21),
  GEOG: cap(12),
  GEOL: cap(8, 'GEOL102'),
  GERM: cap(6),
  GRK: cap(6),
  HEB: cap(6),
  HIST: cap(9),
  HNDI: cap(6),
  INCC: cap(null),
  INDG: cap(3),
  INTS: cap(null),
  IS: cap(3),
  JPNS: cap(6),
  LATN: cap(6),
  LING: cap(15),
  LIT: cap(6),
  MATH: cap(18),
  MUS: cap(null),
  MUAP: cap(null),
  NRTH: cap(3),
  PHIL: cap(12),
  PHYS: cap(9, 'PHYS152'),
  POLS: cap(9),
  PSY: cap(6),
  RLST: cap(9),
  RUSS: cap(6),
  SOC: cap(6),
  SPAN: cap(6),
  STAT: cap(6),
  UKR: cap(6),
  GENS: cap(3),
}
