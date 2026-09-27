import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The brand face is bundled, not fetched: nothing waits on Google Fonts at startup, online or not.
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import './index.css'
import App from './App.tsx'
import { initNative } from './platform.ts'
import { importFromLink } from './webSync.ts'

// Before App reads its saved session: a plan handed over from the phone app lands first.
importFromLink()
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)