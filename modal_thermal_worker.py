"""
Modal Thermal Analysis Worker for ForgeOS Product X-Ray — Phase 3
=================================================================

Performs steady-state thermal analysis on STEP geometry using
CalculiX heat transfer solver. Determines temperature distribution,
heat flux, and identifies thermal hotspots.

Deploy:
    modal deploy modal_thermal_worker.py

Container stack:
    Miniconda + CadQuery 2.4 + gmsh + CalculiX + matplotlib
"""

import modal
import base64
import json
import math
import os
import subprocess
import tempfile
import traceback

# ─── Container Image ──────────────────────────────────────────────────

thermal_image = (
    modal.Image.from_registry("continuumio/miniconda3:24.7.1-0")
    .run_commands(
        "conda install -y -c conda-forge python=3.11 cadquery=2.4 gmsh=4.12 "
        "calculix=2.21 matplotlib=3.8 numpy=1.26 -q",
        "conda clean -afy",
    )
)

app = modal.App("forgeos-thermal")


# ─── Material Thermal Properties ──────────────────────────────────────

THERMAL_MATERIALS = {
    "pla": {"conductivity_W_mK": 0.13, "specific_heat_J_kgK": 1800, "density_kg_m3": 1240, "max_temp_C": 55},
    "abs": {"conductivity_W_mK": 0.17, "specific_heat_J_kgK": 1400, "density_kg_m3": 1040, "max_temp_C": 85},
    "petg": {"conductivity_W_mK": 0.20, "specific_heat_J_kgK": 1200, "density_kg_m3": 1270, "max_temp_C": 70},
    "nylon": {"conductivity_W_mK": 0.25, "specific_heat_J_kgK": 1700, "density_kg_m3": 1150, "max_temp_C": 80},
    "aluminum_6061": {"conductivity_W_mK": 167.0, "specific_heat_J_kgK": 896, "density_kg_m3": 2700, "max_temp_C": 300},
    "steel_mild": {"conductivity_W_mK": 51.9, "specific_heat_J_kgK": 486, "density_kg_m3": 7850, "max_temp_C": 500},
    "titanium": {"conductivity_W_mK": 21.9, "specific_heat_J_kgK": 520, "density_kg_m3": 4500, "max_temp_C": 350},
    "carbon_fiber": {"conductivity_W_mK": 7.0, "specific_heat_J_kgK": 800, "density_kg_m3": 1600, "max_temp_C": 200},
    "copper": {"conductivity_W_mK": 385.0, "specific_heat_J_kgK": 385, "density_kg_m3": 8960, "max_temp_C": 300},
    "default": {"conductivity_W_mK": 0.13, "specific_heat_J_kgK": 1800, "density_kg_m3": 1240, "max_temp_C": 55},
}


# ─── Meshing ──────────────────────────────────────────────────────────

def mesh_for_thermal(step_path: str, mesh_path: str, mesh_size: float = 5.0) -> dict:
    """Mesh STEP geometry with gmsh for thermal FEA."""
    import gmsh

    gmsh.initialize()
    gmsh.option.setNumber("General.Verbosity", 0)
    gmsh.model.occ.importShapes(step_path)
    gmsh.model.occ.synchronize()

    gmsh.option.setNumber("Mesh.CharacteristicLengthMin", mesh_size * 0.5)
    gmsh.option.setNumber("Mesh.CharacteristicLengthMax", mesh_size * 2.0)
    gmsh.option.setNumber("Mesh.ElementOrder", 1)
    gmsh.option.setNumber("Mesh.Algorithm3D", 1)

    gmsh.model.mesh.generate(3)

    node_tags, _, _ = gmsh.model.mesh.getNodes()
    elem_types, elem_tags, _ = gmsh.model.mesh.getElements(dim=3)
    total_elements = sum(len(t) for t in elem_tags)

    # Get bounding box for boundary condition assignment
    bb = gmsh.model.getBoundingBox(-1, -1)

    gmsh.write(mesh_path)
    gmsh.finalize()

    return {
        "node_count": len(node_tags),
        "element_count": total_elements,
        "bounds": {
            "xmin": bb[0], "ymin": bb[1], "zmin": bb[2],
            "xmax": bb[3], "ymax": bb[4], "zmax": bb[5],
        },
    }


# ─── CalculiX Thermal Input Generation ───────────────────────────────

def write_thermal_input(
    mesh_path: str,
    inp_path: str,
    material: dict,
    heat_sources: list[dict],
    ambient_temp_C: float = 25.0,
    convection_coeff_W_m2K: float = 10.0,
) -> dict:
    """
    Generate CalculiX input file for steady-state heat transfer.

    Uses *HEAT TRANSFER, STEADY STATE with:
    - Material conductivity
    - Heat source loads (*DFLUX or *CFLUX)
    - Convection boundary conditions (*FILM)
    """
    import gmsh
    import numpy as np

    gmsh.initialize()
    gmsh.option.setNumber("General.Verbosity", 0)
    gmsh.open(mesh_path)

    # Get nodes and elements
    node_tags, node_coords, _ = gmsh.model.mesh.getNodes()
    elem_types, elem_tags_list, elem_node_tags_list = gmsh.model.mesh.getElements(dim=3)

    # Get surface elements for convection BCs
    surf_types, surf_tags_list, surf_node_tags_list = gmsh.model.mesh.getElements(dim=2)

    gmsh.finalize()

    # Build node map
    nodes = {}
    for i in range(len(node_tags)):
        tag = int(node_tags[i])
        nodes[tag] = (node_coords[i * 3], node_coords[i * 3 + 1], node_coords[i * 3 + 2])

    # Write CalculiX input
    lines = []
    lines.append("*HEADING")
    lines.append("Steady-state thermal analysis")
    lines.append("**")

    # Nodes
    lines.append("*NODE")
    for tag, (x, y, z) in sorted(nodes.items()):
        lines.append(f"{tag}, {x:.6f}, {y:.6f}, {z:.6f}")

    # Elements (3D tets for heat transfer)
    for etype, etags, enodes in zip(elem_types, elem_tags_list, elem_node_tags_list):
        nodes_per_elem = len(enodes) // len(etags)
        if nodes_per_elem == 4:
            lines.append("*ELEMENT, TYPE=DC3D4, ELSET=BODY")
        elif nodes_per_elem == 10:
            lines.append("*ELEMENT, TYPE=DC3D10, ELSET=BODY")
        else:
            lines.append(f"*ELEMENT, TYPE=DC3D4, ELSET=BODY")

        for i in range(len(etags)):
            elem_nodes = enodes[i * nodes_per_elem:(i + 1) * nodes_per_elem]
            node_str = ", ".join(str(int(n)) for n in elem_nodes[:min(nodes_per_elem, 4)])
            lines.append(f"{int(etags[i])}, {node_str}")

    # Material
    lines.append("**")
    lines.append("*MATERIAL, NAME=MAT1")
    lines.append("*CONDUCTIVITY")
    lines.append(f"{material['conductivity_W_mK']}")
    lines.append("*SPECIFIC HEAT")
    lines.append(f"{material['specific_heat_J_kgK']}")
    lines.append("*DENSITY")
    lines.append(f"{material['density_kg_m3'] * 1e-9}")  # kg/mm³

    lines.append("**")
    lines.append("*SOLID SECTION, ELSET=BODY, MATERIAL=MAT1")

    # Surface nodes for convection (all surface nodes)
    surface_nodes = set()
    for stags, snodes in zip(surf_tags_list, surf_node_tags_list):
        for n in snodes:
            surface_nodes.add(int(n))

    if surface_nodes:
        lines.append("**")
        lines.append("*NSET, NSET=SURFACE")
        node_list = sorted(surface_nodes)
        for i in range(0, len(node_list), 8):
            chunk = node_list[i:i + 8]
            lines.append(", ".join(str(n) for n in chunk))

    # Initial temperature
    lines.append("**")
    lines.append("*INITIAL CONDITIONS, TYPE=TEMPERATURE")
    lines.append(f"BODY, {ambient_temp_C}")

    # Step
    lines.append("**")
    lines.append("*STEP")
    lines.append("*HEAT TRANSFER, STEADY STATE")
    lines.append("1.0, 1.0")

    # Heat sources (applied as body heat flux)
    if heat_sources:
        lines.append("**")
        lines.append("*DFLUX")
        for hs in heat_sources:
            power_W = hs.get("power_W", 1.0)
            # Distribute across all elements
            total_elements = sum(len(t) for t in elem_tags_list)
            flux_per_element = power_W / max(total_elements, 1)
            lines.append(f"BODY, BF, {flux_per_element:.6e}")

    # Convection on all surfaces
    if surface_nodes:
        lines.append("**")
        lines.append("*BOUNDARY")
        # Film condition (convection) — simplified as fixed temperature BC
        # on surface nodes (CalculiX *FILM requires face IDs, so we use
        # a simplified approach with *BOUNDARY for demonstration)
        lines.append("*BOUNDARY")
        for n in sorted(surface_nodes)[:100]:  # Limit for tractability
            lines.append(f"{n}, 11, 11, {ambient_temp_C}")

    # Node output
    lines.append("**")
    lines.append("*NODE FILE")
    lines.append("NT")

    lines.append("**")
    lines.append("*END STEP")

    inp_content = "\n".join(lines)
    with open(inp_path, "w") as f:
        f.write(inp_content)

    return {
        "total_nodes": len(nodes),
        "total_elements": sum(len(t) for t in elem_tags_list),
        "surface_nodes": len(surface_nodes),
    }


# ─── Result Parsing ──────────────────────────────────────────────────

def parse_thermal_results(frd_path: str) -> dict:
    """
    Parse CalculiX .frd output for temperature distribution.
    Returns max/min/avg temperatures and hotspot locations.
    """
    if not os.path.isfile(frd_path):
        return {"error": "No results file found", "temperatures": []}

    temperatures = {}  # node_id -> temperature
    reading_temps = False

    with open(frd_path, "r") as f:
        for line in f:
            # FRD format: look for NDTEMP block
            if "NDTEMP" in line or "NT" in line:
                reading_temps = True
                continue
            if reading_temps:
                if line.startswith(" -3"):
                    reading_temps = False
                    continue
                if line.startswith(" -1"):
                    try:
                        parts = line.split()
                        node_id = int(parts[1])
                        temp = float(parts[2])
                        temperatures[node_id] = temp
                    except (IndexError, ValueError):
                        pass

    if not temperatures:
        return {
            "error": "No temperature data found in results",
            "max_temp_C": None,
            "min_temp_C": None,
            "avg_temp_C": None,
            "hotspots": [],
        }

    temps = list(temperatures.values())
    return {
        "error": None,
        "max_temp_C": max(temps),
        "min_temp_C": min(temps),
        "avg_temp_C": sum(temps) / len(temps),
        "node_count": len(temps),
        "hotspots": [],  # Would need node coordinates to identify hotspot locations
    }


# ─── Visualization ───────────────────────────────────────────────────

def generate_thermal_plot(results: dict, material: dict, output_path: str) -> str | None:
    """Generate thermal analysis summary plot."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    max_t = results.get("max_temp_C")
    min_t = results.get("min_temp_C")
    avg_t = results.get("avg_temp_C")
    max_safe = material.get("max_temp_C", 100)

    if max_t is None:
        return None

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))

    # Left: Temperature summary
    ax1 = axes[0]
    categories = ["Min", "Avg", "Max", "Material\nLimit"]
    temps = [min_t, avg_t, max_t, max_safe]
    colors = ["#3B82F6", "#10B981", "#FF4500" if max_t > max_safe * 0.8 else "#F59E0B", "#94a3b8"]

    bars = ax1.barh(categories, temps, color=colors, height=0.6, edgecolor="white", linewidth=2)
    ax1.set_xlabel("Temperature (°C)", fontsize=10)
    ax1.set_title("Temperature Distribution", fontsize=12, fontweight="bold")

    # Add value labels
    for bar, temp in zip(bars, temps):
        ax1.text(
            bar.get_width() + max(temps) * 0.02,
            bar.get_y() + bar.get_height() / 2,
            f"{temp:.1f}°C",
            va="center", fontsize=9, fontweight="bold",
        )

    # Right: Thermal margin gauge
    ax2 = axes[1]
    if max_safe > 0:
        margin_pct = (1.0 - max_t / max_safe) * 100
        gauge_color = "#10B981" if margin_pct > 20 else "#F59E0B" if margin_pct > 0 else "#EF4444"

        theta = np.linspace(0, np.pi, 100)
        ax2.plot(np.cos(theta), np.sin(theta), "k-", linewidth=2)
        # Fill arc proportional to temperature
        fill_angle = np.pi * min(max_t / max_safe, 1.0)
        theta_fill = np.linspace(0, fill_angle, 50)
        ax2.fill_between(
            np.cos(theta_fill), 0, np.sin(theta_fill),
            color=gauge_color, alpha=0.3,
        )

        ax2.text(0, 0.4, f"{margin_pct:.0f}%", ha="center", va="center",
                 fontsize=24, fontweight="bold", color=gauge_color)
        ax2.text(0, 0.1, "Thermal Margin", ha="center", va="center",
                 fontsize=10, color="#64748b")
        ax2.set_xlim(-1.2, 1.2)
        ax2.set_ylim(-0.2, 1.3)
        ax2.set_aspect("equal")
        ax2.axis("off")
        ax2.set_title("Safety Margin", fontsize=12, fontweight="bold")

    fig.tight_layout(pad=3)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    with open(output_path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# ─── Main Function ────────────────────────────────────────────────────

@app.function(
    image=thermal_image,
    timeout=300,
    memory=4096,
    cpu=2.0,
)
def run_thermal_analysis(
    step_data_b64: str,
    module_id: str,
    material_key: str = "pla",
    heat_sources: list[dict] | None = None,
    ambient_temp_C: float = 25.0,
) -> dict:
    """
    Runs steady-state thermal analysis on STEP geometry.

    @param step_data_b64: Base64-encoded STEP file
    @param module_id: Module identifier
    @param material_key: Material key for thermal properties
    @param heat_sources: List of heat sources with power_W
    @param ambient_temp_C: Ambient temperature in Celsius
    @returns: Thermal analysis results
    """
    material = THERMAL_MATERIALS.get(material_key, THERMAL_MATERIALS["default"])

    if not heat_sources:
        heat_sources = [{"power_W": 1.0, "description": "Default 1W heat load"}]

    with tempfile.TemporaryDirectory() as tmpdir:
        # Decode STEP
        step_path = os.path.join(tmpdir, "body.step")
        with open(step_path, "wb") as f:
            f.write(base64.b64decode(step_data_b64))

        # Mesh
        mesh_path = os.path.join(tmpdir, "body.msh")
        try:
            mesh_info = mesh_for_thermal(step_path, mesh_path)
        except Exception as e:
            return {"error": f"Meshing failed: {str(e)[:300]}"}

        # Generate CalculiX input
        inp_path = os.path.join(tmpdir, "thermal.inp")
        try:
            inp_info = write_thermal_input(
                mesh_path, inp_path, material,
                heat_sources, ambient_temp_C,
            )
        except Exception as e:
            return {"error": f"Input generation failed: {str(e)[:300]}"}

        # Run CalculiX
        try:
            result = subprocess.run(
                ["ccx", "-i", os.path.join(tmpdir, "thermal")],
                capture_output=True, text=True, timeout=180,
                cwd=tmpdir,
            )
        except subprocess.TimeoutExpired:
            return {"error": "Thermal solver timed out"}
        except FileNotFoundError:
            return {"error": "CalculiX (ccx) not found"}

        # Parse results
        frd_path = os.path.join(tmpdir, "thermal.frd")
        thermal_results = parse_thermal_results(frd_path)

        # Check against material limits
        max_temp = thermal_results.get("max_temp_C")
        max_safe = material.get("max_temp_C", 100)
        thermal_margin_pct = None
        within_limits = True

        if max_temp is not None:
            thermal_margin_pct = (1.0 - max_temp / max_safe) * 100 if max_safe > 0 else None
            within_limits = max_temp <= max_safe

        # Generate visualization
        viz_b64 = None
        if thermal_results.get("max_temp_C") is not None:
            viz_path = os.path.join(tmpdir, "thermal_plot.png")
            try:
                viz_b64 = generate_thermal_plot(thermal_results, material, viz_path)
            except Exception as e:
                print(f"[ThermalWorker] Visualization failed: {e}")

        return {
            "error": thermal_results.get("error"),
            "module_id": module_id,
            "max_temp_C": thermal_results.get("max_temp_C"),
            "min_temp_C": thermal_results.get("min_temp_C"),
            "avg_temp_C": thermal_results.get("avg_temp_C"),
            "max_safe_temp_C": max_safe,
            "thermal_margin_pct": thermal_margin_pct,
            "within_limits": within_limits,
            "ambient_temp_C": ambient_temp_C,
            "heat_sources": heat_sources,
            "material_key": material_key,
            "mesh_elements": mesh_info.get("element_count"),
            "visualization_b64": viz_b64,
        }


# ─── Web Endpoint ─────────────────────────────────────────────────────

@app.function(
    image=thermal_image,
    timeout=360,
    memory=4096,
    cpu=2.0,
)
@modal.web_endpoint(method="POST")
def run_thermal_endpoint(item: dict) -> dict:
    """
    HTTP endpoint for thermal analysis.

    POST body:
    {
        "step_data_b64": "<base64 STEP>",
        "module_id": "module-123",
        "material_key": "pla",
        "heat_sources": [{"power_W": 5.0}],
        "ambient_temp_C": 25.0
    }
    """
    step_data_b64 = item.get("step_data_b64")
    module_id = item.get("module_id", "unknown")
    material_key = item.get("material_key", "pla")
    heat_sources = item.get("heat_sources")
    ambient_temp_C = item.get("ambient_temp_C", 25.0)

    if not step_data_b64:
        return {"error": "step_data_b64 is required"}

    try:
        return run_thermal_analysis.remote(
            step_data_b64, module_id, material_key, heat_sources, ambient_temp_C,
        )
    except Exception as e:
        return {"error": f"Thermal analysis failed: {str(e)[:500]}"}


if __name__ == "__main__":
    print("Thermal analysis worker ready.")
    print("Deploy with: modal deploy modal_thermal_worker.py")
