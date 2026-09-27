// The pure half of Max's hands in PAWS (src/lib/pawsAgent.ts is the native half): the URL guards,
// the session that decides when the agent script may run, and the script itself. On Banner's own
// class registration page, after the student has signed in on USask's page themselves, the script
// opens Enter CRNs, types each CRN, presses Add to Summary and stops, with Banner's Submit outlined
// for the student to press. No Capacitor and no DOM here, so node checks all of it:
// scripts/check-paws-agent.ts.
//
// Whatever mode it runs in, the script never presses or even looks up Submit (the outline is a CSS
// rule; the id's only other use is click()'s refusal), never retries, never reads an input's value,
// skips password and hidden fields, and never reads cookies, storage or Banner's synchronizer token.

/** Banner 9's registration entry. Signed out, it sends the student to CAS and back. */
export const REG_URL = 'https://banner.usask.ca/StudentRegistrationSsb/ssb/registration/registerPostSignIn?mode=registration'

const BANNER_HOST = 'banner.usask.ca'
const SSB = '/StudentRegistrationSsb/ssb/'
const CLASS_REGISTRATION = SSB + 'classRegistration'
// Banner's Enter CRNs panel takes a handful; a plan never needs more than this.
const MAX_CRNS = 20

/** What the app says around the agent, so every screen words it the same way. */
export const PAWS_COPY = {
  pitch: 'Max plans your registration and fills it in for you in your own PAWS session; you press Submit.',
  signIn:
    "Sign in on USask's own page. Approve with Microsoft Authenticator (a push or a code): Face ID, Touch ID and passkeys don't work inside the app.",
  tuition: 'Tuition is charged when you register.',
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Banner itself, over https on its own host. Reaching it from CAS means the student has signed in. */
export function isBanner(url: string): boolean {
  const u = parse(url)
  return !!u && u.protocol === 'https:' && u.hostname === BANNER_HOST && !u.port && !u.username && !u.password
}

/** Banner's class registration page: the only page the agent script is ever injected into. */
export function isClassRegistration(url: string): boolean {
  const u = parse(url)
  if (!u || !isBanner(url)) return false
  return u.pathname === CLASS_REGISTRATION || u.pathname.startsWith(CLASS_REGISTRATION + '/')
}

/** Banner's term chooser, between signing in and the registration page. Never scripted. */
export function isTermSelection(url: string): boolean {
  const u = parse(url)
  return !!u && isBanner(url) && u.pathname.startsWith(SSB + 'term/termSelection')
}

export type AgentMsg = {
  type: 'status' | 'signed-in' | 'progress' | 'ready' | 'error' | 'dump' | 'closed'
  text?: string
  rows?: string[]
}

// What the page may send. 'signed-in' and 'closed' only ever come from the app's side.
const PAGE_TYPES = new Set(['status', 'progress', 'ready', 'error', 'dump'])
const MAX_TEXT = 240
const MAX_ROWS = 80
const MAX_ROW = 160

/** A message from the page, checked and trimmed, or null. The bridge wraps it once or twice. */
export function fromPage(event: unknown): AgentMsg | null {
  const e = event as { detail?: { detail?: unknown } } | null | undefined
  for (const raw of [e?.detail?.detail, e?.detail]) {
    if (!raw || typeof raw !== 'object') continue
    const { type, text, rows } = raw as Record<string, unknown>
    if (typeof type !== 'string' || !PAGE_TYPES.has(type)) continue
    const m: AgentMsg = { type: type as AgentMsg['type'] }
    if (typeof text === 'string') m.text = text.slice(0, MAX_TEXT)
    if (Array.isArray(rows)) m.rows = rows.slice(0, MAX_ROWS).map((row) => String(row).slice(0, MAX_ROW))
    return m
  }
  return null
}

/** The page's origin and path: a hash or query change within a page isn't a new page. */
function pageOf(url: string): string {
  const u = parse(url)
  return u ? u.origin + u.pathname : url
}

type ViewEvent = { id?: string } | null | undefined

export interface AgentSession {
  /** The event came from this session's web view (or can't say, before its id is known). */
  ours(e: ViewEvent): boolean
  /** openWebView answered with the view's id. */
  opened(id: string | null): void
  onUrl(e: (ViewEvent & { url?: unknown }) | null | undefined): void
  onLoaded(e: ViewEvent): void
  onMessage(e: unknown): void
  /** The view is gone: every later event is ignored. */
  end(): void
}

/**
 * The rules for one openPawsAgent call, apart from the plugin: the script is injected at most once,
 * only into a finished load of Banner's class registration page, and page messages count only
 * after that. `execute` is the plugin's executeScript.
 */
export function agentSession(opts: {
  code: string
  termLabel: string
  emit: (m: AgentMsg) => void
  execute: (id: string, code: string) => Promise<unknown>
}): AgentSession {
  let id: string | null = null
  let url = ''
  let loaded = false // the page at `url` has finished loading
  let leftBanner = false // went through CAS (or Microsoft): coming back to Banner is signing in
  let signedIn = false
  let choosing = false
  let injected = false
  let settled = false // the script reported ready or error
  let done = false
  const { emit } = opts

  const ours = (e: ViewEvent) => !id || !e?.id || e.id === id

  const inject = () => {
    if (done || injected || !id || !loaded || !isClassRegistration(url)) return
    injected = true
    emit({ type: 'status', text: 'Max is filling in your CRNs.' })
    opts.execute(id, opts.code).catch(() => {
      if (done || settled) return
      settled = true
      emit({ type: 'error', text: "Max couldn't start on Banner's page. Nothing was submitted." })
    })
  }

  return {
    ours,
    opened(viewId) {
      if (done) return
      id = viewId
      // Banner's page may have loaded before the id came back.
      inject()
    },
    onUrl(e) {
      if (done || !ours(e) || typeof e?.url !== 'string') return
      if (pageOf(e.url) !== pageOf(url)) loaded = false
      url = e.url
      if (url.startsWith('https://') && !isBanner(url)) leftBanner = true
      if (!signedIn && isBanner(url) && (leftBanner || isTermSelection(url) || isClassRegistration(url))) {
        signedIn = true
        emit({ type: 'signed-in', text: 'Signed in. Opening registration.' })
      }
      if (!choosing && isTermSelection(url)) {
        choosing = true
        emit({ type: 'status', text: `Choose ${opts.termLabel} and press Continue.` })
      }
      if (injected && !settled && !isClassRegistration(url)) {
        settled = true
        emit({ type: 'error', text: 'The page changed before Max finished. Nothing was submitted.' })
      }
    },
    onLoaded(e) {
      if (done || !ours(e)) return
      loaded = true
      inject()
    },
    onMessage(e) {
      if (done || !injected || !ours(e as ViewEvent)) return
      const m = fromPage(e)
      if (!m) return
      if (m.type === 'ready' || m.type === 'error') settled = true
      emit(m)
    },
    end() {
      done = true
    },
  }
}

// The script itself. Plain ES2017 with explicit semicolons, no comments, no template literals and no
// whitespace or quotes inside its regexes, so compact() can squeeze it safely. __CFG__ becomes a
// JSON literal and __DIAGNOSE__ the native-only helpers below. The brand colours (ink, Old Lace,
// Cherry Rose) are written out: Banner's page can't read tokens.css.
const SCRIPT = `(function () {
  'use strict';
  var CFG = __CFG__;
  var HOST = 'banner.usask.ca';
  var PATH = '/StudentRegistrationSsb/ssb/classRegistration';
  var SUBMIT_ID = 'saveButton';
  var INK = '#12262B';
  var LACE = '#FFF8EB';
  var ROSE = '#982649';
  var loc = window.location;
  var onPage = loc.protocol === 'https:' && loc.hostname === HOST && (loc.pathname === PATH || loc.pathname.indexOf(PATH + '/') === 0);
  var bubble = null;
  var log = null;
  var hidden = false;
  var step = 'starting';

  function send(m) {
    if (CFG.mode === 'native') {
      var app = window.mobileApp;
      if (app && typeof app.postMessage === 'function') {
        try { app.postMessage({ detail: m }); } catch (e) {}
      }
    } else {
      try { console.info('[Max] ' + (m.text || m.type), m.rows || ''); } catch (e) {}
    }
  }

  if (!onPage) {
    var off = "Max only fills in Banner's Register for Classes page.";
    send({ type: 'error', text: off });
    if (CFG.mode === 'bookmarklet') {
      try { window.alert(off); } catch (e) {}
    }
    return;
  }
  if (window.__studymaxMax) return;
  window.__studymaxMax = true;

  function box() {
    if (bubble && bubble.isConnected) return;
    bubble = document.createElement('div');
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.style.cssText = 'position:fixed;left:12px;bottom:72px;z-index:2147483646;box-sizing:border-box;max-width:min(300px,calc(100vw - 150px));padding:10px 34px 10px 12px;border-radius:12px;border-left:4px solid ' + ROSE + ';background:' + INK + ';color:' + LACE + ';font:13px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 6px 20px rgba(18,38,43,.35)';
    var head = document.createElement('div');
    head.textContent = 'Max';
    head.style.cssText = 'font-weight:700;margin-bottom:2px';
    log = document.createElement('div');
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '\\u00d7';
    x.setAttribute('aria-label', 'Hide Max');
    x.style.cssText = 'position:absolute;top:4px;right:4px;width:28px;height:28px;padding:0;border:0;border-radius:14px;background:transparent;color:' + LACE + ';font:18px/28px system-ui,sans-serif';
    x.addEventListener('click', function () {
      hidden = true;
      bubble.remove();
    });
    bubble.appendChild(head);
    bubble.appendChild(log);
    bubble.appendChild(x);
    (document.body || document.documentElement).appendChild(bubble);
  }

  function say(m) {
    var last = m.type === 'ready' || m.type === 'error';
    if (!m.text || m.type === 'dump' || (hidden && !last)) return;
    try {
      box();
      var line = document.createElement('div');
      line.textContent = m.text;
      if (last) line.style.fontWeight = '600';
      log.appendChild(line);
      if (log.childNodes.length > 3) log.removeChild(log.firstChild);
    } catch (e) {}
  }

  function post(m) {
    say(m);
    send(m);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitFor(fn, ms, what) {
    var limit = ms || 20000;
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      function tick() {
        var hit = null;
        try { hit = fn(); } catch (e) { hit = null; }
        if (hit) return resolve(hit);
        if (Date.now() - start >= limit) return reject(new Error(what + " didn't show up in " + Math.round(limit / 1000) + ' seconds.'));
        setTimeout(tick, 250);
      }
      tick();
    });
  }

  function shown(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function ours(el) {
    return !!bubble && bubble.contains(el);
  }

  function words(el) {
    return (el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function byId(id) {
    var el = document.getElementById(id);
    return shown(el) ? el : null;
  }

  function byText(sel, re) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!ours(el) && shown(el) && (re.test(words(el)) || re.test(el.getAttribute('aria-label') || ''))) return el;
    }
    return null;
  }

  function secret(el) {
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    return t === 'password' || t === 'hidden';
  }

  function refusal(el) {
    if (!el || el.nodeType !== 1) return 'something that is not a button';
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'FORM') return 'a form field';
    for (var n = el; n; n = n.parentElement) {
      if (n.id === SUBMIT_ID) return 'Submit';
    }
    var label = [words(el), el.getAttribute('aria-label'), el.getAttribute('title'), tag === 'BUTTON' ? el.getAttribute('value') : ''].join(' ');
    if (/submit/i.test(label) || /^\\s*(register|save|confirm)\\s*$/i.test(words(el))) return 'Submit';
    var form = el.closest ? el.closest('form') : null;
    var action = (form ? form.getAttribute('action') || '' : '') + ' ' + (el.getAttribute('formaction') || '');
    if (/submitRegistration/i.test(action)) return 'Submit';
    return '';
  }

  function click(el) {
    var why = refusal(el);
    if (why) throw new Error('Max never presses ' + why + '.');
    el.click();
  }

  function crnTab() {
    return byId('enterCRNs-tab') || byText('a,button,[role=tab]', /^\\s*Enter\\s+CRNs\\s*$/i);
  }

  function termChooser() {
    return byId('s2id_txt_term') || byId('txt_term') || byId('term-go');
  }

  function panel() {
    var tab = crnTab();
    var ref = tab ? tab.getAttribute('aria-controls') || (tab.getAttribute('href') || '').replace(/^#/, '') : '';
    return (ref && /^[\\w-]+$/.test(ref) && document.getElementById(ref)) || document.getElementById('enterCRNs') || document;
  }

  function field(el) {
    if (!el || el.tagName !== 'INPUT' || secret(el)) return false;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    return (t === 'text' || t === 'tel' || t === 'number' || t === 'search') && shown(el) && !el.disabled && !el.readOnly;
  }

  function crnBox(n) {
    var el = document.getElementById('txt_crn' + n);
    if (field(el)) return el;
    var list = panel().querySelectorAll('input');
    var seen = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (field(f) && /crn/i.test([f.id, f.getAttribute('name'), f.getAttribute('aria-label'), f.getAttribute('placeholder')].join(' '))) {
        seen += 1;
        if (seen === n) return f;
      }
    }
    return null;
  }

  function boxFinder(n) {
    return function () { return crnBox(n); };
  }

  function another() {
    return byId('addAnotherCRN') || byText('a,button', /Add\\s+Another\\s+CRN/i);
  }

  function addToSummary() {
    return byId('addCRNbutton') || byText('button,a', /^\\s*Add\\s+to\\s+Summary\\s*$/i);
  }

  function setText(el, text) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, text);
  }

  function fire(el, kind) {
    el.dispatchEvent(new Event(kind, { bubbles: true }));
  }

  function key(el, kind, ch) {
    el.dispatchEvent(new KeyboardEvent(kind, { key: ch, bubbles: true }));
  }

  async function typeCrn(el, crn) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    el.focus();
    setText(el, '');
    fire(el, 'input');
    for (var k = 0; k < crn.length; k++) {
      key(el, 'keydown', crn.charAt(k));
      setText(el, crn.slice(0, k + 1));
      fire(el, 'input');
      key(el, 'keyup', crn.charAt(k));
      await sleep(120);
    }
    fire(el, 'change');
  }

__DIAGNOSE__

  async function run() {
    var total = CFG.crns.length;
    post({ type: 'progress', text: 'Max is on your registration page. Opening Enter CRNs.' });
    step = 'finding the Enter CRNs tab';
    var tab = await waitFor(function () { return crnTab() || (termChooser() ? 'term' : null); }, 20000, 'The Enter CRNs tab');
    if (tab === 'term') {
      post({ type: 'progress', text: 'Choose ' + CFG.termLabel + ' and press Continue.' });
      step = 'waiting for you to choose ' + CFG.termLabel;
      tab = await waitFor(crnTab, 180000, 'The Enter CRNs tab');
    }
    if (CFG.year && !termShown()) post({ type: 'progress', text: 'These CRNs are for ' + CFG.termLabel + '. If Banner shows another term, stop here.' });
    step = 'opening Enter CRNs';
    click(tab);
    for (var i = 0; i < total; i++) {
      var n = i + 1;
      var crn = CFG.crns[i];
      step = 'finding CRN box ' + n;
      var input = crnBox(n);
      if (!input && i > 0) click(await waitFor(another, 5000, 'Add Another CRN'));
      if (!input) input = await waitFor(boxFinder(n), 10000, 'CRN box ' + n);
      step = 'typing CRN ' + crn;
      post({ type: 'progress', text: 'Typing CRN ' + crn + ' (' + n + ' of ' + total + ').' });
      await typeCrn(input, crn);
    }
    step = 'pressing Add to Summary';
    var add = await waitFor(addToSummary, 10000, 'Add to Summary');
    post({ type: 'progress', text: 'Pressing Add to Summary.' });
    click(add);
    await sleep(2000);
    var said = notices();
    for (var j = 0; j < said.length; j++) post({ type: 'progress', text: 'Banner says: ' + said[j] });
    step = 'outlining Submit';
    var style = document.createElement('style');
    style.textContent = '#' + SUBMIT_ID + '{outline:3px solid ' + ROSE + ' !important;outline-offset:3px !important;box-shadow:0 0 0 6px rgba(152,38,73,.25) !important}';
    (document.head || document.documentElement).appendChild(style);
    post({ type: 'ready', text: "Everything's in your summary. Review it and press Submit when you're ready. Tuition is charged when you register." });
  }

  run().then(null, function (err) {
    var why = String((err && err.message) || err).slice(0, 160);
    post({ type: 'error', text: 'Max stopped while ' + step + '. ' + why + ' Nothing was submitted.' });
    if (CFG.mode !== 'native') return;
    var rows = [];
    try { rows = dump(); } catch (e) {}
    post({ type: 'dump', rows: rows });
  });
})();
`

// Native only: what the app shows when something goes wrong (Banner's own notices, and a dump of
// the page's controls, labels only and never a value, for fixing a selector). The bookmarklet goes
// without, which keeps it short.
const DIAGNOSE = `  function termShown() {
    var t = ((document.body && document.body.innerText) || '').toLowerCase();
    return t.indexOf(CFG.year) >= 0 && t.indexOf(CFG.season) >= 0;
  }

  function notices() {
    var out = [];
    var els = document.querySelectorAll('[role=alert],.notification-center-message,.notification-message');
    for (var i = 0; i < els.length && out.length < 3; i++) {
      var t = words(els[i]).slice(0, 160);
      if (t && !ours(els[i]) && shown(els[i]) && out.indexOf(t) < 0) out.push(t);
    }
    return out;
  }

  function describe(el) {
    var tag = el.tagName;
    var s = tag + (el.id ? '#' + el.id : '');
    var cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3) : [];
    if (cls.length) s += '.' + cls.join('.');
    var name = el.getAttribute('name');
    if (name) s += ' name=' + name;
    var type = el.getAttribute('type');
    if (type) s += ' type=' + type;
    var formy = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    var label = formy ? el.getAttribute('placeholder') || el.getAttribute('aria-label') || '' : words(el) || el.getAttribute('aria-label') || '';
    if (label) s += ' ' + JSON.stringify(label.slice(0, 40));
    return s.slice(0, 160);
  }

  function dump() {
    var rows = [];
    var els = document.querySelectorAll('a,button,[role=tab],[role=button],input,select,textarea');
    for (var i = 0; i < els.length && rows.length < 80; i++) {
      var el = els[i];
      if (ours(el) || !shown(el) || (el.tagName === 'INPUT' && secret(el))) continue;
      rows.push(describe(el));
    }
    return rows;
  }
`

const LEAN = `  function termShown() { return true; }
  function notices() { return []; }
  function dump() { return []; }
`

/**
 * The agent script for these CRNs, as one self-contained IIFE. 'native' reports to the app through
 * the web view's bridge; 'bookmarklet' only shows its bubble (and the console). Throws on anything
 * that isn't a five-digit CRN, so nothing but digits is ever written into Banner's page.
 */
export function agentScript(crns: string[], opts: { termLabel: string; mode: 'native' | 'bookmarklet' }): string {
  const list = [...new Set(crns.map((crn) => String(crn).trim()))]
  if (list.length === 0) throw new Error('No CRNs to fill in.')
  if (list.length > MAX_CRNS) throw new Error(`Too many CRNs (${list.length}); Banner takes at most ${MAX_CRNS}.`)
  const bad = list.find((crn) => !/^\d{5}$/.test(crn))
  if (bad !== undefined) throw new Error(`Not a CRN: ${bad}`)
  if (opts.mode !== 'native' && opts.mode !== 'bookmarklet') throw new Error(`Unknown mode: ${String(opts.mode)}`)

  const termLabel = String(opts.termLabel ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  // 'Winter 2027' against Banner's '2027 Winter Term': both words should be on the page.
  const [, season = '', year = ''] = /^(\S+) (\d{4})$/.exec(termLabel) ?? []
  const cfg = JSON.stringify({ crns: list, termLabel, season: season.toLowerCase(), year, mode: opts.mode })
  const extras = opts.mode === 'native' ? DIAGNOSE : LEAN
  return SCRIPT.replace('__CFG__', () => cfg).replace('__DIAGNOSE__\n', () => extras)
}

/**
 * Squeezes whitespace outside string literals. Safe for SCRIPT because its regexes hold no
 * whitespace or quotes and it has no comments; the check script parses and runs the result.
 */
export function compact(code: string): string {
  let out = ''
  let quote = ''
  let gap = false
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      out += ch
      if (ch === '\\') out += code[++i]
      else if (ch === quote) quote = ''
      continue
    }
    if (/\s/.test(ch)) {
      gap = true
      continue
    }
    if (gap && /[\w$]/.test(out.slice(-1)) && /[\w$]/.test(ch)) out += ' '
    gap = false
    if (ch === "'" || ch === '"') quote = ch
    out += ch
  }
  return out
}

/** The same fill as a bookmarklet, for a browser signed in to PAWS. It still never presses Submit. */
export function bookmarklet(crns: string[], termLabel: string): string {
  return 'javascript:' + encodeURIComponent(compact(agentScript(crns, { termLabel, mode: 'bookmarklet' })))
}
