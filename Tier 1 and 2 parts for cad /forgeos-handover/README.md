# ForgeOS Agent Pipeline — Cursor Handover Package

## How to Use This

1. Copy this entire folder into your ForgeOS project root
2. Open the project in Cursor
3. Paste `CLAUDE.md` into your project root (or merge with existing CLAUDE.md)
4. Open each phase file and paste the ENTIRE file content into Cursor's chat (Cmd+L)
5. Do them in order. Each builds on the previous.

## Phase Order

| # | File | What It Builds | Effort | Verify |
|---|------|---------------|--------|--------|
| 1 | `PHASE_1_AGENT_GATEWAY.md` | Gateway server, agent base class, registry, orchestrator, 3 agents | 1-2 days | `pytest backend/tests/test_phase1.py -v` |
| 2 | `PHASE_2_CONTEXT_MANAGER.md` | State compression, oscillation detection, dampening, audit trail | 1 day | `pytest backend/tests/test_phase2.py -v` |
| 3 | `PHASE_3_TRAJECTORY_SCORING.md` | Multi-factor scoring of pipeline runs | 1 day | `pytest backend/tests/test_phase3.py -v` |
| 4 | `PHASE_4_PREFIX_CACHING.md` | Prompt caching, variant exploration | 0.5-1 day | `pytest backend/tests/test_phase4.py -v` |

## What's Different About This Handover

- **`CLAUDE.md`** tells Cursor your existing project structure, tech stack, engineering constants, and coding standards
- **Every function body is complete** — no `...` placeholders, no "implement this"
- **Engineering constants are real** — material properties, load cases, safety factors from our actual drone pipeline work
- **Each phase has a verification script** — run pytest to confirm it works before moving on
- **Imports reference your actual project paths** — `backend.gateway.models`, `backend.agents.mass_properties`, etc.

## After All 4 Phases

Run the full test suite:
```bash
pytest backend/tests/ -v
```

Then test the server end-to-end:
```bash
uvicorn backend.gateway.server:app --reload --port 8001
curl -X POST http://localhost:8001/forge/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"params":{"motor_spacing_mm":220,"arm_width_mm":12,"arm_thickness_mm":3,"arm_fillet_radius_mm":2,"body_width_mm":36,"body_length_mm":40,"battery_x_offset_mm":0,"battery_z_offset_mm":-10,"motor_mount_hole_mm":2.2,"fc_mount_hole_mm":2.2,"weight_reduction_holes":true,"weight_reduction_hole_diameter_mm":8,"motor_max_thrust_g":600},"material":"petg"}'
```
