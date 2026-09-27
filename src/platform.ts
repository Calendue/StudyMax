import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNative = Capacitor.isNativePlatform()

// The serverless routes stay on Vercel. On the web they're same-origin; inside the native app the
// page is served from the device, so they go to our deployment (the study-max project, deployed
// from main). CapacitorHttp is enabled in capacitor.config.ts, which sends these through native
// HTTP, so CORS never applies.
export const API_BASE = isNative ? 'https://study-max-theta.vercel.app' : ''

export function api(path: string) {
  return `${API_BASE}${path}`
}

// THE HAPTIC VOCABULARY. Three words, used sparingly: selection for small confirmations, light for
// success, medium for the big moments (the reveal, starting the call). Nothing else vibrates. The
// web is a silent no-op, and a failure never reaches the person.
let selectionReady = false
export const haptic = {
  selection() {
    if (!isNative) return
    const tick = () => Haptics.selectionChanged()
    if (selectionReady) {
      void tick().catch(() => {})
    } else {
      selectionReady = true
      void Haptics.selectionStart().then(tick).catch(() => {})
    }
  },
  light() {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  },
  medium() {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
  },
}

/** Native chrome that has to be right before the first frame is looked at. */
export function initNative() {
  if (!isNative) return
  document.documentElement.classList.add('native')

  // An app shell doesn't pinch-zoom. The web build keeps zoom, which is an accessibility need there.
  document
    .querySelector('meta[name=viewport]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')

  // Style.Light is "dark text for light backgrounds": dark icons over the Old Lace launch splash,
  // in either theme. src/theme.ts switches them for dark mode once the splash has gone.
  void StatusBar.setStyle({ style: Style.Light }).catch(() => {})

  // The field being typed into is never left under the keyboard. The web view is resized natively,
  // so once the keyboard is up the focused field only needs scrolling back into the smaller view.
  void Keyboard.addListener('keyboardDidShow', () => {
    document.documentElement.classList.add('keyboard-open')
    const el = document.activeElement
    if (el instanceof HTMLElement && el.matches('input, textarea, select')) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  })
  void Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('keyboard-open'))
}

/** Called once React has painted: the native splash hands over to the in-app intro. */
export function hideSplash() {
  if (isNative) void SplashScreen.hide({ fadeOutDuration: 160 }).catch(() => {})
}

/**
 * studymax:// links from the widgets and the deadline watch: the one the app was launched with,
 * then any that arrive while it's running.
 */
export function onAppUrlOpen(handler: (url: string) => void): () => void {
  if (!isNative) return () => {}
  void NativeApp.getLaunchUrl()
    .then((launch) => launch?.url && handler(launch.url))
    .catch(() => {})
  const listener = NativeApp.addListener('appUrlOpen', (event) => handler(event.url))
  return () => void listener.then((l) => l.remove())
}

/**
 * The Android back button. `handler` returns true when it stepped back somewhere inside the flow;
 * false means there was nowhere left to go, and the app exits.
 */
export function onBackButton(handler: () => boolean): () => void {
  if (!isNative) return () => {}
  const listener = NativeApp.addListener('backButton', () => {
    if (!handler()) void NativeApp.exitApp()
  })
  return () => void listener.then((l) => l.remove())
}
