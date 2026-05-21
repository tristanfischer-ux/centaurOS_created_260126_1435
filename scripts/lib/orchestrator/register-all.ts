/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 *
 * Phase 2 will add real tool wrappers here. For now the only
 * registered tool is the PyBaMM stub.
 */

// Tools
import './tools/pybamm-stub'

// Class plans
import './class-plans/bess'
