# ForgeOS — Domain Pattern Library for Parametric Product Design

ForgeOS converts natural language product descriptions into manufacturable 3D geometry. This repository contains the **Domain Grammar engine** — structured knowledge modules that encode how experienced engineers design each product category.

## Quick Start

```bash
cd forgeos
pip install cadquery --break-system-packages
python -m pytest tests/ -v              # 27 tests, all passing
make build-all                           # builds all models to dist/
make viewer-assets                       # copies GLBs to viewer/ for preview
```

## Architecture

```
User: "5-inch FPV quad with 2306 motors"
  ↓ Level 1: AI → params       {prop_size: 5, motor: "2306"}
  ↓ Level 2: derive_skeleton()  pure math → {wheelbase: 200, arm_length: 100, ...}
  ↓ Level 3: build()            CadQuery → cq.Assembly with named parts
  ↓ Export:                      STEP / GLB / STL
```

The AI handles Level 1. Levels 2 and 3 are deterministic code.

## Project Structure

```
forgeos/
├── .cursorrules                 AI agent briefing (read this first)
├── Makefile                     test / build-all / viewer-assets / clean
├── pyproject.toml               dependencies + pytest config
├── core/
│   ├── grammar.py               Base classes: DomainGrammar, ParamSpec, Constraint
│   └── schema.py                JSON Schema / LLM tool def / UI control export
├── grammars/
│   ├── building.py              ✅ BIM house — 15 parts, 10 tests
│   ├── drone.py                 ✅ FPV quad — 18 parts, 10 tests
│   └── (enclosure.py)           🔲 Next — see docs/ARCHITECTURE.md §1
├── examples/
│   ├── house_v3.py              CLI: python examples/house_v3.py --format glb
│   └── drone_v1.py              CLI: python examples/drone_v1.py --format glb
├── tests/
│   ├── test_building_grammar.py 10 tests
│   ├── test_drone_grammar.py    10 tests
│   ├── test_integration.py      7 tests (cross-grammar, isolation, export)
│   └── test_schema.py           Schema generation tests
├── viewer/
│   └── index.html               Three.js viewer (model switcher, part list, explode)
└── docs/
    ├── ARCHITECTURE.md           Domain specs with formulas for unimplemented grammars
    └── GRAMMAR_AUTHORING.md      Step-by-step template for writing new grammars
```

## Working Examples

```bash
# House (12m × 3.7m, pitched roof, loft, windows, doors)
python examples/house_v3.py
python examples/house_v3.py --length 15000 --width 4000 --no-loft --format step glb stl

# Drone (5" FPV quad, 2207 motors, 30.5mm FC stack)
python examples/drone_v1.py
python examples/drone_v1.py --prop-size 3 --motor 1404 --format glb
```

## Writing a New Grammar

See `docs/GRAMMAR_AUTHORING.md` for the complete template. Short version:

1. Create `grammars/your_domain.py` — subclass `DomainGrammar`
2. Implement: `param_specs()`, `defaults()`, `derive_skeleton()`, `build()`, `constraints()`
3. Create `tests/test_your_domain_grammar.py` — minimum 5 tests
4. Register in `grammars/__init__.py`
5. Run `python -m pytest tests/ -v`

## Current Priorities

1. **Electronics Enclosure Grammar** — PCB-first box design (specs in ARCHITECTURE.md §1)
2. **Drone camera mount + battery pad** — missing features on existing grammar
3. **Web viewer with parameter sliders** — live rebuild via WebSocket
4. **Model Rocket Grammar** — axisymmetric stacking (specs in ARCHITECTURE.md §2)
