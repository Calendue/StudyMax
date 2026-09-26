/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor-firebase/authentication" />
import type { CapacitorConfig } from '@capacitor/cli'

// Jet navy, the launch intro's ground. The native launch screen, Capacitor's splash, the web view's
// own background and the Android window all paint it, so nothing lighter flashes between launch and
// the intro's first frame. The app itself paints Old Lace over it.
const INK = '#12262B'

const config: CapacitorConfig = {
  appId: 'ai.calendue.studymax',
  appName: 'StudyMax',
  webDir: 'dist',
  backgroundColor: INK,
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
      backgroundColor: INK,
      showSpinner: false,
    },
    Keyboard: { resize: 'native', resizeOnFullScreen: true, style: 'LIGHT' },
    // Native sign-in: the Firebase SDKs on the device hold the session. The web signs in with the
    // Firebase JS SDK directly (src/auth.ts), so the plugin's web layer is never loaded.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['apple.com', 'google.com'],
    },
  },
  experimental: {
    ios: {
      spm: {
        // Google only: the plugin's default traits also pull in the Facebook SDK.
        swiftToolsVersion: '6.1',
        packageTraits: { '@capacitor-firebase/authentication': ['Google'] },
        // Avoids a SwiftPM package identity collision with firebase-ios-sdk.
        packageOptions: { '@capacitor-firebase/authentication': { symlink: true } },
      },
    },
  },
}

export default config
