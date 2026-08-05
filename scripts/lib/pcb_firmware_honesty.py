#!/usr/bin/env python3
"""
@file pcb_firmware_honesty.py
@description Anvil-engine loader for the PCB firmware honesty contract.

SSOT: src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-honesty.contract.json
(also mirrored into every firmware-proof/ dir as artefacts).

Excel MUST call firmware_status_string() / prefer state.pcb.firmwareProof.honesty
instead of hardcoding tier labels. Docs / MemPalace / LLM memory are NOT the engine.

Usage:
  python3 scripts/lib/pcb_firmware_honesty.py --selftest
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Union

_REPO = Path(__file__).resolve().parents[2]
_CONTRACT_PATH = (
    _REPO
    / "src"
    / "lib"
    / "pdf-engine-v2"
    / "lib"
    / "pcb"
    / "pcb-firmware-honesty.contract.json"
)

_CONTRACT_CACHE: Optional[Dict[str, Any]] = None


def contract_path() -> Path:
    return _CONTRACT_PATH


def load_honesty_contract(path: Optional[Path] = None) -> Dict[str, Any]:
    """Load the committed (or run-local) honesty contract JSON."""
    global _CONTRACT_CACHE
    p = path or _CONTRACT_PATH
    if path is None and _CONTRACT_CACHE is not None:
        return _CONTRACT_CACHE
    if not p.is_file():
        raise FileNotFoundError(
            f"pcb-firmware-honesty contract missing: {p} — "
            "lessons must live in Anvil code, not LLM memory"
        )
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("schema") != "pcb-firmware-honesty/v1":
        raise ValueError(f"unexpected honesty contract schema: {data.get('schema')!r}")
    if path is None:
        _CONTRACT_CACHE = data
    return data


def fab_ready_banner(contract: Optional[Dict[str, Any]] = None) -> str:
    c = contract or load_honesty_contract()
    return str(c["fabReadyBanner"])


def forbidden_functional_claim(contract: Optional[Dict[str, Any]] = None) -> str:
    c = contract or load_honesty_contract()
    return str(c["forbiddenFunctionalClaim"])


def firmware_status_string(
    tier: Optional[int],
    fw_ok: Optional[bool],
    contract: Optional[Dict[str, Any]] = None,
) -> str:
    """Canonical Excel 'Firmware status' cell — lockstep with TS firmwareStatusString()."""
    c = contract or load_honesty_contract()
    status = c["status"]
    if fw_ok is False:
        return str(status["fail"])
    if tier is None or fw_ok is None:
        return str(status["notRun"])
    if tier >= 3:
        return str(status["tier3"])
    if tier == 2:
        return str(status["tier2"])
    if tier == 1:
        return str(status["tier1"])
    return str(status["tier0"])


def firmware_readiness_why_fragment(
    tier: Optional[int],
    contract: Optional[Dict[str, Any]] = None,
) -> str:
    c = contract or load_honesty_contract()
    why = c["readinessWhyFragment"]
    if tier is not None and tier >= 3:
        return str(why["tier3"])
    if tier == 2:
        return str(why["tier2"])
    if tier == 1:
        return str(why["tier1"])
    return str(why["tier0"])


def honesty_from_firmware_proof(fw: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Prefer the structured record written by chain/solo onto state.pcb.firmwareProof."""
    if not isinstance(fw, dict):
        return None
    h = fw.get("honesty")
    return h if isinstance(h, dict) and h.get("schema") == "pcb-firmware-honesty/v1" else None


def status_label_from_firmware_proof(fw: Optional[Dict[str, Any]]) -> str:
    """
    Excel entrypoint: prefer state honesty.statusLabel; else derive from tier/ok
    via the contract (never invent FUNCTIONALLY VERIFIED).
    """
    h = honesty_from_firmware_proof(fw)
    if h is not None and isinstance(h.get("statusLabel"), str) and h["statusLabel"]:
        return str(h["statusLabel"])
    if not isinstance(fw, dict):
        return firmware_status_string(None, None)
    tier_raw = fw.get("tier")
    tier: Optional[int]
    try:
        tier = int(tier_raw) if tier_raw is not None else None
    except (TypeError, ValueError):
        tier = None
    fw_ok: Optional[bool] = None
    if "ok" in fw:
        fw_ok = bool(fw.get("ok"))
    elif "allOk" in fw:
        fw_ok = bool(fw.get("allOk"))
    return firmware_status_string(tier, fw_ok)


def claims_functional_verification_illegally(text: str) -> bool:
    import re

    for m in re.finditer(r"FUNCTIONALLY VERIFIED", text or "", flags=re.I):
        ctx = text[max(0, m.start() - 40) : m.start()].lower()
        if "never" not in ctx and "must not" not in ctx and "not " not in ctx:
            return True
    return False


def _selftest() -> int:
    """proveCatch: contract loads; tier-3 never FUNCTIONALLY VERIFIED; fail/not-run locked."""
    bad = 0
    c = load_honesty_contract()
    banner = fab_ready_banner(c)
    forbidden = forbidden_functional_claim(c)
    if "UNPROVEN IN HARDWARE" not in banner:
        print("FAIL banner missing UNPROVEN IN HARDWARE"); bad += 1
    elif "NOT FABRICATION READY" not in banner and not banner.startswith("DRAFT"):
        print(f"FAIL banner must declare draft/not-fab, got {banner!r}"); bad += 1
    elif banner.startswith("FAB-READY"):
        print(f"FAIL banner must not lead with FAB-READY (skim risk), got {banner!r}"); bad += 1
    else:
        print("PASS banner is draft-not-fab + UNPROVEN IN HARDWARE")
    s3 = firmware_status_string(3, True, c)
    if s3 != c["status"]["tier3"]:
        print(f"FAIL tier3 status drift: {s3!r}"); bad += 1
    else:
        print("PASS tier3 status from contract")
    if forbidden in s3 and "NOT " not in s3:
        print("FAIL tier3 status asserts FUNCTIONALLY VERIFIED"); bad += 1
    else:
        print("PASS tier3 status does not claim FUNCTIONALLY VERIFIED")
    if firmware_status_string(None, None, c) != c["status"]["notRun"]:
        print("FAIL notRun"); bad += 1
    else:
        print("PASS notRun")
    if firmware_status_string(1, False, c) != c["status"]["fail"]:
        print("FAIL fail"); bad += 1
    else:
        print("PASS fail")
    why3 = firmware_readiness_why_fragment(3, c)
    if "virt_i2c_read8" not in why3 or "VIRTUAL BOARD ONLY" not in why3:
        print(f"FAIL readiness why3: {why3!r}"); bad += 1
    else:
        print("PASS readiness why3 names virt_i2c + VIRTUAL BOARD ONLY")
    fake = {
        "tier": 3,
        "ok": True,
        "honesty": {
            "schema": "pcb-firmware-honesty/v1",
            "statusLabel": s3,
        },
    }
    if status_label_from_firmware_proof(fake) != s3:
        print("FAIL prefer honesty.statusLabel"); bad += 1
    else:
        print("PASS prefer honesty.statusLabel from state")
    if claims_functional_verification_illegally(
        "Board is FUNCTIONALLY VERIFIED after QEMU"
    ) is not True:
        print("FAIL illegal claim detector"); bad += 1
    else:
        print("PASS illegal claim detector")
    pack = "\n".join(c["packReadmeLines"])
    if claims_functional_verification_illegally(pack):
        print("FAIL pack README illegally claims FUNCTIONALLY VERIFIED"); bad += 1
    else:
        print("PASS pack README is legal")
    # Adversarial: missing contract path must raise (fail closed)
    try:
        load_honesty_contract(Path("/nonexistent/pcb-firmware-honesty.contract.json"))
        print("FAIL missing contract did not raise"); bad += 1
    except FileNotFoundError:
        print("PASS missing contract fail-closed")
    if bad:
        print(f"selftest: FAIL ({bad})")
        return 1
    print("selftest: OK")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(json.dumps(load_honesty_contract(), indent=2))
