import type { Archetype, BlueprintNode, SkillNode } from '../types'

// Rocket subsystem nodes - IMPROVED LAYOUT
// Layout: Central spine (physical systems) + Left zone (compliance) + Right zone (support)
// Canvas: 1100w x 750h, rocket silhouette centered at x=550

export const ROCKET_NODES: BlueprintNode[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRAL SPINE - Physical Systems (following rocket shape top-to-bottom)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Top: Payload Section (nose cone area)
  {
    id: 'payload',
    title: 'Payload Bay',
    description: 'Cargo and payload integration systems',
    type: 'component',
    category: 'Mechanical',
    x: 440,      // Center spine
    y: 30,       // Top of rocket
    status: 'partial',
    connections: ['avionics'],
  },
  
  // Upper: Avionics Bay
  {
    id: 'avionics',
    title: 'Avionics Bay',
    description: 'Flight computers, sensors, and navigation',
    type: 'system',
    category: 'Electronics',
    x: 440,      // Center spine
    y: 150,      // Below payload
    status: 'covered',
    connections: ['fuselage'],
  },
  
  // Upper-Left Branch: Guidance (connects to avionics)
  {
    id: 'guidance',
    title: 'Guidance System',
    description: 'Navigation, IMU, and flight control',
    type: 'component',
    category: 'Electronics',
    x: 220,      // Left branch
    y: 130,      // Same level as avionics
    status: 'partial',
    connections: ['avionics'],
  },
  
  // Upper-Right Branch: Communications (connects to avionics)
  {
    id: 'comms',
    title: 'Communications',
    description: 'Telemetry, tracking, and command systems',
    type: 'component',
    category: 'Electronics',
    x: 660,      // Right branch
    y: 130,      // Same level as avionics
    status: 'covered',
    connections: ['avionics'],
  },
  
  // Middle: Airframe Structure
  {
    id: 'fuselage',
    title: 'Airframe Structure',
    description: 'Primary structural components and materials',
    type: 'system',
    category: 'Mechanical',
    x: 440,      // Center spine
    y: 290,      // Mid-body
    status: 'partial',
    connections: ['fuel-tank'],
  },
  
  // Middle-Left Branch: Recovery System
  {
    id: 'recovery',
    title: 'Recovery System',
    description: 'Parachutes, landing systems, and reusability',
    type: 'system',
    category: 'Mechanical',
    x: 220,      // Left branch
    y: 310,      // Same level as fuselage
    status: 'partial',
    connections: ['fuselage'],
  },
  
  // Lower: Propellant Tanks
  {
    id: 'fuel-tank',
    title: 'Propellant Tanks',
    description: 'Cryogenic fuel and oxidizer storage',
    type: 'component',
    category: 'Mechanical',
    x: 440,      // Center spine
    y: 430,      // Lower body
    status: 'partial',
    connections: ['engine'],
  },
  
  // Lower-Right Branch: Pressurization
  {
    id: 'pressurization',
    title: 'Pressurization System',
    description: 'Tank pressurization and feed systems',
    type: 'component',
    category: 'Mechanical',
    x: 660,      // Right branch
    y: 450,      // Same level as tanks
    status: 'gap',
    connections: ['fuel-tank'],
  },
  
  // Bottom: Rocket Engine
  {
    id: 'engine',
    title: 'Rocket Engine',
    description: 'Main propulsion system and thrust vectoring',
    type: 'system',
    category: 'Mechanical',
    x: 440,      // Center spine
    y: 570,      // Bottom of rocket
    status: 'gap',
    connections: [],
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEFT ZONE - Compliance & Regulatory (visually separated)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    id: 'faa-license',
    title: 'FAA Launch License',
    description: 'Part 450 launch operator license requirements',
    type: 'compliance',
    category: 'Regulatory',
    x: 20,       // Far left zone
    y: 50,       // Top of compliance zone
    status: 'gap',
    connections: ['payload'],
  },
  {
    id: 'safety',
    title: 'Range Safety',
    description: 'Flight termination and safety analysis',
    type: 'compliance',
    category: 'Regulatory',
    x: 20,       // Far left zone
    y: 200,      // Below FAA
    status: 'gap',
    connections: ['recovery'],
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RIGHT ZONE - Additional Compliance (visually separated)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    id: 'environmental',
    title: 'Environmental Review',
    description: 'NEPA compliance and environmental assessment',
    type: 'compliance',
    category: 'Regulatory',
    x: 860,      // Far right zone
    y: 50,       // Top of right zone
    status: 'partial',
    connections: ['payload'],
  },
  {
    id: 'itar',
    title: 'ITAR Compliance',
    description: 'Export control and technology transfer',
    type: 'compliance',
    category: 'Regulatory',
    x: 860,      // Far right zone
    y: 200,      // Below environmental
    status: 'covered',
    connections: ['guidance'],
  },
]

// Beautiful rocket silhouette SVG path - Centered at x=550 for new layout
export const ROCKET_SILHOUETTE = `
  M 550 20
  C 570 20, 600 50, 610 110
  L 620 190
  L 625 270
  L 630 390
  L 635 490
  L 670 530
  L 690 610
  L 650 610
  L 645 690
  L 600 690
  L 600 640
  L 550 670
  L 500 640
  L 500 690
  L 455 690
  L 450 610
  L 410 610
  L 430 530
  L 465 490
  L 470 390
  L 475 270
  L 480 190
  L 490 110
  C 500 50, 530 20, 550 20
  Z
`

// Fins path (decorative) - adjusted for new center
export const ROCKET_FINS = `
  M 430 530 L 370 610 L 410 610 Z
  M 670 530 L 730 610 L 690 610 Z
`

// Engine nozzle detail - adjusted for new center
export const ROCKET_NOZZLE = `
  M 500 690 
  Q 525 740, 550 750 
  Q 575 740, 600 690
`

export const ROCKET_ARCHETYPE: Archetype = {
  id: 'rocket',
  name: 'Rocket / Launch Vehicle',
  description: 'A complete launch vehicle blueprint covering propulsion, avionics, structures, and regulatory requirements.',
  nodes: ROCKET_NODES,
  silhouette: ROCKET_SILHOUETTE,
  silhouetteViewBox: '0 0 1100 750',
  silhouetteTransform: 'translate(0, 0)',
  defaultZoom: 0.85,
  centerOffset: { x: 0, y: 20 },
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
