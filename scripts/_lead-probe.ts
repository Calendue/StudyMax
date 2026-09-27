import { STAGES, buildCase } from './_plan-matrix.ts'
import { buildStudentPlanResult } from '../src/lib/plan.ts'
const [stage, spec, variant, load, summer, ov] = process.argv.slice(2)
const st = STAGES.find((s) => s.name === stage)!
const r = buildCase({ stage: st, specId: spec, variant: variant as never, load: +load, summer: +summer })
const args = r.args
if (ov) { const [kind, code, ...term] = ov.split(':'); args[6] = { ...args[6], overrides: [{ kind: kind as never, code, term: term.join(' ') }], currentTerm: { season: 'Fall', year: 2026 } } }
console.log('booked', JSON.stringify(args[6].booked))
const res = buildStudentPlanResult(...args)
for (const t of res.terms) console.log(t.label.padEnd(20), t.courses.map((c) => c.code.replace(/^elective:\d+:/, '~')).join(' | '))
console.log(res.graduation, res.optimality, res.bindingKind, res.binding)
for (const d of res.diagnostics) console.log(' ', d.level, d.code, d.course ?? '', d.message)
