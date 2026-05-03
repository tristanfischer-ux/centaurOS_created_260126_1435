"use client"

import React from "react"
import { AnimatePresence } from "framer-motion"

/**
 * A wrapper around framer-motion's AnimatePresence that catches unhandled exceptions 
 * thrown during mount/effect (a known issue in React 19 with framer-motion v12) 
 * and falls back to rendering its children directly without animations, rather than crashing the page.
 */
export class SafeAnimatePresence extends React.Component<React.ComponentProps<typeof AnimatePresence>, { hasError: boolean }> {
  constructor(props: React.ComponentProps<typeof AnimatePresence>) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn("[SafeAnimatePresence] Caught framer-motion crash, falling back to static render", error.message)
  }

  render() {
    if (this.state.hasError) {
      return <>{this.props.children}</>
    }
    return <AnimatePresence {...this.props} />
  }
}
