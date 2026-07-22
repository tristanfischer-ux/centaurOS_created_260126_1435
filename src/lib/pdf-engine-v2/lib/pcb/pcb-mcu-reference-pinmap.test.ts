/**
 * @file proveCatch tests for MCU reference pin-map (Terminal LOOP PREREQ-0).
 */

import {
  proveCatchMcuReferencePinmap,
  resolveMcuReferencePad,
} from './pcb-mcu-reference-pinmap'

describe('MCU reference pin-map', () => {
  it('resolves SAMD21 host pads from datasheet mux', () => {
    expect(resolveMcuReferencePad('ATSAMD21G18A-AU', 'usb_dp')).toBe('PA25')
    expect(resolveMcuReferencePad('ATSAMD21G18A-AU', 'usb_dm')).toBe('PA24')
    expect(resolveMcuReferencePad('ATSAMD21G18A-AU', 'i2c_sda')).toBe('PA22')
    expect(resolveMcuReferencePad('ATSAMD21G18A-AU', 'status_led')).toBe('PA07')
    expect(resolveMcuReferencePad('ATSAMD21G18A-AU', 'heater_pwm')).toBe('PA08')
  })

  it('returns null for unmapped MCU families', () => {
    expect(resolveMcuReferencePad('RP2040', 'i2c_sda')).toBeNull()
  })

  it('proveCatch happy path + unknown MCU', () => {
    expect(() => proveCatchMcuReferencePinmap()).not.toThrow()
  })
})
