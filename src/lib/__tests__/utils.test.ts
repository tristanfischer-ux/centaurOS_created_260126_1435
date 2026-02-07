/**
 * @file utils.test.ts
 * 
 * @description Tests for core utility functions used across 200+ files.
 * These functions are critical infrastructure - a bug here cascades everywhere.
 */

import { cn, getInitials, formatStatus } from '../utils'

// ============================================
// cn() - className merger (used in 200+ files)
// ============================================

describe('cn', () => {
  it('should merge simple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle undefined and null values', () => {
    expect(cn('foo', undefined, 'bar', null)).toBe('foo bar')
  })

  it('should handle empty strings', () => {
    expect(cn('foo', '', 'bar')).toBe('foo bar')
  })

  it('should handle boolean false values (conditional classes)', () => {
    const isActive = false
    expect(cn('base', isActive && 'active')).toBe('base')
  })

  it('should include classes when condition is true', () => {
    const isActive = true
    expect(cn('base', isActive && 'active')).toBe('base active')
  })

  it('should handle no arguments', () => {
    expect(cn()).toBe('')
  })

  it('should merge conflicting Tailwind classes (last wins)', () => {
    // tailwind-merge should resolve conflicts
    expect(cn('p-4', 'p-6')).toBe('p-6')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('should handle object syntax', () => {
    expect(cn({ 'bg-red-500': true, 'bg-blue-500': false })).toBe('bg-red-500')
  })

  it('should handle array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })
})

// ============================================
// getInitials() - avatar initials (used in 20+ files)
// ============================================

describe('getInitials', () => {
  it('should return initials for two-word names', () => {
    expect(getInitials('John Doe')).toBe('JD')
  })

  it('should return initials for multi-word names', () => {
    expect(getInitials('John Michael Doe')).toBe('JD')
  })

  it('should return first two chars for single-word names', () => {
    expect(getInitials('John')).toBe('JO')
  })

  it('should return "??" for null', () => {
    expect(getInitials(null)).toBe('??')
  })

  it('should return "??" for undefined', () => {
    expect(getInitials(undefined)).toBe('??')
  })

  it('should return "??" for empty string', () => {
    expect(getInitials('')).toBe('??')
  })

  it('should return "??" for whitespace-only string', () => {
    expect(getInitials('   ')).toBe('??')
  })

  it('should handle names with extra whitespace', () => {
    expect(getInitials('  John   Doe  ')).toBe('JD')
  })

  it('should uppercase the initials', () => {
    expect(getInitials('john doe')).toBe('JD')
  })

  it('should handle single character names', () => {
    expect(getInitials('J')).toBe('J')
  })

  it('should handle names with special characters', () => {
    expect(getInitials("O'Brien Smith")).toBe('OS')
  })
})

// ============================================
// formatStatus() - status display (used across app)
// ============================================

describe('formatStatus', () => {
  it('should format single word status', () => {
    expect(formatStatus('active')).toBe('Active')
  })

  it('should format underscore-separated status', () => {
    expect(formatStatus('in_progress')).toBe('In Progress')
  })

  it('should format multi-underscore status', () => {
    expect(formatStatus('pending_review_approval')).toBe('Pending Review Approval')
  })

  it('should handle already capitalized status', () => {
    expect(formatStatus('Active')).toBe('Active')
  })

  it('should handle empty string', () => {
    expect(formatStatus('')).toBe('')
  })

  it('should handle single character words', () => {
    expect(formatStatus('a_b_c')).toBe('A B C')
  })

  it('should handle all caps status', () => {
    expect(formatStatus('COMPLETED')).toBe('COMPLETED')
  })
})
