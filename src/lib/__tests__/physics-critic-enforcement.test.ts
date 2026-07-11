import { issueDescribesConcreteFailure } from '../../../scripts/lib/physics-critic-enforcement'

describe('physics critic known-failure classification', () => {
  it('blocks a determinate continuous-current under-rating', () => {
    const result = issueDescribesConcreteFailure({
      issue: 'The Power Filter Inductor is rated for only 18 A continuous, but the required continuous load is 48 A. It will overheat and fail.',
      suggested_check: 'Use a 60 A filter.',
    } as any)

    expect(result).toEqual({ matched: true, tag: 'undersized-vs-load' })
  })

  it('does not block an explicitly adequate continuous rating plus speculative transient concern', () => {
    const result = issueDescribesConcreteFailure({
      issue: 'The Main DC Contactor is rated for 51 A. Continuous demand is 39.2 A. While 51 A covers this, a translated transient may exceed the continuous rating and likely its breaking capacity.',
      suggested_check: 'Verify the peak/surge current rating.',
    } as any)

    expect(result).toEqual({ matched: false, tag: '' })
  })
})
