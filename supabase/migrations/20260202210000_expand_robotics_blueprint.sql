-- Expand Robotics & Automation Blueprint
-- Adds missing domains for humanoid robotics, compute, power, and AI

DO $$
DECLARE
    v_template_id uuid := '00000003-0000-4000-8000-000000000001';
BEGIN

    -- ============================================================================
    -- 1. EXPAND EXISTING CATEGORIES
    -- ============================================================================

    -- Motors & Actuators (1xxx) - Additions
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-1400-4000-8000-000000000001', v_template_id, '00000003-1000-4000-8000-000000000001', 'Harmonic Drives', 'High-ratio, zero-backlash gearing', 'Mechanical', 1, 4, 'important',
    '[{"id": "hd1", "question": "What reduction ratio is required?", "context": "Trade-off between torque and speed"}, {"id": "hd2", "question": "What is the expected lifecycle?", "context": "Harmonic drives have specific wear characteristics"}]',
    ARRAY['Mechanical Engineer'], '2-3 weeks'),

    ('00000003-1500-4000-8000-000000000001', v_template_id, '00000003-1000-4000-8000-000000000001', 'Quasi-Direct Drive (QDD)', 'Low-ratio gearing for high backdrivability', 'Mechanical', 1, 5, 'important',
    '[{"id": "qdd1", "question": "Is transparency/backdrivability required?", "context": "Critical for force control and safety"}, {"id": "qdd2", "question": "What is the torque density target?", "context": "QDD motors are often larger diameter"}]',
    ARRAY['Mechanical Engineer', 'Motion Control Engineer'], '2-3 weeks'),

    ('00000003-1600-4000-8000-000000000001', v_template_id, '00000003-1000-4000-8000-000000000001', 'Series Elastic Actuators', 'Compliant actuation for shock tolerance', 'Mechanical', 1, 6, 'nice-to-have',
    '[{"id": "sea1", "question": "Do you need physical compliance?", "context": "For shock absorption or energy storage"}, {"id": "sea2", "question": "What stiffness profile is needed?", "context": "Determines spring selection"}]',
    ARRAY['Mechanical Engineer'], '3-4 weeks');

    -- Control Systems (2xxx) - Additions
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-2300-4000-8000-000000000001', v_template_id, '00000003-2000-4000-8000-000000000001', 'Whole-Body Control', 'Coordinated multi-limb motion', 'Software', 1, 3, 'critical',
    '[{"id": "wbc1", "question": "How do you handle balance and contacts?", "context": "Floating base dynamics"}, {"id": "wbc2", "question": "What is the optimization solver?", "context": "QP, HQP, etc."}]',
    ARRAY['Controls Engineer', 'Robotics Engineer'], '8-12 weeks'),

    ('00000003-2400-4000-8000-000000000001', v_template_id, '00000003-2000-4000-8000-000000000001', 'Model Predictive Control', 'Optimization-based control', 'Software', 1, 4, 'important',
    '[{"id": "mpc1", "question": "What is the prediction horizon?", "context": "Affects compute load and performance"}, {"id": "mpc2", "question": "Linear or non-linear MPC?", "context": "Non-linear is harder to solve in real-time"}]',
    ARRAY['Controls Engineer'], '6-10 weeks');

    -- Sensing & Perception (3xxx) - Additions
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-3400-4000-8000-000000000001', v_template_id, '00000003-3000-4000-8000-000000000001', 'IMU & State Estimation', 'Inertial measurement and fusion', 'Electronics', 1, 4, 'critical',
    '[{"id": "imu1", "question": "What bias stability is required?", "context": "Affects drift over time"}, {"id": "imu2", "question": "What sensor fusion algorithm?", "context": "Kalman Filter, EKF, UKF"}]',
    ARRAY['Sensor Engineer', 'GNC Engineer'], '3-5 weeks'),

    ('00000003-3500-4000-8000-000000000001', v_template_id, '00000003-3000-4000-8000-000000000001', 'LiDAR & Depth Sensing', '3D environmental mapping', 'Electronics', 1, 5, 'important',
    '[{"id": "lid1", "question": "Range and field of view?", "context": "Navigation vs obstacle avoidance"}, {"id": "lid2", "question": "Solid state or spinning?", "context": "Durability and cost"}]',
    ARRAY['Perception Engineer'], '3-5 weeks'),

    ('00000003-3600-4000-8000-000000000001', v_template_id, '00000003-3000-4000-8000-000000000001', 'Tactile Sensing', 'Artificial skin and touch', 'Electronics', 1, 6, 'nice-to-have',
    '[{"id": "tac1", "question": "Spatial resolution required?", "context": "For texture vs contact detection"}, {"id": "tac2", "question": "Normal vs shear force?", "context": "Grip stability"}]',
    ARRAY['Sensor Engineer'], '4-6 weeks');


    -- ============================================================================
    -- 2. NEW TOP-LEVEL CATEGORIES
    -- ============================================================================

    -- Compute & AI (5xxx)
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-5000-4000-8000-000000000001', v_template_id, NULL, 'Compute & AI', 'Onboard compute and intelligence', 'Software', 0, 5, 'critical', '[]', ARRAY['Computer Architect', 'AI Engineer'], NULL),

    ('00000003-5100-4000-8000-000000000001', v_template_id, '00000003-5000-4000-8000-000000000001', 'Edge Compute', 'Onboard processing hardware', 'Electronics', 1, 1, 'critical',
    '[{"id": "ec1", "question": "What are the TOPS requirements?", "context": "For neural net inference"}, {"id": "ec2", "question": "Power budget for compute?", "context": "Affects battery life"}]',
    ARRAY['Computer Architect', 'Hardware Engineer'], '3-5 weeks'),

    ('00000003-5200-4000-8000-000000000001', v_template_id, '00000003-5000-4000-8000-000000000001', 'Visual Language Models', 'VLM integration for reasoning', 'Software', 1, 2, 'important',
    '[{"id": "vlm1", "question": "On-device or cloud inference?", "context": "Latency vs capability"}, {"id": "vlm2", "question": "What context window size?", "context": "Memory constraints"}]',
    ARRAY['AI Engineer', 'ML Engineer'], '4-8 weeks'),

    ('00000003-5300-4000-8000-000000000001', v_template_id, '00000003-5000-4000-8000-000000000001', 'Sim-to-Real', 'Training in simulation', 'Software', 1, 3, 'critical',
    '[{"id": "str1", "question": "What physics engine (MuJoCo, Isaac Gym)?", "context": "Simulation fidelity"}, {"id": "str2", "question": "How do you handle domain randomization?", "context": "Robustness to real-world noise"}]',
    ARRAY['Simulation Engineer', 'ML Engineer'], '6-10 weeks'),

    ('00000003-5400-4000-8000-000000000001', v_template_id, '00000003-5000-4000-8000-000000000001', 'Navigation Stack', 'SLAM and path planning', 'Software', 1, 4, 'critical',
    '[{"id": "nav1", "question": "VSLAM or LiDAR SLAM?", "context": "Sensor dependency"}, {"id": "nav2", "question": "Dynamic or static environment?", "context": "Re-planning frequency"}]',
    ARRAY['Robotics Engineer'], '4-8 weeks');


    -- Power & Energy (6xxx)
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-6000-4000-8000-000000000001', v_template_id, NULL, 'Power & Energy', 'Energy storage and distribution', 'Electronics', 0, 6, 'critical', '[]', ARRAY['Power Engineer'], NULL),

    ('00000003-6100-4000-8000-000000000001', v_template_id, '00000003-6000-4000-8000-000000000001', 'High-Discharge Batteries', 'Power dense energy storage', 'Electronics', 1, 1, 'critical',
    '[{"id": "bat1", "question": "What is the peak C-rate?", "context": "Required for dynamic motions (jumping)"}, {"id": "bat2", "question": "Gravimetric energy density?", "context": "Affects robot weight"}]',
    ARRAY['Battery Engineer'], '3-5 weeks'),

    ('00000003-6200-4000-8000-000000000001', v_template_id, '00000003-6000-4000-8000-000000000001', 'Custom BMS', 'Battery management systems', 'Electronics', 1, 2, 'critical',
    '[{"id": "bms1", "question": "Cell balancing strategy?", "context": "Active vs passive"}, {"id": "bms2", "question": "Safety protections (OCP, OVP, OTP)?", "context": "Critical for high-power packs"}]',
    ARRAY['Electronics Engineer'], '4-6 weeks'),

    ('00000003-6300-4000-8000-000000000001', v_template_id, '00000003-6000-4000-8000-000000000001', 'Power Distribution', 'PDUs and cabling', 'Electronics', 1, 3, 'important',
    '[{"id": "pdu1", "question": "Voltage bus architecture (48V, HV)?", "context": "Efficiency vs safety"}, {"id": "pdu2", "question": "Cable management strategy?", "context": "Reliability in moving joints"}]',
    ARRAY['Electrical Engineer'], '2-4 weeks');


    -- Locomotion & Manipulation (7xxx)
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-7000-4000-8000-000000000001', v_template_id, NULL, 'Locomotion & Manipulation', 'Moving and interacting', 'Mechanical', 0, 7, 'critical', '[]', ARRAY['Robotics Engineer', 'Mechanical Engineer'], NULL),

    ('00000003-7100-4000-8000-000000000001', v_template_id, '00000003-7000-4000-8000-000000000001', 'Bipedal Locomotion', 'Walking and balancing', 'Software', 1, 1, 'critical',
    '[{"id": "loc1", "question": "Gait generation strategy?", "context": "ZMP, LIPM, or RL-based"}, {"id": "loc2", "question": "Terrain handling capabilities?", "context": "Stairs, slopes, rough terrain"}]',
    ARRAY['Robotics Engineer'], '8-12 weeks'),

    ('00000003-7200-4000-8000-000000000001', v_template_id, '00000003-7000-4000-8000-000000000001', 'Dexterous Manipulation', 'Hand and finger control', 'Software', 1, 2, 'critical',
    '[{"id": "dex1", "question": "Number of fingers and DoF?", "context": "Grasp versatility"}, {"id": "dex2", "question": "Grasp planning algorithm?", "context": "Handling unknown objects"}]',
    ARRAY['Robotics Engineer'], '6-10 weeks'),

    ('00000003-7300-4000-8000-000000000001', v_template_id, '00000003-7000-4000-8000-000000000001', 'End Effectors', 'Grippers and tools', 'Mechanical', 1, 3, 'important',
    '[{"id": "ee1", "question": "Universal or specialized gripper?", "context": "Task dependency"}, {"id": "ee2", "question": "Quick-change mechanism?", "context": "Tool swapping"}]',
    ARRAY['Mechanical Engineer'], '3-5 weeks');


    -- Communication & Connectivity (8xxx)
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-8000-4000-8000-000000000001', v_template_id, NULL, 'Communication', 'Data bus and connectivity', 'Electronics', 0, 8, 'important', '[]', ARRAY['Embedded Engineer'], NULL),

    ('00000003-8100-4000-8000-000000000001', v_template_id, '00000003-8000-4000-8000-000000000001', 'Real-Time Bus', 'EtherCAT, CAN FD', 'Electronics', 1, 1, 'critical',
    '[{"id": "bus1", "question": "Bus cycle time requirement?", "context": "Critical for control loop stability"}, {"id": "bus2", "question": "Topology (Daisy chain, Star)?", "context": "Wiring complexity"}]',
    ARRAY['Embedded Engineer'], '3-5 weeks'),

    ('00000003-8200-4000-8000-000000000001', v_template_id, '00000003-8000-4000-8000-000000000001', 'Telemetry & Logging', 'Data collection and diagnostics', 'Software', 1, 2, 'important',
    '[{"id": "tel1", "question": "Bandwidth for logging?", "context": "Black box recording"}, {"id": "tel2", "question": "Real-time visualization?", "context": "Debugging and monitoring"}]',
    ARRAY['Software Engineer'], '2-4 weeks');


    -- Materials & Manufacturing (9xxx)
    INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
    ('00000003-9000-4000-8000-000000000001', v_template_id, NULL, 'Materials & Manufacturing', 'Advanced fabrication', 'Mechanical', 0, 9, 'important', '[]', ARRAY['Mechanical Engineer', 'Manufacturing Engineer'], NULL),

    ('00000003-9100-4000-8000-000000000001', v_template_id, '00000003-9000-4000-8000-000000000001', 'Generative Design', 'Topology optimization', 'Mechanical', 1, 1, 'nice-to-have',
    '[{"id": "gen1", "question": "Weight reduction targets?", "context": "Critical for dynamic performance"}, {"id": "gen2", "question": "Manufacturing constraints?", "context": "Additive vs subtractive"}]',
    ARRAY['Mechanical Engineer'], '4-6 weeks'),

    ('00000003-9200-4000-8000-000000000001', v_template_id, '00000003-9000-4000-8000-000000000001', 'Advanced Composites', 'Carbon fiber and lightweight materials', 'Mechanical', 1, 2, 'important',
    '[{"id": "comp1", "question": "Stiffness-to-weight ratio?", "context": "Structural efficiency"}, {"id": "comp2", "question": "Cost vs performance trade-off?", "context": "Carbon fiber is expensive"}]',
    ARRAY['Materials Engineer'], '3-5 weeks');

    -- ============================================================================
    -- 3. UPDATE TEMPLATE METADATA
    -- ============================================================================
    
    UPDATE blueprint_templates SET
      estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = blueprint_templates.id),
      estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = blueprint_templates.id)
    WHERE id = v_template_id;

END $$;
