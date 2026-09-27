// The in-app PAWS agent. Opens USask's real registration in an in-app web view: the student signs in
// on USask's own CAS page (StudyMax never sees it and scripts nothing there), and once Banner's class
// registration page has loaded, the agent script runs on it exactly once to type the CRNs and press
// Add to Summary. The student presses Banner's Submit. When to inject lives in agentSession()
// (./pawsAgentScript.ts, pure and checked by scripts/check-paws-agent.ts); this file wires the plugin.
//
// Native only. On the web a page can't reach into another site, so canFillOnPaws is false and
// openPawsAgent throws; the bookmarklet is the browser's way.

import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { agentScript, agentSession, PAWS_COPY, REG_URL, type AgentMsg } from './pawsAgentScript.ts'

export { bookmarklet, isClassRegistration, PAWS_COPY, REG_URL, type AgentMsg } from './pawsAgentScript.ts'

/** The in-app web view exists: the native app, built with @capgo/capacitor-inappbrowser. */
export const canFillOnPaws = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CapgoInAppBrowser')

// The brand's ink and Old Lace, written out because the native toolbar can't read tokens.css.
const TOOLBAR_INK = '#12262B'
const TOOLBAR_TEXT = '#FFF8EB'

let active: { close: () => Promise<void> } | null = null

/**
 * Opens PAWS registration for the student to sign in, then fills the CRNs into Enter CRNs once.
 * One call is one attempt: nothing retries, and closing the view signs the student out (the view
 * keeps no site data and its cookies are cleared).
 */
export async function openPawsAgent(opts: {
  crns: string[]
  termLabel: string
  onMessage: (m: AgentMsg) => void
}): Promise<{ close: () => Promise<void> }> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Filling in PAWS needs the StudyMax app: a browser can't reach into USask's page.")
  }
  const termLabel = opts.termLabel.trim().slice(0, 40)
  // Built first: a bad CRN throws here, before anything opens.
  const code = agentScript(opts.crns, { termLabel, mode: 'native' })
  if (active) await active.close()
  const { InAppBrowser, ToolBarType, BackgroundColor } = await import('@capgo/capacitor-inappbrowser')

  const emit = (m: AgentMsg) => {
    try {
      opts.onMessage(m)
    } catch {
      // The screen's handler failing never stops the agent.
    }
  }
  const session = agentSession({
    code,
    termLabel,
    emit,
    execute: (id, script) => InAppBrowser.executeScript({ id, code: script }),
  })
  const listeners: PluginListenerHandle[] = []
  let id: string | null = null
  let done = false

  const finish = async () => {
    if (done) return
    done = true
    session.end()
    if (active === handle) active = null
    await Promise.all(listeners.map((l) => l.remove().catch(() => {})))
    await InAppBrowser.clearAllCookies().catch(() => {})
    emit({ type: 'closed' })
  }

  const handle = {
    async close() {
      if (done) return
      if (id) await InAppBrowser.clearAllCookies({ id }).catch(() => {})
      await InAppBrowser.close(id ? { id } : undefined).catch(() => {})
      await finish()
    },
  }

  // Every listener is in place before the view opens, so no early event is missed.
  listeners.push(
    await InAppBrowser.addListener('urlChangeEvent', (e) => session.onUrl(e)),
    await InAppBrowser.addListener('browserPageLoaded', (e) => session.onLoaded(e)),
    await InAppBrowser.addListener('messageFromWebview', (e) => session.onMessage(e)),
    await InAppBrowser.addListener('closeEvent', (e) => {
      if (session.ours(e)) void finish()
    }),
  )

  active = handle
  try {
    const opened = await InAppBrowser.openWebView({
      url: REG_URL,
      title: `PAWS · Register for ${termLabel}`,
      toolbarType: ToolBarType.COMPACT,
      toolbarColor: TOOLBAR_INK,
      toolbarTextColor: TOOLBAR_TEXT,
      // USask's pages paint white; this only keeps a black canvas from flashing before they load.
      backgroundColor: BackgroundColor.WHITE,
      // Nothing outlives the view: no stored site data, and it starts signed out.
      persistWebViewData: false,
      clearCookiesOnOpen: true,
      isInspectable: import.meta.env.DEV,
    })
    id = opened?.id ?? null
  } catch (err) {
    await finish()
    throw err
  }
  emit({ type: 'status', text: PAWS_COPY.signIn })
  session.opened(id)
  return handle
}
