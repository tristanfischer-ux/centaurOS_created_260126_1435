/**
 * @file layout.tsx — Route segment config for CAD Lab page.
 *
 * @description Sets maxDuration to 600s (10 min) for server actions called
 * from this route. Building/architectural models with 50+ components can
 * take 5-8 min for Claude code generation + Modal execution.
 */

export const maxDuration = 600

export default function CadLabLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
