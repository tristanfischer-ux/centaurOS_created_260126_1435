/** Universal Yuri cassette electrical platform derived from functional needs. */

export interface CassettePlatformRequirements {
  sensing?: boolean
  optics?: boolean
  perfusion?: boolean
  incubation?: boolean
  motion?: boolean
  returnPreservation?: boolean
  gravityControl?: boolean
}

export interface CassettePlatformPlan {
  schema: 'cassette-electrical-platform/v1'
  interface: {
    mechanicalDatum: 'cassette_interface_origin'
    signals: string[]
    fluidPorts: string[]
  }
  modules: Array<{
    role: string
    reusable: true
    workPerformed: string[]
  }>
}

export function deriveCassettePlatform(requirements: CassettePlatformRequirements): CassettePlatformPlan {
  const modules: CassettePlatformPlan['modules'] = [
    { role: 'cassette_backplane', reusable: true, workPerformed: ['power_distribution', 'host_data_link', 'cassette_presence'] },
    { role: 'smart_cassette', reusable: true, workPerformed: ['cassette_identity', 'traceability', 'local_datalogging'] },
  ]
  if (requirements.sensing || requirements.optics) {
    modules.push({ role: 'sensor_optics_module', reusable: true, workPerformed: ['environment_sensing', 'optical_readout', 'timestamped_telemetry'] })
  }
  if (requirements.perfusion) {
    modules.push({ role: 'perfusion_actuation', reusable: true, workPerformed: ['media_exchange', 'waste_handling', 'flow_monitoring'] })
  }
  if (requirements.incubation) {
    modules.push({ role: 'incubator_control', reusable: true, workPerformed: ['temperature_control', 'gas_control', 'safety_interlock'] })
  }
  if (requirements.motion) {
    modules.push({ role: 'motion_stressor_control', reusable: true, workPerformed: ['motor_control', 'encoder_feedback', 'vibration_telemetry'] })
  }
  if (requirements.returnPreservation) {
    modules.push({ role: 'return_preservation', reusable: true, workPerformed: ['fixation_or_cooling', 'shock_event_logging', 'sample_state_retention'] })
  }
  if (requirements.gravityControl) {
    modules.push({ role: 'gravity_control', reusable: true, workPerformed: ['centrifuge_control', 'gravity_setpoint', 'paired_control_telemetry'] })
  }
  return {
    schema: 'cassette-electrical-platform/v1',
    interface: {
      mechanicalDatum: 'cassette_interface_origin',
      signals: ['POWER', 'GND', 'DATA+', 'DATA-', 'CASSETTE_ID', 'INTERLOCK'],
      fluidPorts: ['MEDIA_IN', 'MEDIA_OUT', 'GAS', 'WASTE'],
    },
    modules,
  }
}
