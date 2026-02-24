/**
 * @file page-knowledge.ts
 *
 * @description Per-page feature registry that gives AI specialists knowledge
 * of what the user can DO on each page -- not just what they're looking at.
 * This powers the specialist page guidance system: contextual walkthroughs,
 * "Guide me" mode, and proactive first-visit orientation.
 *
 * @related
 * - Screen context: src/contexts/screen-context.tsx
 * - Help content (static): src/lib/help-content.ts
 * - Route-specialist map: src/lib/route-specialist-map.ts
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PageFeature {
  /** Feature name (e.g. "Create Strategic Pillar") */
  name: string
  /** What it does, in plain language */
  description: string
  /** Where to find it in the UI (e.g. "Click the '+ Add Pillar' button in the top right") */
  howToAccess: string
  /** When a user should use this feature */
  whenToUse: string
}

export interface PageKnowledge {
  /** Route pattern this applies to (exact or prefix) */
  route: string
  /** Page title */
  title: string
  /** One-sentence purpose of this page */
  purpose: string
  /** Available features/actions on this page */
  features: PageFeature[]
  /** Recommended first steps for new users (ordered) */
  gettingStarted: string[]
  /** Common workflows that span multiple features */
  workflows: string[]
}

// ─── Page Knowledge Registry ────────────────────────────────────────────────

const PAGE_KNOWLEDGE: PageKnowledge[] = [
  {
    route: "/today",
    title: "Today (Daily Briefing)",
    purpose: "Your morning command center -- see what matters today, catch risks early, and build momentum with quick wins.",
    features: [
      {
        name: "Morning Briefing",
        description: "AI-generated narrative summarizing your day -- priorities, risks, and wins.",
        howToAccess: "It loads automatically at the top of the page when you arrive.",
        whenToUse: "Check this first thing each morning to orient your day.",
      },
      {
        name: "Focus Tasks",
        description: "Your highest-priority tasks for today, surfaced by AI based on due dates, blockers, and strategic alignment.",
        howToAccess: "Scroll to the 'Focus' section below the briefing narrative.",
        whenToUse: "When deciding what to work on next.",
      },
      {
        name: "Risk Radar",
        description: "Blockers, overdue items, and at-risk objectives that need attention.",
        howToAccess: "Scroll to the 'Risks & Blockers' section.",
        whenToUse: "When you want to catch problems before they escalate.",
      },
      {
        name: "Quick Wins",
        description: "Small, fast tasks you can knock out to build momentum.",
        howToAccess: "Scroll to the 'Quick Wins' section.",
        whenToUse: "When you have 15 minutes and want to make progress.",
      },
      {
        name: "Strategy Health",
        description: "At-a-glance view of how your strategic pillars are performing.",
        howToAccess: "Scroll to the 'Strategy Health' section at the bottom.",
        whenToUse: "For a quick pulse check on strategic progress.",
      },
      {
        name: "Ask a Specialist",
        description: "Get AI advisor input on anything visible on this page.",
        howToAccess: "Click the specialist avatar in the bottom-right corner, or the 'Ask' button next to any section.",
        whenToUse: "When you want advice on priorities, risks, or next steps.",
      },
    ],
    gettingStarted: [
      "Read the morning briefing narrative at the top -- it summarizes your day",
      "Review your focus tasks and decide what to tackle first",
      "Check the risk radar for anything that needs immediate attention",
      "Knock out a quick win or two to build momentum",
    ],
    workflows: [
      "Morning routine: Read briefing -> Review focus tasks -> Check risks -> Start working",
      "End-of-day review: Check what's still due -> Snooze or complete -> Plan tomorrow",
    ],
  },
  {
    route: "/strategy",
    title: "Strategy Dashboard",
    purpose: "Define your company's strategic direction with pillars, milestones, and health tracking -- the foundation everything else aligns to.",
    features: [
      {
        name: "Define Company Purpose",
        description: "Set your company's 'why' -- the foundation that all strategic pillars align to.",
        howToAccess: "Click 'Define Purpose' in the header area (appears if no purpose is set yet).",
        whenToUse: "First thing -- before creating any strategic pillars.",
      },
      {
        name: "Create Strategic Pillar",
        description: "Add a major strategic focus area (e.g. 'Product-Market Fit', 'Revenue Growth').",
        howToAccess: "Click the '+ Add Pillar' or '+ New Goal' button in the top-right area.",
        whenToUse: "When defining or expanding your strategic framework. Aim for 2-5 pillars.",
      },
      {
        name: "Add Milestones",
        description: "Break a pillar into measurable milestones with target dates.",
        howToAccess: "Click on a pillar card, then use 'Add Milestone' inside the pillar detail view.",
        whenToUse: "After creating a pillar -- milestones make strategy actionable.",
      },
      {
        name: "Health Check",
        description: "AI-powered analysis of how each pillar is performing based on linked objectives and tasks.",
        howToAccess: "Click the health indicator (colored dot) on any pillar card.",
        whenToUse: "During weekly or quarterly reviews to assess strategic progress.",
      },
      {
        name: "Export Strategy",
        description: "Export your strategy as a document to share with stakeholders or investors.",
        howToAccess: "Click the 'Export' button in the page header.",
        whenToUse: "When preparing for board meetings, investor updates, or team alignment sessions.",
      },
      {
        name: "Import from Transcript",
        description: "Extract strategic goals from a meeting transcript or document.",
        howToAccess: "Click 'Import' in the page header and paste your transcript.",
        whenToUse: "After a strategy session or board meeting -- let AI extract the goals.",
      },
      {
        name: "Auto-Generate Milestones",
        description: "Let AI suggest milestones for a strategic pillar based on its description.",
        howToAccess: "Open a pillar, then click 'Auto-generate milestones'.",
        whenToUse: "When you've defined a pillar but aren't sure how to break it down.",
      },
      {
        name: "Ask Sage (Strategy Specialist)",
        description: "Get strategic advice from your AI strategy advisor.",
        howToAccess: "Click the specialist avatar (Sage) in the bottom-right corner.",
        whenToUse: "When you need help with positioning, competitive analysis, or strategic decisions.",
      },
    ],
    gettingStarted: [
      "Define your company purpose first -- it's the foundation everything aligns to",
      "Create 2-3 strategic pillars that support your purpose",
      "Add milestones under each pillar to make strategy actionable",
      "Run a health check to see where you stand",
    ],
    workflows: [
      "Strategy setup: Define purpose -> Create pillars -> Add milestones -> Link objectives",
      "Quarterly review: Run health checks -> Export strategy -> Review with team -> Adjust pillars",
      "Post-meeting: Import transcript -> Review extracted goals -> Create pillars from suggestions",
    ],
  },
  {
    route: "/new-objectives",
    title: "Objectives Board",
    purpose: "Set and track organizational goals with measurable key results -- connect tasks to objectives for automatic progress tracking.",
    features: [
      {
        name: "Create Objective",
        description: "Define a goal with a title, description, timeframe, and measurable key results.",
        howToAccess: "Click the '+ New Objective' button in the top-right, or press 'N'.",
        whenToUse: "When setting quarterly goals, team targets, or project milestones.",
      },
      {
        name: "Link to Strategic Goal",
        description: "Connect an objective to a strategic pillar for alignment tracking.",
        howToAccess: "When creating or editing an objective, use the 'Strategic Goal' dropdown.",
        whenToUse: "Always -- every objective should trace back to a strategic pillar.",
      },
      {
        name: "Track Progress",
        description: "View progress bars, completion rates, and health indicators for each objective.",
        howToAccess: "Progress is shown on each objective card. Click a card for detailed breakdown.",
        whenToUse: "During weekly check-ins or when assessing team performance.",
      },
      {
        name: "Filter & Sort",
        description: "Filter objectives by status, owner, strategic goal, or health.",
        howToAccess: "Use the filter controls at the top of the objectives list.",
        whenToUse: "When you have many objectives and need to focus on a subset.",
      },
      {
        name: "AI Strategic Planner",
        description: "Get AI help breaking down an objective into tasks and milestones.",
        howToAccess: "Click on an objective, then use the 'AI Planner' or 'Break down' option.",
        whenToUse: "When you have a goal but aren't sure how to achieve it.",
      },
    ],
    gettingStarted: [
      "Create your first objective -- start with something achievable this quarter",
      "Link it to a strategic pillar so it connects to the bigger picture",
      "Add 2-3 key results that define what success looks like",
      "Create tasks under the objective to make it actionable",
    ],
    workflows: [
      "Goal setting: Create objective -> Link to strategy -> Define key results -> Assign tasks",
      "Progress review: Filter by status -> Check health indicators -> Address at-risk items",
    ],
  },
  {
    route: "/new-tasks",
    title: "Tasks",
    purpose: "Create, assign, and track work items across your team -- the execution layer that drives objectives forward.",
    features: [
      {
        name: "Create Task",
        description: "Add a new task with title, description, due date, priority, and assignee.",
        howToAccess: "Click '+ New Task' in the top-right, or press 'N' for quick-add.",
        whenToUse: "When there's work to be done -- capture it immediately so nothing falls through.",
      },
      {
        name: "Task Workflow",
        description: "Tasks follow: Pending -> Accepted -> In Progress -> Done. Team members accept before starting.",
        howToAccess: "Click the status badge on any task to advance it through the workflow.",
        whenToUse: "As you progress through work -- update status to keep the team informed.",
      },
      {
        name: "Filter & Views",
        description: "Filter by assignee, status, due date, priority, or objective. Switch between list and board views.",
        howToAccess: "Use the filter bar at the top. View toggle is in the top-right.",
        whenToUse: "When you need to find specific tasks or see work from a particular angle.",
      },
      {
        name: "Link to Objective",
        description: "Connect a task to an objective so completing it automatically updates objective progress.",
        howToAccess: "When creating or editing a task, use the 'Objective' dropdown.",
        whenToUse: "Always -- linked tasks drive automatic progress tracking.",
      },
      {
        name: "Bulk Actions",
        description: "Select multiple tasks to reassign, change status, or update priority in batch.",
        howToAccess: "Use the checkboxes on task rows, then the bulk action bar that appears.",
        whenToUse: "During weekly planning or when reorganizing work across the team.",
      },
      {
        name: "Ask Cal (Chief of Staff)",
        description: "Get help prioritizing, planning, or organizing your task list.",
        howToAccess: "Click the specialist avatar (Cal) in the bottom-right corner.",
        whenToUse: "When overwhelmed with tasks and need help prioritizing.",
      },
    ],
    gettingStarted: [
      "Create a task for your most important piece of work right now",
      "Link it to an objective so progress is tracked automatically",
      "Assign it to yourself or a team member",
      "Use filters to keep your view focused on what matters",
    ],
    workflows: [
      "Daily execution: Filter 'My Tasks' -> Sort by due date -> Work top-down -> Update status",
      "Weekly planning: Review all tasks -> Reassign as needed -> Set priorities -> Check objective alignment",
    ],
  },
  {
    route: "/team",
    title: "Team",
    purpose: "Manage your foundry members, roles, and organizational structure -- see who's doing what and invite new collaborators.",
    features: [
      {
        name: "Invite Team Member",
        description: "Send an email invitation to add someone to your foundry.",
        howToAccess: "Click the '+ Invite' button in the page header.",
        whenToUse: "When you need to bring someone new onto the team.",
      },
      {
        name: "Manage Roles",
        description: "Assign roles: Founder (full control), Executive (approvals), or Apprentice (contributor).",
        howToAccess: "Click on a team member's card, then use the role dropdown.",
        whenToUse: "When onboarding new members or adjusting permissions.",
      },
      {
        name: "View Workload",
        description: "See how tasks and objectives are distributed across team members.",
        howToAccess: "Each member card shows their active task count and objective assignments.",
        whenToUse: "During planning to balance workload and avoid bottlenecks.",
      },
      {
        name: "AI Specialists",
        description: "Your team of 13 AI specialists -- each covers a different business function.",
        howToAccess: "Navigate to the 'Specialists' tab or click 'Specialists' in the sidebar.",
        whenToUse: "When you need expert advice on strategy, finance, marketing, engineering, etc.",
      },
    ],
    gettingStarted: [
      "Review your current team members and their roles",
      "Invite key collaborators who need access to the foundry",
      "Explore the AI specialists -- they're like having a full C-suite on demand",
    ],
    workflows: [
      "Team expansion: Invite member -> Assign role -> Brief them on objectives -> Assign first tasks",
    ],
  },
  {
    route: "/marketplace",
    title: "Marketplace",
    purpose: "Find and engage experts, suppliers, and service providers -- from manufacturing partners to consultants.",
    features: [
      {
        name: "Browse Listings",
        description: "Explore available services, experts, and suppliers organized by category.",
        howToAccess: "Scroll through the marketplace grid or use category tabs.",
        whenToUse: "When exploring what's available or looking for inspiration.",
      },
      {
        name: "Smart Search",
        description: "Describe what you need in natural language and let AI find the best matches.",
        howToAccess: "Use the search bar at the top of the page, or press Cmd+K.",
        whenToUse: "When you know what you need but not which provider to use.",
      },
      {
        name: "Create RFQ",
        description: "Send a Request for Quote to multiple suppliers to compare proposals.",
        howToAccess: "Click 'Create RFQ' in the header or from a supplier's profile.",
        whenToUse: "When you need competitive quotes for manufacturing, services, or materials.",
      },
      {
        name: "Book a Service",
        description: "Schedule a consultation, audit, or engagement directly with a provider.",
        howToAccess: "Click 'Book' on any service listing.",
        whenToUse: "When you've found the right provider and want to engage them.",
      },
    ],
    gettingStarted: [
      "Use Smart Search to describe what you need -- AI will find matches",
      "Browse categories to see what types of services are available",
      "Save interesting providers to your favorites for later",
    ],
    workflows: [
      "Procurement: Smart Search -> Compare providers -> Create RFQ -> Review proposals -> Book service",
    ],
  },
  {
    route: "/agents",
    title: "Specialists Hub",
    purpose: "Meet your team of 13 AI specialists -- each brings deep expertise in a different business function, from strategy to legal.",
    features: [
      {
        name: "Brief a Specialist",
        description: "Start a conversation with any specialist to get expert advice on their domain.",
        howToAccess: "Click 'Brief' on any specialist card.",
        whenToUse: "When you need advice on strategy, finance, marketing, engineering, or any business function.",
      },
      {
        name: "Team Meeting",
        description: "Bring multiple specialists together to discuss a topic from different angles.",
        howToAccess: "Click 'Plan a Team Project' at the top of the page.",
        whenToUse: "When a decision needs input from multiple perspectives (e.g. pricing needs strategy + finance + sales).",
      },
      {
        name: "Conversation History",
        description: "Review past conversations with any specialist -- they remember everything.",
        howToAccess: "Open a specialist's brief dialog -- history loads automatically.",
        whenToUse: "When you want to pick up where you left off or reference past advice.",
      },
    ],
    gettingStarted: [
      "Start with Sage (Strategy) -- they'll help you define direction and recommend who to talk to next",
      "Each specialist remembers your past conversations and builds on them",
      "Try a Team Meeting when you need multiple perspectives on one topic",
    ],
    workflows: [
      "Getting started: Brief Sage -> Follow specialist recommendations -> Build relationships over time",
      "Decision making: Brief relevant specialist -> Get recommendation -> Call a Team Meeting for multiple perspectives -> Decide",
    ],
  },
  {
    route: "/the-forge",
    title: "The Forge",
    purpose: "Turn product ideas into manufacturing-ready packages -- from concept capture through CAD design to supplier documentation.",
    features: [
      {
        name: "Start New Design",
        description: "Begin a new product concept by describing what you want to build.",
        howToAccess: "Click '+ New Design' in the top-right corner.",
        whenToUse: "When you have a product idea you want to develop.",
      },
      {
        name: "CAD Lab",
        description: "Create parametric 3D designs using CadQuery. AI assists with geometry generation.",
        howToAccess: "Open a design project, then click 'Open in CAD Lab'.",
        whenToUse: "When you're ready to turn a concept into a 3D model.",
      },
      {
        name: "Component Library",
        description: "Browse 1,000+ pre-built parametric components with specs and pricing.",
        howToAccess: "Click 'Component Library' in the Forge navigation.",
        whenToUse: "When looking for standard parts to include in your design.",
      },
      {
        name: "Assembly Builder",
        description: "Combine components into assemblies with defined relationships.",
        howToAccess: "Click 'Assembly Builder' in the Forge navigation.",
        whenToUse: "When building a product from multiple components.",
      },
      {
        name: "Engineering Pipeline",
        description: "Track designs through Research -> Build -> Analysis -> Procurement -> Review.",
        howToAccess: "The pipeline stages are shown on each project card.",
        whenToUse: "To understand where each design is in the development process.",
      },
    ],
    gettingStarted: [
      "Click '+ New Design' and describe what you want to build",
      "The AI pipeline will research, generate CAD, and analyze your design",
      "Browse the Component Library for standard parts you can use",
    ],
    workflows: [
      "Product development: New Design -> AI Research -> CAD Lab -> Analysis -> Procurement -> Review",
      "Quick prototype: Component Library -> Assembly Builder -> Export for manufacturing",
    ],
  },
  {
    route: "/the-forge/cad-lab",
    title: "The Forge — Concept Stage",
    purpose: "Capture your product idea, run background research, and decompose into sub-assemblies with concept illustrations.",
    features: [
      {
        name: "Describe Product",
        description: "Enter a product description to kick off the research and decomposition pipeline.",
        howToAccess: "Type your product idea in the input field at the top of the page.",
        whenToUse: "When starting a new product concept from scratch.",
      },
      {
        name: "Research Product",
        description: "Run background research to gather specs, standards, and manufacturing context.",
        howToAccess: "Click 'Research' after entering your product description, or it triggers automatically.",
        whenToUse: "As the first step after describing your product.",
      },
      {
        name: "Map Sub-Assemblies",
        description: "Decompose the product into manufacturable modules with concept illustrations.",
        howToAccess: "Click 'Map sub-assemblies' after research completes.",
        whenToUse: "After research is complete -- this identifies the key building blocks.",
      },
      {
        name: "Edit Subject",
        description: "Rename or refine the product subject line.",
        howToAccess: "Click the product name heading to edit it inline.",
        whenToUse: "When you want to clarify or rename the product.",
      },
      {
        name: "Re-Research",
        description: "Re-run the research pipeline with updated context.",
        howToAccess: "Click 'Re-Research' in the heading area.",
        whenToUse: "When you've changed the subject or want updated research.",
      },
    ],
    gettingStarted: [
      "Describe your product in the input field",
      "Click Research to gather specs and manufacturing context",
      "Click 'Map sub-assemblies' to decompose into modules",
      "Review concept illustrations, then continue to Build",
    ],
    workflows: [
      "New product: Describe product -> Research -> Map sub-assemblies -> Review concepts -> Continue to Build",
    ],
  },
  {
    route: "/the-forge/cad-lab/build",
    title: "The Forge — Build Stage",
    purpose: "Generate parametric CAD for each sub-assembly with dimension planning, DFM analysis, and manufacturing context.",
    features: [
      {
        name: "Generate Single Module",
        description: "Generate parametric CAD code and 3D model for one specific module.",
        howToAccess: "Click 'Generate' on any module in the module breakdown list.",
        whenToUse: "When you want to test one module before committing to a full batch.",
      },
      {
        name: "Generate All Modules",
        description: "Batch-generate CAD for all modules with live progress tracking.",
        howToAccess: "Click 'Generate All Modules' in the sticky action bar or module breakdown.",
        whenToUse: "When you're ready to build all modules -- takes 2-5 minutes.",
      },
      {
        name: "Edit Design Brief",
        description: "Set manufacturing process, material, tolerance, and compliance preferences.",
        howToAccess: "Open the 'Mfg Context' section in the page navigation.",
        whenToUse: "Before generating -- these parameters guide CAD generation.",
      },
      {
        name: "View CAD Results",
        description: "Interactive 3D viewer, SVG projections, metrics, and DFM analysis per module.",
        howToAccess: "Click on any generated module to expand its results.",
        whenToUse: "After generation -- review geometry, dimensions, and manufacturing feasibility.",
      },
      {
        name: "Download STEP/STL",
        description: "Download manufacturing-ready STEP and STL files for each module or all at once.",
        howToAccess: "Use the download buttons on individual modules or 'Download All' when all are complete.",
        whenToUse: "When sending files to a factory or loading into external CAD software.",
      },
      {
        name: "View DFM Analysis",
        description: "Per-module design-for-manufacturing analysis with printability, issues, and compatible processes.",
        howToAccess: "Expand a generated module and scroll to the DFM section.",
        whenToUse: "To check if your design is manufacturable before sending to suppliers.",
      },
      {
        name: "Generate Integration Assembly",
        description: "Combine all module STLs into a single integrated assembly model.",
        howToAccess: "The integration section appears at the top when all modules are generated.",
        whenToUse: "After all modules are built -- see how they fit together.",
      },
    ],
    gettingStarted: [
      "Review the research report carried forward from Concept",
      "Fill in the design brief (manufacturing process, material, tolerances)",
      "Click 'Generate All Modules' to batch-build CAD",
      "Review results, DFM analysis, and download files",
    ],
    workflows: [
      "Full build: Review research -> Set design brief -> Generate all -> Review DFM -> Download STEP/STL -> Continue to Review",
      "Iterative build: Generate one module -> Check DFM -> Adjust brief -> Generate rest",
    ],
  },
  {
    route: "/the-forge/cad-lab/review",
    title: "The Forge — Review Stage",
    purpose: "Supplier-ready engineering package with documentation, DFM analysis, diagnostics, supply chain matching, cost estimates, and contracting.",
    features: [
      {
        name: "Review Engineering Package",
        description: "Quality scorecard and per-module summary of the complete engineering output.",
        howToAccess: "The Review section loads at the top of the page.",
        whenToUse: "First thing -- get an overview of the engineering quality.",
      },
      {
        name: "DFM Analysis Dashboard",
        description: "Consolidated manufacturing grade, risk register, and issue breakdown across all modules.",
        howToAccess: "Scroll to or click 'DFM' in the section navigation.",
        whenToUse: "To understand manufacturing risks before talking to suppliers.",
      },
      {
        name: "Diagnostics Questionnaire",
        description: "Six-category engineering questionnaire (process, material, tolerance, finish, batch, environment) per module.",
        howToAccess: "Scroll to or click 'Diagnostics' in the section navigation.",
        whenToUse: "To capture manufacturing requirements that inform supplier matching and cost.",
      },
      {
        name: "Supply Chain Matching",
        description: "Per-module supplier specifications based on engineering requirements and diagnostics.",
        howToAccess: "Scroll to or click 'Supply Chain' in the section navigation.",
        whenToUse: "When ready to identify potential manufacturing partners.",
      },
      {
        name: "Cost Estimate",
        description: "Tooling and per-unit cost breakdown based on modules, processes, and quantities.",
        howToAccess: "Scroll to or click 'Cost' in the section navigation.",
        whenToUse: "For budgeting and comparing manufacturing approaches.",
      },
      {
        name: "Drawing Exports",
        description: "Export engineering packages as JSON, Markdown, or CSV for sharing.",
        howToAccess: "Scroll to or click 'Exports' in the section navigation.",
        whenToUse: "When sharing the engineering package with stakeholders or external tools.",
      },
      {
        name: "Expert Matching",
        description: "Recommended engineering disciplines and specialist profiles based on module requirements.",
        howToAccess: "Scroll to or click 'Experts' in the section navigation.",
        whenToUse: "When you need to hire or consult with specific engineering experts.",
      },
      {
        name: "Factory Conversation Guide",
        description: "Structured guide for what to discuss with suppliers, organized by topic.",
        howToAccess: "Scroll to or click 'Factory' in the section navigation.",
        whenToUse: "Before your first call with a factory -- know what to ask.",
      },
      {
        name: "RFQ / SOW / NDA Generation",
        description: "Generate procurement documents (Request for Quote, Statement of Work, NDA) from your engineering package.",
        howToAccess: "Scroll to or click 'Contracts' in the section navigation.",
        whenToUse: "When ready to formally engage suppliers.",
      },
    ],
    gettingStarted: [
      "Review the engineering package quality scorecard",
      "Fill in diagnostics questionnaires for each module",
      "Check DFM issues and resolve critical ones",
      "Match suppliers via the Supply Chain section",
      "Generate an RFQ to send to potential manufacturers",
    ],
    workflows: [
      "Supplier engagement: Review package -> Fill diagnostics -> Check DFM -> Match suppliers -> Generate RFQ -> Send to factories",
      "Internal review: Review package -> Export as Markdown -> Share with team -> Collect feedback",
    ],
  },
  {
    route: "/messages",
    title: "Messages",
    purpose: "Team communication with context -- conversations linked to tasks, objectives, and decisions so nothing gets lost.",
    features: [
      {
        name: "Send Message",
        description: "Send a message to your team in a channel or direct conversation.",
        howToAccess: "Type in the message input at the bottom of any conversation.",
        whenToUse: "When you need to communicate with your team about work.",
      },
      {
        name: "@Mentions",
        description: "Tag specific team members to notify them and draw their attention.",
        howToAccess: "Type '@' followed by a team member's name in the message input.",
        whenToUse: "When you need a specific person's input or want to assign follow-up.",
      },
      {
        name: "Context Attachments",
        description: "Link tasks, objectives, or files to messages for traceable conversations.",
        howToAccess: "Click the attachment icon in the message input toolbar.",
        whenToUse: "When discussing specific work items -- keeps conversations connected to action.",
      },
    ],
    gettingStarted: [
      "Start a conversation with your team about a current priority",
      "Use @mentions to loop in specific people",
      "Attach relevant tasks or objectives to keep conversations actionable",
    ],
    workflows: [
      "Decision discussion: Start thread -> @mention stakeholders -> Attach context -> Reach decision -> Create tasks",
    ],
  },
  {
    route: "/settings",
    title: "Settings",
    purpose: "Configure your account, company, billing, AI preferences, and integrations.",
    features: [
      {
        name: "Company Settings",
        description: "Set your foundry name, logo, industry, and organizational details.",
        howToAccess: "Click 'Company' in the settings sidebar.",
        whenToUse: "When setting up your foundry or updating company information.",
      },
      {
        name: "Billing & Plans",
        description: "Manage your subscription, payment methods, and view invoices.",
        howToAccess: "Click 'Billing' in the settings sidebar.",
        whenToUse: "When upgrading your plan or managing payments.",
      },
      {
        name: "AI Intelligence",
        description: "Configure how AI specialists behave — model preferences and data permissions.",
        howToAccess: "Click 'Intelligence' in the settings sidebar.",
        whenToUse: "When you want to fine-tune AI behavior or manage data access.",
      },
    ],
    gettingStarted: [
      "Set up your company profile under Company settings",
      "Review your billing plan",
      "Configure AI intelligence preferences",
    ],
    workflows: [
      "Initial setup: Company details -> Billing plan -> Intelligence preferences -> Invite team",
    ],
  },
  {
    route: "/knowledge",
    title: "Knowledge Vault",
    purpose: "Store and organize institutional knowledge — documents, notes, and reference materials that specialists can draw on.",
    features: [
      {
        name: "Add Document",
        description: "Upload or create a knowledge document that specialists can reference.",
        howToAccess: "Click '+ Add' or '+ New Document' at the top of the page.",
        whenToUse: "When you have important information that should inform AI specialist responses.",
      },
      {
        name: "Search Knowledge",
        description: "Find specific documents or information across your knowledge base.",
        howToAccess: "Use the search bar at the top of the page.",
        whenToUse: "When looking for specific reference material or past decisions.",
      },
    ],
    gettingStarted: [
      "Add your first document — company context, product specs, or competitive analysis",
      "Specialists automatically reference knowledge vault content in their advice",
    ],
    workflows: [
      "Knowledge capture: Create document -> Tag with category -> Specialists reference it automatically",
    ],
  },
  {
    route: "/outreach",
    title: "Outreach Hub",
    purpose: "Plan and execute cold outreach campaigns — import prospects, generate personalized email sequences via Sal, review and copy.",
    features: [
      {
        name: "Create Campaign",
        description: "Set up a new outreach campaign with product context, ICP description, tone, and value propositions.",
        howToAccess: "Click 'New Campaign' in the top right, or press Cmd+N.",
        whenToUse: "When starting a new outreach initiative targeting a specific segment.",
      },
      {
        name: "Import Contacts",
        description: "Paste a CSV from LinkedIn Sales Navigator or any spreadsheet to bulk-import prospects.",
        howToAccess: "Open a campaign, go to the Contacts tab, click 'Import CSV'.",
        whenToUse: "When you have a list of prospects from LinkedIn or another source.",
      },
      {
        name: "Generate Email Sequences",
        description: "Sal creates personalized email sequences for each contact using campaign context and their details.",
        howToAccess: "Select contacts in the table, then click 'Generate Sequences'.",
        whenToUse: "After importing contacts — Sal will write personalized multi-email sequences.",
      },
      {
        name: "Review and Copy Emails",
        description: "Review generated emails, edit inline, copy subject/body to clipboard.",
        howToAccess: "Go to the Emails tab, expand a contact section, use the copy buttons.",
        whenToUse: "When ready to send — copy emails into your email client or outreach tool.",
      },
    ],
    gettingStarted: [
      "Create your first campaign with product context and ICP description",
      "Import contacts by pasting a CSV (First Name, Company required)",
      "Select contacts and generate email sequences",
      "Review emails in the Emails tab, edit if needed, then copy and send",
    ],
    workflows: [
      "Cold outreach: Create campaign -> Import contacts -> Generate sequences -> Review & copy -> Send",
    ],
  },
  {
    route: "/rfq",
    title: "Requests for Quotation",
    purpose: "Create and manage RFQs — send engineering packages to suppliers and compare quotes.",
    features: [
      {
        name: "Create RFQ",
        description: "Start a new request for quotation with specifications and requirements.",
        howToAccess: "Click '+ New RFQ' or 'Create RFQ' at the top of the page.",
        whenToUse: "When you have a design ready and need manufacturing quotes.",
      },
      {
        name: "Track Responses",
        description: "Monitor which suppliers have viewed and responded to your RFQs.",
        howToAccess: "Click on any RFQ card to see its status and responses.",
        whenToUse: "When following up on sent quotation requests.",
      },
    ],
    gettingStarted: [
      "Complete a design in The Forge first — RFQs are generated from engineering packages",
      "Create an RFQ and send it to relevant suppliers",
      "Compare responses and select a supplier",
    ],
    workflows: [
      "Procurement: Design in Forge -> Generate RFQ package -> Send to suppliers -> Compare quotes -> Award contract",
    ],
  },
  {
    route: "/retainers",
    title: "Retainers",
    purpose: "Manage ongoing service engagements — track hours, deliverables, and payments with retained providers.",
    features: [
      {
        name: "Create Retainer",
        description: "Set up a new ongoing service agreement with a provider.",
        howToAccess: "Click '+ New Retainer' at the top of the page.",
        whenToUse: "When engaging a provider for ongoing work rather than a one-off project.",
      },
      {
        name: "Track Time",
        description: "Log and review hours against retainer agreements.",
        howToAccess: "Click on a retainer, then use the timesheet tab.",
        whenToUse: "When reviewing provider utilization or approving timesheets.",
      },
    ],
    gettingStarted: [
      "Find a provider in the marketplace",
      "Set up a retainer with scope, hours, and terms",
      "Track progress via the timesheet",
    ],
    workflows: [
      "Retainer lifecycle: Find provider -> Create retainer -> Track work -> Review timesheets -> Renew or close",
    ],
  },
  {
    route: "/updates",
    title: "Activity Feed",
    purpose: "See what's happening across your foundry — recent changes, completions, and team activity in chronological order.",
    features: [
      {
        name: "View Activity",
        description: "Browse recent changes across tasks, objectives, and team actions.",
        howToAccess: "Activity loads automatically, newest first.",
        whenToUse: "When you want to catch up on what happened while you were away.",
      },
    ],
    gettingStarted: [
      "Scroll through to see what your team has been working on",
      "Click any activity item to jump to the related task or objective",
    ],
    workflows: [
      "Catch-up: Review activity feed -> Click items needing attention -> Take action",
    ],
  },
  {
    route: "/pitch-prep",
    title: "Pitch Prep",
    purpose: "Prepare investor pitches — build your narrative, rehearse with AI, and refine your deck.",
    features: [
      {
        name: "Create Pitch",
        description: "Start a new pitch preparation with audience, narrative arc, and key messages.",
        howToAccess: "Click '+ New Pitch' or 'Create Pitch' at the top.",
        whenToUse: "When preparing for an investor meeting, demo day, or stakeholder presentation.",
      },
      {
        name: "AI Rehearsal",
        description: "Practice your pitch with an AI that asks tough questions investors would ask.",
        howToAccess: "Open a pitch, then click 'Rehearse' or 'Practice'.",
        whenToUse: "Before your actual presentation to build confidence and anticipate questions.",
      },
    ],
    gettingStarted: [
      "Create a pitch with your target audience in mind",
      "Let AI help structure your narrative",
      "Rehearse with the AI investor to prepare for tough questions",
    ],
    workflows: [
      "Pitch prep: Create pitch -> Define narrative -> Build deck -> AI rehearsal -> Refine -> Present",
    ],
  },
]

// ─── Lookup Functions ───────────────────────────────────────────────────────

/**
 * Returns page knowledge for a given route.
 *
 * @description Checks exact match first, then longest prefix match.
 * Returns undefined if no knowledge is registered for the route.
 *
 * @param pathname - Current route (e.g. "/strategy", "/the-forge/cad-lab")
 * @returns Page knowledge or undefined
 */
export function getPageKnowledge(pathname: string): PageKnowledge | undefined {
  const normalized = pathname.replace(/\/$/, "") || "/"

  // Exact match
  const exact = PAGE_KNOWLEDGE.find((pk) => pk.route === normalized)
  if (exact) return exact

  // Prefix match (longest first)
  const prefixMatches = PAGE_KNOWLEDGE.filter((pk) =>
    normalized.startsWith(pk.route),
  )
  if (prefixMatches.length > 0) {
    return prefixMatches.reduce((a, b) =>
      a.route.length >= b.route.length ? a : b,
    )
  }

  return undefined
}

/**
 * Serializes page knowledge into a markdown block for AI system prompts.
 *
 * @description Formats features, getting started steps, and workflows
 * into a structured markdown block that specialists can reference
 * when guiding users through a page.
 *
 * @param knowledge - Page knowledge to serialize
 * @returns Markdown string for injection into system prompts
 */
export function serializePageKnowledge(knowledge: PageKnowledge): string {
  const lines: string[] = []

  lines.push(`### Available Actions on This Page`)
  lines.push("")

  for (const feature of knowledge.features) {
    lines.push(`- **${feature.name}**: ${feature.description}`)
    lines.push(`  - *How:* ${feature.howToAccess}`)
    lines.push(`  - *When:* ${feature.whenToUse}`)
  }

  if (knowledge.gettingStarted.length > 0) {
    lines.push("")
    lines.push(`### Getting Started (Recommended Steps)`)
    knowledge.gettingStarted.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`)
    })
  }

  if (knowledge.workflows.length > 0) {
    lines.push("")
    lines.push(`### Common Workflows`)
    for (const workflow of knowledge.workflows) {
      lines.push(`- ${workflow}`)
    }
  }

  lines.push("")
  lines.push(
    "If the user asks about this page's features or how to do something, guide them step-by-step using the information above. Be specific about where to click and what to expect.",
  )

  return lines.join("\n")
}
