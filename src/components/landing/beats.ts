// The pitch, beat by beat, from the roots (the first screen) up to the canopy. Copy lives here so the
// components stay about layout. Every number comes from facts.ts; every claim is something the app does.
import type { IconName } from '../../ui/Icon.tsx'
import { credentialName, FACTS } from './facts.ts'

export type BeatId = 'roots' | 'problem' | 'scattered' | 'guide' | 'how' | 'showcase' | 'more' | 'team' | 'canopy'

/**
 * Story order, bottom to top. `trunk` is where the trunk stands at that beat, as a fraction of the
 * page's width on a laptop: it starts in the right third at the roots, swings to the left third by
 * the showcase and comes back to the centre for the canopy, so the climb pans around the tree.
 */
export const BEATS: { id: BeatId; label: string; trunk: number }[] = [
  { id: 'roots', label: 'The roots', trunk: 0.7 },
  { id: 'problem', label: 'The problem', trunk: 0.64 },
  { id: 'scattered', label: 'Scattered', trunk: 0.54 },
  { id: 'guide', label: 'The guide', trunk: 0.49 },
  { id: 'how', label: 'How it works', trunk: 0.46 },
  { id: 'showcase', label: 'The skill tree', trunk: 0.29 },
  { id: 'more', label: 'Everything else', trunk: 0.44 },
  { id: 'team', label: 'Who built it', trunk: 0.52 },
  { id: 'canopy', label: 'Try it live', trunk: 0.5 },
]

export const beatIndex = (id: BeatId) => BEATS.findIndex((b) => b.id === id)

export const ROOTS = {
  headline: 'Your university hides things in plain sight.',
  promise:
    'Upload your transcript. StudyMax finds the credential you’re closest to, the one course that gets you there fastest, and calls you before your next award closes.',
  note: 'End to end for Computer Science at USask. Everyone else still gets the awards.',
}

export const PROBLEM = {
  headline: 'We started our degrees without a map.',
  lines: [
    'Which courses count toward what.',
    'Which credentials we were already halfway to.',
    'Which awards closed next month.',
  ],
  close: 'We wish someone had shown us on day one.',
}

export const SCATTERED = {
  headline: 'It was all there. Just scattered.',
  body: 'Across catalogue pages, program pages and award listings nobody reads end to end.',
  facts: [
    { figure: FACTS.courses, label: 'courses in the USask catalogue' },
    { figure: FACTS.csSpecializations, label: 'Computer Science specializations' },
    { figure: FACTS.certificatesAndMinors, label: 'certificates and minors to add on' },
    { figure: FACTS.awards, label: `awards and bursaries, ${FACTS.awardDeadlines} with a published deadline` },
  ],
}

export const GUIDE = {
  headline: 'So we built the guide we wish we’d had.',
  body: 'StudyMax reads where you are and shows you the shortest way to something that counts.',
}

export const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'upload', title: 'Upload your transcript', body: 'A DegreeWorks audit or an unofficial transcript PDF.' },
  { icon: 'target', title: 'See what you’re closest to', body: 'The specialization, certificate or minor nearest to done.' },
  { icon: 'spark', title: 'Take the one course that moves you furthest', body: 'The single course that counts toward the most of it.' },
  { icon: 'plan', title: 'Follow a term-by-term plan', body: 'Prerequisites included, even the ones the program page never lists.' },
  { icon: 'phone', title: 'Get a call before the award closes', body: 'One phone call about the deadline closing soonest.' },
]

export const SHOWCASE = {
  label: 'The Academic Skill Tree',
  headline: 'Your degree, grown as a tree.',
  body: 'What you’ve done are the roots. Arrows carry each prerequisite up to the course it unlocks, all the way to the credential at the top.',
  hint: 'Hover or tap a course to trace its arrows.',
  example: 'An example path, in real USask Computer Science courses.',
}

export const MORE = {
  headline: 'And a few more branches.',
  leaves: [
    { icon: 'seat', title: 'Class Tracker', body: 'Watch a full section and see the moment a seat opens.' },
    { icon: 'award', title: 'Awards by deadline', body: 'Ranked by how soon they close, with why each one fits you.' },
    { icon: 'compare', title: 'What if…', body: 'Put another credential beside yours and compare the plans.' },
    { icon: 'share', title: 'Share your path', body: 'Your result as one image, ready to post or send.' },
    {
      icon: 'device',
      title: 'On iPhone and Android',
      body: 'Home-screen widgets and a live deadline countdown: a Live Activity on iPhone, a Live Update on Android.',
    },
    { icon: 'moon', title: 'Light and dark', body: 'It follows your phone, or you pick.' },
  ] satisfies { icon: IconName; title: string; body: string }[],
}

export const TEAM = {
  headline: 'Built by four of us, in 24 hours.',
  names: ['Ayo Ogunade', 'Sam Lafiaji', 'Tobi Salam', 'Ibraheem Arif'],
  close: 'For the students we were on day one.',
}

export const CANOPY = {
  headline: 'See how close you already are.',
  body: 'Start with a sample student, or bring your own transcript.',
  qr: 'Open it on your phone',
  url: 'studymax.study',
  blossoms: ['artificial-intelligence', 'computing-certificate', 'software-development', 'statistics-minor', 'cybersecurity'].map(
    (id) => ({ id, ...credentialName(id) }),
  ),
}
