"use client"

import { useEffect } from "react"

/**
 * HeroNavScroll — toggles a `.scrolled` class on the homepage's inline nav so it
 * is transparent over the hero and turns solid (white + blur + border) once the
 * visitor scrolls. A tiny client island so the homepage can stay a server
 * component (and keep its `metadata` export). The nav lives inside a
 * dangerouslySetInnerHTML blob, so a <script> in that blob would not run —
 * hence this effect attaches the listener from React.
 */
export function HeroNavScroll() {
  useEffect(() => {
    const nav = document.querySelector("header.nav")
    if (!nav) return
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return null
}
