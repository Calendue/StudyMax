import { useEffect, useMemo, useRef } from 'react'
import { bookmarklet } from '../../lib/pawsAgentScript.ts'

/**
 * On a computer's browser: a bookmark that does what the app's web view does on PAWS's Enter CRNs page
 * (fill the CRNs, press Add to Summary, stop at Submit), for a student already signed in there.
 */
export function Bookmarklet({ crns, termLabel }: { crns: string[]; termLabel: string }) {
  const link = useRef<HTMLAnchorElement>(null)
  // Null when the list isn't one Banner takes (more CRNs than its panel holds): then there's no link.
  const href = useMemo(() => {
    try {
      return bookmarklet(crns, termLabel)
    } catch {
      return null
    }
  }, [crns, termLabel])
  // React won't render a javascript: URL, so the link is handed it directly. It runs only from the
  // bookmarks bar; a click on it here does nothing.
  useEffect(() => {
    if (href) link.current?.setAttribute('href', href)
  }, [href])
  if (!href) return null
  return (
    <p className="footnote reg-bookmarklet">
      On a computer, drag{' '}
      <a ref={link} className="reg-bookmarklet__link" draggable onClick={(e) => e.preventDefault()}>
        Fill it in for me
      </a>{' '}
      to your bookmarks bar, then click it on PAWS&rsquo;s Enter CRNs page. It adds your CRNs to your summary; you press Submit.
    </p>
  )
}
