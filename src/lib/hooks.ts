import { useState, useEffect } from 'react'

/**
 * SSR-safe media query hook
 * Returns false during SSR/hydration, then updates to actual value
 */
export function useMediaQuery(query: string): boolean {
  // Start with false to match SSR, avoiding hydration mismatch
  const [matches, setMatches] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const media = window.matchMedia(query)
    setMatches(media.matches)

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  // Return false until mounted to prevent hydration mismatch
  return mounted ? matches : false
}

/**
 * Scroll lock hook for overlays/modals
 * Uses a counter to safely handle multiple overlays
 */
export function useScrollLock(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return

    // Increment the scroll lock counter
    const currentCount = parseInt(document.body.dataset.scrollLockCount || "0", 10)
    document.body.dataset.scrollLockCount = String(currentCount + 1)
    document.body.style.overflow = "hidden"

    return () => {
      // Decrement the counter and only restore scroll if no other locks remain
      const count = parseInt(document.body.dataset.scrollLockCount || "1", 10)
      const newCount = Math.max(0, count - 1)
      document.body.dataset.scrollLockCount = String(newCount)

      if (newCount === 0) {
        document.body.style.overflow = ""
        delete document.body.dataset.scrollLockCount
      }
    }
  }, [isActive])
}
