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
