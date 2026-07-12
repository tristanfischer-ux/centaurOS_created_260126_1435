# Yuri Wet-Lab Master Prompt — Repository Reconciliation

**Date:** 2026-07-12  
**Source:** `~/Downloads/FORGEANVIL_YURI_MASTER_MEGA_PROMPT.md`  
**Status:** Audit and implementation plan complete; source retrieval not yet authorised.

## 1. Prepared package reviewed

The Downloads work package contains:

- `FORGEANVIL_YURI_MASTER_MEGA_PROMPT.md`
- `Yuri_Wet_Science_Benchmark_Library/`
  - 7 public black-box briefs
  - 7 hidden gold-standard source lists
  - 7 evaluation checklists
  - common scoring rubric
  - reference freeze checklist
  - source manifest
  - retrieval script
  - cycle log template

The benchmark ladder is:

1. IO Rodeo Open Colorimeter
2. NinjaPCR
3. Poseidon syringe pump/microscope
4. OpenFlexure Microscope
5. Pioreactor 20 mL
6. IO Rodeo Rodeostat
7. OpenDrop V4

## 2. Critical discovery: catalogue present, source payload absent

The local benchmark library contains 28 catalogue/brief/evaluation files.

It does **not** currently contain:

- the 11 frozen source repositories;
- the three paper downloads;
- CAD/PCB/Gerber/firmware payloads;
- static BOM exports;
- archived web documentation;
- physical-reference photographs or test results.

`~/Downloads/Yuri_Wet_Science_Reference_Sources` does not exist.

The repository retrieval script is prepared at:

```text
~/Downloads/Yuri_Wet_Science_Benchmark_Library/fetch_all_sources.sh
```

The master prompt says local references are read-only and must not be
redownloaded unless incomplete and the user explicitly authorises retrieval.
The package is incomplete, but this review does not itself constitute download
authorisation.

## 3. Existing ForgeOS/Anvil architecture to reuse

### Programme/project root

Use:

- `cad_lab_projects` as the live engineering project root;
- `pdf_engine_runs` for Anvil design/benchmark iterations;
- `objectives`, `tasks` and `review_gates` for human execution/sign-off.

Do not create an unrelated fourth project/programme framework.

### Requirements

Use:

- immutable founder brief / `founder_raw_brief`;
- chain `parsedBrief.constraints`;
- engineering contract quantities/closures;
- brief constraint completeness audit;
- report-compiler requirement/claim/evidence normalisers where useful.

Do not manually duplicate every requirement into a second editable source of
truth.

### Validation

Use:

- Anvil chain gates;
- existing `gate_verdicts` schema for platform persistence;
- `review_gates` for human acceptance;
- `feasibility_verdict` and accepted-risk mechanisms.

Do not create another independent gate system.

### Files, parsing and storage

Reuse:

- Supabase private storage patterns;
- existing reference-document upload security/quota checks;
- PDF/Office/text extraction;
- STEP/STL/DXF parsers;
- `pipeline_runs` progress/heartbeat model;
- SHA-256/content-addressed patterns from CAD/spec ingest;
- CAD DB-first growing-library architecture.

### The Well

`docs/THE-WELL-ANVIL-PLAN.md` and the `CLAUDE.md` awareness hook already exist.

Binding rule:

- The Well is an offline calibration/validation corpus.
- No ML surrogate enters the authoritative sizing path.
- No full dataset download in the Yuri first phase.
- No `torch`/The Well dependencies in the chain `.venv`.

## 4. Gaps that are genuinely new

The repository lacks:

1. mixed local-folder reference discovery;
2. a queryable reference-device registry;
3. a queryable reference-artifact registry with SHA-256/licence/provenance;
4. a capability-evidence matrix linking claims to artifacts;
5. a Yuri programme status/read model;
6. a Yuri reference architecture report;
7. a minimal Yuri UI/API surface;
8. a complete PCB/Gerber ingestion path (prototype only today).

## 5. Recommended first vertical slice

### Reference device

Use **IO Rodeo Open Colorimeter** first.

Reasons:

- first official benchmark;
- bounded difficulty;
- one primary repository;
- permissive CC BY 4.0/MIT licensing;
- clear capability: optical absorbance/calibration/cuvette handling;
- smallest end-to-end proof of discovery, hashing, evidence and reporting.

This is the first infrastructure/reference slice. It is not the final Yuri
Bench Demonstrator, which later combines dosing, incubation and imaging.

### Complete slice

One user-visible flow:

```text
Yuri project
  -> discover frozen Open Colorimeter source
  -> read-only classify/hash artifacts
  -> persist device/artifact evidence
  -> build optical-absorbance capability matrix
  -> seed evidence-backed requirements/risks/decisions
  -> generate reference architecture report
  -> show programme/reference status in Forge V2
```

### Minimal persistence delta

Use `cad_lab_projects` as root. Add only missing trace entities:

```text
cad_lab_reference_devices
cad_lab_reference_artifacts
cad_lab_capability_evidence
```

Each table is project/foundry scoped with RLS.

Do not add a generic `programmes` table in this slice.

### Ingestion V0

Implement a reusable local CLI/worker:

```text
discover
  -> extension/MIME classification
  -> SHA-256
  -> duplicate check
  -> licence detection
  -> read-only metadata/text extraction
  -> private object-storage copy
  -> DB artifact record
  -> progress + failure record
```

V0 formats:

- Markdown/text/source;
- JSON/YAML/CSV;
- PDF embedded text;
- STEP/STL/DXF metadata;
- KiCad schematic/PCB identification.

Gerber electrical verification remains deferred and must not be claimed.

### Initial UI

Extend the existing Forge V2 project surface with one Yuri page showing:

- current phase;
- reference devices;
- artifact counts/status;
- missing expected artifacts;
- capability matrix;
- open requirements/risks/decisions;
- generated report link.

Use existing design-system components.

## 6. Benchmark integrity

The public brief is the only input provided to the engine during a benchmark.

Hidden until review:

- frozen source repository;
- gold-standard source list;
- evaluation checklist.

Every cycle records:

- engine/brief/prompt versions;
- artifact hash;
- weighted rubric scores;
- defect severities;
- fixed/new/regressed findings;
- deliverable completeness;
- reviewer closure.

A benchmark passes only when three independent reviewers agree that 20
engineering units could be built without fundamental redesign.

## 7. Required pre-implementation retrieval

After explicit authorisation:

```bash
cd ~/Downloads/Yuri_Wet_Science_Benchmark_Library
./fetch_all_sources.sh \
  ~/Downloads/Yuri_Wet_Science_Reference_Sources
```

Then:

1. verify every frozen revision;
2. preserve all licences;
3. generate SHA-256 manifests;
4. export live BOM sheets to static CSV/PDF;
5. archive drifting web documentation;
6. set `YURI_REFERENCE_ROOT`;
7. ingest only `01_open_colorimeter` for V0.

Do not commit downloaded source trees.

## 8. Implementation sequence

1. Retrieve/freeze Open Colorimeter source.
2. Add trace tables and RLS.
3. Build discovery/hash/classification unit tests.
4. Implement dry-run local discovery.
5. Implement object-storage/DB ingest.
6. Build device summary and capability evidence.
7. Initialise Yuri `cad_lab_project`.
8. Seed evidence-backed product concept, requirements, subsystems, decisions and risks.
9. Generate `projects/yuri/YURI_REFERENCE_ARCHITECTURE_REPORT.md`.
10. Add API/actions and minimal Forge V2 page.
11. Update agent awareness docs with concise links.
12. Run full tests and write `YURI_IMPLEMENTATION_REPORT.md`.

## 9. Explicit deferrals

- Full The Well download/integration
- ML surrogate sizing
- Clinical claims
- Flight-qualified design
- Full orbital architecture
- All seven devices in one ingestion run
- Complete PCB electrical verification
- Physical biological/pathogen workflow definition

## 10. Decision required

The next step requires permission to run the prepared retrieval script because
the benchmark payloads are not currently local.

Recommended authorisation:

> Retrieve the frozen Yuri wet-science reference repositories and papers into
> `~/Downloads/Yuri_Wet_Science_Reference_Sources`, preserving revisions,
> submodules and licences. Do not commit them.
