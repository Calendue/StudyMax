import { useCallback, useEffect, useState } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor, registerPlugin, type PluginListenerHandle, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { isNative } from './platform.ts'

// Light, dark, or whatever the device says. The choice lives in localStorage; index.html reads the
// same key in an inline script and sets data-theme before the first paint, so there is never a flash
// of the wrong theme. Every access is wrapped: storage can be blocked, and the app works without it.

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'studymax:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const AndroidAppearance = registerPlugin<{
  getSystemTheme(): Promise<{ dark: boolean }>
  addListener(event: 'change', callback: (event: { dark: boolean }) => void): Promise<PluginListenerHandle>
}>('StudyMaxAppearance')

function readPref(): ThemePref {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function apply(theme: Theme, fade: boolean) {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  // A switch the student made cross-fades colours for 300ms; the first application doesn't.
  if (fade) {
    root.classList.add('theme-fade')
    window.setTimeout(() => root.classList.remove('theme-fade'), 340)
  }
  root.dataset.theme = theme
  root.style.colorScheme = theme
  // The browser bar takes the page colour, read back from the tokens rather than repeated here.
  const page = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (page) document.querySelector('meta[name=theme-color]')?.setAttribute('content', page)
  syncSystemBars(theme)
}

/** Status bar and Android navigation bar icons follow the theme: light icons on dark, dark on light. */
function syncSystemBars(theme: Theme) {
  if (!isNative) return
  // The launch splash is Old Lace in both themes, so its icons stay dark until it has dissolved.
  if (document.querySelector('.prism')) {
    window.setTimeout(() => syncSystemBars(theme), 250)
    return
  }
  // Style.Dark is "light text for dark backgrounds" in both plugins.
  void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
  void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme: Theme = pref === 'system' ? system : pref

  useEffect(() => {
    if (Capacitor.getPlatform() === 'android') {
      let live = true
      const update = ({ dark }: { dark: boolean }) => { if (live) setSystem(dark ? 'dark' : 'light') }
      void AndroidAppearance.getSystemTheme().then(update).catch(() => {})
      const listener = AndroidAppearance.addListener('change', update)
      return () => { live = false; void listener.then((handle) => handle.remove()).catch(() => {}) }
    }
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystem(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // The inline script already set data-theme; this keeps it, the meta tag and the native bars in step.
  useEffect(() => {
    apply(theme, true)
  }, [theme])
  useEffect(() => syncSystemBars(theme), []) // eslint-disable-line react-hooks/exhaustive-deps

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // blocked storage: the choice holds for this session
    }
  }, [])

  return { themePref: pref, theme, setThemePref: setPref }
}
