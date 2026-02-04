"use client"

import { useState, useEffect } from "react"

/**
 * Debounce a value by delaying updates until after a specified delay.
 * 
 * @description Useful for search inputs where you want to wait for the user
 * to stop typing before triggering a search or filter operation.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300)
 * @returns The debounced value
 * 
 * @example
 * const [searchQuery, setSearchQuery] = useState('')
 * const debouncedQuery = useDebounce(searchQuery, 300)
 * 
 * // debouncedQuery updates 300ms after searchQuery stops changing
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
