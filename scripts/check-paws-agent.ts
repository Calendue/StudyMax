// The PAWS agent's rules, checked without a browser or a phone. Run:
//   node --experimental-strip-types scripts/check-paws-agent.ts
// 1. The URL guards: only Banner's own class registration page is ever scripted.
// 2. The session (when to inject): once, only after that page has loaded, and only after the view went
//    out to sign in and came back; never on CAS or Microsoft.
// 3. The script's source: no path to Submit, no values, cookies, storage or tokens read.
// 4. The script run in a small fake Banner page on a virtual clock, native and bookmarklet, with a
//    header, user menu and site notices holding a name and student number its diagnostics must miss.
// 5. pawsAgent.ts's plugin options: nothing persists, cookies cleared, one executeScript.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import {
  agentScript,
  agentSession,
  bookmarklet,
  compact,
  fromPage,
  isBanner,
  isClassRegistration,
  isTermSelection,
  REG_URL,
  termHintScript,
  type AgentMsg,
} from '../src/lib/pawsAgentScript.ts'

const ROOT = new URL('..', import.meta.url)
const CLASS_REG = 'https://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration/classRegistration'
const TERM_SELECT = 'https://banner.usask.ca/StudentRegistrationSsb/ssb/term/termSelection?mode=registration'
const CAS = 'https://cas.usask.ca/cas/login?TARGET=' + encodeURIComponent(REG_URL)
const MICROSOFT = 'https://login.microsoftonline.com/common/oauth2/authorize?client_id=x'
const CRNS = ['26243', '30463', '28326', '27177', '27180']
const TERM = 'Winter 2027'

// --- 1. URL guards ---
const yes = [CLASS_REG, CLASS_REG + '#enterCRNs', 'https://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration', 'https://BANNER.usask.ca/StudentRegistrationSsb/ssb/classRegistration/classRegistration']
const no = [
  'https://cas.usask.ca/cas/login?TARGET=https://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration',
  'https://cas.usask.ca/cas/login?TARGET=' + encodeURIComponent(CLASS_REG),
  'https://banner.usask.ca.evil.com/StudentRegistrationSsb/ssb/classRegistration/classRegistration',
  'https://evil.com/banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration',
  'http://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration/classRegistration',
  'https://banner.usask.ca:8443/StudentRegistrationSsb/ssb/classRegistration/classRegistration',
  'https://someone@banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration/classRegistration',
  'https://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistrationX',
  TERM_SELECT,
  REG_URL,
  MICROSOFT,
  'about:blank',
  'not a url',
  '',
]
for (const url of yes) assert.ok(isClassRegistration(url), `class registration: ${url}`)
for (const url of no) assert.ok(!isClassRegistration(url), `not class registration: ${url}`)
assert.ok(isTermSelection(TERM_SELECT) && !isTermSelection(CAS) && !isTermSelection(CLASS_REG), 'term selection guard')
assert.ok(isBanner(REG_URL) && !isBanner(CAS) && !isBanner('https://banner.usask.ca.evil.com/'), 'banner host guard')
assert.ok(REG_URL.startsWith('https://banner.usask.ca/StudentRegistrationSsb/ssb/registration/registerPostSignIn'), 'REG_URL')

// --- 2. the session: when the script may run ---
function session() {
  const emitted: AgentMsg[] = []
  const executed: { id: string; code: string }[] = []
  let fail = false
  const s = agentSession({
    code: 'CODE',
    termLabel: TERM,
    emit: (m) => emitted.push(m),
    execute: (id, code) => {
      executed.push({ id, code })
      return fail ? Promise.reject(new Error('no')) : Promise.resolve()
    },
  })
  return { s, emitted, executed, failNext: () => (fail = true) }
}
const types = (ms: AgentMsg[]) => ms.map((m) => m.type)
const tick = () => new Promise((resolve) => setImmediate(resolve))

{
  // The whole sign-in path: nothing runs until Banner's registration page has finished loading.
  const { s, emitted, executed } = session()
  s.onUrl({ url: REG_URL })
  s.onUrl({ url: CAS })
  s.onLoaded({})
  s.opened('v1')
  s.onMessage({ detail: { type: 'ready', text: 'spoofed before injection' } })
  s.onUrl({ id: 'v1', url: MICROSOFT })
  s.onLoaded({ id: 'v1' })
  assert.deepEqual(types(emitted), [], 'nothing said before Banner')
  s.onUrl({ id: 'v1', url: REG_URL + '&ticket=ST-1' })
  s.onUrl({ id: 'v1', url: TERM_SELECT })
  s.onLoaded({ id: 'v1' })
  assert.deepEqual(types(emitted), ['signed-in', 'status'], 'signed in once, then the term chooser')
  assert.equal(emitted[1].text, 'Choose Winter 2027 and press Continue.')
  assert.equal(executed.length, 0, 'never injected on CAS, Microsoft or term selection')
  s.onUrl({ id: 'v1', url: CLASS_REG })
  assert.equal(executed.length, 0, 'not before the registration page has loaded')
  s.onLoaded({ id: 'other' })
  assert.equal(executed.length, 0, "another view's load doesn't count")
  s.onLoaded({ id: 'v1' })
  assert.deepEqual(executed, [{ id: 'v1', code: 'CODE' }], 'injected once into the loaded registration page')
  s.onUrl({ id: 'v1', url: CLASS_REG + '#enterCRNs' })
  s.onLoaded({ id: 'v1' })
  s.onUrl({ id: 'v1', url: TERM_SELECT })
  s.onUrl({ id: 'v1', url: CLASS_REG })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 1, 'exactly once per call, even when the page loads again')
  s.onUrl({ id: 'v1', url: REG_URL })
  assert.equal(emitted.filter((m) => m.type === 'signed-in').length, 1, 'signed-in only once')
}
{
  // The term chooser gets Max's text hint (and only that), once per load, after the sign-in hop.
  const executed: { id: string; code: string }[] = []
  const s = agentSession({ code: 'CODE', hint: 'HINT', termLabel: TERM, emit: () => {}, execute: (id, code) => (executed.push({ id, code }), Promise.resolve()) })
  s.opened('v1')
  s.onUrl({ id: 'v1', url: TERM_SELECT })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 0, 'no hint on a term chooser reached without signing in')
  s.onUrl({ id: 'v1', url: CAS })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 0, 'nothing on CAS')
  s.onUrl({ id: 'v1', url: TERM_SELECT })
  assert.equal(executed.length, 0, 'not before the term chooser has loaded')
  s.onLoaded({ id: 'v1' })
  s.onLoaded({ id: 'v1' })
  assert.deepEqual(executed, [{ id: 'v1', code: 'HINT' }], 'the hint once on the loaded term chooser, never the CRN script')
  s.onUrl({ id: 'v1', url: CLASS_REG })
  s.onLoaded({ id: 'v1' })
  assert.deepEqual(executed.map((e) => e.code), ['HINT', 'CODE'], 'then the CRN script on the registration page')
  const hint = termHintScript('Winter 2027')
  assert.match(hint, /choose 2027 Winter Term in the list/, "names the term the way Banner lists it")
  assert.doesNotMatch(hint, /\.click\(|\.value\s*=|submit|saveButton|cookie|localStorage/i, 'the hint reads, picks and presses nothing')
  assert.match(hint, /termSelection/, 'and does nothing off the term chooser')
}
{
  // Banner's registration page without the sign-in hop (a session that somehow survived) is never
  // scripted, and isn't "signed in"; after going out to CAS and back, it is, once.
  const { s, emitted, executed } = session()
  s.opened('v1')
  s.onUrl({ id: 'v1', url: REG_URL })
  s.onUrl({ id: 'v1', url: CLASS_REG })
  s.onLoaded({ id: 'v1' })
  s.onUrl({ id: 'v1', url: CLASS_REG + '#enterCRNs' })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 0, 'no sign-in hop, no injection')
  assert.deepEqual(types(emitted), [], 'and no signed-in')
  s.onUrl({ id: 'v1', url: CAS })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 0, 'never on CAS')
  s.onUrl({ id: 'v1', url: CLASS_REG })
  s.onLoaded({ id: 'v1' })
  assert.equal(executed.length, 1, 'back from CAS: injected once')
  assert.deepEqual(types(emitted), ['signed-in', 'status'])
}
{
  // Messages: only after injection, only known page types, trimmed; other views ignored.
  const { s, emitted } = session()
  s.opened('v1')
  s.onUrl({ id: 'v1', url: CAS })
  s.onUrl({ id: 'v1', url: CLASS_REG })
  s.onLoaded({ id: 'v1' })
  emitted.length = 0
  s.onMessage({ id: 'v1', detail: { type: 'progress', text: 'x'.repeat(1000) } })
  s.onMessage({ id: 'v1', detail: { detail: { type: 'dump', rows: Array.from({ length: 200 }, () => 'r'.repeat(500)) } } })
  s.onMessage({ id: 'v1', detail: { type: 'signed-in' } })
  s.onMessage({ id: 'v1', detail: { type: 'closed' } })
  s.onMessage({ id: 'v1', detail: { type: 'weird' } })
  s.onMessage({ id: 'v1', rawMessage: 'hello' })
  s.onMessage({ id: 'v2', detail: { type: 'ready' } })
  assert.deepEqual(types(emitted), ['progress', 'dump'], 'only real page messages from this view')
  assert.equal(emitted[0].text!.length, 240, 'texts trimmed')
  assert.equal(emitted[1].rows!.length, 80, 'at most 80 dump rows')
  assert.ok(emitted[1].rows!.every((r) => r.length <= 160), 'dump rows trimmed')
  s.onMessage({ id: 'v1', detail: { type: 'ready', text: 'done' } })
  s.onUrl({ id: 'v1', url: CLASS_REG.replace('classRegistration/classRegistration', 'registration') })
  assert.deepEqual(types(emitted), ['progress', 'dump', 'ready'], 'leaving after ready is fine')
  s.end()
  s.onMessage({ id: 'v1', detail: { type: 'progress', text: 'late' } })
  assert.equal(emitted.length, 3, 'nothing after the view is gone')
}
{
  // The page loads before openWebView answers: injected once the id is known, not before.
  const { s, executed } = session()
  s.onUrl({ url: CAS })
  s.onUrl({ url: CLASS_REG })
  s.onLoaded({})
  assert.equal(executed.length, 0, 'no id, no injection')
  s.opened('v9')
  assert.deepEqual(executed, [{ id: 'v9', code: 'CODE' }], 'injected on open')
}
{
  // Leaving the page mid-fill, and a failed executeScript, each report one error.
  const a = session()
  a.s.opened('v1')
  a.s.onUrl({ id: 'v1', url: CAS })
  a.s.onUrl({ id: 'v1', url: CLASS_REG })
  a.s.onLoaded({ id: 'v1' })
  a.s.onUrl({ id: 'v1', url: CAS })
  a.s.onUrl({ id: 'v1', url: MICROSOFT })
  assert.deepEqual(types(a.emitted), ['signed-in', 'status', 'error'], 'one error when the page changes mid-fill')
  const b = session()
  b.failNext()
  b.s.opened('v1')
  b.s.onUrl({ id: 'v1', url: MICROSOFT })
  b.s.onUrl({ id: 'v1', url: CLASS_REG })
  b.s.onLoaded({ id: 'v1' })
  await tick()
  assert.deepEqual(types(b.emitted), ['signed-in', 'status', 'error'], 'one error when the script cannot start')
  assert.equal(b.executed.length, 1, 'and no retry')
}
{
  // Hostile look-alikes never get the script.
  const { s, executed } = session()
  s.opened('v1')
  for (const url of no) {
    s.onUrl({ id: 'v1', url })
    s.onLoaded({ id: 'v1' })
  }
  assert.equal(executed.length, 0, 'no look-alike URL is scripted')
}
assert.deepEqual(fromPage({ detail: { type: 'ready', text: 1 } }), { type: 'ready' }, 'non-string text dropped')
assert.equal(fromPage(null), null)

// --- 3. the script's source ---
assert.throws(() => agentScript([], { termLabel: TERM, mode: 'native' }), /No CRNs/)
assert.throws(() => agentScript(['1234'], { termLabel: TERM, mode: 'native' }), /Not a CRN/)
assert.throws(() => agentScript(["12345');alert(1);('"], { termLabel: TERM, mode: 'native' }), /Not a CRN/)
assert.throws(() => agentScript(Array.from({ length: 21 }, (_, i) => String(10000 + i)), { termLabel: TERM, mode: 'native' }), /Too many/)
assert.throws(() => agentScript(CRNS, { termLabel: TERM, mode: 'other' as 'native' }), /Unknown mode/)
assert.ok(agentScript(['26243', '26243'], { termLabel: TERM, mode: 'native' }).includes('"crns":["26243"]'), 'duplicate CRNs typed once')
const hostileTerm = agentScript(CRNS, { termLabel: "Winter 2027'});alert(1);//", mode: 'native' })
new vm.Script(hostileTerm)

const native = agentScript(CRNS, { termLabel: TERM, mode: 'native' })
const lean = compact(agentScript(CRNS, { termLabel: TERM, mode: 'bookmarklet' }))
const link = bookmarklet(CRNS, TERM)
assert.ok(link.startsWith('javascript:'), 'bookmarklet is a javascript: URL')
assert.equal(decodeURIComponent(link.slice('javascript:'.length)), lean, 'bookmarklet is the compacted bookmarklet script')

function count(src: string, re: RegExp) {
  return (src.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length
}
for (const [name, full] of [['native', native], ['compacted native', compact(native)], ['bookmarklet', lean]] as const) {
  new vm.Script(full, { filename: `${name}.js` })
  // Asserted on the squeezed form, so a reformat of the template can't hide anything.
  const src = compact(full)
  // Submit: its id is written once, used only in the outline rule and in click()'s refusal.
  assert.equal(count(src, /saveButton/), 1, `${name}: 'saveButton' written once`)
  assert.match(src, /var SUBMIT_ID ?= ?'saveButton';/, `${name}: Submit's id is a constant`)
  assert.equal(count(src, /SUBMIT_ID/), 3, `${name}: SUBMIT_ID used exactly twice`)
  assert.match(src, /'#' ?\+ ?SUBMIT_ID ?\+ ?'\{outline:3px solid '/, `${name}: SUBMIT_ID in the outline rule`)
  assert.match(src, /if ?\(n\.id ?=== ?SUBMIT_ID\) ?return ?'Submit';/, `${name}: SUBMIT_ID in the refusal`)
  // One click, behind the refusal; no other way to press anything.
  assert.equal(count(src, /\.click\(/), 1, `${name}: one .click()`)
  assert.match(src, /function click\(el\) ?\{ ?var why ?= ?refusal\(el\); ?if ?\(why\) ?throw new Error\([^;]*\); ?el\.click\(\); ?\}/, `${name}: click() refuses first`)
  for (const re of [/MouseEvent|PointerEvent|TouchEvent/, /Event\('(click|submit|mousedown|mouseup|pointerdown|touchstart)'/, /\.submit\(|requestSubmit/, /submitRegistration\s*\(/, /\bfocus\(\)[^;]*SUBMIT/])
    assert.doesNotMatch(src, re, `${name}: no ${re}`)
  // Never a value, a secret or the session.
  assert.doesNotMatch(src, /\.value\b/, `${name}: never reads .value`)
  assert.equal(count(src, /getAttribute\('value'\)/), 1, `${name}: one value attribute read`)
  assert.match(src, /tag ?=== ?'BUTTON' ?\? ?el\.getAttribute\('value'\)/, `${name}: and only a button's label`)
  assert.equal(count(src, /password/), 1, `${name}: 'password' only in the skip guard`)
  assert.match(src, /return t ?=== ?'password' ?\|\| ?t ?=== ?'hidden';/, `${name}: the skip guard`)
  for (const re of [/document\.cookie/, /localStorage|sessionStorage|indexedDB/, /synchronizer/i, /XMLHttpRequest|fetch\(|sendBeacon|WebSocket/, /\beval\(|new Function|import\(/, /setInterval/, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/])
    assert.doesNotMatch(src, re, `${name}: no ${re}`)
  // Only on Banner's registration page.
  assert.match(src, /var HOST ?= ?'banner\.usask\.ca';/, `${name}: host constant`)
  assert.match(src, /var PATH ?= ?'\/StudentRegistrationSsb\/ssb\/classRegistration';/, `${name}: path constant`)
  assert.match(src, /loc\.protocol ?=== ?'https:' ?&& ?loc\.hostname ?=== ?HOST ?&&/, `${name}: host guard`)
}
assert.ok(!lean.includes('function describe'), 'the bookmarklet leaves the native diagnostics out')
console.log(`check-paws-agent: bookmarklet ${link.length} chars (${(link.length / 1024).toFixed(1)} KB), native script ${native.length}`)
assert.ok(link.length < 12 * 1024, 'bookmarklet stays under 12 KB')

// --- 4. the script in a fake Banner page ---
class FakeEvent {
  type: string
  key?: string
  constructor(type: string, init?: { key?: string }) {
    this.type = type
    this.key = init?.key
  }
}

let valueReads = 0

class El {
  tagName: string
  id = ''
  className = ''
  nodeType = 1
  attrs = new Map<string, string>()
  children: El[] = []
  parentElement: El | null = null
  style: Record<string, string> = { cssText: '' }
  own = ''
  visible = true
  disabled = false
  readOnly = false
  events: string[] = []
  onclick: (() => void) | null = null
  constructor(tag: string, init: { id?: string; text?: string; attrs?: Record<string, string>; visible?: boolean; className?: string } = {}) {
    this.tagName = tag.toUpperCase()
    this.id = init.id ?? ''
    this.own = init.text ?? ''
    this.visible = init.visible ?? true
    this.className = init.className ?? ''
    for (const [k, v] of Object.entries(init.attrs ?? {})) this.attrs.set(k, v)
  }
  get textContent(): string {
    return this.own + this.children.map((c) => c.textContent).join('')
  }
  set textContent(v: string) {
    this.own = String(v)
    this.children = []
  }
  get innerText() {
    return this.textContent
  }
  get childNodes() {
    return this.children
  }
  get firstChild() {
    return this.children[0] ?? null
  }
  get isConnected(): boolean {
    return this.parentElement ? this.parentElement.isConnected : this.tagName === 'HTML'
  }
  setAttribute(k: string, v: string) {
    if (k === 'id') this.id = v
    else this.attrs.set(k, String(v))
  }
  getAttribute(k: string) {
    if (k === 'id') return this.id || null
    if (k === 'class') return this.className || null
    return this.attrs.get(k) ?? null
  }
  appendChild(c: El) {
    c.parentElement = this
    this.children.push(c)
    return c
  }
  removeChild(c: El) {
    this.children = this.children.filter((x) => x !== c)
    c.parentElement = null
    return c
  }
  remove() {
    this.parentElement?.removeChild(this)
  }
  contains(o: El | null) {
    for (let n = o; n; n = n.parentElement) if (n === this) return true
    return false
  }
  get laidOut(): boolean {
    return this.visible && (this.parentElement ? this.parentElement.laidOut : this.tagName === 'HTML')
  }
  getClientRects() {
    return this.laidOut ? [{}] : []
  }
  focus() {
    this.events.push('focus')
  }
  scrollIntoView() {}
  click() {
    this.events.push('click')
    clicks.push(this.id || this.textContent)
    this.onclick?.()
  }
  dispatchEvent(e: FakeEvent) {
    this.events.push(e.type)
    return true
  }
  addEventListener(type: string, fn: () => void) {
    if (type === 'click') this.onclick = fn
  }
  all(): El[] {
    return this.children.flatMap((c) => [c, ...c.all()])
  }
  querySelectorAll(sel: string) {
    return this.all().filter((el) => matches(el, sel))
  }
  querySelector(sel: string) {
    return this.querySelectorAll(sel)[0] ?? null
  }
  closest(sel: string): El | null {
    return matches(this, sel) ? this : (this.parentElement?.closest(sel) ?? null)
  }
}

class Input extends El {
  typed = ''
  constructor(init: ConstructorParameters<typeof El>[1] = {}) {
    super('input', init)
  }
  get value() {
    valueReads += 1
    return this.typed
  }
  set value(v: string) {
    this.typed = v
  }
}

function matches(el: El, sel: string): boolean {
  return sel.split(',').some((part) => {
    const p = part.trim()
    const attr = /^\[([\w-]+)=([\w-]+)\]$/.exec(p)
    if (attr) return el.getAttribute(attr[1]) === attr[2]
    const cls = /^\.([\w-]+)$/.exec(p)
    if (cls) return el.className.split(/\s+/).includes(cls[1])
    if (/^[a-z]+$/.test(p)) return el.tagName === p.toUpperCase()
    throw new Error(`fake DOM: unsupported selector ${p}`)
  })
}

let clicks: string[] = []
const STUDENT = 'Jane Doe 11223344'

interface Page {
  url: string
  ids?: boolean // Banner's ids present (else only the text fallbacks)
  termFirst?: boolean // a term chooser shows before the tabs, and goes after 5 s
  trap?: 'label' | 'form' // Add to Summary is really a Submit, or sits in a submitRegistration form
  noTab?: boolean
  noPanel?: boolean // no Enter CRNs tab or panel to find (Banner renamed them): the dump falls back to the main content
}

function run(page: Page, mode: 'native' | 'bookmarklet', opts: { twice?: boolean } = {}) {
  valueReads = 0
  clicks = []
  let clock = 0
  let seq = 0
  const timers: { at: number; seq: number; fn: () => void }[] = []
  const posts: unknown[] = []
  const alerts: string[] = []
  const infos: unknown[][] = []
  const html = new El('html')
  const head = html.appendChild(new El('head'))
  const body = html.appendChild(new El('body'))
  const doc = {
    documentElement: html,
    head,
    body,
    createElement: (tag: string) => new El(tag),
    getElementById: (id: string) => html.all().find((el) => el.id === id) ?? null,
    querySelectorAll: (sel: string) => html.querySelectorAll(sel),
    querySelector: (sel: string) => html.querySelector(sel),
  }
  const id = (s: string) => (page.ids ? s : '')

  // Banner's header, with the student's name and number in its user menu and a greeting of its own.
  const header = body.appendChild(new El('header'))
  const menu = header.appendChild(new El('div', { id: 'user-menu' }))
  menu.appendChild(new El('button', { text: STUDENT }))
  header.appendChild(new El('div', { text: `Welcome back, ${STUDENT}.`, attrs: { role: 'alert' } }))
  // Outside the registration content too: a site-wide notice and a control.
  const elsewhere = body.appendChild(new El('div', { id: 'elsewhere' }))
  elsewhere.appendChild(new El('div', { text: `Your session ends soon, ${STUDENT}.`, attrs: { role: 'alert' } }))
  elsewhere.appendChild(new El('button', { id: 'outside', text: 'Continue' }))
  // The registration content.
  const main = body.appendChild(new El('div', { id: 'content' }))
  main.appendChild(new El('div', { text: 'Register for Classes. Term: 2027 Winter Term' }))
  main.appendChild(new El('a', { id: id('search-tab'), text: 'Find Classes', attrs: { role: 'tab', href: '#search' } }))
  const tab = main.appendChild(new El('a', { id: id('enterCRNs-tab'), text: 'Enter CRNs', attrs: { role: 'tab', href: '#enterCRNs' }, visible: !page.termFirst && !page.noTab && !page.noPanel }))
  const chooser = main.appendChild(new El('div', { id: 's2id_txt_term', visible: !!page.termFirst }))
  const panel = main.appendChild(new El('div', { id: page.noPanel ? '' : 'enterCRNs', visible: false }))
  // Inside it, the student's name on a control that isn't one of Banner's, and a profile link.
  main.appendChild(new El('button', { text: STUDENT, className: 'chip' }))
  main.appendChild(new El('a', { text: STUDENT, className: 'user-profile' }))
  const boxes: Input[] = []
  const addBox = () => {
    const n = boxes.length + 1
    const box = new Input({ id: id(`txt_crn${n}`), attrs: { type: 'text', 'aria-label': 'CRN', ...(page.ids ? {} : { name: `crn${n}` }) } })
    boxes.push(box)
    panel.appendChild(box)
  }
  addBox()
  tab.onclick = () => (panel.visible = true)
  const another = panel.appendChild(new El('a', { id: id('addAnotherCRN'), text: '+ Add Another CRN' }))
  another.onclick = addBox
  const holder = page.trap === 'form' ? panel.appendChild(new El('form', { attrs: { action: '/StudentRegistrationSsb/ssb/classRegistration/submitRegistration/batch' } })) : panel
  const add = holder.appendChild(new El('button', { id: id('addCRNbutton'), text: page.trap === 'label' ? 'Submit' : 'Add to Summary' }))
  let summary: string[] = []
  add.onclick = () => {
    summary = boxes.map((b) => b.typed).filter(Boolean)
    notice.visible = true
  }
  const notice = main.appendChild(new El('div', { text: 'CRN 30463 needs its linked lab.', attrs: { role: 'alert' }, visible: false }))
  main.appendChild(new Input({ attrs: { type: 'password', name: 'pin' } }))
  main.appendChild(new Input({ attrs: { type: 'hidden', name: 'synchronizerTokenField' } }))
  const save = main.appendChild(new El('button', { id: 'saveButton', text: 'Submit' }))
  let submitted = false
  save.onclick = () => (submitted = true)

  const setTimeout = (fn: () => void, ms?: number) => {
    timers.push({ at: clock + (ms ?? 0), seq: seq++, fn })
    return seq
  }
  if (page.termFirst) {
    setTimeout(() => {
      chooser.visible = false
      tab.visible = true
    }, 5000)
  }
  const u = new URL(page.url)
  const sandbox: Record<string, unknown> = {
    document: doc,
    location: { protocol: u.protocol, hostname: u.hostname, pathname: u.pathname },
    mobileApp: { postMessage: (m: unknown) => posts.push(JSON.parse(JSON.stringify(m))) },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    HTMLInputElement: Input,
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    alert: (t: string) => alerts.push(t),
    console: { info: (...a: unknown[]) => infos.push(a) },
    setTimeout,
    Date: { now: () => clock },
  }
  sandbox.window = sandbox
  const context = vm.createContext(sandbox)
  const code = mode === 'native' ? agentScript(CRNS, { termLabel: TERM, mode }) : lean
  const completion = vm.runInContext(code, context)
  if (opts.twice) vm.runInContext(code, context)

  return {
    completion,
    async settle() {
      for (let guard = 0; guard < 100000; guard++) {
        await tick()
        if (!timers.length) {
          await tick()
          if (!timers.length) return
        }
        timers.sort((a, b) => a.at - b.at || a.seq - b.seq)
        const t = timers.shift()!
        clock = Math.max(clock, t.at)
        t.fn()
      }
      throw new Error('timers never settled')
    },
    get clock() {
      return clock
    },
    msgs: () => posts.map((p) => (p as { detail: AgentMsg }).detail),
    posts,
    alerts,
    infos,
    boxes,
    body,
    head,
    save,
    add,
    timers,
    summary: () => summary,
    submitted: () => submitted,
  }
}

const READY = "Everything's in your summary. Review it and press Submit when you're ready. Tuition is charged when you register."

for (const ids of [true, false]) {
  const r = run({ url: CLASS_REG, ids }, 'native')
  assert.equal(r.completion, undefined, 'the script evaluates to undefined')
  await r.settle()
  const msgs = r.msgs()
  const label = ids ? "Banner's ids" : 'text fallbacks'
  assert.ok(r.posts.every((p) => p && typeof p === 'object' && 'detail' in p), `${label}: posts wrap the message in detail`)
  assert.deepEqual(r.summary(), CRNS, `${label}: every CRN typed into its own box, then Add to Summary`)
  assert.deepEqual(r.boxes.map((b) => b.typed), CRNS, `${label}: the boxes hold the CRNs in order`)
  assert.equal(msgs.at(-1)?.type, 'ready', `${label}: ends ready`)
  assert.equal(msgs.at(-1)?.text, READY)
  for (const [i, crn] of CRNS.entries()) assert.ok(msgs.some((m) => m.text === `Typing CRN ${crn} (${i + 1} of ${CRNS.length}).`), `${label}: says CRN ${i + 1}`)
  assert.ok(msgs.some((m) => m.text === 'Banner says: CRN 30463 needs its linked lab.'), `${label}: relays Banner's notice`)
  assert.ok(!msgs.some((m) => /Jane|11223344/.test(m.text ?? '')), `${label}: never relays the header's or the site's notices`)
  assert.ok(!msgs.some((m) => /another term/.test(m.text ?? '')), `${label}: no term warning when Banner shows the term`)
  assert.ok(!r.submitted() && !r.save.events.includes('click') && !r.save.events.includes('focus'), `${label}: Submit untouched`)
  assert.equal(valueReads, 0, `${label}: no input value read`)
  const style = r.head.children.find((c) => c.tagName === 'STYLE')
  assert.ok(style && style.textContent.startsWith('#saveButton{outline:3px solid #982649'), `${label}: Submit outlined by CSS alone`)
  const bubble = r.body.children.find((c) => c.getAttribute('role') === 'status')
  assert.ok(bubble && bubble.getAttribute('aria-live') === 'polite', `${label}: status bubble`)
  assert.ok(bubble.textContent.includes(READY), `${label}: bubble shows ready`)
  assert.ok(r.boxes.every((b) => ['focus', 'input', 'keydown', 'keyup', 'change'].every((e) => b.events.includes(e))), `${label}: typed with real events`)
  assert.ok(r.clock >= CRNS.length * 5 * 120 + 2000, `${label}: typed at a readable pace`)
  assert.equal(r.timers.length, 0, `${label}: no timers left after ready`)
  assert.equal(clicks.filter((c) => /submit/i.test(c)).length, 0, `${label}: nothing labelled Submit clicked`)
}
{
  const r = run({ url: CLASS_REG, ids: true }, 'bookmarklet')
  await r.settle()
  assert.equal(r.posts.length, 0, 'bookmarklet never talks to the app bridge')
  assert.deepEqual(r.summary(), CRNS, 'bookmarklet fills the same CRNs')
  assert.ok(!r.submitted(), 'bookmarklet leaves Submit alone')
  const bubble = r.body.children.find((c) => c.getAttribute('role') === 'status')
  assert.ok(bubble?.textContent.includes(READY), 'bookmarklet bubble shows ready')
  assert.ok(r.infos.length > 0, 'bookmarklet logs progress to the console')
}
for (const mode of ['native', 'bookmarklet'] as const) {
  // Banner asks for the term on the registration page itself: pressing Continue would reload the page
  // (and end the script), so Max stops and says how to start again, rather than wait.
  const r = run({ url: CLASS_REG, ids: true, termFirst: true }, mode)
  await r.settle()
  const again =
    mode === 'native'
      ? "Close PAWS, tap Fill it in on PAWS again and pick Winter 2027 on Banner’s term page when it asks."
      : 'Choose Winter 2027, press Continue, then click Fill it in for me again.'
  const said = `Banner is asking for the term first. ${again}`
  if (mode === 'native') assert.deepEqual(r.msgs().slice(-1), [{ type: 'error', text: said }], 'term first: one error, no dump')
  assert.ok(r.body.children.find((c) => c.getAttribute('role') === 'status')?.textContent.includes(said), `term first (${mode}): the bubble says so`)
  assert.ok(!r.msgs().some((m) => m.type === 'ready' || /^Choose/.test(m.text ?? '')), `term first (${mode}): never asks to press Continue mid-script`)
  assert.deepEqual(clicks, [], `term first (${mode}): nothing clicked`)
  assert.ok(r.boxes.every((b) => !b.typed) && r.summary().length === 0, `term first (${mode}): nothing typed`)
  assert.ok(r.clock <= 5000, `term first (${mode}): stops at once, without waiting on the chooser`)
}
for (const trap of ['label', 'form'] as const) {
  const r = run({ url: CLASS_REG, ids: true, trap }, 'native')
  await r.settle()
  const msgs = r.msgs()
  assert.deepEqual(types(msgs.slice(-2)), ['error', 'dump'], `trap ${trap}: error then dump`)
  assert.match(msgs.at(-2)!.text!, /Max stopped while pressing Add to Summary\. Max never presses Submit\. Nothing was submitted\./, `trap ${trap}: says why`)
  assert.ok(!r.add.events.includes('click') && !r.submitted(), `trap ${trap}: the trap is never pressed`)
  const rows = msgs.at(-1)!.rows!
  assert.ok(rows.length > 0 && rows.length <= 80, `trap ${trap}: dump rows`)
  assert.ok(rows.some((row) => row.startsWith('BUTTON#saveButton "Submit"')), `trap ${trap}: dump lists buttons`)
  assert.ok(rows.includes('A#enterCRNs-tab "Enter CRNs"'), `trap ${trap}: Banner's control words kept`)
  assert.ok(rows.some((row) => row.startsWith('A#addAnotherCRN') && row.endsWith('"Add Another CRN"')), `trap ${trap}: "+ Add Another CRN" kept as its words`)
  assert.ok(rows.includes('BUTTON.chip'), `trap ${trap}: any other text is left out, tag and class only`)
  assert.ok(!rows.some((row) => /Jane|11223344/.test(row)), `trap ${trap}: no name or student number in the dump`)
  assert.ok(!rows.some((row) => /user|#outside/i.test(row)), `trap ${trap}: dump stays inside the registration content, off the user menu`)
  assert.ok(!rows.some((row) => /pin|synchronizer|type=password|type=hidden/.test(row)), `trap ${trap}: dump skips password and hidden fields`)
  assert.ok(!rows.some((row) => CRNS.some((crn) => row.includes(crn))), `trap ${trap}: dump holds no typed values`)
  assert.equal(valueReads, 0, `trap ${trap}: no value read`)
  assert.equal(r.timers.length, 0, `trap ${trap}: no timers left after error`)
}
{
  const r = run({ url: CLASS_REG, ids: true, noTab: true }, 'native')
  await r.settle()
  const msgs = r.msgs()
  assert.deepEqual(types(msgs.slice(-2)), ['error', 'dump'], 'no tab: error then dump')
  assert.match(msgs.at(-2)!.text!, /The Enter CRNs tab didn't show up in 20 seconds/)
  assert.deepEqual(clicks, [], 'no tab: nothing clicked')
  assert.ok(r.clock >= 20000 && r.clock < 21000, 'no tab: gives up after its 20 s wait, no retry')
}
{
  const r = run({ url: CLASS_REG, ids: true, noPanel: true }, 'native')
  await r.settle()
  const rows = r.msgs().at(-1)!.rows!
  assert.equal(r.msgs().at(-1)!.type, 'dump', 'no panel: error then dump')
  assert.ok(rows.some((row) => row.startsWith('BUTTON#saveButton')), 'no panel: the dump reads the main content')
  assert.ok(!rows.some((row) => /Jane|11223344|user|#outside/i.test(row)), 'no panel: and nothing outside it')
}
for (const url of ['https://cas.usask.ca/cas/login?TARGET=' + encodeURIComponent(CLASS_REG), 'https://banner.usask.ca.evil.com/StudentRegistrationSsb/ssb/classRegistration/classRegistration', TERM_SELECT]) {
  for (const mode of ['native', 'bookmarklet'] as const) {
    const r = run({ url, ids: true }, mode)
    await r.settle()
    assert.deepEqual(clicks, [], `${url} (${mode}): nothing clicked`)
    assert.ok(!r.body.children.some((c) => c.getAttribute('role') === 'status'), `${url} (${mode}): page untouched`)
    assert.ok(r.boxes.every((b) => !b.typed), `${url} (${mode}): nothing typed`)
    if (mode === 'native') assert.deepEqual(types(r.msgs()), ['error'], `${url}: one error`)
    else assert.equal(r.alerts.length, 1, `${url}: the bookmarklet says where it works`)
  }
}
{
  const r = run({ url: CLASS_REG, ids: true }, 'native', { twice: true })
  await r.settle()
  assert.equal(r.msgs().filter((m) => m.type === 'ready').length, 1, 'a second run on the same page does nothing')
  assert.deepEqual(r.summary(), CRNS)
}

// --- 5. the plugin wiring ---
const agent = readFileSync(new URL('src/lib/pawsAgent.ts', ROOT), 'utf8')
for (const needle of ['persistWebViewData: false', 'clearCookiesOnOpen: true', 'clearAllCookies({ id })', 'clearAllCookies()', 'Capacitor.isNativePlatform()', 'url: REG_URL', "mode: 'native'"])
  assert.ok(agent.includes(needle), `pawsAgent.ts has ${needle}`)
assert.equal(count(agent, /executeScript\(/), 1, 'pawsAgent.ts calls executeScript in one place')
assert.match(agent, /execute: \(id, script\) => InAppBrowser\.executeScript\(\{ id, code: script \}\)/, 'and only through agentSession')
assert.ok(agent.indexOf("addListener('urlChangeEvent'") < agent.indexOf('openWebView('), 'listeners before openWebView')
for (const re of [/saveButton/, /password/i, /credentials/, /getCookies/, /preShowScript/, /proxyRequests|ProxyRules|addProxyHandler/, /buttonNearDone/, /useSharedDataStore/, /headers:/, /captureConsoleLogs/, /setUrl/, /dispatchInputEvent/, /\.postMessage\(/, /setInterval/, /localStorage/, /console\./])
  assert.doesNotMatch(agent, re, `pawsAgent.ts: no ${re}`)

// The server never goes near sign-in or registration: api/ stays on the public class search.
for (const file of readdirSync(new URL('api/', ROOT), { recursive: true }) as string[]) {
  if (!file.endsWith('.ts')) continue
  const src = readFileSync(new URL(`api/${file}`, ROOT), 'utf8')
  assert.doesNotMatch(src, /cas\.usask\.ca|registerPostSignIn|ssb\/classRegistration|submitRegistration|mode=registration/, `api/${file} stays off sign-in and registration`)
}

// --- 6. the in-app browser is the patched 8.20.0 (patches/, applied on postinstall) ---
const plugin = new URL('node_modules/@capgo/capacitor-inappbrowser/', ROOT)
assert.equal(JSON.parse(readFileSync(new URL('package.json', plugin), 'utf8')).version, '8.20.0', 'the installed plugin is the patched version')
const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'))
assert.equal(pkg.dependencies['@capgo/capacitor-inappbrowser'], '8.20.0', 'the plugin is pinned')
assert.match(pkg.scripts.postinstall, /patch-package --error-on-fail/, 'a patch that fails to apply fails the install')
const droid = readFileSync(new URL('android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewDialog.java', plugin), 'utf8')
assert.ok(droid.includes('SCRIPT_ORIGIN = "https://banner.usask.ca"') && droid.includes('scriptsAllowedNow()'), 'Android: the plugin scripts banner.usask.ca only')
assert.doesNotMatch(droid, /Collections\.singleton\("\*"\)/, 'Android: no document-start script for every origin')
const swift = readFileSync(new URL('ios/Sources/InAppBrowserPlugin/WKWebViewController.swift', plugin), 'utf8')
assert.ok(swift.includes('func syncUserScripts') && swift.includes('func scriptsAllowedNow'), 'iOS: the plugin scripts banner.usask.ca only')

console.log('check-paws-agent: ok')
