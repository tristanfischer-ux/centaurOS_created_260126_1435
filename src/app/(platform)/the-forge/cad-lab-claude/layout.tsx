/**
 * @file layout.tsx — Route segment config for CAD Lab Claude page.
 *
 * @description Sets maxDuration to 300s (5 min) for server actions called
 * from this route. Claude code generation + Modal execution can take 2-3 min.
 */

export const maxDuration = 300

export default function CadLabClaudeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
