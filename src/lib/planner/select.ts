// Joint selection (L1 over L2): the selection S0 takes each choice's L2-best option (the ranker's
// order). When S0's plan doesn't already sit on its own lower bound with nothing a choice could
// change, the other options of each choice are tried best-first, in the ranker's order, and one is
// kept only when it brings graduation strictly earlier, so an advisor-recommended course wins unless
// it costs a term. Deterministic; the budget counts selections.

/** A place the ranker chose between options: its key and the options in L2 order. */
export interface Choice {
  key: string
  ranked: string[]
}

export type Ranker = (options: string[], exceptSpecId?: string, planned?: Set<string>) => string[]

export const choiceKey = (options: readonly string[]) => [...options].sort().join(',')

/**
 * Wraps a ranker: a forced option goes first for its choice, and every choice with more than one
 * option is logged (first time seen) in the order the selection met it.
 */
export function forcedRanker(base: Ranker, force: ReadonlyMap<string, string>, log: Choice[]): Ranker {
  return (options, exceptSpecId, planned) => {
    let out = base(options, exceptSpecId, planned)
    const key = choiceKey(options)
    const f = force.get(key)
    if (f !== undefined && out.includes(f)) out = [f, ...out.filter((x) => x !== f)]
    if (out.length > 1 && !log.some((c) => c.key === key)) log.push({ key, ranked: base(options, exceptSpecId, planned) })
    return out
  }
}

export interface Attempt<T> {
  /** Graduation term index (lower is better); Infinity when nothing could be scheduled. */
  g: number
  /** The selection's own lower bound. */
  lb: number
  /** The selection's courses, sorted and joined: two forcings giving the same selection are one. */
  signature: string
  /** Courses the binding constraint runs through (the chain), when it's a chain. */
  binding: string[]
  choices: Choice[]
  value: T
}

/**
 * Best-first single swaps over the choices S0 met, then over any a swap uncovers, keeping a swap
 * only when it moves graduation earlier. Returns the winner and whether it's proven L1-optimal over
 * the selections tried (S0 on its own lower bound with a binding no choice feeds).
 */
export function jointSelect<T>(
  attempt: (force: ReadonlyMap<string, string>, beat: number) => Attempt<T> | null,
  allow: (code: string, instead: string) => boolean = () => true,
  budget = 8,
): { best: Attempt<T>; proven: boolean; tried: number } {
  let force = new Map<string, string>()
  let best = attempt(force, Number.POSITIVE_INFINITY)!
  let tried = 1
  const seen = new Set([best.signature])
  // On its own lower bound, and the bound doesn't run through a course some choice picked: no
  // other selection can do better on this constraint.
  const picks = new Set(best.choices.map((c) => c.ranked[0]))
  if (best.g === best.lb && !best.binding.some((code) => picks.has(code))) return { best, proven: true, tried }
  for (let i = 0; i < best.choices.length && tried < budget; i++) {
    const choice = best.choices[i]
    for (const alt of choice.ranked.slice(1)) {
      if (tried >= budget) break
      // A dominated option (another school's route, a course with no published section) never competes.
      if (!allow(alt, choice.ranked[0])) continue
      const next = new Map(force)
      next.set(choice.key, alt)
      // null: its own lower bound can't beat the best graduation, so it isn't scheduled.
      const a = attempt(next, best.g)
      if (!a || seen.has(a.signature)) continue
      seen.add(a.signature)
      tried++
      if (a.g < best.g) {
        best = a
        force = next
        break
      }
    }
    if (best.g === best.lb) break
  }
  return { best, proven: best.g === best.lb, tried }
}
