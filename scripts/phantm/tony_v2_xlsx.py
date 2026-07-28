"""PHANTM v2 — the worksheet as a LIVE Excel model, not a table of answers.

Every derived cell is a real formula referencing named input cells, so Tony can
change a dimension and watch the whole sheet move. That is the point: he asked
to be able to check the numbers personally, and a spreadsheet of pasted values
cannot be checked, only believed.

Design rules:
  - INPUTS are the only hard numbers, gathered on one sheet and colour-coded.
  - Every other cell is an "=" formula. No pasted results anywhere.
  - Formulas reference DEFINED NAMES, so they read like the algebra rather than
    like B7*C12 — e.g. =DETENT_G*M_t*g_accel.
  - Anything NOT reliably computable is marked as such rather than fudged: the
    finite-element force is an INPUT (it comes from a solver, not a formula),
    and it is flagged as withdrawn pending a converged model.

Run: ~/.venvs/phantm/bin/python tony_v2_xlsx.py -> out/PHANTM-TONY-V2-CALC.xlsx
"""

from __future__ import annotations

import json
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")     # amber = you may edit
CALC_FILL = PatternFill("solid", fgColor="E8F1FB")      # blue  = formula
WARN_FILL = PatternFill("solid", fgColor="FCE4E4")      # red   = not reliable
HEAD_FILL = PatternFill("solid", fgColor="1F3864")
HEAD_FONT = Font(color="FFFFFF", bold=True, size=11)
BOLD = Font(bold=True)
THIN = Side(style="thin", color="B0B0B0")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def header(ws, row, *cells):
    for i, txt in enumerate(cells, start=1):
        c = ws.cell(row=row, column=i, value=txt)
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = 28


def put(ws, row, label, value, unit="", note="", kind="calc", name=None,
        fmt=None):
    """One line: label | value/formula | unit | note. Returns the value cell."""
    ws.cell(row=row, column=1, value=label).alignment = Alignment(wrap_text=True)
    c = ws.cell(row=row, column=2, value=value)
    c.fill = {"input": INPUT_FILL, "calc": CALC_FILL,
              "warn": WARN_FILL}.get(kind, CALC_FILL)
    c.border = BOX
    c.font = BOLD if kind != "calc" else Font()
    if fmt:
        c.number_format = fmt
    ws.cell(row=row, column=3, value=unit)
    ws.cell(row=row, column=4, value=note).alignment = Alignment(wrap_text=True)
    if name:
        ws.parent.defined_names.add(
            DefinedName(name, attr_text=f"'{ws.title}'!$B${row}"))
    return c


def build():
    num = json.load(open(os.path.join(OUT, "tony-v2-numbers.json")))
    fe = json.load(open(os.path.join(OUT, "tony-v2-fe.json")))
    wb = Workbook()

    # ------------------------------------------------------------------ 1
    ws = wb.active
    ws.title = "1 INPUTS"
    ws.column_dimensions["A"].width = 46
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 10
    ws.column_dimensions["D"].width = 72
    header(ws, 1, "Input", "Value", "Unit", "Where it comes from")
    ws["A2"] = ("EVERY amber cell below is an input you can change. Every other "
                "sheet is formulas referencing these, so the whole workbook "
                "moves when you edit one.")
    ws["A2"].font = Font(italic=True)
    ws.merge_cells("A2:D2")

    r = 4
    ws.cell(row=r, column=1, value="TRANSLATOR").font = BOLD
    r += 1
    put(ws, r, "Teeth", 25, "-", "your drawing", "input", "N_teeth"); r += 1
    put(ws, r, "Slots", 24, "-", "teeth − 1", "input", "N_slots"); r += 1
    put(ws, r, "Tooth width", 125, "µm",
        "forced by the length closure: 25×125+24×187 = 7613 µm matches your "
        "stated 7.612 mm. The other assignment gives 7.675 and misses.",
        "input", "tooth_w"); r += 1
    put(ws, r, "Slot width", 187, "µm", "your drawing", "input", "slot_w"); r += 1
    put(ws, r, "Slot depth (each face)", 280, "µm", "your worksheet",
        "input", "slot_d"); r += 1
    put(ws, r, "Central core", 280, "µm", "your worksheet", "input", "core"); r += 1
    put(ws, r, "Transverse width L_y", 1200, "µm", "your worksheet",
        "input", "L_y"); r += 1
    put(ws, r, "Density (Fe-Co)", 8.12, "g/cm³", "your worksheet",
        "input", "rho_FeCo"); r += 1
    put(ws, r, "Detent multiple", 30, "× M_t·g", "your worksheet: F_d = 30·M_t·g",
        "input", "DETENT_G"); r += 1

    r += 1
    ws.cell(row=r, column=1, value="COIL AND DRIVE").font = BOLD
    r += 1
    put(ws, r, "Turns", 70, "-", "your correction (drawing shows 60)",
        "input", "N_turns"); r += 1
    put(ws, r, "Wire diameter (bare)", 40, "µm", "your drawing",
        "input", "d_bare"); r += 1
    put(ws, r, "Wire diameter (enamelled)", 48, "µm",
        "grade-2 class for 40 µm bare — change if your supplier differs",
        "input", "d_od"); r += 1
    put(ws, r, "Winding window length", 1521, "µm", "your drawing",
        "input", "window_len"); r += 1
    put(ws, r, "Wound limb width", 400, "µm",
        "the drawing's 400 µm window dimension — CHECK THIS, it is the least "
        "certain input and it drives the mean turn length and hence resistance",
        "input", "limb_w"); r += 1
    put(ws, r, "Supply rail", 5.0, "V", "your worksheet", "input", "V_rail"); r += 1
    put(ws, r, "Working gap", 60, "µm", "your drawing", "input", "gap"); r += 1
    put(ws, r, "Step rate", 10, "/s", "your worksheet", "input", "step_rate"); r += 1

    r += 1
    ws.cell(row=r, column=1, value="CONSTANTS").font = BOLD
    r += 1
    put(ws, r, "g", 9.80665, "m/s²", "", "input", "g_accel"); r += 1
    put(ws, r, "Copper resistivity at 20 °C", 1.72e-8, "Ω·m", "",
        "input", "rho_Cu"); r += 1
    put(ws, r, "Copper temperature coefficient", 0.00393, "/K",
        "resistance rises ~0.39 % per kelvin — this matters, see sheet 4",
        "input", "alpha_Cu"); r += 1
    put(ws, r, "Copper volumetric heat capacity", 3.45e6, "J/(m³·K)", "",
        "input", "C_cu"); r += 1

    # ------------------------------------------------------------------ 2
    ws2 = wb.create_sheet("2 MASS + TARGETS")
    for col, w in (("A", 46), ("B", 16), ("C", 10), ("D", 74)):
        ws2.column_dimensions[col].width = w
    header(ws2, 1, "Quantity", "Value", "Unit", "Formula, in words")
    r = 2
    put(ws2, r, "Tooth pitch", "=tooth_w+slot_w", "µm",
        "tooth + slot", name="pitch"); r += 1
    put(ws2, r, "Tooth duty", "=tooth_w/pitch", "-",
        "0.401 — which is, to three figures, the 0.40 our own duty sweep "
        "independently found optimal", name="duty", fmt="0.000"); r += 1
    put(ws2, r, "Length L_z", "=N_teeth*tooth_w+N_slots*slot_w", "µm",
        "CLOSURE CHECK: should equal your stated 7612 µm", name="L_z"); r += 1
    put(ws2, r, "Across-gap L_x", "=core+2*slot_d", "µm",
        "CLOSURE CHECK: should equal your stated 840 µm", name="L_x"); r += 1
    put(ws2, r, "Envelope volume", "=L_x*L_y*L_z/10^9", "mm³",
        "L_x × L_y × L_z, converted from µm³", name="V_env"); r += 1
    put(ws2, r, "Volume removed by slots",
        "=2*N_slots*slot_w*slot_d*L_y/10^9", "mm³",
        "2 faces × 24 slots × width × depth × transverse", name="V_slots"); r += 1
    put(ws2, r, "Solid volume", "=V_env-V_slots", "mm³", "", name="V_solid"); r += 1
    put(ws2, r, "Solid fraction", "=V_solid/V_env", "-", "", fmt="0.0%"); r += 1
    put(ws2, r, "MASS M_t", "=V_solid/1000*rho_FeCo", "g",
        "volume in cm³ × density", name="M_t", fmt="0.0000"); r += 1
    put(ws2, r, "Mass", "=M_t*1000", "mg", "", fmt="0.00"); r += 1
    put(ws2, r, "Weight", "=M_t/1000*g_accel*1000", "mN", "", name="W_t",
        fmt="0.000"); r += 1
    put(ws2, r, "DETENT TARGET F_d", "=DETENT_G*M_t/1000*g_accel*1000", "mN",
        "30 × M_t × g", name="F_d", fmt="0.00"); r += 1
    put(ws2, r, "Stepping force, 1.5 × F_d", "=1.5*F_d", "mN", "",
        name="F_step15", fmt="0.00"); r += 1
    put(ws2, r, "Stepping force, 2 × F_d", "=2*F_d", "mN", "", fmt="0.00"); r += 1
    put(ws2, r, "Step size (3 phases)", "=pitch/3", "µm",
        "third of a pitch", name="step_um", fmt="0.0"); r += 1

    # ------------------------------------------------------------------ 3
    ws3 = wb.create_sheet("3 COIL")
    for col, w in (("A", 46), ("B", 16), ("C", 10), ("D", 74)):
        ws3.column_dimensions[col].width = w
    header(ws3, 1, "Quantity", "Value", "Unit", "Formula, in words")
    r = 2
    put(ws3, r, "Turns per layer", "=INT(window_len/d_od)", "-",
        "window length ÷ enamelled diameter", name="turns_layer"); r += 1
    put(ws3, r, "Layers needed", "=ROUNDUP(N_turns/turns_layer,0)", "-", "",
        name="layers"); r += 1
    put(ws3, r, "Winding build", "=layers*d_od", "µm", "", name="build"); r += 1
    put(ws3, r, "Window capacity", "=turns_layer*layers", "-",
        "how many turns the window could hold at this gauge",
        name="cap_turns"); r += 1
    put(ws3, r, "Mean turn length", "=2*((limb_w+build)+(L_y+build))", "µm",
        "perimeter of the limb plus the winding build", name="l_turn"); r += 1
    put(ws3, r, "Wire length", "=N_turns*l_turn/1000", "mm", "",
        name="wire_len", fmt="0.0"); r += 1
    put(ws3, r, "Wire cross-section", "=PI()*(d_bare/2)^2/10^12", "m²", "",
        name="A_wire"); r += 1
    put(ws3, r, "RESISTANCE R_c", "=rho_Cu*(wire_len/1000)/A_wire", "Ω",
        "ρ × length ÷ area", name="R_c", fmt="0.000"); r += 1
    put(ws3, r, "Max current the rail can give (cold)", "=V_rail/R_c", "A",
        "V ÷ R — this is a CEILING, not a choice", name="I_max_cold",
        fmt="0.000"); r += 1
    put(ws3, r, "Volts per ampere-turn", "=rho_Cu*(l_turn/10^6)/A_wire", "V/At",
        "THE KEY IDENTITY: V = i·R = (N·i)·ρ·l_turn/A_wire, so for a required "
        "ampere-turn figure the TURN COUNT CANCELS. Only mean turn length and "
        "wire cross-section matter. More turns never helps; thicker wire does.",
        name="V_per_At", fmt="0.0000"); r += 1
    r += 1
    ws3.cell(row=r, column=1, value="WIRE GAUGE COMPARISON — change d_bare "
                                    "above to test one").font = BOLD
    r += 1
    header(ws3, r, "Bare diameter (µm)", "Volts per At", "Turns that fit "
           "(3 layers)", "Comment")
    r += 1
    for d in (40, 50, 63):
        ws3.cell(row=r, column=1, value=d)
        c = ws3.cell(row=r, column=2,
                     value=f"=rho_Cu*(l_turn/10^6)/(PI()*({d}/2)^2/10^12)")
        c.fill, c.number_format = CALC_FILL, "0.0000"
        c2 = ws3.cell(row=r, column=3, value=f"=INT(window_len/({d}*1.2))*3")
        c2.fill = CALC_FILL
        ws3.cell(row=r, column=4,
                 value=("the present choice — see sheet 4, it has no margin"
                        if d == 40 else
                        "fewer turns fit, so current must rise to keep the "
                        "ampere-turns — but the VOLTAGE falls, which is the point"))
        r += 1

    # ------------------------------------------------------------------ 4
    ws4 = wb.create_sheet("4 RAIL MARGIN")
    for col, w in (("A", 52), ("B", 16), ("C", 10), ("D", 74)):
        ws4.column_dimensions[col].width = w
    header(ws4, 1, "Quantity", "Value", "Unit", "Why it matters")
    ws4["A2"] = ("THIS SHEET IS THE MOST IMPORTANT ONE. It does not depend on "
                 "the finite-element model at all — it is Ohm's law and the "
                 "temperature coefficient of copper.")
    ws4["A2"].font = Font(italic=True, bold=True)
    ws4.merge_cells("A2:D2")
    r = 3
    put(ws4, r, "Planning current", 1.00, "A",
        "AMBER = edit me. Set this to whatever operating current you want to "
        "test. The finite-element force magnitude is withdrawn (see sheet 5), "
        "so this is a planning figure, not a result.",
        "input", "I_plan", fmt="0.00"); r += 1
    put(ws4, r, "Ampere-turns at that current", "=N_turns*I_plan", "At",
        "your 70 turns × 0.40 A = 28 At is the root of the force shortfall",
        name="At_plan", fmt="0.0"); r += 1
    put(ws4, r, "Volts needed", "=I_plan*R_c", "V", "", name="V_need",
        fmt="0.000"); r += 1
    put(ws4, r, "Rail ceiling, cold", "=I_max_cold", "A", "", fmt="0.000"); r += 1
    put(ws4, r, "Margin, cold", "=(I_max_cold-I_plan)/I_plan", "-",
        "how much headroom you have before the rail runs out", fmt="0.0%"); r += 1
    put(ws4, r, "Ohmic power during pulse", "=I_plan^2*R_c", "W", "",
        name="P_ohm", fmt="0.00"); r += 1
    put(ws4, r, "Copper volume", "=(wire_len/1000)*A_wire", "m³", "",
        name="V_cu"); r += 1
    put(ws4, r, "Pulse width", 1.0, "ms",
        "AMBER = edit me", "input", "t_pulse", fmt="0.0"); r += 1
    put(ws4, r, "Energy per pulse (ohmic)", "=P_ohm*t_pulse/1000", "J", "",
        name="E_pulse", fmt="0.000000"); r += 1
    put(ws4, r, "Temperature rise per pulse", "=E_pulse/(C_cu*V_cu)", "K",
        "adiabatic — no heat leaves the copper during a 1 ms pulse",
        name="dT", fmt="0.0"); r += 1
    put(ws4, r, "Resistance when warm", "=R_c*(1+alpha_Cu*dT)", "Ω", "",
        name="R_hot", fmt="0.000"); r += 1
    put(ws4, r, "Rail ceiling, warm", "=V_rail/R_hot", "A",
        "THE PROBLEM: compare this with your planning current above. If it is "
        "lower, the actuator makes the first step of a burst and then stops.",
        "warn", "I_max_hot", fmt="0.000"); r += 1
    put(ws4, r, "Still enough when warm?",
        '=IF(I_max_hot>=I_plan,"yes","NO — the step fails once warm")', "", "",
        "warn"); r += 1
    put(ws4, r, "Average power at step rate", "=E_pulse*step_rate*1000", "mW",
        "", fmt="0.0"); r += 1
    r += 1
    c = ws4.cell(row=r, column=1, value=(
        "TRY THIS: type 1.36 into the planning current above — the current an "
        "earlier version of this analysis called for. The cold margin drops to "
        "about 1.4%, the pulse puts ~5.8 K into the winding, and the warm rail "
        "ceiling falls BELOW the current you asked for, so the answer two rows "
        "up flips to NO. That is the failure mode: the actuator steps once and "
        "then stops, intermittently and temperature-dependently. It is why the "
        "wire gauge on sheet 3 is not a detail."))
    c.alignment = Alignment(wrap_text=True, vertical="top")
    c.font = Font(bold=True)
    ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    ws4.row_dimensions[r].height = 62

    # ------------------------------------------------------------------ 5
    ws5 = wb.create_sheet("5 FORCE (withdrawn)")
    for col, w in (("A", 30), ("B", 18), ("C", 18), ("D", 74)):
        ws5.column_dimensions[col].width = w
    ws5["A1"] = ("FORCE MAGNITUDES ARE WITHDRAWN — the finite-element model "
                 "does not converge.")
    ws5["A1"].font = Font(bold=True, size=12, color="9C0006")
    ws5.merge_cells("A1:D1")
    ws5["A2"] = ("Moving the translator's end boundary from 3 to 12 tooth "
                 "pitches away makes the computed force fall steadily instead "
                 "of settling, while a spurious constant term stays at about a "
                 "quarter of the peak. Halving the mesh moves the answer only "
                 "0.5%, so it is the model's geometry, not its numerics. These "
                 "cells are INPUTS from a solver, not formulas — you cannot "
                 "check them from this workbook, which is exactly why they are "
                 "flagged rather than presented.")
    ws5["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws5.merge_cells("A2:D2")
    ws5.row_dimensions[2].height = 68
    header(ws5, 4, "End clearance (pitches)", "Peak force at 0.40 A (mN)",
           "Spurious constant (% of peak)", "Reading")
    r = 5
    for row in fe["convergence"]["rows"]:
        ws5.cell(row=r, column=1, value=row["end_clearance_pitches"])
        c = ws5.cell(row=r, column=2, value=row["peak_ac_force_mn"])
        c.fill = WARN_FILL
        ws5.cell(row=r, column=3, value=row["dc_pct_of_peak"])
        ws5.cell(row=r, column=4,
                 value="falls as the boundary moves — not converged")
        r += 1
    r += 1
    ws5.cell(row=r, column=1, value="WHAT SURVIVES").font = BOLD
    r += 1
    ws5.cell(row=r, column=1, value=(
        "Every refinement made the force SMALLER (1.59 → 1.33 → 1.07 → 0.49 mN "
        "at 0.40 A). So the direction is safe even though the magnitude is not: "
        "the actuator is short of its detent target at 0.30–0.40 A by at least "
        "sevenfold, and probably more. The ampere-turn diagnosis does not "
        "depend on the force model at all — 70 turns × 0.40 A is 28 A-turns "
        "however the iron behaves, and sheet 4 shows what that costs."))
    ws5.cell(row=r, column=1).alignment = Alignment(wrap_text=True, vertical="top")
    ws5.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    ws5.row_dimensions[r].height = 60

    # ------------------------------------------------------------------ 6
    ws6 = wb.create_sheet("6 RESONANCE")
    for col, w in (("A", 52), ("B", 16), ("C", 10), ("D", 74)):
        ws6.column_dimensions[col].width = w
    header(ws6, 1, "Quantity", "Value", "Unit", "Formula, in words")
    r = 2
    put(ws6, r, "Your worksheet form: k = 2π·F_d/(S/2)",
        "=2*PI()*(F_d/1000)/((step_um/2)/10^6)", "N/m",
        "with S the STEP", name="k_tony", fmt="0.0"); r += 1
    put(ws6, r, "Resonance on your form",
        "=1/(2*PI())*SQRT(k_tony/(M_t/1000))", "Hz", "", fmt="0"); r += 1
    put(ws6, r, "Sinusoidal detent over one PITCH: k = 2π·F_d/pitch",
        "=2*PI()*(F_d/1000)/(pitch/10^6)", "N/m",
        "F(x) = F_d·sin(2πx/pitch), so k = dF/dx at the zero crossing. This is "
        "the standard result and the one I would use.",
        name="k_sin", fmt="0.0"); r += 1
    put(ws6, r, "Resonance, sinusoidal",
        "=1/(2*PI())*SQRT(k_sin/(M_t/1000))", "Hz", "", name="f_res",
        fmt="0"); r += 1
    put(ws6, r, "Ratio between the two", "=SQRT(k_tony/k_sin)", "-",
        "√6 = 2.45. Putting S/2 = pitch/6 in place of the pitch inflates the "
        "stiffness sixfold and the frequency by √6.", fmt="0.00"); r += 1
    put(ws6, r, "Margin over step rate", "=f_res/step_rate", "×",
        "still far above the operating rate — your conclusion is unaffected, "
        "only the number", fmt="0"); r += 1

    # ------------------------------------------------------------------ 7
    ws7 = wb.create_sheet("7 MAGNET (screen only)")
    for col, w in (("A", 28), ("B", 14), ("C", 16), ("D", 16), ("E", 14),
                   ("F", 60)):
        ws7.column_dimensions[col].width = w
    ws7["A1"] = ("SCREEN ONLY — H_c × thickness is NOT a valid way to rank "
                 "magnets. It ignores the load line.")
    ws7["A1"].font = Font(bold=True, color="9C0006")
    ws7.merge_cells("A1:F1")
    ws7["A2"] = ("What a magnet actually drives depends on the external "
                 "permeance it sees and on its recoil permeability; two magnets "
                 "with the same H_c·t can deliver very different flux into the "
                 "same circuit. Use this to rule candidates in or out by an "
                 "order of magnitude, then solve the circuit with the magnet "
                 "present. Minimum thicknesses are what each material is "
                 "realistically SOLD in — 0.30 mm ferrite is a ground part and "
                 "0.20 mm bonded NdFeB is calendered sheet, neither is "
                 "ordinary catalogue stock.")
    ws7["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws7.merge_cells("A2:F2")
    ws7.row_dimensions[2].height = 72
    header(ws7, 4, "Material", "H_c (kA/m)", "Thinnest stock (mm)",
           "MMF it gives (At)", "vs planning At", "Note")
    r = 5
    from tony_v2 import pm_options
    for row in pm_options(70.0):
        ws7.cell(row=r, column=1, value=row["material"])
        ws7.cell(row=r, column=2, value=row["hc_ka_m"]).fill = INPUT_FILL
        ws7.cell(row=r, column=3,
                 value=row["supplier_min_thickness_mm"]).fill = INPUT_FILL
        c = ws7.cell(row=r, column=4, value=f"=B{r}*1000*C{r}/1000")
        c.fill, c.number_format = CALC_FILL, "0"
        c2 = ws7.cell(row=r, column=5, value=f"=D{r}/At_plan")
        c2.fill, c2.number_format = CALC_FILL, "0.00"
        ws7.cell(row=r, column=6, value=row["note"]).alignment = Alignment(
            wrap_text=True)
        r += 1

    ws0 = wb.create_sheet("0 READ ME", 0)
    ws0.column_dimensions["A"].width = 118
    ws0["A1"] = "PHANTM v2 actuator — live calculation workbook"
    ws0["A1"].font = Font(bold=True, size=14)
    notes = [
        "",
        "Tony — every number in this workbook is a FORMULA, not a pasted "
        "result. Change any amber cell and the whole workbook moves. That is "
        "the point: you asked to be able to check the numbers yourself, and a "
        "sheet of values cannot be checked, only believed.",
        "",
        "COLOUR CODE",
        "    amber   an input. Edit it.",
        "    blue    a formula. Click it to read the algebra.",
        "    red     not reliable, or a warning. Read the note beside it.",
        "",
        "SHEETS",
        "    1 INPUTS         every hard number, in one place, with its source.",
        "    2 MASS + TARGETS geometry closure, mass, and the force targets "
        "that follow from your 30 g figure.",
        "    3 COIL           resistance, and the volts-per-ampere-turn "
        "identity that decides the wire gauge.",
        "    4 RAIL MARGIN    the most important sheet, and it does not depend "
        "on any finite-element model — it is Ohm's law plus copper's "
        "temperature coefficient.",
        "    5 FORCE          WITHDRAWN. The finite-element model does not "
        "converge; the sheet says why and what survives anyway.",
        "    6 RESONANCE      your formula and the standard one, side by side. "
        "They differ by 2.45x.",
        "    7 MAGNET         a screening table only — H_c x thickness is not "
        "a valid ranking method, and the sheet says so.",
        "",
        "TWO CLOSURE CHECKS worth doing first, on sheet 2: L_z should come out "
        "at 7613 um against your stated 7.612 mm, and L_x at 840 um against "
        "your stated 840. Both close, which is what licenses everything else.",
    ]
    for i, txt in enumerate(notes, start=2):
        c = ws0.cell(row=i, column=1, value=txt)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if txt and not txt.startswith("    ") and txt.isupper():
            c.font = Font(bold=True)
        if len(txt) > 90:
            ws0.row_dimensions[i].height = 30

    for s in wb.worksheets:
        s.freeze_panes = "A2"
    path = os.path.join(OUT, "PHANTM-TONY-V2-CALC.xlsx")
    wb.save(path)
    return path, num, fe


if __name__ == "__main__":
    p, _, _ = build()
    print(f"wrote {p}")
