-- Migration: Seed industry-specific objective packs
-- Purpose: Create objective packs for each industry so they display like Business Objectives
-- Industries: robotics, rockets, satellites, mobile, consumer-electronics, pharmaceuticals, ai-datacentre, saas

-- ============================================================================
-- ROBOTICS & AUTOMATION
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('11111111-1111-1111-1111-000000000001', 'Build Motion Control System', 'Design and implement a complete motion control system for your robot. Covers actuator selection, kinematics, trajectory planning, and real-time control loops.', 'Robotics & Automation', 'robotics', 'Hard', '4-6 Weeks', 'Cog'),
  ('11111111-1111-1111-1111-000000000002', 'Develop Sensor Integration', 'Integrate sensors for perception and environment awareness. Includes camera systems, LIDAR, proximity sensors, and sensor fusion algorithms.', 'Robotics & Automation', 'robotics', 'Medium', '3-4 Weeks', 'Eye'),
  ('11111111-1111-1111-1111-000000000003', 'Create Safety & Compliance Framework', 'Establish safety protocols and compliance documentation for robotic systems. Covers ISO 10218, risk assessment, and safety-rated components.', 'Robotics & Automation', 'robotics', 'Medium', '2-3 Weeks', 'Shield'),
  ('11111111-1111-1111-1111-000000000004', 'Manufacturing Automation Setup', 'Design and deploy automated manufacturing cells. Includes workcell layout, robot programming, and integration with production systems.', 'Robotics & Automation', 'robotics', 'Hard', '6-8 Weeks', 'Factory'),
  ('11111111-1111-1111-1111-000000000005', 'Robot Testing & Validation', 'Comprehensive testing framework for robotic systems. Covers unit testing, integration testing, performance validation, and reliability testing.', 'Robotics & Automation', 'robotics', 'Medium', '2-3 Weeks', 'TestTube');

-- Robotics pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Motion Control System
  ('11111111-1111-1111-1111-000000000001', 'Define Motion Requirements', 'Document payload capacity, speed, accuracy, and workspace requirements for your application.', 'Executive', 1),
  ('11111111-1111-1111-1111-000000000001', 'Select Actuators and Motors', 'Evaluate and select motors, gearboxes, and drives based on torque, speed, and precision needs.', 'Apprentice', 2),
  ('11111111-1111-1111-1111-000000000001', 'Design Kinematic Model', 'Create forward and inverse kinematics models for your robot configuration.', 'Apprentice', 3),
  ('11111111-1111-1111-1111-000000000001', 'Implement Trajectory Planning', 'Develop trajectory generation algorithms for smooth, efficient motion paths.', 'Apprentice', 4),
  ('11111111-1111-1111-1111-000000000001', 'Build Control Loop Software', 'Implement real-time control loops with PID or advanced control strategies.', 'Apprentice', 5),
  ('11111111-1111-1111-1111-000000000001', 'Integrate and Test Motion System', 'Validate motion performance against requirements and tune control parameters.', 'Executive', 6),
  
  -- Sensor Integration
  ('11111111-1111-1111-1111-000000000002', 'Define Perception Requirements', 'Document what the robot needs to perceive: objects, distances, forces, environment.', 'Executive', 1),
  ('11111111-1111-1111-1111-000000000002', 'Select Sensor Suite', 'Choose cameras, LIDAR, force sensors, and other sensors for your application.', 'Apprentice', 2),
  ('11111111-1111-1111-1111-000000000002', 'Implement Sensor Drivers', 'Develop or integrate drivers for each sensor with your control system.', 'Apprentice', 3),
  ('11111111-1111-1111-1111-000000000002', 'Build Sensor Fusion Pipeline', 'Combine data from multiple sensors for robust perception.', 'Apprentice', 4),
  ('11111111-1111-1111-1111-000000000002', 'Calibrate and Validate', 'Calibrate sensors and validate perception accuracy in real conditions.', 'Executive', 5),
  
  -- Safety & Compliance
  ('11111111-1111-1111-1111-000000000003', 'Conduct Risk Assessment', 'Identify hazards and assess risks following ISO 12100 methodology.', 'Executive', 1),
  ('11111111-1111-1111-1111-000000000003', 'Define Safety Requirements', 'Specify safety functions, performance levels, and safety-rated components.', 'Apprentice', 2),
  ('11111111-1111-1111-1111-000000000003', 'Implement Safety Systems', 'Install safety PLCs, sensors, and interlocks per requirements.', 'Apprentice', 3),
  ('11111111-1111-1111-1111-000000000003', 'Create Compliance Documentation', 'Prepare technical files, declarations, and user documentation.', 'Apprentice', 4),
  ('11111111-1111-1111-1111-000000000003', 'Arrange Certification', 'Engage notified body if required and complete certification process.', 'Executive', 5),
  
  -- Manufacturing Automation
  ('11111111-1111-1111-1111-000000000004', 'Analyze Production Process', 'Document current process, identify automation opportunities, and define requirements.', 'Executive', 1),
  ('11111111-1111-1111-1111-000000000004', 'Design Workcell Layout', 'Create 3D layout with robot reach studies and material flow optimization.', 'Apprentice', 2),
  ('11111111-1111-1111-1111-000000000004', 'Select End Effectors', 'Choose or design grippers and tools for your specific handling needs.', 'Apprentice', 3),
  ('11111111-1111-1111-1111-000000000004', 'Develop Robot Programs', 'Create and optimize robot programs for all production operations.', 'Apprentice', 4),
  ('11111111-1111-1111-1111-000000000004', 'Integrate with MES/ERP', 'Connect automation cell with production management systems.', 'Apprentice', 5),
  ('11111111-1111-1111-1111-000000000004', 'Commission and Validate', 'Install, commission, and validate production performance.', 'Executive', 6),
  
  -- Testing & Validation
  ('11111111-1111-1111-1111-000000000005', 'Define Test Strategy', 'Create comprehensive test plan covering all system aspects.', 'Executive', 1),
  ('11111111-1111-1111-1111-000000000005', 'Build Test Infrastructure', 'Set up test fixtures, data collection, and analysis tools.', 'Apprentice', 2),
  ('11111111-1111-1111-1111-000000000005', 'Execute Functional Tests', 'Run tests to verify all functions work correctly.', 'Apprentice', 3),
  ('11111111-1111-1111-1111-000000000005', 'Perform Stress Testing', 'Test system under extreme conditions and edge cases.', 'Apprentice', 4),
  ('11111111-1111-1111-1111-000000000005', 'Document Results', 'Compile test reports and certification evidence.', 'Executive', 5);

-- ============================================================================
-- ROCKETS & LAUNCH VEHICLES
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('22222222-2222-2222-2222-000000000001', 'Propulsion System Development', 'Design and develop rocket propulsion systems. Covers engine design, propellant selection, combustion analysis, and testing protocols.', 'Rockets & Launch Vehicles', 'rockets', 'Hard', '8-12 Weeks', 'Flame'),
  ('22222222-2222-2222-2222-000000000002', 'Avionics & Flight Computer', 'Build flight computer and avionics systems for guidance, navigation, and control. Includes sensor integration and flight software.', 'Rockets & Launch Vehicles', 'rockets', 'Hard', '6-8 Weeks', 'Cpu'),
  ('22222222-2222-2222-2222-000000000003', 'Ground Systems & Launch Operations', 'Develop ground support equipment and launch operations procedures. Covers fueling, checkout, and launch sequencing.', 'Rockets & Launch Vehicles', 'rockets', 'Medium', '4-6 Weeks', 'Radio'),
  ('22222222-2222-2222-2222-000000000004', 'Regulatory & Range Compliance', 'Navigate FAA/regulatory requirements for launch operations. Includes licensing, safety analysis, and environmental review.', 'Rockets & Launch Vehicles', 'rockets', 'Medium', '3-4 Weeks', 'FileCheck'),
  ('22222222-2222-2222-2222-000000000005', 'Structural Analysis & Design', 'Analyze and design rocket structures for flight loads. Covers materials selection, FEA, and qualification testing.', 'Rockets & Launch Vehicles', 'rockets', 'Hard', '6-8 Weeks', 'Box');

-- Rockets pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Propulsion System
  ('22222222-2222-2222-2222-000000000001', 'Define Propulsion Requirements', 'Specify thrust, specific impulse, burn time, and throttling requirements.', 'Executive', 1),
  ('22222222-2222-2222-2222-000000000001', 'Select Propellant Combination', 'Evaluate and select propellants based on performance, handling, and availability.', 'Apprentice', 2),
  ('22222222-2222-2222-2222-000000000001', 'Design Combustion Chamber', 'Design chamber geometry, cooling approach, and injector configuration.', 'Apprentice', 3),
  ('22222222-2222-2222-2222-000000000001', 'Develop Feed System', 'Design propellant tanks, lines, valves, and pressurization system.', 'Apprentice', 4),
  ('22222222-2222-2222-2222-000000000001', 'Build and Test Engine', 'Manufacture engine components and conduct hot-fire testing.', 'Apprentice', 5),
  ('22222222-2222-2222-2222-000000000001', 'Qualify Propulsion System', 'Complete qualification testing and document results.', 'Executive', 6),
  
  -- Avionics
  ('22222222-2222-2222-2222-000000000002', 'Define GNC Requirements', 'Specify guidance, navigation, and control accuracy requirements.', 'Executive', 1),
  ('22222222-2222-2222-2222-000000000002', 'Select Flight Computer Hardware', 'Choose processors, sensors, and communication systems.', 'Apprentice', 2),
  ('22222222-2222-2222-2222-000000000002', 'Develop Navigation Algorithms', 'Implement state estimation and sensor fusion for navigation.', 'Apprentice', 3),
  ('22222222-2222-2222-2222-000000000002', 'Build Guidance Software', 'Create trajectory guidance and steering algorithms.', 'Apprentice', 4),
  ('22222222-2222-2222-2222-000000000002', 'Implement Control Laws', 'Develop autopilot and control algorithms for stable flight.', 'Apprentice', 5),
  ('22222222-2222-2222-2222-000000000002', 'Test in Hardware-in-Loop', 'Validate avionics in simulation before flight.', 'Executive', 6),
  
  -- Ground Systems
  ('22222222-2222-2222-2222-000000000003', 'Define Ground Operations Concept', 'Document launch campaign timeline and operations flow.', 'Executive', 1),
  ('22222222-2222-2222-2222-000000000003', 'Design Fueling System', 'Create propellant loading system with safety interlocks.', 'Apprentice', 2),
  ('22222222-2222-2222-2222-000000000003', 'Build Launch Control Software', 'Develop software for countdown sequencing and vehicle checkout.', 'Apprentice', 3),
  ('22222222-2222-2222-2222-000000000003', 'Create Operations Procedures', 'Write detailed procedures for all ground operations.', 'Apprentice', 4),
  ('22222222-2222-2222-2222-000000000003', 'Conduct Integrated Testing', 'Test full ground system with vehicle in launch configuration.', 'Executive', 5),
  
  -- Regulatory Compliance
  ('22222222-2222-2222-2222-000000000004', 'Research Licensing Requirements', 'Understand FAA/AST or international licensing requirements.', 'Executive', 1),
  ('22222222-2222-2222-2222-000000000004', 'Prepare Safety Analysis', 'Conduct flight safety analysis and hazard assessment.', 'Apprentice', 2),
  ('22222222-2222-2222-2222-000000000004', 'Complete Environmental Review', 'Prepare environmental impact documentation as required.', 'Apprentice', 3),
  ('22222222-2222-2222-2222-000000000004', 'Submit License Application', 'Compile and submit complete license application.', 'Executive', 4),
  ('22222222-2222-2222-2222-000000000004', 'Coordinate with Range', 'Establish agreements with launch range and coordinate operations.', 'Executive', 5),
  
  -- Structural Design
  ('22222222-2222-2222-2222-000000000005', 'Define Structural Requirements', 'Specify load cases, factors of safety, and mass targets.', 'Executive', 1),
  ('22222222-2222-2222-2222-000000000005', 'Select Materials', 'Evaluate and select materials for each structural element.', 'Apprentice', 2),
  ('22222222-2222-2222-2222-000000000005', 'Perform Structural Analysis', 'Conduct FEA for stress, buckling, and dynamics.', 'Apprentice', 3),
  ('22222222-2222-2222-2222-000000000005', 'Design Joints and Interfaces', 'Design stage separation and payload interfaces.', 'Apprentice', 4),
  ('22222222-2222-2222-2222-000000000005', 'Qualify Structures', 'Test structural components to qualification levels.', 'Executive', 5);

-- ============================================================================
-- SATELLITES & SPACECRAFT
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('33333333-3333-3333-3333-000000000001', 'Power System Design', 'Design spacecraft power systems including solar arrays, batteries, and power distribution. Covers eclipse operations and power budgets.', 'Satellites & Spacecraft', 'satellites', 'Hard', '6-8 Weeks', 'Zap'),
  ('33333333-3333-3333-3333-000000000002', 'Communications Subsystem', 'Build spacecraft communications including antennas, transponders, and ground segment interface. Covers link budgets and protocol design.', 'Satellites & Spacecraft', 'satellites', 'Medium', '4-6 Weeks', 'Radio'),
  ('33333333-3333-3333-3333-000000000003', 'Thermal Management System', 'Design thermal control for spacecraft. Covers passive and active thermal control, analysis, and testing.', 'Satellites & Spacecraft', 'satellites', 'Medium', '3-4 Weeks', 'Thermometer'),
  ('33333333-3333-3333-3333-000000000004', 'Attitude Control System', 'Develop attitude determination and control systems. Includes sensors, actuators, and control algorithms.', 'Satellites & Spacecraft', 'satellites', 'Hard', '6-8 Weeks', 'Compass'),
  ('33333333-3333-3333-3333-000000000005', 'Integration & Environmental Testing', 'Plan and execute spacecraft integration and environmental test campaign. Covers vibration, thermal vacuum, and EMC testing.', 'Satellites & Spacecraft', 'satellites', 'Hard', '4-6 Weeks', 'FlaskConical');

-- Satellites pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Power System
  ('33333333-3333-3333-3333-000000000001', 'Develop Power Budget', 'Create detailed power budget for all mission phases and modes.', 'Executive', 1),
  ('33333333-3333-3333-3333-000000000001', 'Size Solar Arrays', 'Design solar array size, configuration, and deployment mechanism.', 'Apprentice', 2),
  ('33333333-3333-3333-3333-000000000001', 'Select Battery System', 'Choose battery chemistry and design pack for eclipse and launch.', 'Apprentice', 3),
  ('33333333-3333-3333-3333-000000000001', 'Design Power Distribution', 'Create power distribution unit and harness design.', 'Apprentice', 4),
  ('33333333-3333-3333-3333-000000000001', 'Test Power System', 'Validate power system performance in relevant environments.', 'Executive', 5),
  
  -- Communications
  ('33333333-3333-3333-3333-000000000002', 'Perform Link Budget Analysis', 'Calculate link margins for all communication links.', 'Executive', 1),
  ('33333333-3333-3333-3333-000000000002', 'Select RF Components', 'Choose antennas, amplifiers, and transponders.', 'Apprentice', 2),
  ('33333333-3333-3333-3333-000000000002', 'Design Ground Segment Interface', 'Define protocols and interfaces with ground stations.', 'Apprentice', 3),
  ('33333333-3333-3333-3333-000000000002', 'Implement Communication Software', 'Develop flight software for command and telemetry.', 'Apprentice', 4),
  ('33333333-3333-3333-3333-000000000002', 'Test End-to-End Communications', 'Validate full communication chain with ground segment.', 'Executive', 5),
  
  -- Thermal Management
  ('33333333-3333-3333-3333-000000000003', 'Develop Thermal Model', 'Create thermal math model of spacecraft.', 'Executive', 1),
  ('33333333-3333-3333-3333-000000000003', 'Analyze Worst Case Conditions', 'Run hot and cold case thermal analysis.', 'Apprentice', 2),
  ('33333333-3333-3333-3333-000000000003', 'Design Passive Thermal Control', 'Specify coatings, MLI, and radiator sizing.', 'Apprentice', 3),
  ('33333333-3333-3333-3333-000000000003', 'Design Active Thermal Control', 'Add heaters, heat pipes, or louvers as needed.', 'Apprentice', 4),
  ('33333333-3333-3333-3333-000000000003', 'Correlate Model with Testing', 'Update model based on thermal balance test results.', 'Executive', 5),
  
  -- Attitude Control
  ('33333333-3333-3333-3333-000000000004', 'Define Pointing Requirements', 'Specify pointing accuracy, stability, and agility needs.', 'Executive', 1),
  ('33333333-3333-3333-3333-000000000004', 'Select Attitude Sensors', 'Choose star trackers, sun sensors, gyros, and magnetometers.', 'Apprentice', 2),
  ('33333333-3333-3333-3333-000000000004', 'Select Actuators', 'Choose reaction wheels, thrusters, or magnetic torquers.', 'Apprentice', 3),
  ('33333333-3333-3333-3333-000000000004', 'Develop Control Algorithms', 'Implement attitude determination and control laws.', 'Apprentice', 4),
  ('33333333-3333-3333-3333-000000000004', 'Test ADCS in Simulation', 'Validate performance in hardware-in-loop simulation.', 'Executive', 5),
  
  -- Integration & Testing
  ('33333333-3333-3333-3333-000000000005', 'Create Integration Plan', 'Define assembly sequence and test flow.', 'Executive', 1),
  ('33333333-3333-3333-3333-000000000005', 'Perform Vibration Testing', 'Execute sine and random vibration tests.', 'Apprentice', 2),
  ('33333333-3333-3333-3333-000000000005', 'Conduct Thermal Vacuum Test', 'Test in thermal vacuum chamber simulating space.', 'Apprentice', 3),
  ('33333333-3333-3333-3333-000000000005', 'Complete EMC Testing', 'Verify electromagnetic compatibility.', 'Apprentice', 4),
  ('33333333-3333-3333-3333-000000000005', 'Prepare for Launch', 'Complete final checks and prepare for shipment.', 'Executive', 5);

-- ============================================================================
-- MOBILE APPLICATION
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('44444444-4444-4444-4444-000000000001', 'App Architecture Setup', 'Establish solid mobile app architecture. Covers state management, navigation, and project structure for iOS and Android.', 'Mobile Application', 'mobile', 'Medium', '2-3 Weeks', 'Smartphone'),
  ('44444444-4444-4444-4444-000000000002', 'UI/UX Implementation', 'Build beautiful, responsive mobile interfaces. Covers design systems, animations, and platform-specific patterns.', 'Mobile Application', 'mobile', 'Medium', '3-4 Weeks', 'Palette'),
  ('44444444-4444-4444-4444-000000000003', 'Backend API Integration', 'Connect your mobile app to backend services. Covers REST/GraphQL, authentication, offline support, and caching.', 'Mobile Application', 'mobile', 'Medium', '2-3 Weeks', 'Server'),
  ('44444444-4444-4444-4444-000000000004', 'App Store Submission', 'Prepare and submit your app to Apple App Store and Google Play. Covers guidelines, assets, and review process.', 'Mobile Application', 'mobile', 'Easy', '1-2 Weeks', 'Upload'),
  ('44444444-4444-4444-4444-000000000005', 'Push Notifications & Analytics', 'Implement push notifications and analytics tracking. Covers FCM, APNs, and event tracking best practices.', 'Mobile Application', 'mobile', 'Easy', '1-2 Weeks', 'Bell');

-- Mobile pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Architecture Setup
  ('44444444-4444-4444-4444-000000000001', 'Choose Development Approach', 'Decide between native, React Native, Flutter, or other frameworks.', 'Executive', 1),
  ('44444444-4444-4444-4444-000000000001', 'Set Up Project Structure', 'Create organized folder structure and configure build tools.', 'Apprentice', 2),
  ('44444444-4444-4444-4444-000000000001', 'Implement State Management', 'Set up Redux, MobX, Provider, or similar state solution.', 'Apprentice', 3),
  ('44444444-4444-4444-4444-000000000001', 'Configure Navigation', 'Implement navigation stack and deep linking.', 'Apprentice', 4),
  ('44444444-4444-4444-4444-000000000001', 'Set Up CI/CD Pipeline', 'Configure automated builds and deployments.', 'Executive', 5),
  
  -- UI/UX Implementation
  ('44444444-4444-4444-4444-000000000002', 'Create Design System', 'Define colors, typography, spacing, and reusable components.', 'Executive', 1),
  ('44444444-4444-4444-4444-000000000002', 'Build Core Components', 'Implement buttons, inputs, cards, and layout components.', 'Apprentice', 2),
  ('44444444-4444-4444-4444-000000000002', 'Implement Screen Layouts', 'Build all app screens following design specifications.', 'Apprentice', 3),
  ('44444444-4444-4444-4444-000000000002', 'Add Animations', 'Implement transitions and micro-interactions.', 'Apprentice', 4),
  ('44444444-4444-4444-4444-000000000002', 'Test on Multiple Devices', 'Verify UI across different screen sizes and OS versions.', 'Executive', 5),
  
  -- Backend Integration
  ('44444444-4444-4444-4444-000000000003', 'Design API Layer', 'Create abstraction for API calls with proper error handling.', 'Executive', 1),
  ('44444444-4444-4444-4444-000000000003', 'Implement Authentication', 'Build login, registration, and token management.', 'Apprentice', 2),
  ('44444444-4444-4444-4444-000000000003', 'Add Offline Support', 'Implement local storage and sync strategies.', 'Apprentice', 3),
  ('44444444-4444-4444-4444-000000000003', 'Set Up Caching', 'Configure response caching for performance.', 'Apprentice', 4),
  ('44444444-4444-4444-4444-000000000003', 'Handle Network Errors', 'Build retry logic and offline indicators.', 'Executive', 5),
  
  -- App Store Submission
  ('44444444-4444-4444-4444-000000000004', 'Prepare App Store Assets', 'Create screenshots, app icon, and preview video.', 'Executive', 1),
  ('44444444-4444-4444-4444-000000000004', 'Write Store Listing', 'Create compelling description and keywords.', 'Apprentice', 2),
  ('44444444-4444-4444-4444-000000000004', 'Configure App Signing', 'Set up certificates and provisioning profiles.', 'Apprentice', 3),
  ('44444444-4444-4444-4444-000000000004', 'Submit for Review', 'Upload builds and submit for app review.', 'Executive', 4),
  ('44444444-4444-4444-4444-000000000004', 'Address Review Feedback', 'Respond to any reviewer questions or rejections.', 'Executive', 5),
  
  -- Push & Analytics
  ('44444444-4444-4444-4444-000000000005', 'Set Up Push Notification Service', 'Configure FCM for Android and APNs for iOS.', 'Executive', 1),
  ('44444444-4444-4444-4444-000000000005', 'Implement Notification Handling', 'Handle notifications in foreground, background, and terminated states.', 'Apprentice', 2),
  ('44444444-4444-4444-4444-000000000005', 'Integrate Analytics SDK', 'Add Firebase Analytics, Mixpanel, or similar.', 'Apprentice', 3),
  ('44444444-4444-4444-4444-000000000005', 'Define Key Events', 'Identify and implement tracking for important user actions.', 'Apprentice', 4),
  ('44444444-4444-4444-4444-000000000005', 'Create Analytics Dashboard', 'Set up dashboards for key metrics.', 'Executive', 5);

-- ============================================================================
-- CONSUMER ELECTRONICS
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('55555555-5555-5555-5555-000000000001', 'Hardware Design & Prototyping', 'Design consumer electronics hardware from concept to prototype. Covers schematic design, PCB layout, and initial builds.', 'Consumer Electronics', 'consumer-electronics', 'Hard', '6-8 Weeks', 'Cpu'),
  ('55555555-5555-5555-5555-000000000002', 'Firmware Development', 'Develop embedded firmware for your device. Covers RTOS, drivers, power management, and OTA updates.', 'Consumer Electronics', 'consumer-electronics', 'Hard', '4-6 Weeks', 'Code'),
  ('55555555-5555-5555-5555-000000000003', 'Manufacturing Setup', 'Prepare for mass production. Covers DFM review, factory selection, and quality control processes.', 'Consumer Electronics', 'consumer-electronics', 'Medium', '4-6 Weeks', 'Factory'),
  ('55555555-5555-5555-5555-000000000004', 'Certification & Compliance', 'Obtain required certifications for your market. Covers FCC, CE, safety certifications, and documentation.', 'Consumer Electronics', 'consumer-electronics', 'Medium', '3-4 Weeks', 'BadgeCheck'),
  ('55555555-5555-5555-5555-000000000005', 'Enclosure & Industrial Design', 'Design the physical enclosure and user interface. Covers materials, manufacturing methods, and aesthetics.', 'Consumer Electronics', 'consumer-electronics', 'Medium', '4-6 Weeks', 'Box');

-- Consumer Electronics pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Hardware Design
  ('55555555-5555-5555-5555-000000000001', 'Define Hardware Requirements', 'Document features, interfaces, power, and size constraints.', 'Executive', 1),
  ('55555555-5555-5555-5555-000000000001', 'Create Block Diagram', 'Design system architecture showing all major components.', 'Apprentice', 2),
  ('55555555-5555-5555-5555-000000000001', 'Complete Schematic Design', 'Design full electrical schematic with all components.', 'Apprentice', 3),
  ('55555555-5555-5555-5555-000000000001', 'Layout PCB', 'Complete PCB layout meeting EMC and manufacturing requirements.', 'Apprentice', 4),
  ('55555555-5555-5555-5555-000000000001', 'Build and Test Prototype', 'Assemble prototype boards and verify functionality.', 'Executive', 5),
  
  -- Firmware Development
  ('55555555-5555-5555-5555-000000000002', 'Set Up Development Environment', 'Configure toolchain, debugger, and version control.', 'Executive', 1),
  ('55555555-5555-5555-5555-000000000002', 'Implement Board Support', 'Write drivers for all peripherals and interfaces.', 'Apprentice', 2),
  ('55555555-5555-5555-5555-000000000002', 'Develop Application Logic', 'Implement main application features and state machine.', 'Apprentice', 3),
  ('55555555-5555-5555-5555-000000000002', 'Optimize Power Management', 'Implement sleep modes and power optimization.', 'Apprentice', 4),
  ('55555555-5555-5555-5555-000000000002', 'Add OTA Update Support', 'Implement secure firmware update mechanism.', 'Executive', 5),
  
  -- Manufacturing Setup
  ('55555555-5555-5555-5555-000000000003', 'Conduct DFM Review', 'Review design for manufacturing feasibility and cost.', 'Executive', 1),
  ('55555555-5555-5555-5555-000000000003', 'Select Manufacturing Partners', 'Evaluate and select CM and suppliers.', 'Executive', 2),
  ('55555555-5555-5555-5555-000000000003', 'Create Manufacturing Files', 'Prepare Gerbers, BOM, and assembly drawings.', 'Apprentice', 3),
  ('55555555-5555-5555-5555-000000000003', 'Develop Test Fixtures', 'Design production test jigs and procedures.', 'Apprentice', 4),
  ('55555555-5555-5555-5555-000000000003', 'Run Pilot Production', 'Produce and validate initial production batch.', 'Executive', 5),
  
  -- Certification
  ('55555555-5555-5555-5555-000000000004', 'Identify Required Certifications', 'Determine which certifications are needed for target markets.', 'Executive', 1),
  ('55555555-5555-5555-5555-000000000004', 'Prepare for EMC Testing', 'Ensure design meets EMC requirements before testing.', 'Apprentice', 2),
  ('55555555-5555-5555-5555-000000000004', 'Complete Safety Testing', 'Pass required safety tests for your product category.', 'Apprentice', 3),
  ('55555555-5555-5555-5555-000000000004', 'Obtain Radio Certifications', 'Complete FCC, CE, and other radio certifications.', 'Apprentice', 4),
  ('55555555-5555-5555-5555-000000000004', 'Create Technical Documentation', 'Prepare manuals, declarations, and compliance docs.', 'Executive', 5),
  
  -- Industrial Design
  ('55555555-5555-5555-5555-000000000005', 'Define Design Requirements', 'Document size, ergonomics, and aesthetic goals.', 'Executive', 1),
  ('55555555-5555-5555-5555-000000000005', 'Create Concept Designs', 'Develop multiple design concepts for evaluation.', 'Apprentice', 2),
  ('55555555-5555-5555-5555-000000000005', 'Select Materials', 'Choose materials for enclosure and buttons.', 'Apprentice', 3),
  ('55555555-5555-5555-5555-000000000005', 'Design for Manufacturing', 'Optimize design for injection molding or other processes.', 'Apprentice', 4),
  ('55555555-5555-5555-5555-000000000005', 'Prototype and Validate', 'Build prototype enclosures and test fit/finish.', 'Executive', 5);

-- ============================================================================
-- PHARMACEUTICALS & DRUG DEVELOPMENT
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('66666666-6666-6666-6666-000000000001', 'Clinical Trial Planning', 'Design and plan clinical trials for drug development. Covers protocol design, site selection, and regulatory strategy.', 'Pharmaceuticals & Drug Development', 'pharmaceuticals', 'Hard', '8-12 Weeks', 'FlaskConical'),
  ('66666666-6666-6666-6666-000000000002', 'Regulatory Submission Preparation', 'Prepare regulatory submissions for drug approval. Covers IND, NDA/BLA, and international filings.', 'Pharmaceuticals & Drug Development', 'pharmaceuticals', 'Hard', '6-8 Weeks', 'FileCheck'),
  ('66666666-6666-6666-6666-000000000003', 'Manufacturing Process Development', 'Develop manufacturing processes for drug products. Covers formulation, scale-up, and process validation.', 'Pharmaceuticals & Drug Development', 'pharmaceuticals', 'Hard', '8-12 Weeks', 'Factory'),
  ('66666666-6666-6666-6666-000000000004', 'Quality Management System', 'Establish GMP-compliant quality systems. Covers SOPs, documentation, and audit readiness.', 'Pharmaceuticals & Drug Development', 'pharmaceuticals', 'Medium', '4-6 Weeks', 'ClipboardCheck'),
  ('66666666-6666-6666-6666-000000000005', 'Drug Discovery Research', 'Conduct early-stage drug discovery research. Covers target identification, screening, and lead optimization.', 'Pharmaceuticals & Drug Development', 'pharmaceuticals', 'Hard', '12-16 Weeks', 'Microscope');

-- Pharmaceuticals pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Clinical Trial Planning
  ('66666666-6666-6666-6666-000000000001', 'Define Trial Objectives', 'Establish primary and secondary endpoints.', 'Executive', 1),
  ('66666666-6666-6666-6666-000000000001', 'Design Trial Protocol', 'Create detailed protocol including inclusion/exclusion criteria.', 'Apprentice', 2),
  ('66666666-6666-6666-6666-000000000001', 'Select Trial Sites', 'Identify and evaluate potential clinical sites.', 'Apprentice', 3),
  ('66666666-6666-6666-6666-000000000001', 'Plan Patient Recruitment', 'Develop recruitment strategy and materials.', 'Apprentice', 4),
  ('66666666-6666-6666-6666-000000000001', 'Set Up Data Management', 'Implement EDC system and data management plan.', 'Apprentice', 5),
  ('66666666-6666-6666-6666-000000000001', 'Obtain Ethics Approval', 'Submit to IRB/ethics committees and obtain approval.', 'Executive', 6),
  
  -- Regulatory Submission
  ('66666666-6666-6666-6666-000000000002', 'Develop Regulatory Strategy', 'Determine optimal regulatory pathway and timeline.', 'Executive', 1),
  ('66666666-6666-6666-6666-000000000002', 'Compile CMC Documentation', 'Prepare chemistry, manufacturing, and controls section.', 'Apprentice', 2),
  ('66666666-6666-6666-6666-000000000002', 'Prepare Nonclinical Summary', 'Compile nonclinical study reports and summaries.', 'Apprentice', 3),
  ('66666666-6666-6666-6666-000000000002', 'Write Clinical Summary', 'Prepare clinical study reports and efficacy summary.', 'Apprentice', 4),
  ('66666666-6666-6666-6666-000000000002', 'Submit Application', 'Compile and submit complete regulatory package.', 'Executive', 5),
  
  -- Manufacturing Process
  ('66666666-6666-6666-6666-000000000003', 'Develop Formulation', 'Optimize drug formulation for stability and bioavailability.', 'Executive', 1),
  ('66666666-6666-6666-6666-000000000003', 'Scale Up Process', 'Transfer from lab to pilot to commercial scale.', 'Apprentice', 2),
  ('66666666-6666-6666-6666-000000000003', 'Validate Manufacturing Process', 'Complete process validation runs.', 'Apprentice', 3),
  ('66666666-6666-6666-6666-000000000003', 'Establish Analytical Methods', 'Develop and validate analytical test methods.', 'Apprentice', 4),
  ('66666666-6666-6666-6666-000000000003', 'Document Process', 'Create batch records and manufacturing instructions.', 'Executive', 5),
  
  -- Quality Management
  ('66666666-6666-6666-6666-000000000004', 'Develop Quality Manual', 'Create overarching quality management framework.', 'Executive', 1),
  ('66666666-6666-6666-6666-000000000004', 'Write Standard Operating Procedures', 'Document all key processes and procedures.', 'Apprentice', 2),
  ('66666666-6666-6666-6666-000000000004', 'Implement Document Control', 'Set up system for document management.', 'Apprentice', 3),
  ('66666666-6666-6666-6666-000000000004', 'Train Personnel', 'Conduct GMP training for all relevant staff.', 'Apprentice', 4),
  ('66666666-6666-6666-6666-000000000004', 'Prepare for Audits', 'Conduct mock audits and address findings.', 'Executive', 5),
  
  -- Drug Discovery
  ('66666666-6666-6666-6666-000000000005', 'Identify Drug Target', 'Select and validate therapeutic target.', 'Executive', 1),
  ('66666666-6666-6666-6666-000000000005', 'Develop Screening Assays', 'Create assays for compound screening.', 'Apprentice', 2),
  ('66666666-6666-6666-6666-000000000005', 'Screen Compound Library', 'Conduct high-throughput screening.', 'Apprentice', 3),
  ('66666666-6666-6666-6666-000000000005', 'Optimize Lead Compounds', 'Improve potency, selectivity, and drug-like properties.', 'Apprentice', 4),
  ('66666666-6666-6666-6666-000000000005', 'Select Development Candidate', 'Choose compound for preclinical development.', 'Executive', 5);

-- ============================================================================
-- AI DATA CENTRES
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('77777777-7777-7777-7777-000000000001', 'Infrastructure Planning', 'Plan AI data centre infrastructure. Covers capacity planning, site selection, and architecture design.', 'AI Data Centres', 'ai-datacentre', 'Hard', '8-12 Weeks', 'Building'),
  ('77777777-7777-7777-7777-000000000002', 'Cooling System Design', 'Design cooling systems for high-density AI compute. Covers liquid cooling, airflow, and efficiency optimization.', 'AI Data Centres', 'ai-datacentre', 'Hard', '6-8 Weeks', 'Snowflake'),
  ('77777777-7777-7777-7777-000000000003', 'Power Infrastructure', 'Plan power systems for AI workloads. Covers capacity, redundancy, UPS, and generator systems.', 'AI Data Centres', 'ai-datacentre', 'Hard', '6-8 Weeks', 'Zap'),
  ('77777777-7777-7777-7777-000000000004', 'Network Architecture', 'Design high-bandwidth, low-latency networks for AI training. Covers spine-leaf, InfiniBand, and storage networks.', 'AI Data Centres', 'ai-datacentre', 'Hard', '4-6 Weeks', 'Network'),
  ('77777777-7777-7777-7777-000000000005', 'Security & Compliance', 'Implement security and compliance for AI infrastructure. Covers physical security, access control, and data protection.', 'AI Data Centres', 'ai-datacentre', 'Medium', '3-4 Weeks', 'Shield');

-- AI Data Centre pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Infrastructure Planning
  ('77777777-7777-7777-7777-000000000001', 'Define Capacity Requirements', 'Project compute, storage, and power needs over time.', 'Executive', 1),
  ('77777777-7777-7777-7777-000000000001', 'Evaluate Site Options', 'Assess locations for power, connectivity, and risk factors.', 'Apprentice', 2),
  ('77777777-7777-7777-7777-000000000001', 'Design Data Centre Architecture', 'Plan floor layout, rows, and infrastructure distribution.', 'Apprentice', 3),
  ('77777777-7777-7777-7777-000000000001', 'Plan Phased Buildout', 'Create modular expansion plan to match growth.', 'Apprentice', 4),
  ('77777777-7777-7777-7777-000000000001', 'Develop Cost Model', 'Build TCO model including CapEx and OpEx.', 'Executive', 5),
  
  -- Cooling System
  ('77777777-7777-7777-7777-000000000002', 'Calculate Heat Loads', 'Determine cooling requirements for GPU/TPU density.', 'Executive', 1),
  ('77777777-7777-7777-7777-000000000002', 'Evaluate Cooling Technologies', 'Compare air, direct liquid, and immersion cooling.', 'Apprentice', 2),
  ('77777777-7777-7777-7777-000000000002', 'Design Cooling Distribution', 'Plan piping, CDUs, and heat rejection systems.', 'Apprentice', 3),
  ('77777777-7777-7777-7777-000000000002', 'Optimize for Efficiency', 'Design for low PUE and sustainable operation.', 'Apprentice', 4),
  ('77777777-7777-7777-7777-000000000002', 'Plan Redundancy', 'Ensure N+1 or 2N cooling redundancy.', 'Executive', 5),
  
  -- Power Infrastructure
  ('77777777-7777-7777-7777-000000000003', 'Size Power Capacity', 'Determine total power requirements with growth.', 'Executive', 1),
  ('77777777-7777-7777-7777-000000000003', 'Design Power Distribution', 'Plan switchgear, PDUs, and distribution to racks.', 'Apprentice', 2),
  ('77777777-7777-7777-7777-000000000003', 'Specify UPS Systems', 'Select UPS topology and battery/flywheel backup.', 'Apprentice', 3),
  ('77777777-7777-7777-7777-000000000003', 'Plan Generator Backup', 'Size and configure backup generator systems.', 'Apprentice', 4),
  ('77777777-7777-7777-7777-000000000003', 'Implement Power Monitoring', 'Deploy monitoring for power quality and efficiency.', 'Executive', 5),
  
  -- Network Architecture
  ('77777777-7777-7777-7777-000000000004', 'Define Network Requirements', 'Specify bandwidth, latency, and protocol needs.', 'Executive', 1),
  ('77777777-7777-7777-7777-000000000004', 'Design Data Network', 'Plan Ethernet spine-leaf fabric for management/storage.', 'Apprentice', 2),
  ('77777777-7777-7777-7777-000000000004', 'Design GPU Interconnect', 'Plan InfiniBand or NVLink fabric for training.', 'Apprentice', 3),
  ('77777777-7777-7777-7777-000000000004', 'Plan Storage Network', 'Design high-bandwidth storage connectivity.', 'Apprentice', 4),
  ('77777777-7777-7777-7777-000000000004', 'Implement Network Monitoring', 'Deploy monitoring and traffic analysis tools.', 'Executive', 5),
  
  -- Security & Compliance
  ('77777777-7777-7777-7777-000000000005', 'Assess Security Requirements', 'Identify regulatory and customer security needs.', 'Executive', 1),
  ('77777777-7777-7777-7777-000000000005', 'Design Physical Security', 'Plan access control, CCTV, and perimeter security.', 'Apprentice', 2),
  ('77777777-7777-7777-7777-000000000005', 'Implement Access Control', 'Deploy identity management and authentication.', 'Apprentice', 3),
  ('77777777-7777-7777-7777-000000000005', 'Establish Data Protection', 'Implement encryption and data handling policies.', 'Apprentice', 4),
  ('77777777-7777-7777-7777-000000000005', 'Prepare for Audits', 'Document controls and prepare for SOC2/ISO audits.', 'Executive', 5);

-- ============================================================================
-- SAAS PLATFORM
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name)
VALUES 
  ('88888888-8888-8888-8888-000000000001', 'Platform Architecture', 'Design scalable SaaS architecture. Covers microservices, database design, and multi-tenancy patterns.', 'SaaS Platform', 'saas', 'Hard', '4-6 Weeks', 'Layers'),
  ('88888888-8888-8888-8888-000000000002', 'Authentication & Authorization', 'Implement secure auth for SaaS. Covers SSO, RBAC, team management, and security best practices.', 'SaaS Platform', 'saas', 'Medium', '2-3 Weeks', 'Lock'),
  ('88888888-8888-8888-8888-000000000003', 'Billing & Subscriptions', 'Build subscription billing system. Covers Stripe integration, pricing tiers, and usage-based billing.', 'SaaS Platform', 'saas', 'Medium', '3-4 Weeks', 'CreditCard'),
  ('88888888-8888-8888-8888-000000000004', 'Deployment & DevOps', 'Set up production deployment pipeline. Covers CI/CD, infrastructure as code, and monitoring.', 'SaaS Platform', 'saas', 'Medium', '2-3 Weeks', 'Rocket'),
  ('88888888-8888-8888-8888-000000000005', 'Customer Onboarding', 'Build smooth customer onboarding flow. Covers signup, setup wizards, and product tours.', 'SaaS Platform', 'saas', 'Easy', '1-2 Weeks', 'UserPlus');

-- SaaS pack items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
VALUES
  -- Platform Architecture
  ('88888888-8888-8888-8888-000000000001', 'Define System Requirements', 'Document scale, performance, and availability targets.', 'Executive', 1),
  ('88888888-8888-8888-8888-000000000001', 'Design Service Architecture', 'Plan services, APIs, and communication patterns.', 'Apprentice', 2),
  ('88888888-8888-8888-8888-000000000001', 'Design Database Schema', 'Plan data models and multi-tenancy approach.', 'Apprentice', 3),
  ('88888888-8888-8888-8888-000000000001', 'Plan Scalability Strategy', 'Design for horizontal scaling and load handling.', 'Apprentice', 4),
  ('88888888-8888-8888-8888-000000000001', 'Document Architecture', 'Create architecture diagrams and ADRs.', 'Executive', 5),
  
  -- Authentication
  ('88888888-8888-8888-8888-000000000002', 'Implement Core Auth', 'Build email/password and magic link authentication.', 'Executive', 1),
  ('88888888-8888-8888-8888-000000000002', 'Add Social Login', 'Integrate Google, GitHub, and other OAuth providers.', 'Apprentice', 2),
  ('88888888-8888-8888-8888-000000000002', 'Build SSO Support', 'Implement SAML/OIDC for enterprise SSO.', 'Apprentice', 3),
  ('88888888-8888-8888-8888-000000000002', 'Implement RBAC', 'Create role-based access control system.', 'Apprentice', 4),
  ('88888888-8888-8888-8888-000000000002', 'Add Team Management', 'Build team invites, roles, and permissions UI.', 'Executive', 5),
  
  -- Billing
  ('88888888-8888-8888-8888-000000000003', 'Define Pricing Model', 'Design pricing tiers and feature gating.', 'Executive', 1),
  ('88888888-8888-8888-8888-000000000003', 'Integrate Stripe', 'Set up Stripe for payments and subscriptions.', 'Apprentice', 2),
  ('88888888-8888-8888-8888-000000000003', 'Build Subscription Management', 'Implement upgrade, downgrade, and cancellation flows.', 'Apprentice', 3),
  ('88888888-8888-8888-8888-000000000003', 'Add Usage Tracking', 'Track and bill for usage-based features.', 'Apprentice', 4),
  ('88888888-8888-8888-8888-000000000003', 'Create Billing Portal', 'Build customer-facing billing management UI.', 'Executive', 5),
  
  -- Deployment
  ('88888888-8888-8888-8888-000000000004', 'Set Up CI Pipeline', 'Configure automated testing and builds.', 'Executive', 1),
  ('88888888-8888-8888-8888-000000000004', 'Implement CD Pipeline', 'Set up automated deployments to staging and production.', 'Apprentice', 2),
  ('88888888-8888-8888-8888-000000000004', 'Configure Infrastructure', 'Set up cloud resources using IaC (Terraform/Pulumi).', 'Apprentice', 3),
  ('88888888-8888-8888-8888-000000000004', 'Set Up Monitoring', 'Deploy APM, logging, and alerting.', 'Apprentice', 4),
  ('88888888-8888-8888-8888-000000000004', 'Create Runbooks', 'Document operational procedures and incident response.', 'Executive', 5),
  
  -- Onboarding
  ('88888888-8888-8888-8888-000000000005', 'Design Onboarding Flow', 'Map ideal first-time user experience.', 'Executive', 1),
  ('88888888-8888-8888-8888-000000000005', 'Build Setup Wizard', 'Create step-by-step setup for new accounts.', 'Apprentice', 2),
  ('88888888-8888-8888-8888-000000000005', 'Add Product Tour', 'Implement interactive feature walkthroughs.', 'Apprentice', 3),
  ('88888888-8888-8888-8888-000000000005', 'Create Sample Data', 'Generate example data to showcase features.', 'Apprentice', 4),
  ('88888888-8888-8888-8888-000000000005', 'Track Onboarding Metrics', 'Measure completion rates and drop-off points.', 'Executive', 5);
