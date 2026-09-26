/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/keyboard" />
import type { CapacitorConfig } from '@capacitor/cli'

// Old Lace. The WebView, the native splash and the Android window all paint this, so there is no
// flash of another colour between launch and first render.
const OLD_LACE = '#FFF8EB'

const config: CapacitorConfig = {
  appId: 'ai.calendue.studymax',
  appName: 'StudyMax',
  webDir: 'dist',
  backgroundColor: OLD_LACE,
  ios: {
    contentInset: 'never',
    // The app scrolls inside its own container, so the root never rubber-bands.
    scrollEnabled: false,
  },
  plugins: {
    // fetch() goes through native HTTP, so the Vercel API is reached without CORS.
    CapacitorHttp: { enabled: true },
    // 'LIGHT' is dark icons on a light background, in both plugins.
    SystemBars: { insetsHandling: 'css', style: 'LIGHT' },
    StatusBar: { overlaysWebView: true, style: 'LIGHT' },
    // The web app hides the splash on first render; the duration is only a safety net.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: OLD_LACE,
      showSpinner: false,
    },
    Keyboard: { resize: 'native', resizeOnFullScreen: true, style: 'LIGHT' },
  },
}

export default config
