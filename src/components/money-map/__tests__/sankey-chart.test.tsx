/**
 * @file sankey-chart.test.tsx
 * @description Tests for the MoneyMapSankey income statement flow diagram.
 * Verifies correct waterfall computation, SVG rendering, and edge cases.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { MoneyMapSankey } from '../sankey-chart'
import { SAMPLE_MONEY_MAP_DATA } from '../sample-data'
import type { MoneyMapData, MoneyMapSummary, RevenueStream, CostItem } from '@/types/money-map'

// ============================================================
// Test Helpers
// ============================================================

const now = new Date().toISOString()

/** Create a minimal MoneyMapData with custom values */
function createTestData(overrides: Partial<{
  revenue: number
  directCosts: number
  indirectCosts: number
  overhead: number
  revenueStreams: Array<{ name: string; amount: number }>
  costItems: Array<{ name: string; amount: number; type: 'direct' | 'indirect' | 'overhead' }>
}>): MoneyMapData {
  const {
    revenue = 90000,
    directCosts = 36000,
    indirectCosts = 8000,
    overhead = 6000,
    revenueStreams = [{ name: 'Main Revenue', amount: revenue }],
    costItems = [],
  } = overrides

  const totalCosts = directCosts + indirectCosts + overhead
  const netMargin = revenue - totalCosts

  const rs: RevenueStream[] = revenueStreams.map((s, i) => ({
    id: `rs-${i}`,
    foundry_id: 'test',
    name: s.name,
    category: 'service' as const,
    amount: s.amount,
    currency: 'GBP',
    period: 'monthly' as const,
    source: 'manual' as const,
    auto_source_type: null,
    description: null,
    sort_order: i,
    is_active: true,
    created_at: now,
    updated_at: now,
  }))

  const ci: CostItem[] = costItems.map((c, i) => ({
    id: `ci-${i}`,
    foundry_id: 'test',
    name: c.name,
    category: 'operations' as const,
    amount: c.amount,
    currency: 'GBP',
    period: 'monthly' as const,
    cost_type: c.type,
    source: 'manual' as const,
    description: null,
    sort_order: i,
    is_active: true,
    created_at: now,
    updated_at: now,
  }))

  const summary: MoneyMapSummary = {
    total_revenue: revenue,
    total_direct_costs: directCosts,
    total_indirect_costs: indirectCosts,
    total_overhead_costs: overhead,
    total_costs: totalCosts,
    net_margin: netMargin,
    net_margin_pct: revenue > 0 ? (netMargin / revenue) * 100 : 0,
    stream_count: rs.length,
    cost_count: ci.length,
  }

  return {
    revenue_streams: rs,
    cost_items: ci,
    cost_links: [],
    summary,
    profitability: [],
  }
}

// ============================================================
// Tests
// ============================================================

describe('MoneyMapSankey', () => {
  describe('Sample data rendering', () => {
    it('renders SVG with sample data', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('role')).toBe('img')
      expect(svg?.getAttribute('aria-label')).toContain('Income statement')
    })

    it('renders all revenue source bars', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const svg = container.querySelector('svg')!
      const rects = svg.querySelectorAll('rect')
      // Source bars (3) + Revenue bar + GP bar + OP bar + NP bar + cost bars (3) + legend (2) + mini-bars
      expect(rects.length).toBeGreaterThanOrEqual(10)
    })

    it('renders cascade labels (Revenue, Gross Profit, Operating Profit, Net Profit)', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      expect(textContent).toContain('Revenue')
      expect(textContent).toContain('Gross Profit')
      expect(textContent).toContain('Operating Profit')
      expect(textContent).toContain('Net Profit')
    })

    it('renders cost section labels', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      expect(textContent).toContain('Direct Costs')
      expect(textContent).toContain('Shared Costs')
      expect(textContent).toContain('Overhead')
    })

    it('renders legend', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      expect(textContent.some(t => t?.includes('Income'))).toBe(true)
      expect(textContent.some(t => t?.includes('Costs'))).toBe(true)
    })

    it('renders flow paths (green and red)', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const paths = container.querySelectorAll('path')
      // Source→Rev (3) + Rev→GP + Rev→DC + GP→OP + GP→SC + OP→NP + OP→OH = 9 paths
      expect(paths.length).toBe(9)

      const greenPaths = Array.from(paths).filter(p =>
        p.getAttribute('fill')?.includes('16, 185, 129')
      )
      const redPaths = Array.from(paths).filter(p =>
        p.getAttribute('fill')?.includes('239, 68, 68')
      )

      // Green: 3 source flows + Rev→GP + GP→OP + OP→NP = 6
      expect(greenPaths.length).toBe(6)
      // Red: Rev→DC + GP→SC + OP→OH = 3
      expect(redPaths.length).toBe(3)
    })

    it('renders revenue source labels', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      expect(textContent.some(t => t?.includes('Consulting'))).toBe(true)
      expect(textContent.some(t => t?.includes('Retainers'))).toBe(true)
      expect(textContent.some(t => t?.includes('Product Sales'))).toBe(true)
    })

    it('renders individual cost items', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      // Check for individual cost items from sample data
      expect(textContent.some(t => t?.includes('Consultant Salaries'))).toBe(true)
      expect(textContent.some(t => t?.includes('Marketing'))).toBe(true)
      expect(textContent.some(t => t?.includes('Office'))).toBe(true)
    })
  })

  describe('Empty state', () => {
    it('shows empty message when revenue is 0', () => {
      const emptyData = createTestData({ revenue: 0 })
      const { container } = render(
        <MoneyMapSankey data={emptyData} />
      )

      expect(container.querySelector('svg')).toBeNull()
      expect(container.textContent).toContain('Add revenue streams and costs')
    })
  })

  describe('Edge cases', () => {
    it('renders with zero costs (all revenue is profit)', () => {
      const data = createTestData({
        revenue: 50000,
        directCosts: 0,
        indirectCosts: 0,
        overhead: 0,
        revenueStreams: [{ name: 'Sales', amount: 50000 }],
      })

      const { container } = render(<MoneyMapSankey data={data} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()

      // Should have Revenue bar and Net Profit bar
      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)
      expect(textContent).toContain('Revenue')
      expect(textContent).toContain('Net Profit')

      // No red cost flows
      const paths = container.querySelectorAll('path')
      const redPaths = Array.from(paths).filter(p =>
        p.getAttribute('fill')?.includes('239, 68, 68')
      )
      expect(redPaths.length).toBe(0)
    })

    it('renders with single revenue stream', () => {
      const data = createTestData({
        revenue: 100000,
        directCosts: 40000,
        indirectCosts: 20000,
        overhead: 10000,
        revenueStreams: [{ name: 'Only Stream', amount: 100000 }],
      })

      const { container } = render(<MoneyMapSankey data={data} />)
      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)
      expect(textContent.some(t => t?.includes('Only Stream'))).toBe(true)
    })

    it('renders loss scenario correctly', () => {
      const data = createTestData({
        revenue: 50000,
        directCosts: 30000,
        indirectCosts: 15000,
        overhead: 10000, // Total costs = 55k > revenue 50k → loss
        revenueStreams: [{ name: 'Sales', amount: 50000 }],
      })

      const { container } = render(<MoneyMapSankey data={data} />)
      const texts = Array.from(container.querySelectorAll('text'))
      const textContent = texts.map(t => t.textContent)

      // Should show "Net Loss" instead of "Net Profit"
      expect(textContent).toContain('Net Loss')
    })

    it('handles many revenue streams', () => {
      const streams = Array.from({ length: 8 }, (_, i) => ({
        name: `Stream ${i + 1}`,
        amount: 10000 + i * 1000,
      }))
      const totalRev = streams.reduce((s, r) => s + r.amount, 0)

      const data = createTestData({
        revenue: totalRev,
        directCosts: totalRev * 0.3,
        indirectCosts: totalRev * 0.1,
        overhead: totalRev * 0.05,
        revenueStreams: streams,
      })

      const { container } = render(<MoneyMapSankey data={data} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()

      // All 8 streams should have source bars
      const paths = container.querySelectorAll('path')
      // 8 source flows + 3 green cascade + 3 red cost = 14 paths
      expect(paths.length).toBe(14)
    })

    it('handles very small costs relative to revenue', () => {
      const data = createTestData({
        revenue: 1000000,
        directCosts: 100,
        indirectCosts: 50,
        overhead: 25,
        revenueStreams: [{ name: 'Big Stream', amount: 1000000 }],
      })

      const { container } = render(<MoneyMapSankey data={data} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()

      // Cost bars should still be visible (minimum height enforced)
      const rects = container.querySelectorAll('rect')
      expect(rects.length).toBeGreaterThan(0)
    })
  })

  describe('SVG structure', () => {
    it('has correct viewBox', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1020 620')
    })

    it('all flow paths have valid d attribute', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const paths = container.querySelectorAll('path')
      paths.forEach(path => {
        const d = path.getAttribute('d')
        expect(d).toBeTruthy()
        // Should start with M and contain C (cubic bezier) and Z (close path)
        expect(d).toMatch(/^M\s/)
        expect(d).toContain('C ')
        expect(d).toContain('Z')
      })
    })

    it('all bars have positive dimensions', () => {
      const { container } = render(
        <MoneyMapSankey data={SAMPLE_MONEY_MAP_DATA} />
      )

      const rects = container.querySelectorAll('rect')
      rects.forEach(rect => {
        const width = parseFloat(rect.getAttribute('width') || '0')
        const height = parseFloat(rect.getAttribute('height') || '0')
        expect(width).toBeGreaterThan(0)
        expect(height).toBeGreaterThan(0)
      })
    })
  })
})
