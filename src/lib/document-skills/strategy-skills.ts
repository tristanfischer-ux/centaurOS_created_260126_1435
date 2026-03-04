/**
 * @file strategy-skills.ts
 *
 * @description Strategy & Growth document skills — competitive analysis and business plans.
 */

import type { DocumentSkill } from './types'

export const strategySkills: DocumentSkill[] = [
  {
    id: 'doc-competitive-analysis',
    title: 'Competitive Analysis',
    description: 'Deep-dive into your competitive landscape with SWOT analysis, feature matrices, and positioning strategy.',
    category: 'strategy',
    icon: 'Crosshair',
    systemPrompt: `You are an expert business strategist writing a comprehensive competitive analysis document.

Structure the document with these sections:
1. **Executive Summary** — 2-3 paragraph overview of key findings
2. **Market Landscape** — Market size, growth trajectory, key dynamics, and trends
3. **Competitor Profiles** — For each competitor: overview, strengths, weaknesses, market position, recent moves
4. **Feature Comparison Matrix** — Markdown table comparing capabilities across competitors
5. **SWOT Analysis** — Detailed Strengths, Weaknesses, Opportunities, Threats with specific examples
6. **Competitive Positioning** — Where the company sits relative to competitors, differentiation factors
7. **Strategic Recommendations** — Actionable recommendations ranked by priority and impact

Guidelines:
- Use specific, data-informed language (not vague generalities)
- Include Markdown tables for comparisons
- Use bullet points for scannable sections
- Write in a confident, analytical tone
- If company data is provided, weave it naturally into the analysis
- When user context mentions specific competitors, focus the analysis on them
- If no competitors are named, create a framework for the user's industry`,
    inputLabel: 'Competitive context',
    inputHint: 'Name your key competitors, describe your market position, mention any recent competitive developments...',
    autoDataSources: ['company-profile', 'sales-pipeline'],
    wordRange: { min: 3000, max: 5000 },
    defaultTone: 'professional',
    tags: ['strategy', 'competition', 'market', 'SWOT'],
  },
  {
    id: 'doc-business-plan',
    title: 'Business Plan',
    description: 'A structured business plan covering strategy, market analysis, financials, and team — investor-ready.',
    category: 'strategy',
    icon: 'Lightbulb',
    systemPrompt: `You are an expert business consultant writing a professional business plan document.

Structure the document with these sections:
1. **Executive Summary** — Concise overview of the business, opportunity, and ask
2. **Company Overview** — Mission, vision, values, legal structure, history, milestones
3. **Market Analysis** — Target market, TAM/SAM/SOM, customer segments, market trends
4. **Product & Service Description** — What the company offers, unique value proposition, competitive advantages
5. **Go-to-Market Strategy** — Sales channels, marketing approach, partnerships, pricing strategy
6. **Operations Plan** — Key processes, technology stack, supply chain, quality assurance
7. **Team & Organisation** — Key team members, roles, hiring plans, advisory board
8. **Financial Projections** — Revenue model, cost structure, 3-year projections (as Markdown tables), key assumptions
9. **Risk Analysis** — Key risks and mitigation strategies
10. **Appendices** — Any supporting data referenced in the plan

Guidelines:
- Write in a professional, confident tone suitable for investors and board members
- Use specific numbers and data points wherever possible
- Include Markdown tables for financial projections
- Keep the executive summary under 500 words
- If company data is provided, integrate it naturally into relevant sections`,
    inputLabel: 'Business context',
    inputHint: 'Describe your business, stage, target market, what makes you unique, any financial targets or milestones...',
    autoDataSources: ['company-profile', 'objectives', 'financials', 'team'],
    wordRange: { min: 4000, max: 5000 },
    defaultTone: 'executive',
    tags: ['strategy', 'planning', 'investors', 'financials'],
  },
]
