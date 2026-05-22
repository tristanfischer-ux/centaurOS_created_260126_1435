/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 */

// Tools (auto-register on import). Overnight push 2026-05-22:
// CoolProp + PyBaMM are now REAL wrappers (subprocess to Python via the
// repo's .venv). 4 other tools remain stubs pending real wrappers.
import './tools/pybamm-real'        // Build #18f
import './tools/coolprop-real'      // Build #18e
import './tools/ngspice-stub'
import './tools/pandapower-stub'
import './tools/octopart-stub'
import './tools/iec-standards-stub'

// Class plans (auto-register on import)
import './class-plans/bess'
