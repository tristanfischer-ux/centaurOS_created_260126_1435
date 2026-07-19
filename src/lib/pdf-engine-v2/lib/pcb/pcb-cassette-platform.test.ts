import { deriveCassettePlatform } from './pcb-cassette-platform'

describe('deriveCassettePlatform', () => {
  it('makes the universal cassette interface the root for every platform', () => {
    const plan = deriveCassettePlatform({})
    expect(plan.modules.map((item) => item.role)).toEqual(['cassette_backplane', 'smart_cassette'])
    expect(plan.interface.signals).toEqual(expect.arrayContaining(['POWER', 'GND', 'DATA+', 'DATA-', 'CASSETTE_ID']))
  })

  it('adds reusable sensor/optics and appliance actuation roles from functions', () => {
    const plan = deriveCassettePlatform({ sensing: true, optics: true, perfusion: true, incubation: true })
    expect(plan.modules.map((item) => item.role)).toEqual(expect.arrayContaining([
      'sensor_optics_module', 'perfusion_actuation', 'incubator_control',
    ]))
  })

  it('keeps return preservation and gravity control as separable modules', () => {
    const plan = deriveCassettePlatform({ returnPreservation: true, gravityControl: true })
    expect(plan.modules.map((item) => item.role)).toEqual(expect.arrayContaining([
      'return_preservation', 'gravity_control',
    ]))
  })
})
