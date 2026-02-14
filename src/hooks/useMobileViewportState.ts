import { useEffect, useState } from 'react'

interface MobileViewportState {
  isKeyboardOpen: boolean
  viewportHeight: number | null
}

interface UseMobileViewportStateOptions {
  keyboardThresholdPx?: number
}

/**
 * Tracks mobile viewport changes and infers keyboard visibility.
 *
 * @description Uses the Visual Viewport API when available to detect when
 * the on-screen keyboard is likely open (viewport shrinks by a threshold).
 * Falls back to a stable default on browsers that do not expose the API.
 *
 * @param {UseMobileViewportStateOptions} [options] - Keyboard detection options
 * @param {number} [options.keyboardThresholdPx=140] - Minimum viewport shrink to treat as keyboard open
 * @returns {MobileViewportState} Keyboard and viewport metadata for adaptive mobile UI
 *
 * @example
 * const { isKeyboardOpen } = useMobileViewportState()
 */
export function useMobileViewportState(
  options: UseMobileViewportStateOptions = {},
): MobileViewportState {
  const { keyboardThresholdPx = 140 } = options
  const [state, setState] = useState<MobileViewportState>({
    isKeyboardOpen: false,
    viewportHeight: null,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const viewport = window.visualViewport
    if (!viewport) {
      setState({
        isKeyboardOpen: false,
        viewportHeight: window.innerHeight,
      })
      return
    }

    let baselineHeight = viewport.height

    const updateViewportState = (): void => {
      const currentHeight = viewport.height
      const heightDelta = baselineHeight - currentHeight
      const keyboardOpen = heightDelta > keyboardThresholdPx

      // If keyboard is closed and viewport grows, keep baseline current.
      if (!keyboardOpen && currentHeight > baselineHeight) {
        baselineHeight = currentHeight
      }

      setState({
        isKeyboardOpen: keyboardOpen,
        viewportHeight: currentHeight,
      })
    }

    const resetBaseline = (): void => {
      baselineHeight = viewport.height
      setState({
        isKeyboardOpen: false,
        viewportHeight: viewport.height,
      })
    }

    updateViewportState()

    viewport.addEventListener('resize', updateViewportState)
    viewport.addEventListener('scroll', updateViewportState)
    window.addEventListener('orientationchange', resetBaseline)

    return (): void => {
      viewport.removeEventListener('resize', updateViewportState)
      viewport.removeEventListener('scroll', updateViewportState)
      window.removeEventListener('orientationchange', resetBaseline)
    }
  }, [keyboardThresholdPx])

  return state
}
