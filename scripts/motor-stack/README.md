# Motor-stack simulation smoke tests

## OpenFOAM status on Apple silicon

OpenFOAM is running through a native ARM64 Linux container. This avoids slow
x86 emulation and is the practical macOS path for computational fluid dynamics
(CFD) and conjugate heat-transfer work.

- Container runtime: Colima 0.10.3, installed with Homebrew
- Docker engine in Colima: 29.5.2, `aarch64`
- OpenFOAM image: `microfluidica/openfoam:14`
- Pulled digest:
  `sha256:efba53ae22dc5154114a9dd346c979b3cd7f3e20ebed90e399230c02592aecbf`

The headless OpenFOAM 14 cavity tutorial completed on 30 July 2026:

- mesh generation completed;
- 2,000 velocity solves were recorded;
- the initial x-velocity residual fell from `1` to `3.32735e-05`;
- result time `10` contained a non-empty `U` velocity field.

Run the repeatable check with:

```bash
scripts/motor-stack/openfoam_smoke_selftest.sh
```

The script uses native `blockMesh` and solver commands if they are already in
the shell. Otherwise it verifies Docker, the image, the residual decrease, and
the generated velocity field. Missing prerequisites produce a direct install
or start command and a non-zero exit.

## Fresh Mac setup

```bash
brew install colima
colima start --cpu 2 --memory 4 --disk 10 --vm-type vz --mount-type virtiofs
docker pull --platform linux/arm64 microfluidica/openfoam:14
scripts/motor-stack/openfoam_smoke_selftest.sh
```

OpenFOAM Foundation also documents a Canonical Multipass installation for
macOS, but the container route is smaller and now proven in this workspace.

## Electromagnetic status on Apple silicon

The headless electromagnetic path is also proven natively:

- Python: 3.12.12 in the isolated `.venv-motor`
- Pyleecan: 1.5.2, pinned to source revision
  `7937d675fb77701ac8f2c65816b583cb29270e12`
- xfemm `femmcli`: `0.0.0-dev`, native Mach-O ARM64
- xfemm mesher: built-in Triangle 1.6.0
- training machine: licensed Pyleecan `IPMSM_B` with 48 stator slots, eight
  rotor poles, 16 buried V-magnet regions and 0.75 mm mechanical air gap

Run the repeatable proof from the repository root:

```bash
.venv-motor/bin/python scripts/motor-stack/em_magnetic_selftest.py --selftest
```

The 30 July 2026 proof loaded the Pyleecan machine, generated its exact
one-pole anti-periodic finite-element sector, applied the source M400-50A
nonlinear B-H curve and 1.24 T magnet remanence, and solved it with native
xfemm. Sample open-circuit air-gap results were:

- peak flux density: `0.796173 T`
- root-mean-square flux density: `0.593026 T`
- mean flux-density magnitude: `0.504830 T`

The self-test also reruns the identical model with magnet remanence reduced by
one million. Its peak falls to `6.12e-08 T`, proving the headline result is
field-solver output rather than a stored constant. All five checks must pass.

This is a toolchain smoke proof, not a torque map, demagnetisation study,
thermal correlation or dynamometer correlation. It changes no release state.

### FIA-bound Formula E front-kit case

The smoke command above proves that Pyleecan and xfemm work; it deliberately
does **not** represent the Formula E front kit. Run the twin-bound case instead
when producing front-powertrain evidence:

```bash
.venv-motor/bin/python scripts/motor-stack/em_fia_front_kit_case.py \
  --twin out/formula-e-front-mgu-20260729-1432
```

The FIA case selectively reads `orchestratorContract.quantities` and
`fpkConcentricGeometry` with `ijson`, so it does not load the large `state.json`
into memory. It builds a fresh direct-xfemm 48-slot/eight-pole twin-V
interior-permanent-magnet cross-section at the twin's controlled dimensions:
approximately 122 mm rotor outside diameter, 123.4/164.7 mm stator
inside/outside diameters, 0.7 mm radial air gap and 97.6 mm active length. The
licensed Pyleecan definition contributes only its nonlinear electrical-steel
B-H curve and neodymium-magnet material record; no Prius dimensions or
proprietary Lucid geometry enter the mesh.

The command performs one nonlinear open-circuit solve and one loaded
magnetostatic solve, then writes:

```text
out/formula-e-front-mgu-20260729-1432/_motor_stack/em_fia_front_kit_case.json
```

That artefact binds its input hash to 250 kW front-regeneration duty, 750 V
direct-current bus within the assumed 600–900 V window, 19,500 rpm, the
343×259×267 mm bay and the 32 kg soft whole-kit aspiration. The analytical
duty check estimates about 335 A rms phase current and 125 N·m required shaft
torque. The loaded solve applies that current at one assumed regenerative
q-axis angle (`Id = 0`, −90 electrical degrees) and one rotor position
(0 mechanical degrees).

The exact winding has not been frozen, so the model uses one effective
conductor per slot rather than inventing a production turn count. On the
30 July live twin this raised peak air-gap flux from about 0.283 T open-circuit
to 0.678 T loaded and returned −7.75 N·m from FEMM's weighted-stress integral.
The sign denotes the chosen regenerative direction. The magnitude is only a
solver-derived estimate: it does **not** demonstrate the required 125 N·m.
Series turns, winding factor, angle and rotor-position sweeps, voltage closure,
losses and demagnetisation still need to be solved. The artefact therefore
always keeps the torque map and dynamometer correlation `OPEN`, status
`PARTIAL`, and `ship_ok: false`.

Run the synthetic proveCatch separately:

```bash
.venv-motor/bin/python scripts/motor-stack/em_fia_front_kit_case.py --selftest
```

The self-test solves the synthetic FIA geometry open-circuit, loaded, and again
with magnet remanence reduced by one million. The reduced-remanence field must
collapse by at least five orders of magnitude, and the loaded case must return
finite flux and torque. These checks prove the headline values are
solver-derived. The test also proves that synthetic twin dimensions replace
the educational machine dimensions and that no code path can set `ship_ok`.

### Fresh Python setup

Pyleecan's full package metadata includes graphical-interface, visualization
and Windows-oriented pyFEMM dependencies. The native macOS solve instead uses
Pyleecan headlessly for controlled geometry and materials, then sends generated
Lua directly to xfemm. Install only that proven subset:

```bash
python3.12 -m venv .venv-motor
.venv-motor/bin/python -m pip install --upgrade pip setuptools
.venv-motor/bin/python -m pip install --no-deps \
  -r scripts/motor-stack/requirements-em-magnetic.txt
.venv-motor/bin/python scripts/motor-stack/em_magnetic_selftest.py --selftest
```

### Native xfemm solver

The tracked ARM64 binary is at `scripts/phantm/bin/femmcli`; it does not need
to be on `PATH`. Set `FEMMCLI=/absolute/path/to/femmcli` to test another build.
Verify the tracked binary with:

```bash
file scripts/phantm/bin/femmcli
scripts/phantm/bin/femmcli --version
```

If it must be rebuilt, use the source and portability notes already recorded
in `scripts/phantm/femm/runner.py`. There is no Homebrew `xfemm` formula on
Apple silicon as of this proof.

## ROSS rotor dynamics

ROSS (Rotordynamic Open-Source Software) 2.3.0 is installed in the isolated
Python 3.12 environment at `.venv-motor`. It is not installed in the design
chain's `.venv`.

The repeatable proof builds a 1.000 m steel shaft from four beam elements, adds
a central steel disk and two bearings, and asks ROSS to solve the damped
critical speeds:

```bash
.venv-motor/bin/python scripts/motor-stack/ross_rotor_selftest.py --selftest
```

On 30 July 2026, the first critical speed was:

- `229.846114 rad/s`;
- `36.581145 Hz`;
- `2,194.869 rpm`.

The check rejects missing, non-finite, or physically unreasonable results and
exits non-zero. To recreate the isolated environment:

```bash
/opt/homebrew/bin/python3.12 -m venv .venv-motor
.venv-motor/bin/python -m pip install --upgrade pip
.venv-motor/bin/python -m pip install ross-rotordynamics
```

### FIA-bound Formula E front-kit case

The smoke command above proves that ROSS works; it deliberately does **not**
represent the Formula E front kit. Run the twin-bound case instead when
producing front-powertrain rotor-dynamics evidence:

```bash
.venv-motor/bin/python scripts/motor-stack/ross_fia_front_kit_case.py \
  --twin out/formula-e-front-mgu-20260729-1432
```

The FIA case selectively reads `orchestratorContract.quantities` and
`fpkConcentricGeometry` with `ijson`, so it does not load the large `state.json`
into memory. It builds a simplified kit-sized beam model:

- solid steel shaft OD ≈ rotor bore (~92.7 mm);
- bearing span ≈ housing length (~141 mm);
- one midspan disk for laminated rotor + magnets (Ø~122 mm × stack length);
- two identical isotropic bearings with **assumed** stiffness/damping
  (5×10⁷ N/m, 5×10³ N·s/m) until a supplier catalogue replaces them.

It asks ROSS for the first damped critical speeds and compares them to the
~19,500 rpm operating band (subcritical screen wants first critical ≥
1.20 × operating). The artefact always keeps bearing identity and
modal/dynamometer correlation `OPEN`, status `PARTIAL`, and `ship_ok: false`.

```text
out/formula-e-front-mgu-20260729-1432/_motor_stack/ross_fia_front_kit_case.json
```

When that file exists, `scripts/fe-front-stamp-motor-multiphysics.py` promotes
the multiphysics `rotor_dynamics` check to **PARTIAL** (same honesty pattern as
the magnetic twin-bound case). Never treat PARTIAL as PASS; never set
`ship_ok` true without race / dyno evidence.

Run the synthetic proveCatch separately:

```bash
.venv-motor/bin/python scripts/motor-stack/ross_fia_front_kit_case.py --selftest
```

The self-test solves the synthetic FIA geometry twice. Stretching the bearing
span by 4× must drop the first critical by more than 40 %, proving the
headline rpm is solver-derived. It also proves that the synthetic twin
dimensions replace the generic 1 m smoke shaft and that no code path can set
`ship_ok`.

## CalculiX structural finite-element analysis

Homebrew does not currently provide a CalculiX formula. ForgeOS therefore uses
the Ubuntu 24.04 ARM64 package in a small local Linux container. This is native
on Apple silicon, not x86 emulation.

- CalculiX CrunchiX solver (`ccx`): 2.21
- Ubuntu package: `calculix-ccx=2.21-1`
- Local image: `forgeos/calculix:2.21-arm64`
- Image architecture: `linux/arm64`
- Image size after installation: 60,989,457 bytes

Build the solver image once:

```bash
docker build --platform linux/arm64 \
  -f scripts/motor-stack/calculix.Dockerfile \
  -t forgeos/calculix:2.21-arm64 \
  scripts/motor-stack
```

Then run the repeatable check:

```bash
scripts/motor-stack/calculix_smoke_selftest.sh
```

The check runs a loaded 1,000 × 100 × 100 mm steel cantilever solid. It requires
both displacement and stress fields in the CalculiX result files. The proven
result on 30 July 2026 was:

- maximum absolute displacement: `0.00483982 mm`;
- maximum absolute stress component: `8 MPa`;
- finite-element result database: `3,684 bytes`.

If a native `ccx` is later installed, the script uses it automatically.
Otherwise it verifies Docker and the local image, then prints the exact build
command when either is missing. Gmsh remains available for production meshes;
the smoke test deliberately uses a tiny hand-written mesh so it proves the
structural solver independently.

### FIA-bound Formula E front-kit rotor centrifugal screen

The smoke command above proves that CalculiX works; it deliberately does **not**
represent the Formula E front kit. Run the twin-bound case instead when producing
front-powertrain rotor-retention screening evidence:

```bash
.venv-motor/bin/python scripts/motor-stack/calculix_fia_rotor_screen.py \
  --twin out/formula-e-front-mgu-20260729-1432
```

The FIA case selectively reads `orchestratorContract.quantities` and
`fpkConcentricGeometry` with `ijson`. It builds a coarse C3D8 quarter-ring solid
from twin rotor ID→OD (≈92.7–122 mm) at 25 % of active length, applies
`*DLOAD CENTRIF` at ~19,500 rpm about the kit axis, and records max von Mises /
principal stress plus displacement. Material cards are **assumed isotropic
steel** (E = 210 GPa, ν = 0.30, ρ ≈ 7810 kg/m³, screening yield 355 MPa) —
not laminate stack, magnet pocket, or sleeve detail.

Work directories stay under `scripts/motor-stack/` so Colima can see them (macOS
`TMPDIR` under `/var/folders` is not mounted). Native `ccx` is preferred when
present; otherwise `forgeos/calculix:2.21-arm64`.

The artefact always keeps magnet-pocket burst FEA and release FoS `OPEN`,
status `PARTIAL`, and `ship_ok: false`. Screening FoS vs assumed yield is
informational only — never a closed release factor of safety.

```text
out/formula-e-front-mgu-20260729-1432/_motor_stack/calculix_fia_rotor_screen.json
```

When that file exists, `scripts/fe-front-stamp-motor-multiphysics.py` promotes
the multiphysics `structural` check to **PARTIAL** (same honesty pattern as the
magnetic and ROSS twin-bound cases).

Run the synthetic proveCatch separately:

```bash
.venv-motor/bin/python scripts/motor-stack/calculix_fia_rotor_screen.py --selftest
```

The self-test solves the synthetic FIA ring at 19,500 rpm and again at half
speed. Halving rpm must drop von Mises by more than 55 %, proving the headline
stress is solver-derived (ω² scaling). It also proves twin dimensions replace
the smoke cantilever and that no code path can set `ship_ok` or close release
FoS.
