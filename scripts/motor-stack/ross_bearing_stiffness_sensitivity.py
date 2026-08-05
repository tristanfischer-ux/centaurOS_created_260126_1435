#!/usr/bin/env python3
"""ROSS first-critical vs assumed bearing stiffness (screening). ship_ok false."""
from __future__ import annotations

import json
import os
import sys
import warnings
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("RPPREFIX", "/tmp/forgeos-no-refprop-x")
warnings.filterwarnings("ignore", message="Unable to set REFPROP path.*")
warnings.filterwarnings("ignore", category=UserWarning, module=r"ccp(\..*)?")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "motor-stack"))
import ross_fia_front_kit_case as rf  # noqa: E402

DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"


def main() -> int:
    twin = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TWIN
    twin = twin.resolve()
    out = twin / "_motor_stack" / "multiphysics"
    jack = twin / "_motor_stack" / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    inputs, _ = rf.load_twin_inputs(twin / "state.json")
    base = rf.derive_rotor_model(inputs)
    op = float(inputs.max_rotor_speed_rpm)
    base_k = rf.ASSUMED_BEARING_KXX_N_M
    factors = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0]
    rows = []
    for f in factors:
        g = replace(base, bearing_kxx_n_m=base_k * f)
        rotor = rf.build_ross_rotor(g)
        res = rf.run_critical_speeds(rotor, operating_speed_rpm=op, num_modes=8)
        first = float(res.first_critical_speed_rpm)
        margin = first / op
        rows.append(
            {
                "k_factor": f,
                "kxx_n_m": base_k * f,
                "first_critical_rpm": round(first, 3),
                "margin_over_operating": round(margin, 4),
                "clear_subcritical_1p2": margin >= 1.2,
            }
        )
        print(f"k×{f}: first={first:.1f} margin={margin:.3f}", flush=True)
    payload = {
        "schema": "forgeos.multiphysics.ross_bearing_k_sensitivity/v1",
        "ran_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ship_ok": False,
        "operating_rpm": op,
        "base_kxx_n_m": base_k,
        "required_subcritical_factor": 1.2,
        "rows": rows,
        "baseline_first_critical_rpm": next(
            r["first_critical_rpm"] for r in rows if r["k_factor"] == 1.0
        ),
        "k_factor_for_clear_1p2": next(
            (r["k_factor"] for r in rows if r["clear_subcritical_1p2"]), None
        ),
        "headline": "Assumed-bearing stiffness sweep vs 24k. Identity OPEN.",
        "honest_limits": [
            "isotropic assumed K/C",
            "steel equivalent disk",
            "not modal/dyno correlated",
        ],
    }
    (out / "ross_bearing_k_sensitivity.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    fig, ax = plt.subplots(figsize=(8.5, 4.6), dpi=140)
    ax.semilogx(
        [r["k_factor"] for r in rows],
        [r["first_critical_rpm"] for r in rows],
        "o-",
        color="#264653",
        lw=2,
        label="first critical",
    )
    ax.axhline(op, color="#e76f51", ls="--", label=f"operating {op:.0f} rpm")
    ax.axhline(op * 1.2, color="#9b2226", ls=":", label="1.2× operating")
    ax.set_xlabel("bearing kxx factor (× base 5e7 N/m)")
    ax.set_ylabel("first critical (rpm)")
    ax.set_title(
        "ROSS screening: critical vs assumed bearing stiffness\n"
        "ship_ok=false · bearings OPEN"
    )
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "ross_bearing_k_sensitivity.png")
    jack.mkdir(parents=True, exist_ok=True)
    fig.savefig(jack / "51b-ross-bearing-k-sensitivity.png")
    plt.close(fig)
    print(json.dumps({"k_clear": payload["k_factor_for_clear_1p2"], "baseline": payload["baseline_first_critical_rpm"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
