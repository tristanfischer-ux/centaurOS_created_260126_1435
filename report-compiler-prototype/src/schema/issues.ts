import type { SectionIssue, Severity } from './types'

export function issue(
  severity: Severity,
  code: string,
  message: string,
  section: SectionIssue['section'],
  repairHint?: string,
  path?: string,
): SectionIssue {
  return { severity, code, message, section, repairHint, path }
}

export function hasBlockers(issues: SectionIssue[]): boolean {
  return issues.some(i => i.severity === 'blocker')
}

export function groupIssuesBySection(issues: SectionIssue[]): Record<string, SectionIssue[]> {
  const grouped: Record<string, SectionIssue[]> = {}
  for (const item of issues) {
    grouped[item.section] ??= []
    grouped[item.section].push(item)
  }
  return grouped
}

