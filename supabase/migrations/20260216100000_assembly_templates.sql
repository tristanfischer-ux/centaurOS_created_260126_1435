/**
 * Migration: Create assembly_templates table
 *
 * Purpose: Pre-built design skeletons for the RPG-style Assembly Builder.
 * Users pick a template (e.g., "Racing Quadcopter") to get a schematic
 * with named slots, then fill those slots with components from the library.
 *
 * Security:
 * - Public read: anyone can browse templates
 * - No write: templates are seed data only (admin-managed)
 *
 * Related:
 * - Frontend: src/app/(platform)/the-forge/assembly-builder/
 * - Actions: src/actions/assembly-builder.ts
 *
 * Rollback: DROP TABLE assembly_templates CASCADE
 */

-- ─── Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assembly_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  schematic_svg TEXT,
  slots         JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  difficulty    TEXT NOT NULL DEFAULT 'beginner',
  sector        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE assembly_templates ENABLE ROW LEVEL SECURITY;

-- Public read access (templates are reference data)
CREATE POLICY "Anyone can read assembly templates"
  ON assembly_templates FOR SELECT
  USING (true);

-- ─── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assembly_templates_category
  ON assembly_templates (category);

CREATE INDEX IF NOT EXISTS idx_assembly_templates_difficulty
  ON assembly_templates (difficulty);

-- ─── Seed Data: 5 Templates ─────────────────────────────────────────

INSERT INTO assembly_templates (slug, name, category, description, difficulty, sector, slots, default_stats) VALUES

-- 1. Racing Quadcopter (Beginner)
(
  'racing-quadcopter',
  'Racing Quadcopter',
  'drone',
  'A lightweight FPV racing drone with 4 motors, flight controller, ESCs, camera, and battery. Perfect for getting started with drone assembly.',
  'beginner',
  'aerospace',
  '[
    {"id":"motor_fl","label":"Front-Left Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":"bolt_circle_m3_16mm","position":{"x":40,"y":40},"quantity":1,"constraints":{"max_weight_g":80}},
    {"id":"motor_fr","label":"Front-Right Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":"bolt_circle_m3_16mm","position":{"x":360,"y":40},"quantity":1,"constraints":{"max_weight_g":80}},
    {"id":"motor_rl","label":"Rear-Left Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":"bolt_circle_m3_16mm","position":{"x":40,"y":280},"quantity":1,"constraints":{"max_weight_g":80}},
    {"id":"motor_rr","label":"Rear-Right Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":"bolt_circle_m3_16mm","position":{"x":360,"y":280},"quantity":1,"constraints":{"max_weight_g":80}},
    {"id":"flight_controller","label":"Flight Controller","group":"electronics","required":true,"compatibleCategories":["electronics","pcb"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":"pcb_mounting_m2_5","position":{"x":200,"y":140},"quantity":1,"constraints":{}},
    {"id":"esc_stack","label":"ESC Stack","group":"electronics","required":true,"compatibleCategories":["electronics","esc"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":200,"y":210},"quantity":1,"constraints":{}},
    {"id":"fpv_camera","label":"FPV Camera","group":"sensors","required":false,"compatibleCategories":["sensor","camera"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":200,"y":40},"quantity":1,"constraints":{"max_weight_g":30}},
    {"id":"battery","label":"LiPo Battery","group":"power","required":true,"compatibleCategories":["battery","power"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":200,"y":280},"quantity":1,"constraints":{}},
    {"id":"frame","label":"Frame","group":"structure","required":true,"compatibleCategories":["structural","frame"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":120,"y":160},"quantity":1,"constraints":{}},
    {"id":"antenna","label":"Antenna","group":"electronics","required":false,"compatibleCategories":["antenna","connector"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":320,"y":160},"quantity":1,"constraints":{"max_weight_g":15}}
  ]'::jsonb,
  '{"estimatedMinCost":45,"estimatedMaxCost":200,"estimatedWeight":"250-450g","category":"FPV Racing"}'::jsonb
),

-- 2. Robot Arm (Intermediate)
(
  'robot-arm-6dof',
  '6-DOF Robot Arm',
  'robot',
  'A desktop 6-axis robotic arm with servo motors, joints, gripper, and controller. Build your own pick-and-place or drawing robot.',
  'intermediate',
  'robotics',
  '[
    {"id":"base_motor","label":"Base Motor","group":"propulsion","required":true,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":"nema17_bolt_pattern","position":{"x":200,"y":340},"quantity":1,"constraints":{}},
    {"id":"shoulder_motor","label":"Shoulder Motor","group":"propulsion","required":true,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":200,"y":260},"quantity":1,"constraints":{}},
    {"id":"elbow_motor","label":"Elbow Motor","group":"propulsion","required":true,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":200,"y":180},"quantity":1,"constraints":{}},
    {"id":"wrist_pitch","label":"Wrist Pitch Motor","group":"propulsion","required":true,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":200,"y":100},"quantity":1,"constraints":{"max_weight_g":60}},
    {"id":"wrist_roll","label":"Wrist Roll Motor","group":"propulsion","required":false,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":280,"y":100},"quantity":1,"constraints":{"max_weight_g":40}},
    {"id":"gripper","label":"Gripper Servo","group":"propulsion","required":true,"compatibleCategories":["motor","servo"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":200,"y":30},"quantity":1,"constraints":{"max_weight_g":30}},
    {"id":"controller","label":"Controller Board","group":"electronics","required":true,"compatibleCategories":["electronics","pcb"],"compatibleTiers":["electromechanical"],"mountingStandard":"pcb_mounting_m2_5","position":{"x":40,"y":260},"quantity":1,"constraints":{}},
    {"id":"power_supply","label":"Power Supply","group":"power","required":true,"compatibleCategories":["power","electronics"],"compatibleTiers":["electromechanical"],"mountingStandard":null,"position":{"x":40,"y":340},"quantity":1,"constraints":{}},
    {"id":"base_bearing","label":"Base Bearing","group":"structure","required":true,"compatibleCategories":["bearing"],"compatibleTiers":["universal"],"mountingStandard":"608_bearing_bore","position":{"x":120,"y":340},"quantity":1,"constraints":{}},
    {"id":"end_effector_sensor","label":"Force Sensor","group":"sensors","required":false,"compatibleCategories":["sensor"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":280,"y":30},"quantity":1,"constraints":{"max_weight_g":20}}
  ]'::jsonb,
  '{"estimatedMinCost":80,"estimatedMaxCost":350,"estimatedWeight":"500g-2kg","category":"Desktop Robotics"}'::jsonb
),

-- 3. 1U CubeSat (Advanced)
(
  'cubesat-1u',
  '1U CubeSat Bus',
  'satellite',
  'A complete 1U CubeSat satellite bus with structure, solar panels, onboard computer, radio, ADCS, and payload bay. Space-grade engineering challenge.',
  'advanced',
  'aerospace',
  '[
    {"id":"frame","label":"CubeSat Frame","group":"structure","required":true,"compatibleCategories":["structural","frame","cubesat"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":180,"y":160},"quantity":1,"constraints":{}},
    {"id":"solar_px","label":"Solar Panel +X","group":"power","required":true,"compatibleCategories":["solar","power"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":360,"y":160},"quantity":1,"constraints":{}},
    {"id":"solar_mx","label":"Solar Panel -X","group":"power","required":true,"compatibleCategories":["solar","power"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":20,"y":160},"quantity":1,"constraints":{}},
    {"id":"obc","label":"Onboard Computer","group":"electronics","required":true,"compatibleCategories":["electronics","pcb","computer"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":"pcb_mounting_m2_5","position":{"x":180,"y":80},"quantity":1,"constraints":{}},
    {"id":"radio","label":"Radio Transceiver","group":"electronics","required":true,"compatibleCategories":["electronics","antenna","radio"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":300,"y":80},"quantity":1,"constraints":{}},
    {"id":"antenna","label":"Deployable Antenna","group":"electronics","required":true,"compatibleCategories":["antenna"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":300,"y":240},"quantity":1,"constraints":{}},
    {"id":"reaction_wheel","label":"Reaction Wheel","group":"control","required":false,"compatibleCategories":["reaction_wheel","motor"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":80,"y":80},"quantity":1,"constraints":{"max_weight_g":100}},
    {"id":"magnetorquer","label":"Magnetorquer","group":"control","required":false,"compatibleCategories":["magnetorquer"],"compatibleTiers":["domain"],"mountingStandard":null,"position":{"x":80,"y":240},"quantity":1,"constraints":{"max_weight_g":50}},
    {"id":"eps","label":"EPS Board","group":"power","required":true,"compatibleCategories":["electronics","power"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":"pcb_mounting_m2_5","position":{"x":180,"y":240},"quantity":1,"constraints":{}},
    {"id":"payload","label":"Payload Bay","group":"payload","required":false,"compatibleCategories":["sensor","camera","electronics"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":180,"y":320},"quantity":1,"constraints":{"max_weight_g":300}},
    {"id":"kill_switch","label":"Kill Switch","group":"electronics","required":true,"compatibleCategories":["switch","electronics"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":80,"y":160},"quantity":1,"constraints":{}},
    {"id":"sep_spring","label":"Separation Springs","group":"structure","required":true,"compatibleCategories":["spring","structural"],"compatibleTiers":["domain","universal"],"mountingStandard":null,"position":{"x":180,"y":400},"quantity":4,"constraints":{}}
  ]'::jsonb,
  '{"estimatedMinCost":500,"estimatedMaxCost":5000,"estimatedWeight":"1-1.33kg","category":"CubeSat"}'::jsonb
),

-- 4. IoT Sensor Hub (Beginner)
(
  'iot-sensor-hub',
  'IoT Sensor Hub',
  'iot',
  'A compact environmental monitoring station with microcontroller, sensors, display, and wireless connectivity. Great intro to IoT product design.',
  'beginner',
  'consumer_electronics',
  '[
    {"id":"mcu","label":"Microcontroller","group":"electronics","required":true,"compatibleCategories":["electronics","pcb"],"compatibleTiers":["electromechanical"],"mountingStandard":"pcb_mounting_m2_5","position":{"x":180,"y":160},"quantity":1,"constraints":{}},
    {"id":"display","label":"OLED Display","group":"electronics","required":false,"compatibleCategories":["display","electronics"],"compatibleTiers":["electromechanical"],"mountingStandard":null,"position":{"x":180,"y":60},"quantity":1,"constraints":{"max_weight_g":20}},
    {"id":"temp_sensor","label":"Temperature Sensor","group":"sensors","required":true,"compatibleCategories":["sensor"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":60,"y":100},"quantity":1,"constraints":{}},
    {"id":"humidity_sensor","label":"Humidity Sensor","group":"sensors","required":false,"compatibleCategories":["sensor"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":60,"y":200},"quantity":1,"constraints":{}},
    {"id":"battery","label":"Battery","group":"power","required":true,"compatibleCategories":["battery","power"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":180,"y":260},"quantity":1,"constraints":{}},
    {"id":"enclosure","label":"Enclosure","group":"structure","required":true,"compatibleCategories":["structural","enclosure"],"compatibleTiers":["universal","domain"],"mountingStandard":null,"position":{"x":300,"y":160},"quantity":1,"constraints":{}},
    {"id":"antenna","label":"WiFi Antenna","group":"electronics","required":false,"compatibleCategories":["antenna","connector"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":300,"y":60},"quantity":1,"constraints":{"max_weight_g":10}}
  ]'::jsonb,
  '{"estimatedMinCost":15,"estimatedMaxCost":60,"estimatedWeight":"50-150g","category":"IoT"}'::jsonb
),

-- 5. Electric Skateboard (Intermediate)
(
  'electric-skateboard',
  'Electric Skateboard',
  'vehicle',
  'A belt-driven electric skateboard with hub motors, ESC, battery pack, wireless remote receiver, and enclosure. Hit the streets with your own build.',
  'intermediate',
  'automotive',
  '[
    {"id":"motor_l","label":"Left Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":80,"y":60},"quantity":1,"constraints":{}},
    {"id":"motor_r","label":"Right Motor","group":"propulsion","required":true,"compatibleCategories":["motor"],"compatibleTiers":["universal","electromechanical"],"mountingStandard":null,"position":{"x":340,"y":60},"quantity":1,"constraints":{}},
    {"id":"esc","label":"Speed Controller","group":"electronics","required":true,"compatibleCategories":["electronics","esc","motor_controller"],"compatibleTiers":["electromechanical","domain"],"mountingStandard":null,"position":{"x":210,"y":140},"quantity":1,"constraints":{}},
    {"id":"battery_pack","label":"Battery Pack","group":"power","required":true,"compatibleCategories":["battery","power"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":210,"y":220},"quantity":1,"constraints":{}},
    {"id":"bms","label":"Battery Management System","group":"power","required":true,"compatibleCategories":["electronics","bms"],"compatibleTiers":["domain","electromechanical"],"mountingStandard":null,"position":{"x":80,"y":220},"quantity":1,"constraints":{}},
    {"id":"receiver","label":"Remote Receiver","group":"electronics","required":true,"compatibleCategories":["electronics","connector"],"compatibleTiers":["electromechanical"],"mountingStandard":null,"position":{"x":340,"y":140},"quantity":1,"constraints":{"max_weight_g":30}},
    {"id":"enclosure","label":"Battery Enclosure","group":"structure","required":true,"compatibleCategories":["structural","enclosure"],"compatibleTiers":["universal","domain"],"mountingStandard":null,"position":{"x":210,"y":300},"quantity":1,"constraints":{}},
    {"id":"bearings","label":"Wheel Bearings","group":"structure","required":true,"compatibleCategories":["bearing"],"compatibleTiers":["universal"],"mountingStandard":"608_bearing_bore","position":{"x":80,"y":140},"quantity":4,"constraints":{}},
    {"id":"switch","label":"Power Switch","group":"electronics","required":true,"compatibleCategories":["switch","electronics"],"compatibleTiers":["electromechanical"],"mountingStandard":null,"position":{"x":340,"y":220},"quantity":1,"constraints":{}}
  ]'::jsonb,
  '{"estimatedMinCost":120,"estimatedMaxCost":500,"estimatedWeight":"3-6kg","category":"Personal EV"}'::jsonb
);
