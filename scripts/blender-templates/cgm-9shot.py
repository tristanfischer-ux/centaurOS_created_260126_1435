"""cgm-9shot.py — 14-day disposable CGM patch + reusable BLE bridge.

Source: iter-64-cgm-v4. Patch envelope 35 × 30 × 7 mm. Bridge slightly larger
(reusable, with display). Two physical objects in scene. 9 modules.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P cgm-9shot.py
"""
import bpy
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()
POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-cgm-9shot")))

# Scale: 1 Blender unit = 1 metre. Patch envelope 35×30×7 mm = 0.035 × 0.030 × 0.007
PATCH_W = 0.035
PATCH_D = 0.030
PATCH_H = 0.007
PATCH_X, PATCH_Y = 0.0, 0.0

# Bridge — slightly larger device with display
BRIDGE_W = 0.050
BRIDGE_D = 0.035
BRIDGE_H = 0.012
BRIDGE_X = 0.08  # separated to the right of the patch
BRIDGE_Y = 0.0
BRIDGE_Z_BASE = -PATCH_H/2 - 0.001  # bridge sits at same z as patch base

MO = fl.make_module_dict([
    "energy_storage_source", "structure_containment",
    "sensing_instrumentation", "control_compute_communication",
    "safety_protection", "environmental_interface",
    "power_distribution", "maintenance_serviceability", "hmi_ergonomics",
])

MAT = fl.make_default_palette()
MAT["adhesive"]    = fl.make_mat("m_adhesive",    (0.95, 0.92, 0.85), metallic=0.0, roughness=0.7)
MAT["overmould"]   = fl.make_mat("m_overmould",   (0.85, 0.86, 0.88), metallic=0.0, roughness=0.55)
MAT["bridge_case"] = fl.make_mat("m_bridge_case", (0.18, 0.20, 0.24), metallic=0.3, roughness=0.5)
MAT["display"]     = fl.make_mat("m_display",     (0.05, 0.42, 1.00), metallic=0.0, roughness=0.3)


# ═══════ structure_containment ════════════════════════════════════════════
# Patch substrate (thin disc-like flex substrate)
fl.add_box("cgm1_patch_substrate", (PATCH_X, PATCH_Y, 0),
           (PATCH_W, PATCH_D, 0.0008), MAT["pcb"], "structure_containment", MO)
# Patch overmould (rounded top cover)
fl.add_box("cgm1_patch_overmould", (PATCH_X, PATCH_Y, PATCH_H/2),
           (PATCH_W * 0.95, PATCH_D * 0.95, PATCH_H), MAT["overmould"], "structure_containment", MO)
# Bridge enclosure (slightly rounded box)
fl.add_box("cgm1_bridge_enclosure", (BRIDGE_X, BRIDGE_Y, BRIDGE_H/2),
           (BRIDGE_W, BRIDGE_D, BRIDGE_H), MAT["bridge_case"], "structure_containment", MO)
# Bridge chassis (internal frame, thin metal shield)
fl.add_box("cgm1_bridge_chassis", (BRIDGE_X, BRIDGE_Y, BRIDGE_H * 0.40),
           (BRIDGE_W - 0.004, BRIDGE_D - 0.004, BRIDGE_H * 0.10), MAT["enclosure"], "structure_containment", MO)
# Patch applicator mechanism (small spring-loaded plunger — shown as cylinder above patch in "applied" state)
fl.add_cyl("cgm1_applicator", (PATCH_X, PATCH_Y, PATCH_H + 0.005),
           0.003, 0.010, MAT["maint"], "structure_containment", MO)


# ═══════ energy_storage_source ════════════════════════════════════════════
# Patch primary cell (CR2032-like coin cell inside patch)
fl.add_cyl("cgm2_patch_cell", (PATCH_X - 0.005, PATCH_Y, PATCH_H * 0.45),
           0.005, PATCH_H * 0.5, MAT["battery"], "energy_storage_source", MO)
# Bridge rechargeable cell (lipo, inside bridge)
fl.add_box("cgm2_bridge_cell", (BRIDGE_X - 0.012, BRIDGE_Y, BRIDGE_H * 0.30),
           (0.018, 0.020, BRIDGE_H * 0.40), MAT["battery"], "energy_storage_source", MO)
# Bridge charging circuit
fl.add_box("cgm2_bridge_charger", (BRIDGE_X - 0.012, BRIDGE_Y + 0.013, BRIDGE_H * 0.60),
           (0.014, 0.008, 0.002), MAT["control"], "energy_storage_source", MO)
# Patch power management (small chip on patch PCB)
fl.add_box("cgm2_patch_pm", (PATCH_X + 0.008, PATCH_Y - 0.005, 0.0014),
           (0.004, 0.004, 0.0012), MAT["control"], "energy_storage_source", MO)
# Thermal management (thin copper spreader on PCB)
fl.add_box("cgm2_thermal_spread", (PATCH_X, PATCH_Y, 0.0014),
           (0.020, 0.016, 0.0004), MAT["copper"], "energy_storage_source", MO)


# ═══════ sensing_instrumentation ══════════════════════════════════════════
# Microneedle array (cluster of tiny needles below patch — pointing down)
for i in range(3):
    for j in range(3):
        fl.add_cyl(f"cgm4_microneedle_{i}_{j}", (PATCH_X - 0.004 + i * 0.004, PATCH_Y - 0.004 + j * 0.004, -0.001),
                   0.0003, 0.002, MAT["safety"], "sensing_instrumentation", MO)
# Potentiostat front end (analog sensor IC)
fl.add_box("cgm4_potentiostat", (PATCH_X + 0.008, PATCH_Y + 0.008, 0.0014),
           (0.005, 0.005, 0.0012), MAT["sensor"], "sensing_instrumentation", MO)
# Temperature compensation (thermistor on PCB)
fl.add_box("cgm4_thermistor", (PATCH_X - 0.012, PATCH_Y + 0.008, 0.0014),
           (0.002, 0.002, 0.001), MAT["sensor"], "sensing_instrumentation", MO)
# Calibration memory (EEPROM chip)
fl.add_box("cgm4_cal_memory", (PATCH_X - 0.010, PATCH_Y - 0.008, 0.0014),
           (0.003, 0.003, 0.001), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ control_compute_communication ════════════════════════════════════
# Patch BLE SoC (large chip — relatively dominant on patch)
fl.add_box("cgm5_patch_ble_soc", (PATCH_X, PATCH_Y, 0.0016),
           (0.008, 0.008, 0.0015), MAT["control"], "control_compute_communication", MO)
# Bridge MCU
fl.add_box("cgm5_bridge_mcu", (BRIDGE_X + 0.005, BRIDGE_Y - 0.008, BRIDGE_H * 0.55),
           (0.006, 0.006, 0.0015), MAT["control"], "control_compute_communication", MO)
# Bridge BLE module (separate radio module)
fl.add_box("cgm5_bridge_ble", (BRIDGE_X + 0.012, BRIDGE_Y - 0.008, BRIDGE_H * 0.55),
           (0.005, 0.005, 0.0015), MAT["control"], "control_compute_communication", MO)
# Data logging storage (flash chip)
fl.add_box("cgm5_data_log", (BRIDGE_X + 0.005, BRIDGE_Y + 0.008, BRIDGE_H * 0.55),
           (0.004, 0.004, 0.0012), MAT["control"], "control_compute_communication", MO)


# ═══════ safety_protection ════════════════════════════════════════════════
# Bridge battery protection (small chip near battery)
fl.add_box("cgm6_batt_protection", (BRIDGE_X - 0.012, BRIDGE_Y - 0.012, BRIDGE_H * 0.55),
           (0.003, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
# ESD suppression (TVS diodes — tiny components)
for i in range(3):
    fl.add_box(f"cgm6_esd_{i}", (PATCH_X - 0.014, PATCH_Y - 0.010 + i * 0.005, 0.0014),
               (0.001, 0.0015, 0.0007), MAT["safety"], "safety_protection", MO)
# Medical isolation barrier (gold ring around microneedles)
fl.add_torus("cgm6_medical_isolation", (PATCH_X, PATCH_Y, -0.0005),
             major_radius=0.012, minor_radius=0.0008,
             material=MAT["copper"], module="safety_protection", module_objects=MO)
# Watchdog supervision chip (on bridge)
fl.add_box("cgm6_watchdog", (BRIDGE_X + 0.018, BRIDGE_Y, BRIDGE_H * 0.55),
           (0.003, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
# Safety interlock (mechanical detent on bridge — magnet)
fl.add_cyl("cgm6_safety_interlock", (BRIDGE_X, BRIDGE_Y - BRIDGE_D/2 + 0.003, BRIDGE_H * 0.30),
           0.002, 0.003, MAT["safety"], "safety_protection", MO)
# EMC grounding (ground plane on bridge PCB — represented as copper strip)
fl.add_box("cgm6_emc_ground", (BRIDGE_X, BRIDGE_Y, BRIDGE_H * 0.42),
           (BRIDGE_W - 0.008, BRIDGE_D - 0.008, 0.0003), MAT["copper"], "safety_protection", MO)


# ═══════ environmental_interface ══════════════════════════════════════════
# Skin adhesive pad (thin sticky disc beneath patch)
fl.add_cyl("cgm7_skin_adhesive", (PATCH_X, PATCH_Y, -0.0015),
           0.015, 0.0008, MAT["adhesive"], "environmental_interface", MO)
# Patch sealing (gasket band around patch perimeter)
fl.add_box("cgm7_patch_seal", (PATCH_X, PATCH_Y, 0.0005),
           (PATCH_W, PATCH_D, 0.0008), MAT["safety"], "environmental_interface", MO)
# Bridge ingress protection (silicone gasket)
fl.add_box("cgm7_bridge_seal", (BRIDGE_X, BRIDGE_Y, BRIDGE_H * 0.85),
           (BRIDGE_W - 0.002, BRIDGE_D - 0.002, 0.001), MAT["safety"], "environmental_interface", MO)
# Thermal interface (thermal pad between BLE SoC and overmould)
fl.add_box("cgm7_thermal_interface", (PATCH_X, PATCH_Y, 0.0030),
           (0.010, 0.010, 0.0006), MAT["thermal"], "environmental_interface", MO)


# ═══════ power_distribution ══════════════════════════════════════════════
# Patch flex PCB (the main flex circuit)
fl.add_box("cgm8_patch_flex_pcb", (PATCH_X, PATCH_Y, 0.0015),
           (PATCH_W - 0.004, PATCH_D - 0.004, 0.0005), MAT["pcb"], "power_distribution", MO)
# Bridge rigid PCB
fl.add_box("cgm8_bridge_pcb", (BRIDGE_X, BRIDGE_Y, BRIDGE_H * 0.50),
           (BRIDGE_W - 0.006, BRIDGE_D - 0.006, 0.0008), MAT["pcb"], "power_distribution", MO)
# Patch power rails (visible copper traces — represented as thin lines)
for i in range(3):
    fl.add_box(f"cgm8_patch_rail_{i}", (PATCH_X - 0.012 + i * 0.012, PATCH_Y + 0.012, 0.0018),
               (0.024, 0.0005, 0.0003), MAT["copper"], "power_distribution", MO)
# Bridge power harness (internal wiring)
fl.add_cyl("cgm8_bridge_harness", (BRIDGE_X, BRIDGE_Y, BRIDGE_H * 0.40),
           0.0008, BRIDGE_W - 0.006, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ maintenance_serviceability ══════════════════════════════════════
# Patch sterile packaging (small magenta pouch beside patch)
fl.add_box("cgm10_sterile_pouch", (PATCH_X, PATCH_Y - 0.040, 0.0015),
           (0.040, 0.030, 0.001), MAT["maint"], "maintenance_serviceability", MO)
# Retail carton (small box icon)
fl.add_box("cgm10_retail_carton", (PATCH_X - 0.045, PATCH_Y - 0.040, 0.005),
           (0.030, 0.020, 0.010), MAT["maint"], "maintenance_serviceability", MO)
# Bridge USB-C charging interface
fl.add_box("cgm10_usb_port", (BRIDGE_X + BRIDGE_W/2 - 0.002, BRIDGE_Y, BRIDGE_H * 0.30),
           (0.004, 0.008, 0.003), MAT["maint"], "maintenance_serviceability", MO)
# Firmware debug port (test pads on bridge PCB)
for i in range(4):
    fl.add_cyl(f"cgm10_debug_pad_{i}", (BRIDGE_X - 0.018, BRIDGE_Y - 0.006 + i * 0.004, BRIDGE_H * 0.52),
               0.0007, 0.0003, MAT["maint"], "maintenance_serviceability", MO)
# Desiccant moisture control (small sachet — magenta block)
fl.add_box("cgm10_desiccant", (PATCH_X, PATCH_Y - 0.034, 0.001),
           (0.008, 0.005, 0.001), MAT["maint"], "maintenance_serviceability", MO)


# ═══════ hmi_ergonomics ══════════════════════════════════════════════════
# Bridge display (small OLED on top of bridge)
fl.add_box("cgm3_display", (BRIDGE_X, BRIDGE_Y, BRIDGE_H + 0.0005),
           (0.025, 0.018, 0.001), MAT["display"], "hmi_ergonomics", MO)
# Bridge user input (single button on bridge)
fl.add_cyl("cgm3_btn", (BRIDGE_X, BRIDGE_Y + BRIDGE_D/2 - 0.003, BRIDGE_H * 0.60),
           0.004, 0.003, MAT["maint"], "hmi_ergonomics", MO,
           rotation=(math.radians(90), 0, 0))
# Haptic feedback motor (small cylinder inside bridge)
fl.add_cyl("cgm3_haptic", (BRIDGE_X, BRIDGE_Y + 0.008, BRIDGE_H * 0.40),
           0.003, 0.004, MAT["motor"], "hmi_ergonomics", MO)
# Patch ergonomic shaping (rounded chamfer on patch edge — represented as thin band)
fl.add_torus("cgm3_patch_chamfer", (PATCH_X, PATCH_Y, PATCH_H - 0.001),
             major_radius=0.014, minor_radius=0.0008,
             material=MAT["maint"], module="hmi_ergonomics", module_objects=MO)
# Bridge audio alert (small piezo speaker)
fl.add_cyl("cgm3_speaker", (BRIDGE_X - 0.018, BRIDGE_Y + 0.008, BRIDGE_H * 0.30),
           0.003, 0.002, MAT["ctrl_black"], "hmi_ergonomics", MO)


# Lighting tuned to tiny scale
fl.add_lights(target_centre=((PATCH_X + BRIDGE_X)/2, 0, 0.005), fill_energy=10, fill_size=0.2)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment", flat_form_factor=True)
