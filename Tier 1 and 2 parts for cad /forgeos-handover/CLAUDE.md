# ForgeOS — Agent Pipeline Architecture Extension

## What ForgeOS Is

ForgeOS converts natural language product ideas into ready-to-manufacture hardware packages. The MVP is a drone configurator that outputs 3D-printable STL files, validated electronics BOMs, and assembly instructions.

## Existing Architecture

### Tech Stack
- **Backend:** Python FastAPI (async), CadQuery + OpenCascade for parametric CAD, Trimesh + NumPy for mesh ops
- **Database:** Supabase (PostgreSQL + Auth + Storage), JSONB for flexible schemas
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Frontend:** React + TypeScript + Three.js + Tailwind (not relevant for this work)

### Existing Project Structure
```
forgeos/
├── CLAUDE.md
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI entry, CORS configured
│   │   ├── config.py                  # Pydantic settings from .env
│   │   ├── api/
│   │   │   ├── configurator.py        # POST /configure endpoint
│   │   │   └── components.py          # Component CRUD
│   │   ├── cad/
│   │   │   └── frame_plate.py         # CadQuery parametric frame generator
│   │   ├── compatibility/
│   │   │   └── engine.py              # 5-class validation engine
│   │   ├── models/
│   │   │   └── component.py           # Pydantic schemas
│   │   ├── services/
│   │   └── tests/
│   │       └── test_compat.py
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── docs/
```

### Existing Engineering Pipeline (currently monolithic)
The generative engineering loop currently runs as chained Python function calls:
1. `parse_requirements()` — NL → structured DroneRequirements
2. `generate_frame()` — CadQuery geometry from parameters
3. `compute_mass_properties()` — CG, MOI, total mass
4. `analyze_structure()` — cantilever beam stress analysis
5. `check_dfm()` — 3D printing manufacturability validation
6. `reinforce_if_needed()` / `fix_dfm_issues()` — automatic fixes
7. Convergence controller loops stages 2-6

These are in `forgeos-pipeline/` as standalone scripts. This work refactors them into a proper agent-based architecture.

### Existing Material Database
```python
MATERIALS = {
    "pla":     {"density": 1.24, "yield_mpa": 50,  "E_mpa": 3500, "max_temp_c": 60,  "layer_adhesion": 0.65, "min_wall_mm": 0.8, "min_feature_mm": 0.4, "max_overhang_deg": 45},
    "petg":    {"density": 1.27, "yield_mpa": 50,  "E_mpa": 2100, "max_temp_c": 80,  "layer_adhesion": 0.75, "min_wall_mm": 0.8, "min_feature_mm": 0.5, "max_overhang_deg": 40},
    "abs":     {"density": 1.04, "yield_mpa": 40,  "E_mpa": 2300, "max_temp_c": 100, "layer_adhesion": 0.70, "min_wall_mm": 1.0, "min_feature_mm": 0.5, "max_overhang_deg": 40},
    "nylon":   {"density": 1.14, "yield_mpa": 70,  "E_mpa": 1700, "max_temp_c": 180, "layer_adhesion": 0.80, "min_wall_mm": 1.0, "min_feature_mm": 0.6, "max_overhang_deg": 35},
    "cf_petg": {"density": 1.30, "yield_mpa": 65,  "E_mpa": 4500, "max_temp_c": 85,  "layer_adhesion": 0.60, "min_wall_mm": 1.0, "min_feature_mm": 0.6, "max_overhang_deg": 45},
    "tpu":     {"density": 1.21, "yield_mpa": 26,  "E_mpa": 26,   "max_temp_c": 80,  "layer_adhesion": 0.85, "min_wall_mm": 1.2, "min_feature_mm": 0.8, "max_overhang_deg": 35},
}
```

### Existing Structural Analysis Logic
Arms are modeled as rectangular cantilever beams. Load cases:
- Hover: AUW/4 per arm
- Max thrust: 2× hover
- Landing impact: 3g deceleration
- Dynamic maneuver: sqrt(4+1)g combined

Stress: σ = M/S where M = F×L, S = bh²/6
Deflection: δ = FL³/(3EI) where I = bh³/12
Effective yield = material_yield × layer_adhesion_factor
Safety factor = effective_yield / bending_stress

### Existing DFM Checks
- Wall thickness vs material minimum
- Overhang angle analysis (faces needing support)
- Small feature detection
- Print time estimation: volume_cm3 / (layer_height × print_speed × width) × 1.3
- Material cost: volume × density × price_per_kg / 1000

### Convergence Controller Thresholds
- Safety factor target: ≥ 2.0 (acceptable ≥ 1.5)
- CG offset target: < 2mm from thrust center
- DFM: zero critical issues
- Mass: within 10% of target
- Oscillation dampening: 50% correction factor
- Max iterations: 15

## Coding Standards

- Python 3.11+, type hints on everything
- Pydantic v2 for all models (BaseModel, not dataclass for API-facing)
- FastAPI with async throughout
- pytest for tests, pytest-asyncio for async tests
- Conventional commits: `feat:`, `fix:`, `test:`, `refactor:`
- Every module has a docstring explaining what it does
- Engineering constants documented with units in comments
- No `print()` — use Python logging module

## What We're Building

Four phases that refactor the monolithic pipeline into a modular agent architecture. Each phase is in its own file in this directory. Do them in order.

## Environment Variables
```
SUPABASE_URL=
SUPABASE_KEY=
ANTHROPIC_API_KEY=
FORGEOS_MAX_ITERATIONS=15
FORGEOS_CONVERGENCE_THRESHOLD=0.01
FORGEOS_DAMPENING_FACTOR=0.5
FORGEOS_DEFAULT_MATERIAL=petg
```
