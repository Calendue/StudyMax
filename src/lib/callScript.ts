export interface CallContext {
  specializationName: string
  coursesRemaining: number
  awardName?: string
  awardDeadlineText?: string
}

/** The exact words the call will say — short, one-way, grounded only in real given facts. */
export function buildCallScript(ctx: CallContext): string {
  const specLine =
    ctx.coursesRemaining === 0
      ? `You've completed the ${ctx.specializationName} specialization.`
      : `You're ${ctx.coursesRemaining} course${ctx.coursesRemaining === 1 ? '' : 's'} away from the ${ctx.specializationName} specialization.`

  // The call can't carry a URL, so it points at the link StudyMax already put on the screen.
  const awardLine = ctx.awardName
    ? ` One more thing: the ${ctx.awardName}${ctx.awardDeadlineText ? `, ${ctx.awardDeadlineText.toLowerCase()}` : ''}.` +
      ' The link is waiting on your StudyMax screen. Please open it before the deadline.'
    : ''

  return (
    `Hello. I am StudyMax, your personal academic advisor. ` +
    `There is no need to answer, I will be brief. ${specLine}${awardLine} ` +
    `That is everything. Take care, and good luck.`
  )
}

/** A watched section that just opened, for the Class Tracker's call. */
export interface SeatCallContext {
  /** "CMPT 280" */
  course: string
  /** "02" */
  section: string
  /** "2027 Winter Term" */
  termDesc: string
}

/** The seat-open call: which section, which term, and where to go. Nothing else. */
export function buildSeatCallScript(seat: SeatCallContext): string {
  return (
    `Hello. I am StudyMax. There is no need to answer, I will be brief. ` +
    `A seat just opened in ${seat.course}, section ${seat.section}, for the ${seat.termDesc}. ` +
    `Seats go fast, so please register in PAWS now. That is everything. Good luck.`
  )
}

/**
 * Wraps the script in explicit one-way, no-conversation instructions for the call provider, plus
 * the delivery notes: a calm, gentle, unhurried caretaker voice rather than a telemarketer's.
 */
export function buildCallTask(script: string): string {
  return [
    'You are placing a one-way informational phone call. Do not have a conversation and do not ask the person any questions.',
    `As soon as the call connects, say exactly this, once: "${script}"`,
    'Speak slowly, softly and warmly, in a calm and reassuring tone, like a gentle personal healthcare companion.',
    'Never sound urgent, salesy or excited. Pause briefly between sentences.',
    'Immediately after saying it, say a brief goodbye and end the call. Do not wait for or react to anything the person says.',
  ].join(' ')
}
