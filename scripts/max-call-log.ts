// Prints one Max call's full story — the stored transcript plus every tool call it made, in
// order — straight from the shared DB. Works against prod: there's no separate prod database
// (CLAUDE.md/HANDOFF.md — one shared remote Supabase instance for local and deployed alike), so
// this sees exactly what a real phone call just did without needing Vercel's log viewer at all.
// Console logs there are also short-retention on the free tier; these DB rows aren't.
//
// Run: node --experimental-strip-types --env-file=.env.local scripts/max-call-log.ts [callId]
// With no callId, prints the most recently started call.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const requestedId = process.argv[2]

const call = requestedId
  ? await prisma.maxCall.findUnique({ where: { callId: BigInt(requestedId) } })
  : await prisma.maxCall.findFirst({ orderBy: { createdAt: 'desc' } })

if (!call) {
  console.log(requestedId ? `No MaxCall with callId ${requestedId}.` : 'No calls in the DB yet.')
  process.exit(0)
}

const toolCalls = await prisma.maxToolCall.findMany({ where: { callId: call.callId }, orderBy: { createdAt: 'asc' } })

console.log(`Call ${call.callId} (vapi ${call.vapiCallId ?? '—'}) — ${call.status}${call.endedReason ? ` (${call.endedReason})` : ''}`)
console.log(`  user ${call.userId} · started ${call.startedAt?.toISOString() ?? '—'} · duration ${call.durationSec ?? '?'}s`)

console.log('\n--- transcript (as stored by Vapi\'s end-of-call report; shape not schema-checked) ---')
console.log(call.transcript ? JSON.stringify(call.transcript, null, 2) : '(none yet — call may still be in progress)')

console.log(`\n--- tool calls (${toolCalls.length}) ---`)
if (toolCalls.length === 0) console.log('(none)')
for (const tc of toolCalls) {
  const status = tc.ok === false ? (tc.errorCode ?? 'error') : tc.ok === true ? 'ok' : 'pending'
  console.log(`[${tc.createdAt.toISOString()}] ${tc.toolName} args=${JSON.stringify(tc.args)} -> ${status} [${tc.latencyMs ?? '?'}ms]`)
  if (tc.result) console.log(`  result: ${JSON.stringify(tc.result).slice(0, 300)}`)
}

await prisma.$disconnect()
