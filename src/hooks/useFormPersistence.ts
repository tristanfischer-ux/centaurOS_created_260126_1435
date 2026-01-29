'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook for persisting form state across page refreshes.
 * Useful for multi-step forms and wizards.
 * 
 * @example
 * ```tsx
 * const { data, setData, clearData, isLoaded } = useFormPersistence<BookingFormState>(
 *   'booking-wizard',
 *   { step: 1, dates: null }
 * )
 * ```
 */
export function useFormPersistence<T extends Record<string, unknown>>(
    key: string,
    defaultValue: T
): {
    data: T
    setData: (value: T | ((prev: T) => T)) => void
    clearData: () => void
    isLoaded: boolean
} {
    const storageKey = `form-persistence:${key}`
    const [data, setDataInternal] = useState<T>(defaultValue)
    const [isLoaded, setIsLoaded] = useState(false)

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const parsed = JSON.parse(stored)
                // Merge with default to handle schema changes
                setDataInternal({ ...defaultValue, ...parsed })
            }
        } catch (error) {
            console.warn('Failed to load form persistence:', error)
        }
        setIsLoaded(true)
    }, [storageKey, defaultValue])

    // Save to localStorage when data changes
    useEffect(() => {
        if (!isLoaded) return
        try {
            localStorage.setItem(storageKey, JSON.stringify(data))
        } catch (error) {
            console.warn('Failed to save form persistence:', error)
        }
    }, [data, storageKey, isLoaded])

    const setData = useCallback((value: T | ((prev: T) => T)) => {
        setDataInternal(value)
    }, [])

    const clearData = useCallback(() => {
        try {
            localStorage.removeItem(storageKey)
        } catch (error) {
            console.warn('Failed to clear form persistence:', error)
        }
        setDataInternal(defaultValue)
    }, [storageKey, defaultValue])

    return { data, setData, clearData, isLoaded }
}

/**
 * Hook for persisting just the current step in a multi-step form.
 * Lighter weight than full form persistence.
 */
export function useStepPersistence(
    key: string,
    totalSteps: number
): {
    currentStep: number
    setCurrentStep: (step: number) => void
    nextStep: () => void
    prevStep: () => void
    resetSteps: () => void
    isFirstStep: boolean
    isLastStep: boolean
} {
    const storageKey = `step-persistence:${key}`
    const [currentStep, setCurrentStepInternal] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)

    // Load from sessionStorage on mount (session-based, not persistent)
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(storageKey)
            if (stored) {
                const step = parseInt(stored, 10)
                if (!isNaN(step) && step >= 0 && step < totalSteps) {
                    setCurrentStepInternal(step)
                }
            }
        } catch (error) {
            console.warn('Failed to load step persistence:', error)
        }
        setIsLoaded(true)
    }, [storageKey, totalSteps])

    // Save to sessionStorage when step changes
    useEffect(() => {
        if (!isLoaded) return
        try {
            sessionStorage.setItem(storageKey, currentStep.toString())
        } catch (error) {
            console.warn('Failed to save step persistence:', error)
        }
    }, [currentStep, storageKey, isLoaded])

    const setCurrentStep = useCallback((step: number) => {
        if (step >= 0 && step < totalSteps) {
            setCurrentStepInternal(step)
        }
    }, [totalSteps])

    const nextStep = useCallback(() => {
        setCurrentStepInternal(prev => Math.min(prev + 1, totalSteps - 1))
    }, [totalSteps])

    const prevStep = useCallback(() => {
        setCurrentStepInternal(prev => Math.max(prev - 1, 0))
    }, [])

    const resetSteps = useCallback(() => {
        try {
            sessionStorage.removeItem(storageKey)
        } catch (error) {
            console.warn('Failed to clear step persistence:', error)
        }
        setCurrentStepInternal(0)
    }, [storageKey])

    return {
        currentStep,
        setCurrentStep,
        nextStep,
        prevStep,
        resetSteps,
        isFirstStep: currentStep === 0,
        isLastStep: currentStep === totalSteps - 1,
    }
}
