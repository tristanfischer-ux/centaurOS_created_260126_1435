/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 */

// Tools (auto-register on import)
import './tools/pybamm-stub'
import './tools/coolprop-stub'
import './tools/ngspice-stub'
import './tools/pandapower-stub'
import './tools/octopart-stub'
import './tools/iec-standards-stub'

// Class plans (auto-register on import)
import './class-plans/bess'
