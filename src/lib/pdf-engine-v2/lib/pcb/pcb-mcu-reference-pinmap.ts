/**
 * @file Per-MCU REFERENCE pin-map for host-interface net assignment.
 * @description Terminal adversarial LOOP (2026-07-22): peripheral pin names
 * (SDA/SCL/AIN) are not enough — the MCU side must resolve to real pads via a
 * curated reference map (gold-reuse style), else wirePeripheralNets invents
 * phantom GPIO labels. Universal by MPN family regex, never a product slug.
 */

export type McuHostFunction =
  | 'usb_dp'
  | 'usb_dm'
  | 'swdio'
  | 'swclk'
  | 'reset'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'uart_tx'
  | 'uart_rx'
  | 'adc0'
  | 'status_led'
  | 'heater_pwm'

export interface McuReferencePinMap {
  /** Regex matched against manufacturer + MPN blob. */
  mcuFamilyTest: RegExp
  familyId: string
  /** Pad name as it appears on the curated / KiCad symbol (e.g. PA22). */
  pads: Partial<Record<McuHostFunction, string>>
  provenance: string
}

/**
 * INTENT: SAMD21G18 TQFP-48 Microchip defaults used by Pioreactor / Forge HAT
 * densify — USB on PA24/PA25, SWD on PA30/PA31, SERCOM3 I2C on PA22/PA23,
 * TCC0 WO[0] PWM on PA08, status LED on PA07 (free GPIO, not SERCOM-critical).
 */
export const MCU_REFERENCE_PINMAPS: readonly McuReferencePinMap[] = [
  {
    mcuFamilyTest: /ATSAMD21|SAMD21G18/i,
    familyId: 'samd21g18_tqfp48',
    pads: {
      usb_dp: 'PA25',
      usb_dm: 'PA24',
      swdio: 'PA31',
      swclk: 'PA30',
      reset: 'RESET',
      i2c_sda: 'PA22',
      i2c_scl: 'PA23',
      uart_tx: 'PA10',
      uart_rx: 'PA11',
      adc0: 'PA02',
      status_led: 'PA07',
      heater_pwm: 'PA08',
    },
    provenance:
      'Microchip SAMD21G18A datasheet pin mux: USB DP/DM=PA25/PA24; SWD=PA31/PA30; '
      + 'SERCOM3 PAD0/1 I2C=PA22/PA23; TCC0/WO[0]=PA08; ADC AIN0=PA02',
  },
]

/**
 * @description Resolve a host function pad for an MCU identified by MPN/name blob.
 * @returns Pad name or null when no family map matches.
 */
export function resolveMcuReferencePad(
  mcuIdentityBlob: string,
  fn: McuHostFunction,
): string | null {
  const map = MCU_REFERENCE_PINMAPS.find((m) => m.mcuFamilyTest.test(mcuIdentityBlob))
  if (!map) return null
  return map.pads[fn] ?? null
}

/**
 * @description proveCatch: SAMD21 resolves USB/I2C/LED pads; unknown MCU returns null.
 */
export function proveCatchMcuReferencePinmap(): void {
  const usb = resolveMcuReferencePad('Microchip ATSAMD21G18A-AU', 'usb_dp')
  if (usb !== 'PA25') {
    throw new Error(`proveCatch expected SAMD21 usb_dp=PA25, got ${usb}`)
  }
  const sda = resolveMcuReferencePad('ATSAMD21G18A-AU', 'i2c_sda')
  if (sda !== 'PA22') {
    throw new Error(`proveCatch expected SAMD21 i2c_sda=PA22, got ${sda}`)
  }
  const led = resolveMcuReferencePad('ATSAMD21G18A-AU', 'status_led')
  if (led !== 'PA07') {
    throw new Error(`proveCatch expected SAMD21 status_led=PA07, got ${led}`)
  }
  const unknown = resolveMcuReferencePad('UnknownMCU-999', 'i2c_sda')
  if (unknown !== null) {
    throw new Error('proveCatch must return null for unmapped MCU families')
  }
}
