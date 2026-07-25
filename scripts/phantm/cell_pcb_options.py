"""PHANTM — hex-cell + PCB/drive options ledgers (Tristan 25 Jul: same
kill/keep treatment as the actuator; every option on the record with numbers).

CELL side — deterministic sensitivities from the validated §9 physics:
  fc sensitivity 17.3 MHz per µm of interior across-flats (fc/a);
  band edge f_edge = sqrt(fc² + (c/2d)²) for usable travel d;
  skin depth 0.25 µm at 70 GHz (plate ≥10×);
  wall thickness is NOT an RF dimension (pitch/mass only).

PCB side — part counts and fit at the 3.25 mm pitch from §9.5 + the campaign's
drive-scheme requirement (reverse current in the cancel coil).

Run: ~/.venvs/phantm/bin/python cell_pcb_options.py
  → out/opt/CELL-OPTIONS.md + PCB-OPTIONS.md (+ .json each)
"""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "out", "opt")
C0, FC = 299.792458, 53.556          # mm·GHz, computed cell cutoff
SENS_MHZ_PER_UM = 17.3


def f_edge(d_mm):
    return math.sqrt(FC**2 + (C0 / (2 * d_mm))**2)


# ============================ CELL OPTIONS ==================================
cell = []


def crow(option, family, numbers, verdict, why):
    cell.append(dict(option=option, family=family, numbers=numbers,
                     verdict=verdict, why=why))


# fabrication routes (from §9.6 research, scored with the §9 sensitivities)
crow("3D print (micro-SLA/PµSL) + electroless Cu 3–5 µm + flash",
     "fabrication", "tolerance ±10–25 µm ⇒ fc scatter ±0.17–0.43 GHz; roughness 1–10 µm vs 0.25 µm skin depth (loss tax unless smoothed); ≈$50–300/tile",
     "PASS (prototype)", "Tony's existing route + one plating step; fastest learning loop; loss budget is Vlad's gate")
crow("Electroforming (Cu on dissolvable mandrel)",
     "fabrication", "±5 µm ⇒ fc scatter ±0.09 GHz; conductivity solved by construction; $$$/slow",
     "PASS (pilot/reference)", "reference-grade RF truth; the calibration standard the cheap routes are judged against")
crow("Wire-EDM from solid aluminium", "fabrication",
     "±5–10 µm; surface Ra ≈0.2–0.8 µm; per-cell cutting time scales badly",
     "viable (pilot only)", "excellent parts, wrong economics beyond tens of tiles")
crow("Injection mould, walls AT 150 µm × 7.75 mm deep", "fabrication",
     "aspect 52:1 vs thin-wall limit ≈15–30:1", "KILL",
     "not mouldable as drawn — the aspect ratio is the wall, not the tooling vendor")
crow("Injection mould, TWO half-depth tiles (≈26:1) bonded, then plated", "fabrication",
     "standard thin-wall class; bond seam mid-wall (RF: seam ⊥ currents at the wall mid-height — Vlad check); tooling £30–80k, sub-£2/tile at 100k+",
     "KEEP (volume route)", "the automotive-radar playbook adapted; the seam is the one open RF question")
crow("Injection mould with walls thickened to 0.25–0.30 mm (single-piece)", "fabrication",
     "aspect 26–31:1 (marginal-to-OK); pitch grows 3.25 → 3.35–3.40 mm; interior 3.10 UNCHANGED (fc unchanged); lattice mass +65–95%",
     "KEEP (volume alternative)", "wall thickness is not an RF dimension — the manufacturer may thicken walls for free RF-wise; array pitch is Vlad's call")
crow("Commodity aerospace Al honeycomb (3.175 mm cell, 18–50 µm foil)", "fabrication",
     "cell size right; corrugated double-wall geometry ≠ Tony's uniform hexagon; £100/slice",
     "viable (bench experiment only)", "answers 'how does a real metal lattice behave' in a week; never the product")
crow("Fine-blank/stamped lattice from strip", "fabrication",
     "155 µm slots at 7.75 mm depth unreachable by blanking (it is a 2D process)", "KILL",
     "wrong process class for a deep lattice — kept on record so nobody re-proposes it")

# geometry options
for tol, cls in ((10, "electroform/EDM class"), (25, "good print class"), (50, "loose print class")):
    sc = tol * SENS_MHZ_PER_UM / 1000
    v = "PASS" if tol <= 25 else "KILL"
    why = ("fc scatter comfortably inside the 57.5–90 GHz band margin" if tol <= 25 else
           "±0.87 GHz eats the band-edge margin near 60 GHz operation — reject at the spec level")
    crow(f"interior tolerance ±{tol} µm ({cls})", "geometry",
         f"fc scatter ±{sc:.2f} GHz (17.3 MHz/µm)", v, why)
for d in (6.9, 8.2, 9.3):
    lab = {6.9: "7.75 mm depth (as drawn; usable ≈6.9)",
           8.2: "9.0 mm depth (usable ≈8.2)",
           9.3: "10.0 mm depth (usable ≈9.3)"}[d]
    crow(lab, "geometry", f"full-2π band edge ≈{f_edge(d):.1f} GHz", "PASS" if d == 6.9 else "KEEP (option)",
         "as-drawn covers 60–90 GHz" if d == 6.9 else
         "deeper cell + LONGER TRANSLATOR pushes the band edge down — the low-band lever (campaign: depth alone is not enough, stroke must grow too)")
crow("metallisation <2.5 µm Cu", "plating", "<10 skin depths at 70 GHz", "KILL",
     "conductor loss rises measurably below ~10δ — floor the spec at 3 µm")
crow("metallisation 3–5 µm Cu + Ni/Au flash", "plating", "≥12δ + corrosion barrier", "PASS",
     "the spec: RF-thick, outdoor-capable")

cell_counts = {}
for r in cell:
    cell_counts[r["verdict"].split()[0]] = cell_counts.get(r["verdict"].split()[0], 0) + 1
lines = ["# HEX-CELL OPTIONS LEDGER — fabrication, geometry, plating (kills on the record)",
         "", f"{len(cell)} options: " + ", ".join(f"{v} {k}" for k, v in sorted(cell_counts.items())) + ".", "",
         "| Option | Family | Numbers | VERDICT | Why |", "|---|---|---|---|---|"]
lines += [f"| {r['option']} | {r['family']} | {r['numbers']} | **{r['verdict']}** | {r['why']} |" for r in cell]
open(os.path.join(OUT, "CELL-OPTIONS.md"), "w").write("\n".join(lines) + "\n")
json.dump(dict(counts=cell_counts, rows=cell), open(os.path.join(OUT, "cell-options.json"), "w"), indent=1)

# ============================ PCB / DRIVE OPTIONS ============================
pcb = []


def prow(option, numbers, verdict, why):
    pcb.append(dict(option=option, numbers=numbers, verdict=verdict, why=why))


prow("Matrix select: 3 shared full-H phase rails + dual select-FET per cell",
     "48 select FETs + 3 bridges per tile",
     "KILL (council, gemini-3.1)", "a dual FET cannot block a bipolar rail — body diodes cross-feed deselected coils")
prow("Unipolar: 1 low-side FET + clamp per coil, direction by phase sequence",
     "72 FETs/tile; fits 3.25 mm pitch in 1 mm DFN",
     "KILL for the optimised sets / PASS for the original 5 g design",
     "the campaign's dual pull-and-cancel step needs REVERSE current in the cancel coil — unipolar cannot deliver it; remains the cheapest correct answer if Tony ships the original detent")
prow("Full H-bridge per coil", "4 switches × 72 = 288 switches/tile (or 72 driver ICs); fits with both-side placement",
     "PASS ★ (prototype)", "unconditionally correct for every drive scheme incl. dual ±5 A; driver-IC variant is the fastest bring-up")
prow("Complementary half-bridge per coil + split mid-rail return",
     "144 switches + one bipolar rail pair; coil common to mid-rail",
     "KEEP (volume candidate)", "halves the switch count vs full-H; needs the ±rail design and careful return-current routing — quantify in the electronics pass")
prow("Phase-pair H-bridges (bridge per PHASE, cells time-multiplexed)",
     "6 bridges + per-cell disconnects/tile",
     "KILL", "same body-diode blocking problem as matrix select once rails are bipolar — dies for the same reason, recorded so it is not reinvented")
prow("Per-coil integrated driver IC (DRV-class H-bridge)",
     "72 ICs/tile ≈ $25–35 prototype BOM",
     "PASS (prototype alternative)", "identical topology to full-H discrete, faster to lay out; volume cost favours discretes")
prow("Rail: DAC-set buck 0.8–2.1 V (rail = current control)",
     "±3.35 A ⇒ 1.07 V step context; needs burst-rated VRM-class buck",
     "KEEP", "survives the campaign; with H-bridges the DAC rail sets |I| and the bridge sets sign")
prow("Rail: fixed 5 V + per-coil PWM current chop", "chop into 0.6 µH at ≥1 MHz for <20% ripple",
     "KILL", "τ = 1.1 µs makes PWM into the bare coil impractical at sane frequencies — the resistive-rail insight stands")
prow("Single-board HDI (drivers in-cell, no stack)", "3 driver sites + routing per 9.15 mm² cell + Ø2.6 hole",
     "KILL", "does not fit even both-sides once H-bridges are required; the two-board stack stays")
prow("Two-board stack: aperture board (holes+FETs) + driver board (buck+MCU)",
     "board-to-board at tile perimeter",
     "PASS", "unchanged by the topology change; the aperture board now carries bridge halves or driver ICs")
prow("DEMAG GATE on the cancel coil (sol, council5): reverse MMF across the cancelled pole's NdFeB",
     "−3.35/−5 A across the magnet's recoil line; N52 has the least Hcj margin",
     "OPEN GATE — blocks freezing the dual scheme",
     "temperature-dependent demagnetisation FE required before ANY dual-drive set ships; if it fails, fall back to higher-current single-coil or the original detent")

pcb_counts = {}
for r in pcb:
    pcb_counts[r["verdict"].split()[0]] = pcb_counts.get(r["verdict"].split()[0], 0) + 1
lines = ["# PCB / DRIVE OPTIONS LEDGER — topologies, rails, boards (kills on the record)",
         "", f"{len(pcb)} options: " + ", ".join(f"{v} {k}" for k, v in sorted(pcb_counts.items())) + ".", "",
         "| Option | Numbers | VERDICT | Why |", "|---|---|---|---|"]
lines += [f"| {r['option']} | {r['numbers']} | **{r['verdict']}** | {r['why']} |" for r in pcb]
open(os.path.join(OUT, "PCB-OPTIONS.md"), "w").write("\n".join(lines) + "\n")
json.dump(dict(counts=pcb_counts, rows=pcb), open(os.path.join(OUT, "pcb-options.json"), "w"), indent=1)
print(f"cell: {len(cell)} options {cell_counts}; pcb: {len(pcb)} options {pcb_counts}")
