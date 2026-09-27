import { useEffect, useMemo, useState } from 'react'
import { useModel } from '../../model.ts'
import { registrationRequest, type RegPlan, type RegRequest } from '../../lib/registration.ts'
import { loadRegistration } from '../../lib/registrationData.ts'

// What the next term asks the student to register for, from the model alone (no fetch), shared by the
// Plan's entry button and the Register screen so both always agree. Only USask programs have plans,
// so a request is always for USask's portal.

export function useRegistrationRequest(): RegRequest | null {
  const m = useModel()
  return useMemo(
    () =>
      registrationRequest({
        plan: m.plan,
        booked: m.booked,
        degree: m.activeDegree,
        taken: [...m.completed, ...m.inProgressCourses],
      }),
    [m.plan, m.booked, m.activeDegree, m.completed, m.inProgressCourses],
  )
}

export interface LoadedPlan {
  plan: RegPlan | null
  loading: boolean
  /** loadRegistration threw something other than a network failure (it falls back for those). */
  failed: boolean
  /** Look again: one lookup per tap. */
  retry: () => void
}

/** Max's real sections for the request, looked up once per request (and again only on retry). */
export function useRegistrationPlan(request: RegRequest | null): LoadedPlan {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; plan: RegPlan | null } | null>(null)
  const key = request ? `${attempt}:${JSON.stringify(request)}` : null
  useEffect(() => {
    if (!request || key === null) return
    const controller = new AbortController()
    loadRegistration(request, { signal: controller.signal }).then(
      (plan) => setResult({ key, plan }),
      () => {
        if (!controller.signal.aborted) setResult({ key, plan: null })
      },
    )
    return () => controller.abort()
    // Keyed on the request's content: the model hands over a new object on unrelated renders.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = result && result.key === key ? result : null
  return {
    plan: current?.plan ?? null,
    loading: key !== null && current === null,
    failed: current !== null && current.plan === null,
    retry: () => setAttempt((a) => a + 1),
  }
}
