// Terms USask has published a timetable for, and whether a course actually has sections in them —
// so when Max moves a course, a term the real timetable doesn't run it in is skipped, rather than
// trusting past offering patterns alone (CMPT 370 ran Fall and Winter before; Winter 2027 has none).
// Fails open: with the class search down, placement falls back to the catalogue's seasons.
import { getTerms, searchCourse } from '../_banner.js'

const TTL_MS = 10 * 60 * 1000
const counts = new Map<string, { at: number; count: number }>()
let terms: { at: number; codes: string[] } | null = null

/** Banner's 202701 → the plan's "Winter 2027"; Spring (05) and Summer (07) are both the plan's Spring/Summer. */
function planLabel(bannerTerm: string): string {
  const year = bannerTerm.slice(0, 4)
  const month = bannerTerm.slice(4)
  return month === '01' ? `Winter ${year}` : month === '09' ? `Fall ${year}` : `Spring/Summer ${year}`
}

async function openTerms(): Promise<string[]> {
  if (terms && Date.now() - terms.at < TTL_MS) return terms.codes
  terms = { at: Date.now(), codes: (await getTerms()).filter((t) => !t.viewOnly).map((t) => t.code) }
  return terms.codes
}

async function sectionCount(term: string, subject: string, number: string): Promise<number> {
  const key = `${term}:${subject}${number}`
  const hit = counts.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.count
  let sections = await searchCourse(term, subject, number)
  // Banner answers a throttled search with nothing: look once more before believing it.
  if (sections.length === 0) {
    await new Promise((r) => setTimeout(r, 1200))
    sections = await searchCourse(term, subject, number)
  }
  counts.set(key, { at: Date.now(), count: sections.length })
  return sections.length
}

/** For each course, the plan terms USask has published a timetable for that don't run it. */
export async function publishedAbsences(codes: string[]): Promise<Record<string, string[]>> {
  try {
    const open = await openTerms()
    const out: Record<string, string[]> = {}
    await Promise.all(
      [...new Set(codes)].map(async (code) => {
        const m = code.match(/^([A-Z]{2,5})(\d{3})$/)
        if (!m) return
        const found = new Map<string, number>()
        await Promise.all(
          open.map(async (term) => {
            const n = await sectionCount(term, m[1], m[2])
            found.set(planLabel(term), (found.get(planLabel(term)) ?? 0) + n)
          }),
        )
        out[code] = [...found].filter(([, n]) => n === 0).map(([label]) => label)
      }),
    )
    return out
  } catch (e) {
    console.error('[Max] published timetable lookup failed; placing from the catalogue', (e as Error)?.message ?? e)
    return {}
  }
}
