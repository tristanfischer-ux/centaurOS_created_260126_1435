import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 *
 * @description Provides an SSR-safe media query primitive for responsive
 * component logic. Uses useSyncExternalStore to avoid tearing and to keep
 * client and server snapshots predictable.
 *
 * @param {string} query - CSS media query string (e.g. "(min-width: 1280px)")
 * @param {boolean} [defaultValue=false] - Fallback value used during SSR
 * @returns {boolean} True when the media query currently matches
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 1024px)')
 */
export function useMediaQuery(query: string, defaultValue: boolean = false): boolean {
  const getServerSnapshot = useCallback((): boolean => {
    return defaultValue
  }, [defaultValue])

  const getSnapshot = useCallback((): boolean => {
    if (typeof window === 'undefined') {
      return defaultValue
    }
    return window.matchMedia(query).matches
  }, [defaultValue, query])

  const subscribe = useCallback((onStoreChange: () => void): (() => void) => {
    if (typeof window === 'undefined') {
      return () => {}
    }

    const mediaQueryList = window.matchMedia(query)
    const handleChange = (): void => onStoreChange()

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return (): void => mediaQueryList.removeEventListener('change', handleChange)
    }

    // Safari < 14 fallback
    mediaQueryList.addListener(handleChange)
    return (): void => mediaQueryList.removeListener(handleChange)
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
