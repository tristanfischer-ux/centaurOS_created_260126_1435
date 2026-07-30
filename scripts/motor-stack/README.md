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
