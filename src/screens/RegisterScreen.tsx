import { useState } from 'react'
import { useLayoutMode } from '../ui/layout.ts'
import { PracticeRun } from './register/PracticeRun.tsx'
import { RegisterPlan } from './register/RegisterPlan.tsx'
import { useRegistrationPlan, useRegistrationRequest } from './register/useRegistration.ts'
import './register.css'

// Registering for the plan's next term with Max. Reached only from the Plan's button; not a nav
// destination. Two views share the screen: Max's plan (real sections from USask's public class
// search, and the way into PAWS, where the student signs in and presses Submit themselves), and the
// practice run, a simulated registration page that plays those same picks out.

export function RegisterScreen() {
  const request = useRegistrationRequest()
  const loaded = useRegistrationPlan(request)
  const phone = useLayoutMode() === 'tabs'
  const [view, setView] = useState<'plan' | 'practice'>('plan')

  if (view === 'practice' && loaded.plan) {
    return <PracticeRun plan={loaded.plan} scroll={phone} onBack={() => setView('plan')} />
  }
  const plan = <RegisterPlan request={request} loaded={loaded} onPractice={() => setView('practice')} />
  // In the shell it's a focused column with its own Back, like the call.
  return phone ? plan : <div className="shell-focus">{plan}</div>
}
