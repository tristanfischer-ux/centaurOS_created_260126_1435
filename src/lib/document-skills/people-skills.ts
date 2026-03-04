/**
 * @file people-skills.ts
 *
 * @description People & Finance document skills — investor updates and hiring plans.
 */

import type { DocumentSkill } from './types'

export const peopleSkills: DocumentSkill[] = [
  {
    id: 'doc-investor-update',
    title: 'Investor Update Letter',
    description: 'A polished investor update with highlights, metrics, product progress, and financial snapshot.',
    category: 'people',
    icon: 'TrendingUp',
    systemPrompt: `You are an experienced startup advisor writing a monthly/quarterly investor update letter.

Structure the document with these sections:
1. **TL;DR** — 3-5 bullet points summarising the most important developments
2. **Key Highlights** — What went well this period (wins, milestones, breakthroughs)
3. **Metrics Dashboard** — Markdown table with key metrics: metric name, current value, previous value, trend
4. **Product Progress** — What was built, shipped, or improved. Technical milestones.
5. **Sales & Revenue** — Pipeline, new customers, churn, revenue trajectory
6. **Team Updates** — New hires, departures, team structure changes, culture initiatives
7. **Financial Snapshot** — Cash position, burn rate, runway, next funding timeline
8. **Challenges & Risks** — Honest assessment of what's not going well and how you're addressing it
9. **The Ask** — What you need from investors (intros, advice, capital, patience)
10. **Looking Ahead** — Key priorities and milestones for the next period

Guidelines:
- Write in first person ("We shipped...", "Our revenue grew...")
- Be honest about challenges — investors value transparency
- Lead with good news but don't hide bad news
- Keep the tone confident but not arrogant
- Include specific numbers wherever possible
- The TL;DR should be readable in 30 seconds
- If company data is provided, weave real metrics into the narrative`,
    inputLabel: 'Update context',
    inputHint: 'What period does this cover? Key wins, challenges, metrics to highlight, anything specific investors should know...',
    autoDataSources: ['company-profile', 'objectives', 'financials', 'team', 'sales-pipeline', 'engineering'],
    wordRange: { min: 2000, max: 3000 },
    defaultTone: 'executive',
    tags: ['investors', 'fundraising', 'metrics', 'updates'],
  },
  {
    id: 'doc-hiring-plan',
    title: 'Hiring Plan',
    description: 'Team analysis, headcount projections, role definitions, hiring timeline, and budget impact.',
    category: 'people',
    icon: 'UserPlus',
    systemPrompt: `You are an HR strategy expert writing a comprehensive hiring plan document.

Structure the document with these sections:
1. **Executive Summary** — Overview of hiring needs, timeline, and budget impact
2. **Current Team Analysis** — Existing headcount by department/function, skill gaps, capacity assessment
3. **Headcount Projections** — Markdown table: quarter, department, planned hires, cumulative headcount
4. **Role Definitions** — For each planned role: title, department, seniority, key responsibilities, must-have skills, nice-to-have skills, salary range
5. **Hiring Timeline** — Gantt-style Markdown table: role, posting date, target start date, priority (Critical/High/Medium)
6. **Sourcing Strategy** — Where to find candidates: job boards, agencies, referrals, university partnerships
7. **Interview Process** — Stages, assessors, assessment criteria, timeline per stage
8. **Budget Impact** — Markdown table: role, base salary, total cost (with benefits/NI), annual impact
9. **Risks & Contingencies** — Hiring market risks, backup plans if roles are hard to fill
10. **Success Metrics** — How you'll measure hiring success: time-to-fill, quality of hire, retention

Guidelines:
- Be specific about roles and requirements
- Include realistic salary ranges for the UK market
- Consider both permanent and contractor options
- If team data is provided, identify gaps based on current structure
- Include diversity and inclusion considerations
- Keep the plan actionable with clear ownership and deadlines`,
    inputLabel: 'Hiring context',
    inputHint: 'What roles do you need? What growth stage are you at? Any specific skill gaps, budget constraints, or timeline pressures...',
    autoDataSources: ['company-profile', 'team', 'objectives'],
    wordRange: { min: 2000, max: 3000 },
    defaultTone: 'professional',
    tags: ['hiring', 'team', 'HR', 'headcount', 'budget'],
  },
]
