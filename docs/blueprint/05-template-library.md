# Template Library Specification

> **Step 5 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-5+4

---

## Table of Contents
1. [Overview](#1-overview)
2. [Canonical Template Schema](#2-canonical-template-schema)
3. [Knowledge Domain Schema](#3-knowledge-domain-schema)
4. [Key Questions Structure](#4-key-questions-structure)
5. [Stage Gate Attachment](#5-stage-gate-attachment)
6. [Example Template: Robotics Hardware Product](#6-example-template-robotics-hardware-product)
7. [Seeding & Migrations Strategy](#7-seeding--migrations-strategy)
8. [Validation Rules](#8-validation-rules)
9. [Template Quality Rubric](#9-template-quality-rubric)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

The Template Library provides curated, domain-expert-designed knowledge structures that founders can instantiate as Manufacturing Blueprints. Templates encode:

1. **Domain expertise**: What knowledge areas are required to ship a product category
2. **Key questions**: Stage-aware questions that generate non-generic Expert Packets
3. **Criticality mapping**: Which domains are critical vs nice-to-have
4. **Stage relevance**: When each domain becomes active in the product lifecycle

### 1.2 Template Philosophy

**Templates are "opinions made concrete."** A good template:
- Encodes real-world expertise from domain experts
- Prevents founders from missing critical unknowns
- Enables AI to generate parameterized, contextual outputs
- Evolves through verified update cycles (see 15-template-governance.md)

### 1.3 Integration Points

| System | Integration |
|--------|-------------|
| **Blueprint Creation** | `clone_blueprint_from_template()` instantiates domains |
| **Expert Packet Generation** | `key_questions` drive AI output (see 04-llm-design.md) |
| **Stage Gates** | `stage_relevance` metadata drives filtering (see 09-stage-gates.md) |
| **AI Provenance** | Template-derived content has `provenance_type: 'template_derived'` (see 13-ai-confidence-verification.md) |

---

## 2. Canonical Template Schema

### 2.1 Blueprint Templates Table

**Table:** `blueprint_templates` (existing)

```sql
CREATE TABLE blueprint_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  product_category TEXT NOT NULL,  -- e.g., 'consumer_electronics', 'robotics', 'medtech'
  icon TEXT,                       -- Lucide icon name
  estimated_domains INTEGER NOT NULL DEFAULT 0,
  estimated_questions INTEGER NOT NULL DEFAULT 0,
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  fork_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Template Metadata Schema

All templates MUST include this metadata structure (extends 15-template-governance.md):

```typescript
interface TemplateMetadata {
  // Governance (from 15-template-governance.md)
  lifecycle: 'draft' | 'active' | 'deprecated' | 'archived'
  version: string  // Semantic version e.g., "1.2.0"
  owner: TemplateOwner
  last_verified_at?: string  // ISO8601
  review_interval_days?: number  // Default: 180
  changelog: ChangeEntry[]
  
  // Template Content Metadata
  product_types: string[]          // e.g., ["smart_home_hub", "wearable", "iot_sensor"]
  target_audience: 'technical' | 'non_technical' | 'mixed'
  typical_team_size: 'solo' | 'small' | 'medium' | 'large'
  typical_budget_range: {
    min_usd: number
    max_usd: number
    currency: 'USD'
  }
  typical_timeline_months: {
    concept_to_launch_min: number
    concept_to_launch_max: number
  }
  
  // Domain Statistics
  domain_count: number
  top_level_domain_count: number
  question_count: number
  critical_domain_count: number
  
  // AI Generation Hints
  ai_hints: {
    primary_regulatory_bodies: string[]    // e.g., ["FCC", "UL", "CE"]
    typical_manufacturing_regions: string[] // e.g., ["China", "Taiwan", "Mexico"]
    common_failure_modes: string[]          // Category-level failures
    key_expertise_areas: string[]           // e.g., ["RF engineering", "mechanical design"]
  }
  
  // Categorization
  tags: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  min_domains: number  // Minimum expected domains for this category
}
```

### 2.3 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| **Template Name** | Title Case, Category + Context | "Consumer Electronics (IoT)" |
| **Product Category** | snake_case | "consumer_electronics" |
| **Domain Name** | Title Case, Noun Phrase | "Power Systems", "Regulatory Compliance" |
| **Category (top-level)** | Title Case, Broad Area | "Electronics", "Mechanical", "Regulatory" |

### 2.4 Product Category Enum

Canonical product categories for `blueprint_templates.product_category`:

```typescript
type ProductCategory = 
  | 'consumer_electronics'
  | 'industrial_equipment'
  | 'robotics_automation'
  | 'medical_devices'
  | 'automotive'
  | 'aerospace_defense'
  | 'wearables'
  | 'iot_sensors'
  | 'energy_cleantech'
  | 'telecommunications'
  | 'saas_platform'     // Software-only (reference template)
  | 'custom'            // User-created custom templates
```

---

## 3. Knowledge Domain Schema

### 3.1 Knowledge Domains Table

**Table:** `knowledge_domains` (existing)

```sql
CREATE TABLE knowledge_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES blueprint_templates(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,           -- Top-level category grouping
  depth INTEGER NOT NULL DEFAULT 0, -- 0 = top-level, 1 = child, 2 = grandchild
  display_order INTEGER NOT NULL DEFAULT 0,
  key_questions JSONB NOT NULL DEFAULT '[]',
  typical_roles TEXT[],             -- e.g., ['EE', 'ME', 'Firmware']
  criticality TEXT NOT NULL DEFAULT 'important',  -- 'critical' | 'important' | 'nice-to-have'
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_criticality CHECK (
    criticality IN ('critical', 'important', 'nice-to-have')
  ),
  CONSTRAINT valid_depth CHECK (depth >= 0 AND depth <= 4)
);

-- Index for hierarchical queries
CREATE INDEX idx_domains_template ON knowledge_domains(template_id);
CREATE INDEX idx_domains_parent ON knowledge_domains(parent_id);
CREATE INDEX idx_domains_category ON knowledge_domains(template_id, category);
```

### 3.2 Domain Metadata Schema

```typescript
interface DomainMetadata {
  // Stage Relevance (from 09-stage-gates.md)
  stage_relevance: {
    concept: StageRelevanceConfig
    prototype: StageRelevanceConfig
    evt: StageRelevanceConfig
    dvt: StageRelevanceConfig
    production: StageRelevanceConfig
    launched: StageRelevanceConfig
  }
  
  // Required Artifacts by Stage
  required_artifacts: {
    concept: string[]
    prototype: string[]
    evt: string[]
    dvt: string[]
    production: string[]
    launched: string[]
  }
  
  // Key Questions Stage Mapping
  key_questions_by_stage: {
    concept: number[]     // Indices into key_questions array
    prototype: number[]
    evt: number[]
    dvt: number[]
    production: number[]
    launched: number[]
  }
  
  // Expert Packet Generation Hints
  expert_packet_hints: {
    expertise_keywords: string[]        // For marketplace matching
    typical_engagement_type: 'consulting' | 'fractional' | 'retainer' | 'project'
    budget_range_usd?: { min: number; max: number }
    lead_time_weeks?: { min: number; max: number }
  }
  
  // RFQ Generation Hints
  rfq_hints?: {
    supplier_category: string           // e.g., "pcb_manufacturer", "cm_assembly"
    typical_moq_range?: { min: number; max: number }
    specification_fields: string[]      // Fields to include in RFQ
  }
  
  // Risk Assessment Hints
  risk_hints?: {
    common_failure_modes: string[]
    mitigation_strategies: string[]
    warning_signs: string[]
  }
  
  // Related Domains
  related_domains?: string[]  // Domain names that often co-occur
  prerequisite_domains?: string[]  // Domains that should be covered first
}

interface StageRelevanceConfig {
  relevance: 'informational' | 'active' | 'critical' | 'sustaining' | 'not_applicable'
  min_status: 'covered' | 'partial' | null  // Required coverage to exit stage
}
```

### 3.3 Criticality Definitions

| Criticality | Definition | Stage Gate Impact | Example |
|-------------|------------|-------------------|---------|
| `critical` | Failure blocks product launch or causes safety/legal issues | MUST be `covered` or `partial` with plan to advance from EVT | FCC Certification, Battery Safety |
| `important` | Significantly impacts product success but not blocking | Should be addressed but can advance with documented gaps | User Documentation, Cost Optimization |
| `nice-to-have` | Enhances product but not required for MVP | Informational only; no stage gate impact | Advanced Analytics, Premium Features |

### 3.4 Depth and Hierarchy Rules

| Depth | Name | Typical Count | Example |
|-------|------|---------------|---------|
| 0 | Top-Level Domain | 8-15 per template | "Electronics", "Regulatory" |
| 1 | Sub-Domain | 3-6 per top-level | "Power Systems", "FCC Certification" |
| 2 | Specialty Area | 2-4 per sub-domain | "Battery Management", "EMC Testing" |
| 3 | Specific Topic | 0-3 per specialty | "Cell Selection", "Conducted Emissions" |

**Maximum Depth:** 4 (for exceptional complexity only)

**Hierarchy Rules:**
1. Top-level domains represent broad expertise categories
2. Each level adds specificity without redundancy
3. Questions belong at the most specific applicable level
4. Parent domain questions are inherited by children (contextually)

---

## 4. Key Questions Structure

### 4.1 Question Schema

The `key_questions` JSONB array is the foundation for non-generic Expert Packet generation.

```typescript
interface KeyQuestion {
  // Unique identifier within domain
  id: string  // e.g., "q1", "q2" - stable across versions
  
  // The question text
  question: string
  
  // Why this question matters (REQUIRED for "No Generic" bar)
  why_it_matters: string
  
  // Stage applicability
  stages: ProjectStage[]  // When this question is relevant
  primary_stage?: ProjectStage  // The stage where this is most critical
  
  // Parameterization context
  context_required: {
    product_description: boolean
    budget_range: boolean
    timeline: boolean
    volume_targets: boolean
    target_market: boolean
    existing_decisions: boolean
  }
  
  // Expected deliverables from expert
  artifacts_to_request: string[]
  
  // Warning signs in expert responses
  red_flags: string[]
  
  // Follow-up question triggers
  follow_ups?: {
    condition: string  // e.g., "if answer mentions 'custom battery'"
    question: string
  }[]
  
  // Categorization
  question_type: 'feasibility' | 'design' | 'validation' | 'compliance' | 'process' | 'cost'
  difficulty: 'basic' | 'intermediate' | 'advanced'
}

type ProjectStage = 'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'
```

### 4.2 Example Key Question

```json
{
  "id": "bms-q3",
  "question": "What is the expected operating temperature range, and have you characterized the battery cells' performance and safety across this range?",
  "why_it_matters": "Li-ion batteries have significant capacity reduction at low temperatures (can lose 40%+ capacity below 0°C) and safety risks at high temperatures (thermal runaway risk above 60°C). The operating range directly impacts cell chemistry selection, BMS design complexity, and thermal management requirements.",
  "stages": ["prototype", "evt", "dvt"],
  "primary_stage": "prototype",
  "context_required": {
    "product_description": true,
    "budget_range": false,
    "timeline": false,
    "volume_targets": false,
    "target_market": true,
    "existing_decisions": true
  },
  "artifacts_to_request": [
    "Cell datasheet with temperature derating curves",
    "Thermal simulation or test data for enclosure",
    "BMS temperature monitoring specification"
  ],
  "red_flags": [
    "No temperature range specified for product",
    "Cells not characterized below 0°C for outdoor products",
    "No thermal management strategy documented",
    "Relying solely on cell vendor specifications without validation"
  ],
  "follow_ups": [
    {
      "condition": "if operating range includes below 0°C",
      "question": "What cell heating strategy will you use, and have you validated charge acceptance at low temperatures?"
    },
    {
      "condition": "if operating range includes above 45°C",
      "question": "What active cooling strategy will you use, and what is your thermal runaway prevention approach?"
    }
  ],
  "question_type": "design",
  "difficulty": "intermediate"
}
```

### 4.3 Question Quality Criteria

Every key question MUST pass these criteria:

| Criterion | Requirement | Bad Example | Good Example |
|-----------|-------------|-------------|--------------|
| **Specificity** | Asks about concrete, measurable aspects | "What battery will you use?" | "What cell chemistry, capacity (Ah), and nominal voltage is your battery pack?" |
| **Context-Aware** | References product context | "What certifications do you need?" | "Given your {product_type} targeting {market}, which of FCC Part 15B/15C or CE RED certifications apply?" |
| **Actionable** | Leads to specific deliverables | "Have you thought about safety?" | "Can you provide your FMEA for battery thermal events and the corresponding mitigation controls?" |
| **Stage-Appropriate** | Matches the project phase | "What's your production yield?" (at concept) | "What's your technical feasibility assessment for this approach?" (at concept) |
| **Non-Obvious** | Goes beyond surface-level | "Do you need FCC certification?" | "Have you determined if your device is intentional (Part 15C) or unintentional (Part 15B) radiator, and tested for spurious emissions that could push you into different requirements?" |

### 4.4 Question Count Guidelines

| Template Complexity | Questions per Domain | Total Questions |
|---------------------|---------------------|-----------------|
| Basic (SaaS, Simple IoT) | 3-5 per leaf domain | 40-80 |
| Standard (Consumer Electronics) | 5-8 per leaf domain | 100-200 |
| Complex (Robotics, Medical) | 8-12 per leaf domain | 200-400 |
| Expert (Automotive, Aerospace) | 10-15 per leaf domain | 300-500+ |

---

## 5. Stage Gate Attachment

### 5.1 Stage Relevance Configuration

Every domain MUST define `stage_relevance` in its metadata (from 09-stage-gates.md):

```json
{
  "stage_relevance": {
    "concept": {
      "relevance": "informational",
      "min_status": null
    },
    "prototype": {
      "relevance": "active",
      "min_status": "partial"
    },
    "evt": {
      "relevance": "critical",
      "min_status": "covered"
    },
    "dvt": {
      "relevance": "critical",
      "min_status": "covered"
    },
    "production": {
      "relevance": "critical",
      "min_status": "covered"
    },
    "launched": {
      "relevance": "sustaining",
      "min_status": "covered"
    }
  }
}
```

### 5.2 Relevance Level Meanings

| Relevance | UI Behavior | Stage Gate Impact | Expert Packet Behavior |
|-----------|-------------|-------------------|----------------------|
| `not_applicable` | Hidden from domain tree | Excluded from coverage calculation | Not included |
| `informational` | Shown but grayed out | No minimum status required | Questions marked "for awareness" |
| `active` | Highlighted; shown in focus view | Should address; appears in recommendations | Full questions with guidance |
| `critical` | Prominently displayed; red if gap | MUST meet `min_status` to advance | Urgent questions; deadline-aware |
| `sustaining` | Shown in maintenance view | Ongoing monitoring | Troubleshooting/improvement questions |

### 5.3 Default Stage Relevance by Category

Templates should apply these defaults, then override for specific domains:

| Domain Category | concept | prototype | evt | dvt | production | launched |
|-----------------|---------|-----------|-----|-----|------------|----------|
| **Electronics** | info | active | critical | critical | critical | sustaining |
| **Mechanical** | info | active | critical | critical | critical | sustaining |
| **Software/Firmware** | info | active | active | critical | critical | sustaining |
| **Regulatory** | active | active | critical | critical | critical | sustaining |
| **Supply Chain** | info | active | active | critical | critical | sustaining |
| **Manufacturing** | info | info | active | critical | critical | sustaining |
| **Quality/Testing** | info | info | active | critical | critical | sustaining |
| **Business Operations** | active | active | active | active | active | active |

### 5.4 Required Artifacts by Stage

Each domain should define `required_artifacts` with stage-specific deliverables:

```json
{
  "required_artifacts": {
    "concept": ["feasibility_assessment"],
    "prototype": ["design_specification", "component_selection_rationale"],
    "evt": ["test_report", "design_release_document"],
    "dvt": ["validation_report", "certification_test_results"],
    "production": ["process_specification", "quality_control_plan"],
    "launched": []
  }
}
```

---

## 6. Example Template: Robotics Hardware Product

### 6.1 Template Overview

```json
{
  "id": "00000003-0000-4000-8000-000000000001",
  "name": "Robotics Hardware Product",
  "description": "Comprehensive template for autonomous robots, robotic arms, drones, and mobile robots targeting consumer or light industrial applications.",
  "product_category": "robotics_automation",
  "icon": "Bot",
  "estimated_domains": 68,
  "estimated_questions": 284,
  "is_system_template": true,
  "metadata": {
    "lifecycle": "active",
    "version": "1.0.0",
    "owner": {
      "type": "system",
      "team": "CentaurOS Product Team",
      "contact_email": "templates@centauros.com"
    },
    "last_verified_at": "2026-02-01T10:00:00Z",
    "review_interval_days": 180,
    "product_types": [
      "autonomous_mobile_robot",
      "robotic_arm",
      "drone_uav",
      "collaborative_robot",
      "service_robot",
      "educational_robot"
    ],
    "target_audience": "technical",
    "typical_team_size": "small",
    "typical_budget_range": {
      "min_usd": 100000,
      "max_usd": 5000000,
      "currency": "USD"
    },
    "typical_timeline_months": {
      "concept_to_launch_min": 12,
      "concept_to_launch_max": 36
    },
    "domain_count": 68,
    "top_level_domain_count": 12,
    "question_count": 284,
    "critical_domain_count": 24,
    "ai_hints": {
      "primary_regulatory_bodies": ["FCC", "CE", "UL", "ISO 10218", "ISO 13482"],
      "typical_manufacturing_regions": ["China", "Taiwan", "Germany", "USA"],
      "common_failure_modes": [
        "Motor burnout",
        "Sensor drift",
        "Communication dropouts",
        "Mechanical fatigue",
        "Software crashes"
      ],
      "key_expertise_areas": [
        "Motion control",
        "Computer vision",
        "SLAM navigation",
        "Embedded systems",
        "Mechanical design",
        "Functional safety"
      ]
    },
    "tags": ["robotics", "hardware", "automation", "ai", "iot"],
    "difficulty": "advanced",
    "min_domains": 50,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-02-01T10:00:00Z",
        "author_name": "CentaurOS Product Team",
        "changes": ["Initial release"]
      }
    ]
  }
}
```

### 6.2 Domain Hierarchy

The template contains **12 top-level domains**, each with **3-6 child domains**.

---

#### 6.2.1 Electronics & Electrical Systems

```yaml
Electronics & Electrical Systems:
  criticality: critical
  description: "Electrical architecture, PCB design, power distribution, and embedded computing"
  children:
    - Power Systems:
        criticality: critical
        description: "Battery, charging, power distribution, and energy management"
        children:
          - Battery Management:
              criticality: critical
              key_questions: 12
          - Power Distribution:
              criticality: important
              key_questions: 8
          - Charging Systems:
              criticality: important
              key_questions: 6
    - Motor Control & Drives:
        criticality: critical
        description: "Motor selection, drivers, encoders, and motion control"
        children:
          - Motor Selection:
              criticality: critical
              key_questions: 10
          - Drive Electronics:
              criticality: critical
              key_questions: 8
          - Encoder Integration:
              criticality: important
              key_questions: 5
    - Main Computing Platform:
        criticality: critical
        description: "Central processor, SBC, or embedded computer selection"
        key_questions: 8
    - PCB Design:
        criticality: critical
        description: "Custom PCB design for motor control, sensor interfaces, power"
        key_questions: 10
    - Wiring & Connectors:
        criticality: important
        description: "Wire harness, connectors, EMC considerations"
        key_questions: 6
```

---

#### 6.2.2 Sensing & Perception

```yaml
Sensing & Perception:
  criticality: critical
  description: "Sensors for navigation, obstacle detection, and environmental awareness"
  children:
    - Navigation Sensors:
        criticality: critical
        description: "LiDAR, cameras, IMU, GPS for localization"
        children:
          - LiDAR Systems:
              criticality: critical
              key_questions: 10
          - Camera Systems:
              criticality: important
              key_questions: 8
          - IMU & Odometry:
              criticality: critical
              key_questions: 6
    - Proximity & Safety Sensors:
        criticality: critical
        description: "Ultrasonic, ToF, bumpers for collision avoidance"
        key_questions: 8
    - Environmental Sensors:
        criticality: nice-to-have
        description: "Temperature, humidity, air quality for context awareness"
        key_questions: 4
    - Sensor Fusion:
        criticality: important
        description: "Combining sensor data for robust perception"
        key_questions: 8
```

---

#### 6.2.3 Motion & Actuation

```yaml
Motion & Actuation:
  criticality: critical
  description: "Motors, actuators, transmissions, and mechanical motion systems"
  children:
    - Drive System:
        criticality: critical
        description: "Locomotion mechanism - wheels, tracks, legs"
        children:
          - Wheel/Track Design:
              criticality: critical
              key_questions: 8
          - Gearbox & Transmission:
              criticality: important
              key_questions: 6
    - Manipulation System:
        criticality: important
        description: "Arms, grippers, end effectors for task execution"
        children:
          - Arm Kinematics:
              criticality: important
              key_questions: 8
          - End Effector Design:
              criticality: important
              key_questions: 6
          - Gripper Systems:
              criticality: important
              key_questions: 5
    - Servo & Actuator Selection:
        criticality: critical
        description: "Actuator sizing, torque requirements, control modes"
        key_questions: 10
```

---

#### 6.2.4 Mechanical Engineering

```yaml
Mechanical Engineering:
  criticality: critical
  description: "Structural design, enclosures, mechanisms, and thermal management"
  children:
    - Structural Design:
        criticality: critical
        description: "Frame, chassis, load-bearing structures"
        key_questions: 8
    - Enclosure & Housing:
        criticality: important
        description: "External housing, IP rating, aesthetics"
        key_questions: 7
    - Thermal Management:
        criticality: critical
        description: "Heat dissipation for motors, electronics, batteries"
        key_questions: 8
    - Mechanism Design:
        criticality: important
        description: "Linkages, cams, gears, bearings"
        key_questions: 6
    - Materials Selection:
        criticality: important
        description: "Material properties, weight optimization, durability"
        key_questions: 6
    - Serviceability:
        criticality: nice-to-have
        description: "Maintainability, repair access, modularity"
        key_questions: 4
```

---

#### 6.2.5 Software & Firmware

```yaml
Software & Firmware:
  criticality: critical
  description: "Embedded firmware, ROS, navigation stack, and application software"
  children:
    - Embedded Firmware:
        criticality: critical
        description: "Low-level motor control, sensor drivers, real-time systems"
        key_questions: 10
    - Robot Operating System (ROS):
        criticality: important
        description: "ROS/ROS2 architecture, nodes, messages"
        key_questions: 8
    - Navigation Stack:
        criticality: critical
        description: "SLAM, path planning, localization, mapping"
        children:
          - SLAM Implementation:
              criticality: critical
              key_questions: 10
          - Path Planning:
              criticality: critical
              key_questions: 8
          - Localization:
              criticality: critical
              key_questions: 6
    - Behavior & Task Planning:
        criticality: important
        description: "High-level decision making, task sequencing"
        key_questions: 6
    - Remote Connectivity:
        criticality: important
        description: "WiFi, cellular, cloud connectivity"
        key_questions: 6
```

---

#### 6.2.6 Safety & Functional Safety

```yaml
Safety & Functional Safety:
  criticality: critical
  description: "Hazard analysis, safety systems, emergency stop, functional safety"
  children:
    - Hazard Analysis:
        criticality: critical
        description: "FMEA, risk assessment, hazard identification"
        key_questions: 10
    - Emergency Stop Systems:
        criticality: critical
        description: "E-stop design, STO, SBC implementation"
        key_questions: 8
    - Protective Systems:
        criticality: critical
        description: "Guards, sensors, speed limiting for human safety"
        key_questions: 8
    - Functional Safety Compliance:
        criticality: critical
        description: "ISO 13849, IEC 62443, SIL/PL determination"
        key_questions: 10
    - Human-Robot Interaction Safety:
        criticality: critical
        description: "Collaborative safety, force limiting, space sharing"
        key_questions: 8
```

---

#### 6.2.7 Regulatory & Compliance

```yaml
Regulatory & Compliance:
  criticality: critical
  description: "Certifications, standards compliance, and market access requirements"
  children:
    - RF & Wireless Certification:
        criticality: critical
        description: "FCC, CE RED, IC for wireless communications"
        key_questions: 8
    - Safety Certification:
        criticality: critical
        description: "UL, CE, IEC 60204, ISO 10218"
        key_questions: 10
    - Robot-Specific Standards:
        criticality: critical
        description: "ISO 10218, ISO 13482, ISO 15066 for collaborative robots"
        key_questions: 10
    - EMC Compliance:
        criticality: important
        description: "Electromagnetic compatibility testing"
        key_questions: 6
    - International Market Access:
        criticality: important
        description: "Regional certifications beyond US/EU"
        key_questions: 5
```

---

#### 6.2.8 Supply Chain & Sourcing

```yaml
Supply Chain & Sourcing:
  criticality: important
  description: "Component sourcing, supplier management, and supply chain resilience"
  children:
    - Critical Components:
        criticality: critical
        description: "Motors, sensors, compute modules sourcing"
        key_questions: 8
    - Manufacturing Partners:
        criticality: important
        description: "PCB fabrication, machining, injection molding"
        key_questions: 6
    - Supplier Qualification:
        criticality: important
        description: "Supplier assessment, quality agreements"
        key_questions: 6
    - Inventory Strategy:
        criticality: nice-to-have
        description: "Stock levels, lead time management"
        key_questions: 4
```

---

#### 6.2.9 Manufacturing & Assembly

```yaml
Manufacturing & Assembly:
  criticality: important
  description: "Production processes, assembly procedures, and quality control"
  children:
    - Assembly Design:
        criticality: important
        description: "DFA, assembly sequence, fixturing"
        key_questions: 8
    - Production Planning:
        criticality: important
        description: "Capacity, cycle time, line design"
        key_questions: 6
    - Quality Control:
        criticality: critical
        description: "Inspection, testing, defect tracking"
        key_questions: 10
    - Calibration Procedures:
        criticality: important
        description: "Sensor calibration, motion calibration"
        key_questions: 8
```

---

#### 6.2.10 Testing & Validation

```yaml
Testing & Validation:
  criticality: critical
  description: "Test planning, validation protocols, and reliability testing"
  children:
    - Unit & Component Testing:
        criticality: important
        description: "Individual component verification"
        key_questions: 6
    - Integration Testing:
        criticality: critical
        description: "Subsystem and system-level testing"
        key_questions: 8
    - Environmental Testing:
        criticality: important
        description: "Temperature, humidity, vibration, shock"
        key_questions: 8
    - Reliability Testing:
        criticality: critical
        description: "Life testing, MTBF, wear-out analysis"
        key_questions: 8
    - Field Validation:
        criticality: important
        description: "Real-world testing, beta programs"
        key_questions: 6
```

---

#### 6.2.11 User Experience & Interfaces

```yaml
User Experience & Interfaces:
  criticality: important
  description: "Human-robot interfaces, control methods, and user documentation"
  children:
    - Control Interface:
        criticality: important
        description: "Remote control, teach pendant, voice control"
        key_questions: 6
    - Mobile/Web App:
        criticality: nice-to-have
        description: "Companion application for monitoring/control"
        key_questions: 5
    - Physical Interface:
        criticality: important
        description: "Buttons, displays, indicators on robot"
        key_questions: 5
    - Documentation & Training:
        criticality: important
        description: "User manuals, training materials"
        key_questions: 4
```

---

#### 6.2.12 Business Operations

```yaml
Business Operations:
  criticality: important
  description: "Go-to-market, support, and business model considerations"
  children:
    - Product Strategy:
        criticality: important
        description: "Positioning, pricing, market segments"
        key_questions: 6
    - Customer Support:
        criticality: important
        description: "Support channels, RMA, warranty"
        key_questions: 5
    - Field Service:
        criticality: nice-to-have
        description: "Maintenance, upgrades, spare parts"
        key_questions: 4
    - Business Model:
        criticality: important
        description: "RaaS, sales, leasing options"
        key_questions: 5
```

### 6.3 Sample Key Questions

#### Battery Management (Electronics > Power Systems > Battery Management)

```json
{
  "key_questions": [
    {
      "id": "bms-q1",
      "question": "What is your target runtime per charge cycle, and what system power consumption have you measured or estimated (including peak loads during high-torque maneuvers)?",
      "why_it_matters": "Runtime directly determines battery capacity requirements and weight. For mobile robots, battery weight significantly impacts locomotion power consumption, creating a non-linear tradeoff. Accurate power profiling is essential for sizing.",
      "stages": ["concept", "prototype"],
      "primary_stage": "concept",
      "context_required": {
        "product_description": true,
        "budget_range": false,
        "timeline": false,
        "volume_targets": false,
        "target_market": true,
        "existing_decisions": true
      },
      "artifacts_to_request": [
        "Power budget spreadsheet with all loads enumerated",
        "Motor current profiles during typical operation",
        "Duty cycle assumptions for runtime calculation"
      ],
      "red_flags": [
        "No measured power data, only vendor specifications",
        "Peak power not accounted for (motors can draw 3-10x continuous current at stall)",
        "Runtime calculation assumes 100% DoD (depth of discharge)"
      ],
      "question_type": "design",
      "difficulty": "intermediate"
    },
    {
      "id": "bms-q2",
      "question": "What cell chemistry have you selected (LiFePO4, NMC, NCA, etc.) and what factors drove this decision?",
      "why_it_matters": "Cell chemistry determines energy density, cycle life, safety characteristics, and cost. LiFePO4 offers safety and longevity but lower energy density; NMC/NCA offer higher density but require more sophisticated thermal management and safety systems.",
      "stages": ["prototype", "evt"],
      "primary_stage": "prototype",
      "context_required": {
        "product_description": true,
        "budget_range": true,
        "timeline": false,
        "volume_targets": true,
        "target_market": true,
        "existing_decisions": true
      },
      "artifacts_to_request": [
        "Cell selection trade study",
        "Cell vendor datasheets",
        "Safety certifications for selected cells (UL 1642, IEC 62133)"
      ],
      "red_flags": [
        "No trade study conducted; defaulted to vendor recommendation",
        "Using non-certified cells from unknown suppliers",
        "Cells not rated for expected temperature range",
        "No consideration of cycle life vs energy density tradeoff"
      ],
      "question_type": "design",
      "difficulty": "intermediate"
    },
    {
      "id": "bms-q3",
      "question": "How will you handle cell balancing, and what is your strategy for managing cell-to-cell variation over the battery's lifetime?",
      "why_it_matters": "Cell imbalance reduces usable capacity and accelerates degradation. Without active or passive balancing, a pack can lose 20-30% of usable capacity even when cells are healthy. Balancing strategy impacts BMS complexity and cost.",
      "stages": ["prototype", "evt"],
      "primary_stage": "evt",
      "context_required": {
        "product_description": false,
        "budget_range": true,
        "timeline": false,
        "volume_targets": true,
        "target_market": false,
        "existing_decisions": true
      },
      "artifacts_to_request": [
        "BMS specification with balancing method detailed",
        "Cell matching/grading specification",
        "Balancing current and threshold settings"
      ],
      "red_flags": [
        "No balancing strategy (relying on initial cell matching only)",
        "Passive balancing only on high-capacity packs (will be slow)",
        "No specification for cell matching tolerance at assembly"
      ],
      "question_type": "design",
      "difficulty": "advanced"
    }
  ]
}
```

#### SLAM Implementation (Software > Navigation Stack > SLAM)

```json
{
  "key_questions": [
    {
      "id": "slam-q1",
      "question": "What SLAM algorithm are you using (e.g., gmapping, Cartographer, ORB-SLAM, LIO-SAM), and why is it appropriate for your environment and sensor suite?",
      "why_it_matters": "Different SLAM algorithms have vastly different requirements and capabilities. 2D laser-based SLAM works well for indoor flat floors but fails outdoors. Visual SLAM requires texture but works in GPS-denied areas. LiDAR SLAM handles 3D but requires more compute.",
      "stages": ["prototype", "evt"],
      "primary_stage": "prototype",
      "context_required": {
        "product_description": true,
        "budget_range": false,
        "timeline": false,
        "volume_targets": false,
        "target_market": true,
        "existing_decisions": true
      },
      "artifacts_to_request": [
        "SLAM algorithm trade study with evaluation results",
        "Sample maps generated in target environment",
        "Compute resource utilization measurements"
      ],
      "red_flags": [
        "Using default ROS algorithm without evaluation for specific environment",
        "No testing in environments with feature-sparse areas",
        "Relying solely on simulation without real-world validation",
        "Compute requirements exceed available resources"
      ],
      "question_type": "design",
      "difficulty": "advanced"
    },
    {
      "id": "slam-q2",
      "question": "How does your SLAM system handle loop closure, and what is your strategy for long-term map drift correction?",
      "why_it_matters": "Without proper loop closure, odometry errors accumulate indefinitely. A robot operating for hours can have meters of positional error. Loop closure allows correcting accumulated drift when revisiting known areas, critical for long-term autonomy.",
      "stages": ["prototype", "evt"],
      "primary_stage": "evt",
      "context_required": {
        "product_description": false,
        "budget_range": false,
        "timeline": false,
        "volume_targets": false,
        "target_market": true,
        "existing_decisions": true
      },
      "artifacts_to_request": [
        "Loop closure performance metrics (success rate, latency)",
        "Long-duration test results showing drift over time",
        "Strategy for environments with repetitive features"
      ],
      "red_flags": [
        "No loop closure implementation",
        "Loop closure fails in symmetric environments",
        "No testing beyond 30-minute operation",
        "Drift exceeds 1% of traveled distance without correction"
      ],
      "question_type": "validation",
      "difficulty": "advanced"
    }
  ]
}
```

---

## 7. Seeding & Migrations Strategy

### 7.1 Idempotent Seeding Approach

All template seeds MUST be idempotent—running them multiple times produces the same result.

**Strategy: Upsert with Stable UUIDs**

```sql
-- Template seeding uses deterministic UUIDs based on template name + version
-- This allows re-running seeds without creating duplicates

-- Function to generate deterministic UUID from string
CREATE OR REPLACE FUNCTION deterministic_uuid(input TEXT)
RETURNS UUID AS $$
BEGIN
  RETURN uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID,  -- Namespace UUID
    input
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example: Template UUID = deterministic_uuid('Robotics Hardware Product:1.0.0')
```

### 7.2 Migration File Structure

```
supabase/migrations/
├── 20260201000001_create_template_tables.sql       # Schema (if not exists)
├── 20260201000002_seed_robotics_template.sql       # Robotics template
├── 20260201000003_seed_consumer_electronics.sql    # Consumer Electronics template
├── 20260201000004_seed_medical_devices.sql         # Medical Devices template
└── ...
```

### 7.3 Seed File Pattern

```sql
-- 20260201000002_seed_robotics_template.sql

-- Idempotent: Delete existing template and re-insert
-- This ensures updates to templates propagate cleanly

DO $$
DECLARE
  v_template_id UUID := deterministic_uuid('Robotics Hardware Product:1.0.0');
  v_electronics_id UUID := deterministic_uuid('Robotics:Electronics & Electrical Systems');
  v_power_systems_id UUID := deterministic_uuid('Robotics:Electronics:Power Systems');
  v_battery_mgmt_id UUID := deterministic_uuid('Robotics:Electronics:Power Systems:Battery Management');
  -- ... more domain IDs
BEGIN
  -- Remove existing template and cascade to domains
  DELETE FROM blueprint_templates WHERE id = v_template_id;
  
  -- Insert template
  INSERT INTO blueprint_templates (
    id, name, description, product_category, icon,
    estimated_domains, estimated_questions, is_system_template, metadata
  ) VALUES (
    v_template_id,
    'Robotics Hardware Product',
    'Comprehensive template for autonomous robots...',
    'robotics_automation',
    'Bot',
    68,
    284,
    true,
    '{
      "lifecycle": "active",
      "version": "1.0.0",
      "owner": {"type": "system", "team": "CentaurOS Product Team"},
      ...
    }'::JSONB
  );
  
  -- Insert domains (top-level)
  INSERT INTO knowledge_domains (
    id, template_id, parent_id, name, description, category, depth, display_order,
    key_questions, typical_roles, criticality, metadata
  ) VALUES (
    v_electronics_id,
    v_template_id,
    NULL,  -- Top-level
    'Electronics & Electrical Systems',
    'Electrical architecture, PCB design, power distribution, and embedded computing',
    'Electronics',
    0,
    1,
    '[]'::JSONB,  -- Questions at leaf level
    ARRAY['Electrical Engineer', 'Embedded Engineer'],
    'critical',
    '{
      "stage_relevance": {
        "concept": {"relevance": "informational", "min_status": null},
        "prototype": {"relevance": "active", "min_status": "partial"},
        "evt": {"relevance": "critical", "min_status": "covered"},
        ...
      }
    }'::JSONB
  );
  
  -- Insert child domains
  INSERT INTO knowledge_domains (...) VALUES (
    v_power_systems_id,
    v_template_id,
    v_electronics_id,  -- Parent: Electronics
    'Power Systems',
    ...
  );
  
  -- Insert grandchild domains with questions
  INSERT INTO knowledge_domains (...) VALUES (
    v_battery_mgmt_id,
    v_template_id,
    v_power_systems_id,  -- Parent: Power Systems
    'Battery Management',
    'Battery selection, BMS design, charging, and safety',
    'Electronics',
    2,
    1,
    '[
      {
        "id": "bms-q1",
        "question": "What is your target runtime per charge cycle...",
        "why_it_matters": "Runtime directly determines battery capacity...",
        ...
      },
      ...
    ]'::JSONB,
    ARRAY['Battery Engineer', 'Electrical Engineer'],
    'critical',
    '{...}'::JSONB
  );
  
  -- ... continue for all domains
  
END;
$$;
```

### 7.4 Version Upgrade Strategy

When updating an existing template version:

1. **Minor Updates** (1.0.0 → 1.0.1): Questions edited, metadata updated
   - Re-run seed with same UUID
   - Existing blueprints unaffected (they have copies)

2. **Major Updates** (1.0.0 → 2.0.0): Domains added/removed/restructured
   - Create new template with new UUID
   - Deprecate old template (don't delete)
   - Notify users of upgrade path

```sql
-- Example: Deprecate old version when releasing major update
UPDATE blueprint_templates
SET metadata = metadata || jsonb_build_object(
  'lifecycle', 'deprecated',
  'deprecated_at', NOW()::TEXT,
  'deprecation_reason', 'Superseded by v2.0.0 with updated safety standards',
  'replacement_template_id', deterministic_uuid('Robotics Hardware Product:2.0.0')
)
WHERE id = deterministic_uuid('Robotics Hardware Product:1.0.0');
```

### 7.5 Template Verification Script

```typescript
// scripts/verify_template.ts - Run after seeding to validate

async function verifyTemplate(templateId: string): Promise<ValidationResult> {
  const template = await getTemplateWithDomains(templateId)
  const errors: string[] = []
  const warnings: string[] = []
  
  // 1. Verify minimum domain count
  if (template.domains.length < (template.metadata.min_domains || 10)) {
    errors.push(`Domain count ${template.domains.length} below minimum ${template.metadata.min_domains}`)
  }
  
  // 2. Verify all domains have stage_relevance
  for (const domain of template.domains) {
    if (!domain.metadata?.stage_relevance) {
      errors.push(`Domain "${domain.name}" missing stage_relevance metadata`)
    }
  }
  
  // 3. Verify question quality
  let totalQuestions = 0
  for (const domain of template.domains) {
    if (domain.key_questions && domain.key_questions.length > 0) {
      totalQuestions += domain.key_questions.length
      for (const q of domain.key_questions) {
        if (!q.why_it_matters) {
          errors.push(`Question "${q.id}" in "${domain.name}" missing why_it_matters`)
        }
        if (!q.artifacts_to_request || q.artifacts_to_request.length === 0) {
          warnings.push(`Question "${q.id}" has no artifacts_to_request`)
        }
        if (!q.red_flags || q.red_flags.length === 0) {
          warnings.push(`Question "${q.id}" has no red_flags`)
        }
      }
    }
  }
  
  // 4. Verify question count matches estimate
  if (Math.abs(totalQuestions - template.estimated_questions) > 10) {
    warnings.push(`Actual questions (${totalQuestions}) differs from estimate (${template.estimated_questions})`)
  }
  
  // 5. Verify hierarchy integrity
  for (const domain of template.domains) {
    if (domain.parent_id) {
      const parent = template.domains.find(d => d.id === domain.parent_id)
      if (!parent) {
        errors.push(`Domain "${domain.name}" references non-existent parent`)
      }
    }
  }
  
  // 6. Verify critical domains have sufficient questions
  for (const domain of template.domains) {
    if (domain.criticality === 'critical') {
      const questionCount = domain.key_questions?.length || 0
      if (questionCount < 3 && domain.depth === 2) {  // Leaf domains
        warnings.push(`Critical domain "${domain.name}" has only ${questionCount} questions`)
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
```

---

## 8. Validation Rules

### 8.1 Template-Level Validation

| Rule | Severity | Description |
|------|----------|-------------|
| T-001 | ERROR | Template must have `lifecycle` in metadata |
| T-002 | ERROR | Template must have `version` in semver format |
| T-003 | ERROR | Template must have `owner` object with valid `type` |
| T-004 | ERROR | Active template must have `last_verified_at` |
| T-005 | WARNING | Template should have at least 5 domains |
| T-006 | WARNING | `estimated_domains` should match actual count (±10%) |
| T-007 | WARNING | `estimated_questions` should match actual count (±15%) |
| T-008 | INFO | Template should have `tags` for discoverability |

### 8.2 Domain-Level Validation

| Rule | Severity | Description |
|------|----------|-------------|
| D-001 | ERROR | Domain must have `criticality` set |
| D-002 | ERROR | Domain must have `stage_relevance` in metadata |
| D-003 | ERROR | Domain `depth` must match actual hierarchy position |
| D-004 | ERROR | Domain `parent_id` must reference valid domain in same template |
| D-005 | WARNING | Leaf domains should have at least 3 key questions |
| D-006 | WARNING | Critical domains should have at least 5 key questions |
| D-007 | WARNING | Domain description should be > 20 characters |
| D-008 | INFO | Domain should have `typical_roles` specified |

### 8.3 Question-Level Validation

| Rule | Severity | Description |
|------|----------|-------------|
| Q-001 | ERROR | Question must have `id` that is unique within domain |
| Q-002 | ERROR | Question must have `why_it_matters` (>50 chars) |
| Q-003 | ERROR | Question must have `stages` array (non-empty) |
| Q-004 | WARNING | Question should have `artifacts_to_request` (>=1) |
| Q-005 | WARNING | Question should have `red_flags` (>=2) |
| Q-006 | WARNING | Question text should be > 30 characters |
| Q-007 | INFO | Question should have `question_type` classification |
| Q-008 | INFO | Question should have `difficulty` rating |

### 8.4 Cross-Validation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| X-001 | ERROR | No circular parent references in domain hierarchy |
| X-002 | ERROR | `key_questions_by_stage` indices must exist in `key_questions` array |
| X-003 | WARNING | Every top-level domain should have at least one critical child |
| X-004 | WARNING | Template should have domains for each stage relevance level |
| X-005 | INFO | Templates with 50+ domains should have difficulty >= 'intermediate' |

### 8.5 Validation Function

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  info: ValidationIssue[]
}

interface ValidationIssue {
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
  location: {
    template_id?: string
    domain_id?: string
    domain_name?: string
    question_id?: string
  }
}

function validateTemplate(template: BlueprintTemplateWithDomains): ValidationResult {
  const issues: ValidationIssue[] = []
  
  // Template-level validations
  if (!template.metadata?.lifecycle) {
    issues.push({
      rule: 'T-001',
      severity: 'error',
      message: 'Template must have lifecycle in metadata',
      location: { template_id: template.id }
    })
  }
  
  // ... implement all rules
  
  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info')
  }
}
```

---

## 9. Template Quality Rubric

### 9.1 Quality Score Calculation

Templates receive a quality score (0-100) based on:

| Factor | Weight | Max Points | Scoring |
|--------|--------|------------|---------|
| **Coverage Completeness** | 25% | 25 | All expected domain categories present |
| **Question Depth** | 25% | 25 | Questions meet "No Generic" bar |
| **Stage Awareness** | 20% | 20 | All domains have stage_relevance configured |
| **Actionability** | 15% | 15 | Questions have artifacts_to_request and red_flags |
| **Documentation** | 10% | 10 | Descriptions, why_it_matters are substantial |
| **Maintenance** | 5% | 5 | Has changelog, sources, review schedule |

### 9.2 Minimum Quality for Active Status

| Template Type | Minimum Score | Required Factors |
|---------------|---------------|------------------|
| System Template | 80 | All factors ≥ 60% |
| Custom Template | 60 | Coverage, Question Depth ≥ 50% |
| Draft Template | N/A | No minimum required |

### 9.3 Quality Improvement Suggestions

The system generates improvement suggestions for templates below threshold:

```typescript
function getImprovementSuggestions(template: BlueprintTemplate): Suggestion[] {
  const suggestions: Suggestion[] = []
  const score = calculateQualityScore(template)
  
  if (score.coverage < 60) {
    suggestions.push({
      priority: 'high',
      factor: 'coverage',
      message: 'Add domains for missing categories: ' + getMissingCategories(template).join(', ')
    })
  }
  
  if (score.questionDepth < 60) {
    suggestions.push({
      priority: 'high',
      factor: 'questionDepth',
      message: 'Enhance questions with why_it_matters explanations',
      affectedDomains: getDomainsWithWeakQuestions(template)
    })
  }
  
  // ... more suggestions
  
  return suggestions
}
```

---

## 10. Implementation Checklist

### 10.1 Database

- [ ] Verify `knowledge_domains.metadata` supports extended schema
- [ ] Add `deterministic_uuid()` function for idempotent seeding
- [ ] Create indexes for `key_questions` JSONB queries
- [ ] Add template validation trigger function

### 10.2 Seed Files

- [ ] Create `20260201000002_seed_robotics_template.sql`
- [ ] Migrate existing Consumer Electronics template to new schema
- [ ] Add validation verification step to CI/CD

### 10.3 API

- [ ] Extend `getTemplateWithDomains()` to include full hierarchy
- [ ] Add `validateTemplate()` endpoint for draft templates
- [ ] Add `getQuestionsForStage()` helper function

### 10.4 Frontend

- [ ] Update template selection UI to show quality score
- [ ] Add staleness warnings (from 15-template-governance.md)
- [ ] Implement template preview with domain tree

### 10.5 AI Integration

- [ ] Pass `key_questions` to Expert Packet generation (see 04-llm-design.md)
- [ ] Use `ai_hints` for marketplace search optimization
- [ ] Include `stage_relevance` in prompt context

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/05-template-library.md` | Created |
| `docs/blueprint/INDEX.md` | Pending update (Step 5 complete) |
| `docs/blueprint/ORCHESTRATION.md` | Pending update (Step 5 complete) |
