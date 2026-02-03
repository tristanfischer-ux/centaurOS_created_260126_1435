-- =============================================
-- Seed Universal Subsystems Part 2
-- Software, Manufacturing, Regulatory, Operations
-- =============================================

-- =============================================
-- SOFTWARE SUBSYSTEMS (9-12)
-- =============================================

-- 9. Control Systems
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000009',
    'Control Systems',
    'control-systems',
    'Making it go where you want: feedback loops, stability, and precision',
    'Control systems use feedback to make things behave as intended. From simple thermostats to sophisticated flight controllers, the principles are the same: measure the current state, compare to desired state, and command actuators to reduce the error. Good control design is essential for stable, precise, and safe operation.',
    'Software',
    'GitBranch',
    9,
    '{
        "overview": "Control systems are the mathematical and engineering discipline of making systems behave as desired despite disturbances and uncertainties. Every autonomous system relies on control loops to maintain stability, follow trajectories, and respond to commands.\n\nControl design starts with understanding system dynamics - how the system responds to inputs. Then controllers are designed to achieve desired behavior (fast response, no overshoot, disturbance rejection). Modern control increasingly uses model predictive control (MPC) and other advanced techniques.\n\nThe field spans classical control (PID, lead-lag), modern control (state space, LQR, LQG), and advanced methods (adaptive, robust, nonlinear). The right approach depends on system complexity and performance requirements.",
        "why_it_matters": "Unstable control systems crash. Poorly tuned systems oscillate, respond slowly, or fail to reject disturbances. Control quality directly impacts user experience and safety.",
        "key_concepts": [
            "Feedback loop: Measuring output and adjusting input to reduce error",
            "Stability: System returns to equilibrium after disturbance",
            "Bandwidth: Frequency range where controller is effective",
            "Gain margin: How much gain increase before instability",
            "Phase margin: How much phase delay before instability",
            "Actuator saturation: When actuators hit limits, control degrades"
        ],
        "decision_points": [
            "Classical (PID) vs modern (state space) vs advanced (MPC, adaptive)",
            "Inner/outer loop architecture for complex systems",
            "Gain scheduling vs adaptive vs robust for varying conditions",
            "Centralized vs distributed control",
            "Model-based vs model-free approaches"
        ],
        "common_mistakes": [
            "Tuning for nominal conditions and ignoring parameter variation",
            "Ignoring actuator dynamics and rate limits",
            "Not including sensor noise in stability analysis",
            "Designing without accounting for computational delays",
            "Insufficient simulation before flight/operation"
        ],
        "success_indicators": [
            "Stability margins verified through analysis and simulation",
            "Performance validated across operating envelope",
            "Actuator authority sufficient with margin",
            "Gain schedules cover all flight/operating conditions",
            "Monte Carlo simulations show robustness to variations"
        ],
        "terminology": {
            "PID": "Proportional-Integral-Derivative controller",
            "LQR": "Linear Quadratic Regulator - optimal control method",
            "MPC": "Model Predictive Control - optimization-based control",
            "Loop rate": "Frequency at which control loop executes",
            "Setpoint": "Desired value the controller tries to achieve",
            "Transient response": "How system responds to step changes"
        }
    }'::jsonb,
    '[
        {"id": "ctrl-1", "question": "What are your control objectives (tracking, stabilization, disturbance rejection)?", "context": "Different objectives require different controller designs.", "difficulty": "basic"},
        {"id": "ctrl-2", "question": "What are your required loop rates?", "context": "Faster systems need faster control. Typically 10-100x the system bandwidth.", "difficulty": "basic"},
        {"id": "ctrl-3", "question": "What stability margins are required?", "context": "Typically 6dB gain margin and 45° phase margin minimum.", "difficulty": "intermediate"},
        {"id": "ctrl-4", "question": "How will you handle actuator saturation?", "context": "Anti-windup, command limiting, and graceful degradation strategies.", "difficulty": "advanced"},
        {"id": "ctrl-5", "question": "What simulation fidelity do you need?", "context": "Higher fidelity simulation catches more issues but costs more.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Control of Mobile Robots", "url": "https://www.coursera.org/", "provider": "Georgia Tech"},
            {"title": "Modern Control", "url": "https://ocw.mit.edu/", "provider": "MIT OpenCourseWare"}
        ],
        "books": [
            {"title": "Feedback Control of Dynamic Systems", "author": "Franklin, Powell, Emami-Naeini", "description": "Standard controls textbook"},
            {"title": "Model Predictive Control", "author": "Camacho & Alba", "description": "MPC theory and applications"}
        ]
    }'::jsonb,
    ARRAY['robotics', 'aerospace', 'control-systems', 'automotive'],
    ARRAY['Controls Engineer', 'GNC Lead', 'VP Engineering'],
    ARRAY['service', 'software']
);

-- Control Systems Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000009',
    'Develop Control System',
    'Design control architecture, implement controllers, and validate stability',
    'This objective guides you through developing the control system for your autonomous application. You''ll design the control architecture, implement and tune controllers, and validate performance and stability.',
    'advanced',
    '6-10 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define control requirements and architecture",
            "description": "Document control system needs:\n\n**Control Objectives:**\n- What must be controlled (position, velocity, attitude, etc.)\n- Performance requirements (response time, accuracy, overshoot)\n- Disturbance rejection requirements\n- Operating envelope\n\n**Architecture:**\n- Inner/outer loop structure\n- Controller allocation (what controls what)\n- Sensor and actuator assignments\n- Mode transitions\n\n**Deliverable:** Control requirements and architecture document.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Develop system dynamic model",
            "description": "Create mathematical model of system:\n\n**Model Development:**\n- Equations of motion\n- Actuator dynamics\n- Sensor dynamics\n- Aerodynamic/dynamic models\n\n**Model Validation:**\n- Compare to first-principles\n- Validate against test data if available\n- Document uncertainties and assumptions\n\n**Deliverable:** Validated dynamic model (MATLAB/Simulink or equivalent).",
            "role": "AI_Agent",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design and tune controllers",
            "description": "Implement control algorithms:\n\n**Controller Design:**\n- Select control law approach\n- Design inner loop controllers\n- Design outer loop controllers\n- Develop gain schedules if needed\n\n**Analysis:**\n- Stability margins at all conditions\n- Robustness to parameter variations\n- Actuator usage and margin\n\n**Deliverable:** Controller designs with analysis results.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find controls expert on marketplace",
            "description": "Engage a control systems specialist:\n\n**Expertise Areas:**\n- GNC (Guidance, Navigation, Control)\n- Control law design and analysis\n- Simulation and testing\n- Industry-specific control challenges\n\n**Deliverable:** Expert review of control design.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "control-systems", "robotics"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source simulation and development tools",
            "description": "Find tools and services for control development:\n\n**Tools:**\n- Simulation software (MATLAB, etc.)\n- Hardware-in-the-loop systems\n- Real-time computing platforms\n\n**Services:**\n- Simulation development support\n- Flight test support\n\n**Deliverable:** Tools acquisition and service engagement.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "software", "simulation"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 10. Embedded Software
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000010',
    'Embedded Software',
    'embedded-software',
    'Code that runs on hardware: firmware, drivers, and real-time systems',
    'Embedded software runs on the hardware, directly interfacing with sensors, actuators, and communications. Unlike application software, embedded code must work within tight resource constraints (memory, CPU) and meet hard real-time deadlines. Quality embedded software is essential for reliable hardware operation.',
    'Software',
    'Microchip',
    10,
    '{
        "overview": "Embedded software is the invisible intelligence inside every electronic device. It boots the processor, configures peripherals, implements protocols, runs control loops, and manages the complex dance of reading sensors and commanding actuators.\n\nEmbedded development differs from application development in fundamental ways: no operating system (or a simple RTOS), limited memory, real-time constraints, and direct hardware interaction. Debugging is harder because you can''t easily stop and inspect running code.\n\nModern embedded systems often use a layered architecture: hardware abstraction layer (HAL), board support package (BSP), middleware (file systems, networking), and application code. This separation improves portability and maintainability.",
        "why_it_matters": "Embedded software bugs are difficult to diagnose and expensive to fix in the field. Real-time failures can cause crashes. Security vulnerabilities in embedded code can compromise entire systems.",
        "key_concepts": [
            "Real-time constraints: Code must complete within deterministic time bounds",
            "Interrupt handling: Responding to hardware events with low latency",
            "Memory management: Working within limited RAM without leaks",
            "Bootloader: Code that initializes hardware and loads main firmware",
            "Watchdog: Hardware timer that resets system if software hangs",
            "DMA: Direct Memory Access - moving data without CPU involvement"
        ],
        "decision_points": [
            "Bare metal vs RTOS vs Linux: Complexity vs features tradeoff",
            "Language: C, C++, Rust, or specialized embedded languages",
            "Development tools: IDE, debugger, profiler selection",
            "Testing approach: Unit tests, HIL, automated testing",
            "Update mechanism: Secure over-the-air updates"
        ],
        "common_mistakes": [
            "Underestimating development and testing time (2-3x desktop software)",
            "Not using version control for firmware from day one",
            "Ignoring timing analysis until problems appear",
            "Not planning for field updates and debugging",
            "Inadequate error handling and watchdog coverage"
        ],
        "success_indicators": [
            "Real-time budget shows all tasks meet deadlines with margin",
            "Memory usage tracked with margin for growth",
            "All code paths tested including error conditions",
            "Field update mechanism tested and secure",
            "Diagnostic and debugging capabilities in production code"
        ],
        "terminology": {
            "RTOS": "Real-Time Operating System",
            "HAL": "Hardware Abstraction Layer",
            "BSP": "Board Support Package",
            "ISR": "Interrupt Service Routine",
            "JTAG": "Debugging interface for embedded processors",
            "Flash": "Non-volatile memory for code and data storage"
        }
    }'::jsonb,
    '[
        {"id": "emb-1", "question": "What operating system approach will you use?", "context": "Bare metal is simplest but limited. RTOS adds scheduling. Linux adds features but complexity.", "difficulty": "basic"},
        {"id": "emb-2", "question": "What are your hard real-time requirements?", "context": "Tasks with deadlines that absolutely cannot be missed.", "difficulty": "basic"},
        {"id": "emb-3", "question": "How will you handle field software updates?", "context": "OTA updates need security, rollback, and fail-safe mechanisms.", "difficulty": "intermediate"},
        {"id": "emb-4", "question": "What is your testing strategy?", "context": "Unit tests, integration tests, HIL testing plan.", "difficulty": "intermediate"},
        {"id": "emb-5", "question": "What safety/certification requirements apply?", "context": "DO-178C, ISO 26262, IEC 61508 have different requirements.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Introduction to Embedded Systems", "url": "https://www.coursera.org/", "provider": "UC Irvine"},
            {"title": "Real-Time Operating Systems", "url": "https://www.edx.org/", "provider": "University of Colorado"}
        ],
        "books": [
            {"title": "Making Embedded Systems", "author": "Elecia White", "description": "Practical embedded development guide"},
            {"title": "Programming Embedded Systems in C and C++", "author": "Michael Barr", "description": "Classic embedded programming reference"}
        ]
    }'::jsonb,
    ARRAY['embedded', 'software', 'electronics', 'robotics'],
    ARRAY['Embedded Software Lead', 'VP Engineering', 'CTO'],
    ARRAY['service', 'software']
);

-- Embedded Software Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000010',
    'Establish Embedded Software Foundation',
    'Set up development environment, architecture, and testing framework',
    'This objective guides you through establishing the embedded software foundation for your product. You''ll set up the development environment, define the software architecture, and create a testing framework.',
    'intermediate',
    '4-8 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define embedded software requirements",
            "description": "Document software requirements:\n\n**Functional Requirements:**\n- Hardware interfaces to support\n- Control functions to implement\n- Communication protocols\n- Safety/monitoring functions\n\n**Non-Functional Requirements:**\n- Real-time performance\n- Memory constraints\n- Power consumption targets\n- Reliability requirements\n\n**Interface Requirements:**\n- Hardware interface specifications\n- External communication interfaces\n- Debug and test interfaces\n\n**Deliverable:** Software requirements specification.",
            "role": "Executive",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Design software architecture",
            "description": "Create the software architecture:\n\n**Architecture Elements:**\n- Layer diagram (HAL, drivers, middleware, application)\n- Task structure and priorities\n- Inter-task communication\n- Memory map\n- Boot sequence\n\n**Design Decisions:**\n- RTOS selection (if any)\n- Coding standards\n- Module interfaces\n- Error handling approach\n\n**Deliverable:** Software architecture document.",
            "role": "AI_Agent",
            "estimated_hours": 20,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Set up development environment",
            "description": "Establish development infrastructure:\n\n**Development Environment:**\n- Compiler and toolchain\n- IDE and debugger\n- Version control (Git)\n- Build system\n\n**Testing Infrastructure:**\n- Unit test framework\n- CI/CD pipeline\n- Code coverage tools\n- Static analysis tools\n\n**Deliverable:** Working development environment with sample project.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find embedded software expert on marketplace",
            "description": "Engage an embedded software specialist:\n\n**Expertise Areas:**\n- RTOS development\n- Hardware driver development\n- Safety-critical software (DO-178C, etc.)\n- Secure embedded systems\n\n**Deliverable:** Expert review of architecture.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["embedded", "software", "aerospace"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source development tools and services",
            "description": "Find embedded development resources:\n\n**Tools:**\n- Development kits and debuggers\n- Static analysis tools\n- RTOS licenses\n- Simulation tools\n\n**Services:**\n- Embedded development support\n- Code review services\n\n**Deliverable:** Tools acquired, services engaged.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["embedded", "software"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 11. AI/ML Systems
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000011',
    'AI/ML Systems',
    'ai-ml-systems',
    'Teaching machines to learn: neural networks, training, and inference',
    'AI and machine learning systems enable products to learn from data, recognize patterns, and make decisions that would be difficult to program explicitly. This includes perception (computer vision), decision-making (reinforcement learning), and prediction (time series forecasting). AI/ML is transforming what autonomous systems can do.',
    'Software',
    'Brain',
    11,
    '{
        "overview": "Machine learning allows systems to improve performance on tasks through experience rather than explicit programming. For autonomous systems, ML is most commonly used for perception (object detection, classification), behavior (motion planning, decision making), and prediction (trajectory forecasting).\n\nDeploying ML in products requires managing the full lifecycle: data collection, annotation, model training, validation, deployment, and monitoring. The model is only as good as the data it learned from.\n\nEdge deployment (running ML on embedded hardware) has different constraints than cloud ML. Model size, latency, and power consumption must be optimized for the target platform.",
        "why_it_matters": "ML enables capabilities that would be impossible to hand-code. But ML also introduces new failure modes - models can be confident but wrong. Understanding ML limitations is essential for safe deployment.",
        "key_concepts": [
            "Training data: Examples the model learns from - quality is critical",
            "Neural network: Layered structure of artificial neurons",
            "Inference: Running trained model to make predictions",
            "Overfitting: Model memorizes training data instead of generalizing",
            "Edge deployment: Running ML on embedded devices",
            "MLOps: Managing ML model lifecycle in production"
        ],
        "decision_points": [
            "Build vs buy: Train custom models vs use pre-trained",
            "Cloud vs edge: Where does inference run?",
            "Architecture: CNN, transformer, other neural network types",
            "Framework: PyTorch, TensorFlow, specialized edge frameworks",
            "Data strategy: How to collect, annotate, and manage training data"
        ],
        "common_mistakes": [
            "Underestimating data requirements (quality and quantity)",
            "Not testing against adversarial and edge cases",
            "Ignoring model drift and the need for continuous learning",
            "Overestimating model accuracy from training metrics",
            "Not planning for model updates in production"
        ],
        "success_indicators": [
            "Representative training data from actual operating conditions",
            "Model validated against held-out test set and edge cases",
            "Inference meets latency and throughput requirements",
            "Monitoring in place to detect model degradation",
            "Update mechanism allows model improvements"
        ],
        "terminology": {
            "CNN": "Convolutional Neural Network - good for images",
            "Transformer": "Attention-based architecture - good for sequences",
            "Inference latency": "Time to process one input",
            "Model quantization": "Reducing precision to shrink model size",
            "Transfer learning": "Using pre-trained model as starting point",
            "Annotation": "Labeling data for supervised learning"
        }
    }'::jsonb,
    '[
        {"id": "ai-1", "question": "What ML tasks do you need (detection, classification, prediction)?", "context": "Different tasks need different architectures and data.", "difficulty": "basic"},
        {"id": "ai-2", "question": "Where will inference run (cloud, edge, or hybrid)?", "context": "Edge requires smaller models and optimization.", "difficulty": "basic"},
        {"id": "ai-3", "question": "What training data do you have or need to collect?", "context": "ML quality depends on data quality. Plan data collection early.", "difficulty": "intermediate"},
        {"id": "ai-4", "question": "What is your acceptable failure rate?", "context": "ML models have error rates. Safety systems need to handle wrong predictions.", "difficulty": "intermediate"},
        {"id": "ai-5", "question": "How will you update models in production?", "context": "Models need updates as data and requirements change.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Deep Learning Specialization", "url": "https://www.coursera.org/", "provider": "deeplearning.ai"},
            {"title": "Machine Learning Engineering for Production", "url": "https://www.coursera.org/", "provider": "deeplearning.ai"}
        ],
        "books": [
            {"title": "Deep Learning", "author": "Goodfellow, Bengio, Courville", "description": "The deep learning textbook"},
            {"title": "Designing Machine Learning Systems", "author": "Chip Huyen", "description": "Practical ML systems engineering"}
        ]
    }'::jsonb,
    ARRAY['ai', 'machine-learning', 'software', 'robotics'],
    ARRAY['ML Engineer', 'Head of AI', 'CTO'],
    ARRAY['service', 'software']
);

-- AI/ML Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000011',
    'Develop AI/ML Capability',
    'Define ML requirements, establish data pipeline, and deploy models',
    'This objective guides you through adding AI/ML capabilities to your product. You''ll define requirements, establish data collection and training pipelines, and deploy models for inference.',
    'advanced',
    '8-12 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define ML requirements and feasibility",
            "description": "Document ML needs:\n\n**ML Tasks:**\n- What decisions need ML (vs explicit programming)\n- Input data available\n- Output required (detection, classification, etc.)\n- Accuracy requirements\n\n**Constraints:**\n- Inference latency limits\n- Edge compute available\n- Training data availability\n- Update frequency needed\n\n**Feasibility Assessment:**\n- Is ML the right approach?\n- Is sufficient data available?\n- Can requirements be met with current technology?\n\n**Deliverable:** ML requirements and feasibility assessment.",
            "role": "Executive",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Establish data collection and annotation pipeline",
            "description": "Create data infrastructure:\n\n**Data Collection:**\n- Sensors and data sources\n- Storage infrastructure\n- Data versioning\n- Privacy and security\n\n**Annotation Pipeline:**\n- Annotation tools\n- Quality control process\n- Workforce (internal, outsourced)\n- Annotation guidelines\n\n**Deliverable:** Working data pipeline with initial dataset.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Develop and validate ML models",
            "description": "Train and test models:\n\n**Model Development:**\n- Architecture selection\n- Training infrastructure\n- Hyperparameter tuning\n- Optimization for target platform\n\n**Validation:**\n- Test set evaluation\n- Edge case testing\n- Robustness testing\n- Benchmark against requirements\n\n**Deliverable:** Trained models meeting requirements.",
            "role": "AI_Agent",
            "estimated_hours": 60,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find ML/AI expert on marketplace",
            "description": "Engage an ML specialist:\n\n**Expertise Areas:**\n- Computer vision / perception\n- MLOps and deployment\n- Edge ML optimization\n- Domain-specific ML\n\n**Deliverable:** Expert guidance on ML architecture.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["ai", "machine-learning", "software"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source ML infrastructure and services",
            "description": "Find ML resources:\n\n**Infrastructure:**\n- Training compute (cloud GPUs)\n- Annotation services\n- Edge inference hardware\n\n**Services:**\n- ML consulting\n- Data annotation\n- Model optimization\n\n**Deliverable:** ML infrastructure and services acquired.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["ai", "machine-learning", "software"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 12. Ground Software / Mission Control
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000012',
    'Ground Software & Mission Control',
    'ground-software',
    'Command and monitor: operator interfaces, data visualization, and fleet management',
    'Ground software provides the human interface for commanding, monitoring, and managing autonomous systems. This includes mission planning, real-time telemetry display, command and control interfaces, data archiving, and fleet management. Good ground software makes operators more effective and reduces errors.',
    'Software',
    'MonitorPlay',
    12,
    '{
        "overview": "Ground software is everything that runs on the ground to support operations. For autonomous systems this typically includes a Ground Control Station (GCS) for real-time monitoring and command, mission planning tools, data analysis and visualization, and fleet management systems.\n\nGround software faces unique challenges: it must handle unreliable and delayed data from remote vehicles, present complex information clearly to operators, and prevent operator errors that could cause accidents. Good UX design is essential.\n\nModern ground systems are often web-based for accessibility, though real-time command and control may require native applications for lower latency and better hardware integration.",
        "why_it_matters": "Operators can only be as effective as their tools allow. Poor ground software leads to errors, missed alarms, and reduced situational awareness. Good ground software multiplies operator effectiveness.",
        "key_concepts": [
            "GCS: Ground Control Station - primary operator interface",
            "Telemetry: Data received from the vehicle",
            "Command: Instructions sent to the vehicle",
            "Mission planning: Defining what the vehicle should do",
            "Situational awareness: Operator understanding of current state",
            "Fleet management: Managing multiple vehicles simultaneously"
        ],
        "decision_points": [
            "Web vs native application: Accessibility vs performance",
            "COTS vs custom: Off-shelf GCS vs purpose-built",
            "Single operator vs multi-operator: Collaboration features",
            "Cloud vs on-premise: Data storage and processing location",
            "Integration approach: How to connect with vehicle systems"
        ],
        "common_mistakes": [
            "Overwhelming operators with too much data",
            "Not designing for off-nominal situations and alarms",
            "Ignoring latency in UI design for command confirmation",
            "Not planning for poor or lost connectivity",
            "Building separate tools instead of integrated workflow"
        ],
        "success_indicators": [
            "Operators can perform core tasks without training manual",
            "Alarms are prioritized and actionable",
            "System degrades gracefully with poor connectivity",
            "Data is archived for post-mission analysis",
            "Access control and audit logging implemented"
        ],
        "terminology": {
            "GCS": "Ground Control Station",
            "HMI": "Human-Machine Interface",
            "SCADA": "Supervisory Control and Data Acquisition",
            "Geofence": "Virtual boundary for vehicle operations",
            "Waypoint": "Geographic point in a mission plan",
            "Playback": "Reviewing historical telemetry data"
        }
    }'::jsonb,
    '[
        {"id": "gnd-1", "question": "What are the core operator tasks?", "context": "Focus on workflows operators actually do, not all possible features.", "difficulty": "basic"},
        {"id": "gnd-2", "question": "How many simultaneous operators and vehicles?", "context": "Affects architecture, access control, and collaboration features.", "difficulty": "basic"},
        {"id": "gnd-3", "question": "What data must be displayed in real-time?", "context": "Real-time data has infrastructure cost. Not everything needs to be real-time.", "difficulty": "intermediate"},
        {"id": "gnd-4", "question": "What happens when connectivity is lost?", "context": "Graceful degradation and clear state indication are critical.", "difficulty": "intermediate"},
        {"id": "gnd-5", "question": "What integrations are needed?", "context": "Existing fleet management, airspace systems, customer systems.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Human-Computer Interaction", "url": "https://www.coursera.org/", "provider": "Georgia Tech"},
            {"title": "UX Design", "url": "https://www.coursera.org/", "provider": "Google"}
        ],
        "books": [
            {"title": "Designing Connected Products", "author": "Rowland et al.", "description": "UX for IoT and connected systems"},
            {"title": "Don''t Make Me Think", "author": "Steve Krug", "description": "Web usability classic"}
        ]
    }'::jsonb,
    ARRAY['software', 'aerospace', 'ground-systems'],
    ARRAY['Software Lead', 'VP Engineering', 'CTO'],
    ARRAY['service', 'software']
);

-- Ground Software Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000012',
    'Develop Ground Control System',
    'Define operator workflows, design interfaces, and build mission control',
    'This objective guides you through developing the ground control and mission management system. You''ll define operator workflows, design user interfaces, and build the ground software infrastructure.',
    'intermediate',
    '8-12 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define operator workflows and requirements",
            "description": "Document ground system needs:\n\n**Operator Roles:**\n- Who uses the system (pilots, mission planners, supervisors)\n- Tasks each role performs\n- Information each role needs\n\n**Workflows:**\n- Pre-mission planning\n- Real-time operations\n- Contingency handling\n- Post-mission analysis\n\n**Requirements:**\n- Real-time data requirements\n- Command latency requirements\n- Data retention requirements\n- Access control requirements\n\n**Deliverable:** Ground system requirements document.",
            "role": "Executive",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Design ground system architecture",
            "description": "Create the system architecture:\n\n**Architecture Elements:**\n- Client applications (GCS, planning, analysis)\n- Backend services (telemetry, command, storage)\n- Data flows and protocols\n- Security architecture\n\n**Technology Selection:**\n- Frontend framework\n- Backend framework\n- Database(s)\n- Real-time infrastructure\n\n**Deliverable:** Ground system architecture document.",
            "role": "AI_Agent",
            "estimated_hours": 20,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design and prototype user interface",
            "description": "Create the operator interface:\n\n**UI Design:**\n- Information hierarchy\n- Primary views and layouts\n- Alarm and alert design\n- Command confirmation patterns\n\n**Prototyping:**\n- Wireframes for core workflows\n- Interactive prototype\n- Operator feedback sessions\n\n**Deliverable:** UI design and validated prototype.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find ground systems expert on marketplace",
            "description": "Engage a ground systems specialist:\n\n**Expertise Areas:**\n- GCS development\n- Real-time systems\n- Operator interface design\n- Fleet management systems\n\n**Deliverable:** Expert review and guidance.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["software", "aerospace", "ground-systems"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source ground software components",
            "description": "Find ground software resources:\n\n**COTS Options:**\n- GCS platforms\n- Fleet management systems\n- Data visualization tools\n\n**Services:**\n- Custom development\n- UX design services\n- Integration support\n\n**Deliverable:** Component selection and services engaged.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["software", "aerospace"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- =============================================
-- MANUFACTURING SUBSYSTEMS (13-16)
-- =============================================

-- 13. Additive Manufacturing
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000013',
    'Additive Manufacturing',
    'additive-manufacturing',
    'Printing the future: 3D printing metals, plastics, and composites',
    'Additive manufacturing (3D printing) builds parts layer by layer, enabling geometries impossible with traditional manufacturing. This includes metal printing (DMLS, SLM, EBM), polymer printing (FDM, SLA, SLS), and composite printing. AM is transforming prototyping and increasingly production manufacturing.',
    'Manufacturing',
    'Printer',
    13,
    '{
        "overview": "Additive manufacturing builds parts by adding material layer by layer, in contrast to subtractive manufacturing which removes material. This fundamental difference enables complex geometries, internal features, and part consolidation that traditional methods cannot achieve.\n\nFor prototyping, AM dramatically reduces lead time from weeks to days. For production, AM enables parts that were previously impossible or impractical, particularly for aerospace and medical applications.\n\nEach AM process has different capabilities, materials, costs, and quality considerations. Selecting the right process requires understanding the part requirements and tradeoffs.",
        "why_it_matters": "AM can compress development timelines by 10x for prototypes. For production, AM enables weight reduction, part consolidation, and supply chain simplification.",
        "key_concepts": [
            "Layer thickness: Determines resolution and build time",
            "Build orientation: Affects strength, surface finish, and supports",
            "Support structures: Material needed to build overhangs",
            "Post-processing: Steps after printing (heat treat, machining, surface finish)",
            "Powder bed fusion: Metal AM using laser or electron beam",
            "Material extrusion: FDM-type processes for polymers"
        ],
        "decision_points": [
            "Metal vs polymer: Driven by strength and temperature requirements",
            "Process selection: SLM, DMLS, EBM for metals; FDM, SLA, SLS for polymers",
            "Prototype vs production: Different quality and documentation needs",
            "In-house vs outsource: Capital investment vs flexibility",
            "Post-processing approach: How much finishing is needed"
        ],
        "common_mistakes": [
            "Designing parts without AM constraints (overhangs, minimum features)",
            "Ignoring post-processing time and cost",
            "Not accounting for anisotropic material properties",
            "Underestimating quality variability batch-to-batch",
            "Selecting AM when traditional methods are better/cheaper"
        ],
        "success_indicators": [
            "Parts designed for AM (DfAM principles applied)",
            "Process parameters qualified and documented",
            "Post-processing procedures defined",
            "Quality inspection methods established",
            "Cost comparison to alternatives completed"
        ],
        "terminology": {
            "DMLS": "Direct Metal Laser Sintering",
            "SLM": "Selective Laser Melting",
            "EBM": "Electron Beam Melting",
            "FDM": "Fused Deposition Modeling",
            "SLA": "Stereolithography",
            "DfAM": "Design for Additive Manufacturing"
        }
    }'::jsonb,
    '[
        {"id": "am-1", "question": "What material properties do you need?", "context": "Drives metal vs polymer and specific material selection.", "difficulty": "basic"},
        {"id": "am-2", "question": "What quantities and lead times?", "context": "AM is faster for small quantities but often costlier at volume.", "difficulty": "basic"},
        {"id": "am-3", "question": "What post-processing can you accommodate?", "context": "Most AM parts need significant finishing for production use.", "difficulty": "intermediate"},
        {"id": "am-4", "question": "What quality documentation is required?", "context": "Production parts may need material certs, process traceability.", "difficulty": "intermediate"},
        {"id": "am-5", "question": "Have you optimized the design for AM?", "context": "Parts designed for AM can achieve 50% weight reduction.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Additive Manufacturing", "url": "https://www.coursera.org/", "provider": "MIT"},
            {"title": "Design for Additive Manufacturing", "url": "https://www.edx.org/", "provider": "TU Delft"}
        ],
        "books": [
            {"title": "Additive Manufacturing Technologies", "author": "Gibson, Rosen, Stucker", "description": "Comprehensive AM textbook"},
            {"title": "Metal Additive Manufacturing", "author": "Yadroitsev et al.", "description": "Metal AM processes and applications"}
        ]
    }'::jsonb,
    ARRAY['additive-manufacturing', '3d-printing', 'manufacturing', 'aerospace'],
    ARRAY['Manufacturing Engineer', 'VP Operations', 'VP Engineering'],
    ARRAY['manufacturer', 'service', 'material']
);

-- Additive Manufacturing Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000013',
    'Implement Additive Manufacturing',
    'Evaluate AM opportunities, select processes, and qualify suppliers',
    'This objective guides you through implementing additive manufacturing for your product. You''ll identify AM opportunities, select appropriate processes, and qualify suppliers.',
    'intermediate',
    '4-8 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Identify AM candidate parts",
            "description": "Evaluate parts for AM suitability:\n\n**Good AM Candidates:**\n- Complex geometries impossible traditionally\n- Consolidated assemblies\n- Low volume, high value parts\n- Parts needing rapid iteration\n- Lightweighting opportunities\n\n**Evaluation Criteria:**\n- Technical feasibility\n- Cost vs traditional\n- Lead time improvement\n- Quality achievable\n\n**Deliverable:** AM candidate list with business cases.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Select AM processes and materials",
            "description": "Choose appropriate AM approaches:\n\n**For Each Part:**\n- Material options that meet requirements\n- Process options for that material\n- Post-processing needed\n- Quality achievable\n- Cost estimate\n\n**Deliverable:** Process selection matrix.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Optimize designs for AM",
            "description": "Apply DfAM principles:\n\n**Design Updates:**\n- Remove supports where possible\n- Optimize build orientation\n- Add self-supporting features\n- Consolidate assemblies\n- Topology optimization (if applicable)\n\n**Deliverable:** AM-optimized part designs.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find AM expert on marketplace",
            "description": "Engage an AM specialist:\n\n**Expertise Areas:**\n- DfAM and part optimization\n- Process selection and qualification\n- Material properties and testing\n- Post-processing optimization\n\n**Deliverable:** Expert DfAM review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["additive-manufacturing", "manufacturing"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source AM suppliers",
            "description": "Find qualified AM suppliers:\n\n**Supplier Types:**\n- Metal AM service bureaus\n- Polymer printing services\n- Post-processing specialists\n- Material suppliers\n\n**Deliverable:** Qualified AM supplier list with capabilities.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["additive-manufacturing", "3d-printing", "manufacturing"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 14. Assembly & Integration
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000014',
    'Assembly & Integration',
    'assembly-integration',
    'Putting it all together: assembly processes, integration, and test',
    'Assembly and integration is where all the subsystems come together into a working product. This includes mechanical assembly, electrical integration, software loading, calibration, and functional testing. Good A&I processes ensure products work correctly and are produced efficiently.',
    'Manufacturing',
    'Package',
    14,
    '{
        "overview": "Assembly and integration transforms components and subsystems into working products. It''s where design meets reality - all the interfaces, tolerances, and assumptions get tested for real.\n\nA&I includes planning the assembly sequence, designing fixtures and tools, writing procedures, training technicians, and developing test plans. The quality of A&I directly impacts product quality, production rate, and cost.\n\nFor complex products, integration often reveals issues that weren''t apparent in component-level testing. Plan for integration challenges and build in margin for rework.",
        "why_it_matters": "Poor A&I processes lead to quality escapes, slow production, and high rework costs. Good A&I processes catch problems early and enable efficient scaling.",
        "key_concepts": [
            "Assembly sequence: Order of operations for efficient, correct assembly",
            "Workmanship standards: Criteria for acceptable work (solder, torque, etc.)",
            "Fixtures and tooling: Hardware that holds parts during assembly",
            "Integration testing: Verifying assembled systems work correctly",
            "Calibration: Adjusting systems to meet specifications",
            "First article inspection: Thorough check of first production unit"
        ],
        "decision_points": [
            "In-house vs outsource: Build yourself or use contract manufacturer",
            "Automation level: Manual, semi-auto, or fully automated assembly",
            "Test strategy: How much testing at what stages",
            "Documentation level: Procedures detail based on operator skill",
            "Build quantity: Prototype, low-rate, or high-volume processes"
        ],
        "common_mistakes": [
            "Writing procedures without building units yourself",
            "Not planning for access and assembly order early in design",
            "Underestimating training time for complex procedures",
            "Not capturing lessons learned from early builds",
            "Designing tests that don''t catch real failure modes"
        ],
        "success_indicators": [
            "Assembly procedures written and validated with builds",
            "Test procedures verify all critical functions",
            "First article inspection passed with documented results",
            "Production rate achieved with acceptable yield",
            "Defect tracking shows improving trends"
        ],
        "terminology": {
            "BOM": "Bill of Materials - complete parts list",
            "WIP": "Work in Progress",
            "FAI": "First Article Inspection",
            "MRB": "Material Review Board - disposition of nonconformances",
            "OEE": "Overall Equipment Effectiveness",
            "Yield": "Percentage of units passing all tests"
        }
    }'::jsonb,
    '[
        {"id": "assy-1", "question": "What is your production volume target?", "context": "Drives investment in automation, tooling, and procedures.", "difficulty": "basic"},
        {"id": "assy-2", "question": "What is the expected assembly time per unit?", "context": "Determines production rate and capacity needed.", "difficulty": "basic"},
        {"id": "assy-3", "question": "What workmanship standards apply?", "context": "IPC, NASA, or custom standards affect procedures and training.", "difficulty": "intermediate"},
        {"id": "assy-4", "question": "How will you handle nonconformances?", "context": "MRB process, disposition authority, rework procedures.", "difficulty": "intermediate"},
        {"id": "assy-5", "question": "What integration risks have you identified?", "context": "Interface issues, timing problems, software integration.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Assembly Automation and Product Design", "author": "Boothroyd", "description": "Design for assembly principles"},
            {"title": "Lean Manufacturing", "author": "Womack & Jones", "description": "Efficient production principles"}
        ]
    }'::jsonb,
    ARRAY['manufacturing', 'assembly', 'integration'],
    ARRAY['Manufacturing Engineer', 'VP Operations', 'Production Manager'],
    ARRAY['manufacturer', 'service', 'contract_mfg']
);

-- Assembly Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000014',
    'Establish Assembly & Integration Process',
    'Design assembly flow, write procedures, and validate with first builds',
    'This objective guides you through establishing the assembly and integration process for your product. You''ll design the assembly flow, write procedures, and validate with first article builds.',
    'intermediate',
    '6-10 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define assembly and integration requirements",
            "description": "Document A&I needs:\n\n**Production Requirements:**\n- Target production rate\n- Lot sizes\n- Quality requirements\n- Lead time requirements\n\n**Constraints:**\n- Facility and equipment available\n- Skill level of workforce\n- Regulatory requirements\n- Budget for tooling\n\n**Deliverable:** A&I requirements document.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Design assembly sequence and process flow",
            "description": "Create the process:\n\n**Assembly Sequence:**\n- Order of operations\n- Subassembly breakdown\n- Work content per station\n- Parallel vs serial flow\n\n**Process Flow:**\n- Station layout\n- Material flow\n- Test points\n- Quality checkpoints\n\n**Deliverable:** Assembly process flow diagram.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Write assembly and test procedures",
            "description": "Create procedures:\n\n**Assembly Procedures:**\n- Step-by-step instructions\n- Visual aids and photos\n- Torque specs and workmanship criteria\n- Required tools and materials\n\n**Test Procedures:**\n- Functional test steps\n- Pass/fail criteria\n- Calibration procedures\n- Test equipment setup\n\n**Deliverable:** Complete procedure set.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find manufacturing expert on marketplace",
            "description": "Engage a manufacturing specialist:\n\n**Expertise Areas:**\n- Assembly process design\n- Lean manufacturing\n- Quality systems\n- Production scaling\n\n**Deliverable:** Expert review of A&I process.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["manufacturing", "assembly"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source manufacturing services",
            "description": "Find manufacturing partners:\n\n**Services:**\n- Contract manufacturing\n- Assembly services\n- Test services\n- Tooling fabrication\n\n**Deliverable:** Manufacturing partner evaluation.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["manufacturing", "assembly"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 15. Quality & Testing
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000015',
    'Quality & Testing',
    'quality-testing',
    'Proving it works: verification, validation, and quality management',
    'Quality and testing ensures products meet requirements and perform reliably. This includes designing test programs, performing qualification testing, implementing quality management systems, and managing supplier quality. Good quality systems prevent defects from reaching customers.',
    'Manufacturing',
    'ClipboardCheck',
    15,
    '{
        "overview": "Quality encompasses everything that ensures products meet their requirements. Testing is a key part - systematic verification that design requirements are met. But quality also includes the systems, processes, and culture that prevent defects.\n\nTest programs range from development testing (finding and fixing problems) to qualification testing (proving design meets requirements) to acceptance testing (verifying production units). Each serves a different purpose.\n\nQuality management systems (ISO 9001, AS9100, etc.) provide frameworks for consistent quality. They require documented processes, records, audits, and continuous improvement.",
        "why_it_matters": "Quality escapes damage reputation and can be dangerous. Finding defects late is expensive. A strong quality system catches problems early and continuously improves.",
        "key_concepts": [
            "Verification: Did we build the product right? (meets design spec)",
            "Validation: Did we build the right product? (meets user needs)",
            "Qualification testing: Formal demonstration that design meets requirements",
            "Acceptance testing: Testing each production unit before delivery",
            "Quality management system: Documented framework for quality",
            "Statistical process control: Using data to maintain consistent quality"
        ],
        "decision_points": [
            "Test levels: Component, subsystem, system, and integrated testing",
            "Test vs analysis: When to test physically vs use analysis/simulation",
            "Quality system: ISO 9001, AS9100, or other standards",
            "In-house vs outsource: Testing capabilities to own vs contract",
            "Automation: Manual inspection vs automated testing"
        ],
        "common_mistakes": [
            "Testing only happy path, not failure modes and edge cases",
            "Not tracing test results back to requirements",
            "Underestimating test fixture and equipment needs",
            "Implementing quality system as paperwork, not culture",
            "Not closing the loop from field failures to design changes"
        ],
        "success_indicators": [
            "Test plan covers all requirements with traceability",
            "Qualification testing complete with documented results",
            "Production test coverage catches expected defect types",
            "Quality metrics (yield, escapes) trending positive",
            "Supplier quality program in place"
        ],
        "terminology": {
            "V&V": "Verification and Validation",
            "QMS": "Quality Management System",
            "SPC": "Statistical Process Control",
            "MRB": "Material Review Board",
            "NCR": "Nonconformance Report",
            "CAPA": "Corrective and Preventive Action"
        }
    }'::jsonb,
    '[
        {"id": "qual-1", "question": "What quality standards must you meet?", "context": "AS9100 for aerospace, ISO 13485 for medical, etc.", "difficulty": "basic"},
        {"id": "qual-2", "question": "What qualification testing is required?", "context": "Environmental, EMC, safety - driven by market and regulations.", "difficulty": "basic"},
        {"id": "qual-3", "question": "What is your test automation strategy?", "context": "Automated testing enables consistency and scaling.", "difficulty": "intermediate"},
        {"id": "qual-4", "question": "How will you manage supplier quality?", "context": "Incoming inspection, audits, approved supplier list.", "difficulty": "intermediate"},
        {"id": "qual-5", "question": "What is your CAPA process?", "context": "Systematic process for addressing quality issues.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Juran''s Quality Handbook", "author": "Juran & De Feo", "description": "The comprehensive quality reference"},
            {"title": "Testing Complex and Embedded Systems", "author": "Kinnucan", "description": "Practical guide to hardware/software testing"}
        ]
    }'::jsonb,
    ARRAY['quality', 'testing', 'manufacturing', 'aerospace'],
    ARRAY['Quality Manager', 'Test Engineer', 'VP Operations'],
    ARRAY['testing_lab', 'service']
);

-- Quality Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000015',
    'Establish Quality & Test Program',
    'Design test program, implement quality system, and qualify suppliers',
    'This objective guides you through establishing the quality and test infrastructure for your product. You''ll design the test program, implement quality processes, and qualify suppliers.',
    'intermediate',
    '6-10 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define quality and test requirements",
            "description": "Document quality needs:\n\n**Quality Standards:**\n- Applicable standards (AS9100, ISO 9001, etc.)\n- Customer quality requirements\n- Regulatory requirements\n\n**Test Requirements:**\n- Qualification tests needed\n- Acceptance test coverage\n- Environmental requirements\n\n**Deliverable:** Quality and test requirements document.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Develop test program plan",
            "description": "Create comprehensive test plan:\n\n**Test Plan Elements:**\n- Test levels and objectives\n- Test articles and quantities\n- Test facilities and equipment\n- Pass/fail criteria\n- Schedule and resources\n\n**Test Matrix:**\n- Requirements traceability\n- Test coverage analysis\n\n**Deliverable:** Test program plan.",
            "role": "AI_Agent",
            "estimated_hours": 20,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Implement quality management system",
            "description": "Build quality infrastructure:\n\n**QMS Elements:**\n- Quality manual\n- Key procedures\n- Forms and records\n- Training requirements\n\n**Processes:**\n- Document control\n- Change management\n- Nonconformance handling\n- CAPA process\n\n**Deliverable:** Draft QMS documentation.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find quality expert on marketplace",
            "description": "Engage a quality specialist:\n\n**Expertise Areas:**\n- Quality system implementation\n- Test program management\n- Certification audits\n- Supplier quality\n\n**Deliverable:** Expert quality system review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["quality", "manufacturing"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source test facilities and services",
            "description": "Find test providers:\n\n**Test Services:**\n- Environmental testing (thermal, vibration)\n- EMC testing\n- Safety testing\n- Material testing\n\n**Deliverable:** Qualified test lab list.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["testing", "quality", "manufacturing"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 16. Supply Chain
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000016',
    'Supply Chain',
    'supply-chain',
    'Getting what you need: procurement, suppliers, and logistics',
    'Supply chain encompasses the sourcing, procurement, and logistics needed to acquire components and materials for your product. A robust supply chain ensures you can build products consistently, at target cost, without disruption. Supply chain issues are a leading cause of project delays.',
    'Manufacturing',
    'Truck',
    16,
    '{
        "overview": "Supply chain is everything between your suppliers and your assembly line (or your customer). It includes supplier identification and qualification, procurement and contracts, inventory management, and logistics.\n\nFor hardware products, supply chain often determines success or failure. Long lead time components, sole-source suppliers, and shortage situations can halt production. Good supply chain management identifies and mitigates these risks.\n\nModern supply chains use data and software for visibility, forecasting, and optimization. But fundamentals matter: knowing your suppliers, having alternatives, and maintaining relationships.",
        "why_it_matters": "Supply chain disruptions stop production. Long lead times delay schedules. Single-source suppliers are risks. Supply chain is often the bottleneck.",
        "key_concepts": [
            "Lead time: Time from order to receipt",
            "MOQ: Minimum Order Quantity",
            "Second source: Alternative supplier for risk reduction",
            "Safety stock: Extra inventory to buffer variability",
            "BOM cost: Total cost of materials for one unit",
            "Sourcing strategy: Make vs buy, sole vs multi-source"
        ],
        "decision_points": [
            "Make vs buy: What to manufacture vs outsource",
            "Single vs multi-source: Cost vs risk tradeoff",
            "Domestic vs global: Proximity vs cost vs capability",
            "Stock vs JIT: Inventory carrying cost vs flexibility",
            "Contract type: Fixed price, cost-plus, or hybrid"
        ],
        "common_mistakes": [
            "Not identifying long lead time components early",
            "Single-source on critical components without backup plan",
            "Not factoring shipping time and customs into schedule",
            "Ignoring MOQ constraints in cost estimates",
            "Not building relationships before you need urgent help"
        ],
        "success_indicators": [
            "All components have identified suppliers and lead times",
            "Critical components have second sources identified",
            "BOM cost estimated with supplier quotes",
            "Long lead time items on order to support schedule",
            "Supplier relationships established before production"
        ],
        "terminology": {
            "BOM": "Bill of Materials",
            "AVL": "Approved Vendor List",
            "RFQ": "Request for Quote",
            "PO": "Purchase Order",
            "EOL": "End of Life (component obsolescence)",
            "JIT": "Just in Time inventory"
        }
    }'::jsonb,
    '[
        {"id": "supply-1", "question": "What are your long lead time components?", "context": "Items with 12+ week lead time need early attention.", "difficulty": "basic"},
        {"id": "supply-2", "question": "Where do you have sole-source suppliers?", "context": "Single sources are risks. Identify and plan mitigations.", "difficulty": "basic"},
        {"id": "supply-3", "question": "What is your target BOM cost?", "context": "BOM cost drives pricing and margins. Track from early stages.", "difficulty": "intermediate"},
        {"id": "supply-4", "question": "How will you handle component obsolescence?", "context": "EOL notices are common. Need strategy for lifetime buys or redesign.", "difficulty": "intermediate"},
        {"id": "supply-5", "question": "What inventory strategy will you use?", "context": "Safety stock, JIT, consignment - depends on demand variability and capital.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Supply Chain Management", "author": "Chopra & Meindl", "description": "Comprehensive supply chain textbook"},
            {"title": "The Goal", "author": "Goldratt", "description": "Classic on manufacturing bottlenecks"}
        ]
    }'::jsonb,
    ARRAY['supply-chain', 'procurement', 'manufacturing'],
    ARRAY['Supply Chain Manager', 'VP Operations', 'Head of Procurement'],
    ARRAY['distributor', 'component', 'service']
);

-- Supply Chain Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000016',
    'Build Supply Chain Foundation',
    'Identify suppliers, establish procurement processes, and mitigate risks',
    'This objective guides you through establishing the supply chain for your product. You''ll identify and qualify suppliers, establish procurement processes, and build risk mitigation strategies.',
    'intermediate',
    '6-10 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Analyze BOM for supply chain risks",
            "description": "Review bill of materials:\n\n**Risk Analysis:**\n- Lead time analysis (flag >8 weeks)\n- Single-source identification\n- Cost concentration (top 10 items)\n- Obsolescence risk\n\n**Categorization:**\n- Strategic (high value, high risk)\n- Critical (production-stopping)\n- Commodity (easily sourced)\n\n**Deliverable:** BOM risk analysis and mitigation plan.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Identify and qualify key suppliers",
            "description": "Build supplier base:\n\n**For Strategic Components:**\n- Identify 2+ potential suppliers\n- Request quotes and capabilities\n- Evaluate quality and reliability\n- Negotiate terms\n\n**Qualification:**\n- Sample evaluation\n- Financial assessment\n- Quality system review\n\n**Deliverable:** Approved vendor list for key components.",
            "role": "Apprentice",
            "estimated_hours": 40,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Establish procurement processes",
            "description": "Create procurement infrastructure:\n\n**Processes:**\n- Purchase order workflow\n- Receiving and inspection\n- Inventory management\n- Supplier performance tracking\n\n**Systems:**\n- ERP or procurement software\n- Inventory tracking\n- Supplier portal (if needed)\n\n**Deliverable:** Procurement process documentation.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find supply chain expert on marketplace",
            "description": "Engage a supply chain specialist:\n\n**Expertise Areas:**\n- Strategic sourcing\n- Supplier negotiation\n- Risk management\n- Cost reduction\n\n**Deliverable:** Expert supply chain review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["supply-chain", "manufacturing"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source component suppliers via marketplace",
            "description": "Find component suppliers:\n\n**Components:**\n- Electronics distributors\n- Mechanical component suppliers\n- Custom part manufacturers\n- Raw material suppliers\n\n**Deliverable:** Additional supplier options evaluated.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["manufacturing", "electronics", "component"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);
