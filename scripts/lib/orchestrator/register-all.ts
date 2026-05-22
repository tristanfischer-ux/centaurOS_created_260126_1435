/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 */

// Tools (auto-register on import). Overnight push 2026-05-22 final:
// 5 of 6 tools are now REAL wrappers (subprocess to Python via the
// repo's .venv). Octopart + IEC standards remain stubs (API key + scrape
// work not yet started).
import './tools/pybamm-real'         // Build #18f  PyBaMM 26.4.3
import './tools/coolprop-real'       // Build #18e  CoolProp 7.2.0
import './tools/pandapower-real'     // Build #18g  pandapower 3.4.0
import './tools/ngspice-real'        // Build #18h  ngspice 46 direct CLI
import './tools/opendss-real'        // Build #18i  OpenDSS 0.9.4
import './tools/cantera-real'        // Build #18j  Cantera 3.2.0
import './tools/octopart-stub'       // stub (needs API key)
import './tools/iec-standards-stub'  // stub (needs scrape or local DB)
// Also register opendss as an additional grid tool — pandapower covers
// transmission-side, opendss covers distribution-side. Together they
// give the full grid story.

// Class plans (auto-register on import)
import './class-plans/bess'
