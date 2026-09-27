import { useEffect, useState } from 'react'

/** How long the canopy sits quietly before the joke: long enough that nobody's expecting it. */
const DELAY_MS = 10_000

/**
 * Ayo's Drake meme, for comic timing. Ten seconds after the climb reaches the canopy, it glides in
 * from the left along a thin rail, pauses mid-screen for the room to read it, and slides out the
 * right. Once per arrival at the top: leaving the canopy before it plays cancels it, and coming back
 * sets it up again.
 */
export function useDrakeCue(atCanopy: boolean) {
  const [run, setRun] = useState(0)
  useEffect(() => {
    if (!atCanopy) return
    const timer = window.setTimeout(() => setRun((n) => n + 1), DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [atCanopy])
  return run
}
