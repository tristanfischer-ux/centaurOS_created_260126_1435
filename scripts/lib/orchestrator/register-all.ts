/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 */

// Tools (auto-register on import). Build #18e (overnight push 2026-05-22):
// CoolProp is now the REAL wrapper (subprocess to Python CoolProp 7.2.0
// via the repo's .venv). Other tools remain stubs pending real wrappers.
import './tools/pybamm-stub'
import './tools/coolprop-real'
import './tools/ngspice-stub'
import './tools/pandapower-stub'
import './tools/octopart-stub'
import './tools/iec-standards-stub'

// Class plans (auto-register on import)
import './class-plans/bess'
