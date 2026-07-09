/**
 * Quick proveCatch for OPENROUTER_MAX_INFLIGHT — peak in-flight ≤ cap.
 * Usage: npx tsx scripts/lib/openrouter-semaphore.selftest.ts
 */
import {
  withOpenRouterSlot,
  openRouterMaxInflight,
  _resetOpenRouterSemaphoreForTests,
} from '../../src/lib/pdf-engine-v2/lib/openrouter-semaphore'

async function main(): Promise<void> {
  _resetOpenRouterSemaphoreForTests()
  process.env.OPENROUTER_MAX_INFLIGHT = '2'
  const order: string[] = []
  await Promise.all(
    [0, 1, 2].map((i) =>
      withOpenRouterSlot(async () => {
        order.push(`start${i}`)
        await new Promise((r) => setTimeout(r, 80))
        order.push(`end${i}`)
      }),
    ),
  )
  let inflight = 0
  let peak = 0
  for (const s of order) {
    if (s.startsWith('start')) {
      inflight++
      peak = Math.max(peak, inflight)
    } else {
      inflight--
    }
  }
  if (openRouterMaxInflight() !== 2) throw new Error(`cap=${openRouterMaxInflight()}`)
  if (peak > 2) throw new Error(`peak ${peak} > 2; order=${order.join(',')}`)
  console.log(`openrouter-semaphore selftest: OK (peak=${peak}, order=${order.join(',')})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
