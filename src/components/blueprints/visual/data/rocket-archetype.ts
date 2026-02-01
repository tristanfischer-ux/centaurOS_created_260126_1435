import type { Archetype, BlueprintNode, SkillNode } from '../types'

// Rocket subsystem nodes with realistic positioning
export const ROCKET_NODES: BlueprintNode[] = [
  // === PHYSICAL SYSTEMS ===
  
  // Nose/Payload Section
  {
    id: 'payload',
    title: 'Payload Bay',
    description: 'Cargo and payload integration systems',
    type: 'component',
    category: 'Mechanical',
    x: 400,
    y: 80,
    status: 'partial',
    connections: ['avionics', 'fuselage'],
  },
  
  // Avionics & Guidance
  {
    id: 'avionics',
    title: 'Avionics Bay',
    description: 'Flight computers, sensors, and navigation',
    type: 'system',
    category: 'Electronics',
    x: 400,
    y: 180,
    status: 'covered',
    connections: ['guidance', 'comms', 'fuselage'],
  },
  {
    id: 'guidance',
    title: 'Guidance System',
    description: 'Navigation, IMU, and flight control',
    type: 'component',
    category: 'Electronics',
    x: 220,
    y: 160,
    status: 'partial',
    connections: [],
  },
  {
    id: 'comms',
    title: 'Communications',
    description: 'Telemetry, tracking, and command systems',
    type: 'component',
    category: 'Electronics',
    x: 580,
    y: 160,
    status: 'covered',
    connections: [],
  },
  
  // Main Structure
  {
    id: 'fuselage',
    title: 'Airframe Structure',
    description: 'Primary structural components and materials',
    type: 'system',
    category: 'Mechanical',
    x: 400,
    y: 320,
    status: 'partial',
    connections: ['fuel-tank', 'recovery'],
  },
  
  // Propulsion
  {
    id: 'fuel-tank',
    title: 'Propellant Tanks',
    description: 'Cryogenic fuel and oxidizer storage',
    type: 'component',
    category: 'Mechanical',
    x: 400,
    y: 450,
    status: 'partial',
    connections: ['engine', 'pressurization'],
  },
  {
    id: 'pressurization',
    title: 'Pressurization System',
    description: 'Tank pressurization and feed systems',
    type: 'component',
    category: 'Mechanical',
    x: 580,
    y: 430,
    status: 'gap',
    connections: [],
  },
  {
    id: 'engine',
    title: 'Rocket Engine',
    description: 'Main propulsion system and thrust vectoring',
    type: 'system',
    category: 'Mechanical',
    x: 400,
    y: 580,
    status: 'gap',
    connections: [],
  },
  
  // Recovery
  {
    id: 'recovery',
    title: 'Recovery System',
    description: 'Parachutes, landing systems, and reusability',
    type: 'system',
    category: 'Mechanical',
    x: 220,
    y: 380,
    status: 'partial',
    connections: [],
  },
  
  // === COMPLIANCE & REGULATORY ===
  {
    id: 'faa-license',
    title: 'FAA Launch License',
    description: 'Part 450 launch operator license requirements',
    type: 'compliance',
    category: 'Regulatory',
    x: 80,
    y: 100,
    status: 'gap',
    connections: ['avionics', 'safety'],
  },
  {
    id: 'safety',
    title: 'Range Safety',
    description: 'Flight termination and safety analysis',
    type: 'compliance',
    category: 'Regulatory',
    x: 80,
    y: 220,
    status: 'gap',
    connections: ['recovery'],
  },
  {
    id: 'environmental',
    title: 'Environmental Review',
    description: 'NEPA compliance and environmental assessment',
    type: 'compliance',
    category: 'Regulatory',
    x: 720,
    y: 100,
    status: 'partial',
    connections: ['engine'],
  },
  {
    id: 'itar',
    title: 'ITAR Compliance',
    description: 'Export control and technology transfer',
    type: 'compliance',
    category: 'Regulatory',
    x: 720,
    y: 220,
    status: 'covered',
    connections: ['guidance', 'avionics'],
  },
]

// Beautiful rocket silhouette SVG path
export const ROCKET_SILHOUETTE = `
  M 400 30
  C 420 30, 450 60, 460 120
  L 470 200
  L 475 280
  L 480 400
  L 485 500
  L 520 540
  L 540 620
  L 500 620
  L 495 700
  L 450 700
  L 450 650
  L 400 680
  L 350 650
  L 350 700
  L 305 700
  L 300 620
  L 260 620
  L 280 540
  L 315 500
  L 320 400
  L 325 280
  L 330 200
  L 340 120
  C 350 60, 380 30, 400 30
  Z
`

// Fins path (decorative)
export const ROCKET_FINS = `
  M 280 540 L 220 620 L 260 620 Z
  M 520 540 L 580 620 L 540 620 Z
`

// Engine nozzle detail
export const ROCKET_NOZZLE = `
  M 350 700 
  Q 375 750, 400 760 
  Q 425 750, 450 700
`

export const ROCKET_ARCHETYPE: Archetype = {
  id: 'rocket',
  name: 'Rocket / Launch Vehicle',
  description: 'A complete launch vehicle blueprint covering propulsion, avionics, structures, and regulatory requirements.',
  nodes: ROCKET_NODES,
  silhouette: ROCKET_SILHOUETTE,
  silhouetteViewBox: '0 0 800 800',
  defaultZoom: 0.9,
  centerOffset: { x: 100, y: 50 },
}

// Skills tree for Rocket Engine domain
export const ENGINE_SKILLS: SkillNode[] = [
  {
    id: 'propulsion-fundamentals',
    name: 'Propulsion Fundamentals',
    status: 'mastered',
    children: [
      {
        id: 'rocket-equation',
        name: 'Tsiolkovsky Rocket Equation',
        status: 'mastered',
        questions: [
          'What is the relationship between exhaust velocity and delta-v?',
          'How does mass ratio affect mission capability?',
        ],
      },
      {
        id: 'thrust-calc',
        name: 'Thrust Calculations',
        status: 'mastered',
      },
    ],
  },
  {
    id: 'combustion',
    name: 'Combustion Systems',
    status: 'learning',
    children: [
      {
        id: 'injectors',
        name: 'Injector Design',
        status: 'unknown',
        questions: [
          'What atomization patterns work best for LOX/methane?',
          'How to prevent combustion instabilities?',
        ],
      },
      {
        id: 'chamber-design',
        name: 'Combustion Chamber',
        status: 'learning',
        questions: [
          'What L* values are typical for this propellant combination?',
          'How to size the chamber for your thrust level?',
        ],
      },
    ],
  },
  {
    id: 'cooling',
    name: 'Cooling Systems',
    status: 'needs_expert',
    children: [
      {
        id: 'regenerative',
        name: 'Regenerative Cooling',
        status: 'needs_expert',
        questions: [
          'What materials work for cooling channels at these temperatures?',
          'How to calculate required coolant flow rate?',
          'What manufacturing methods work for complex channel geometries?',
        ],
      },
      {
        id: 'film-cooling',
        name: 'Film Cooling',
        status: 'unknown',
      },
      {
        id: 'ablative',
        name: 'Ablative Cooling',
        status: 'mastered',
      },
    ],
  },
  {
    id: 'turbomachinery',
    name: 'Turbomachinery',
    status: 'needs_expert',
    children: [
      {
        id: 'turbopumps',
        name: 'Turbopump Design',
        status: 'needs_expert',
        questions: [
          'What pump type is best for this flow rate?',
          'How to handle cavitation in LOX pumps?',
        ],
      },
      {
        id: 'power-cycle',
        name: 'Engine Cycle Selection',
        status: 'learning',
        questions: [
          'Gas generator vs staged combustion tradeoffs?',
          'What are the complexity implications of full-flow staged?',
        ],
      },
    ],
  },
  {
    id: 'tvc',
    name: 'Thrust Vector Control',
    status: 'learning',
    children: [
      {
        id: 'gimbal',
        name: 'Gimbal Systems',
        status: 'learning',
      },
      {
        id: 'actuators',
        name: 'Hydraulic Actuators',
        status: 'unknown',
      },
    ],
  },
]

// Sample expert matches for engine gaps
export const ENGINE_EXPERTS = [
  {
    id: 'exp-1',
    name: 'Dr. Sarah Chen',
    avatar: '/avatars/expert-1.jpg',
    title: 'Propulsion Engineer, ex-SpaceX',
    hourlyRate: 250,
    rating: 4.9,
    reviewCount: 47,
    relevantSkills: ['Regenerative Cooling', 'Turbopump Design', 'Combustion'],
    availability: 'available' as const,
  },
  {
    id: 'exp-2',
    name: 'Marcus Webb',
    avatar: '/avatars/expert-2.jpg',
    title: 'Chief Engineer, Rocket Lab',
    hourlyRate: 300,
    rating: 5.0,
    reviewCount: 23,
    relevantSkills: ['Engine Cycles', 'System Integration', 'Testing'],
    availability: 'busy' as const,
  },
  {
    id: 'exp-3',
    name: 'Dr. James Okonkwo',
    avatar: '/avatars/expert-3.jpg',
    title: 'Professor, MIT AeroAstro',
    hourlyRate: 175,
    rating: 4.8,
    reviewCount: 89,
    relevantSkills: ['Combustion Dynamics', 'Injector Design', 'Research'],
    availability: 'available' as const,
  },
]

// Sample supplier matches
export const ENGINE_SUPPLIERS = [
  {
    id: 'sup-1',
    name: 'Precision Castparts Corp',
    logo: '/logos/pcc.png',
    leadTime: '8-12 weeks',
    priceRange: '$50K - $200K',
    rating: 4.7,
    capabilities: ['Turbopump housings', 'Nozzle components', 'Precision casting'],
    location: 'Portland, OR',
  },
  {
    id: 'sup-2',
    name: 'MOOG Inc',
    logo: '/logos/moog.png',
    leadTime: '6-10 weeks',
    priceRange: '$25K - $100K',
    rating: 4.9,
    capabilities: ['Actuators', 'Valves', 'TVC systems'],
    location: 'East Aurora, NY',
  },
  {
    id: 'sup-3',
    name: 'Aerojet Rocketdyne',
    logo: '/logos/aerojet.png',
    leadTime: '12-16 weeks',
    priceRange: '$100K+',
    rating: 4.8,
    capabilities: ['Complete engines', 'Injectors', 'Test support'],
    location: 'Canoga Park, CA',
  },
]
