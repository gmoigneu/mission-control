import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.hidden &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.closest('[hidden],[aria-hidden="true"]') === null,
  )
}

/**
 * Traps keyboard focus within the returned ref while `active` is true:
 * - focuses the first focusable element (or the container) on open,
 * - cycles Tab / Shift+Tab within the overlay,
 * - calls `onClose` on Escape,
 * - restores focus to the previously focused element on close.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose?: () => void,
) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previousFocusRef.current = document.activeElement as HTMLElement | null

    const focusable = getFocusable(container)
    const initial = focusable[0] ?? container
    initial.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !container) return

      const items = getFocusable(container)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [active])

  return containerRef
}
