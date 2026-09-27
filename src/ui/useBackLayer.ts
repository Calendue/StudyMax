import { useEffect, useRef } from 'react'
import { registerBackLayer } from '../lib/backLayers.ts'

/** Android Back and Escape share the same dismissal order, including locally owned sheets. */
export function useBackLayer(open: boolean, close: () => void, priority = 0) {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    if (open) return registerBackLayer(() => latest.current(), priority)
  }, [open, priority])
}
