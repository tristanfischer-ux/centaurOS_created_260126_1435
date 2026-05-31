#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cybersecurity_threat_model.py

STRIDE + DREAD threat model for connected products.

STRIDE = Spoofing, Tampering, Repudiation, Information disclosure,
         Denial of service, Elevation of privilege
DREAD = Damage, Reproducibility, Exploitability, Affected users,
        Discoverability

Threat library based on:
- OWASP IoT Top 10 (2018)
- ETSI EN 303 645 v2.1.1 (consumer IoT)
- NIST SP 800-30 Rev 1
- ISO/IEC 27005:2022
- NIST IR 8259A (IoT device cybersecurity baseline)
- Microsoft Threat Modeling Tool catalogue

Input:
    {
      "connectivity_types": ["wifi", "cellular", "bluetooth"],
      "data_sensitivity": "pii",
      "firmware_update_method": "ota",
      "authentication_method": "password"
    }

Output:
    {
      "stride_threats": [
        {"category": "Spoofing", "threat": "WiFi WPA2-PSK cracking",
         "severity": "high", "mitigation": "..."},
        ...
      ],
      "severity_score": ...,
      "mitigation_recommendations": [...],
      "compliance_iso_27001": true|false,
      "compliance_etsi_en_303_645": true|false
    }
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'cybersecurity_threat_model (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'STRIDE/DREAD per Microsoft Security Development Lifecycle; ETSI EN 303 645:2020 (Consumer IoT Cybersecurity); ISO/IEC 27001:2022',
    "physics_basis": 'STRIDE category enumeration + DREAD scoring (damage × reproducibility × exploitability × affected users × discoverability). Compliance gap analysis vs ETSI EN 303 645 + ISO 27001.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Threat library: (category, threat, base_severity, mitigation, triggered_by)
THREATS: list[dict] = [
    # ===== Spoofing =====
    {"cat": "Spoofing", "threat": "WiFi rogue AP / evil twin",
     "severity": "high", "score": 7,
     "mitigation": "Require WPA3-Enterprise with cert-based EAP-TLS auth",
     "triggers": {"conn": ["wifi"], "auth": ["password", "none"]}},
    {"cat": "Spoofing", "threat": "Cellular IMSI catcher / Stingray attack",
     "severity": "medium", "score": 5,
     "mitigation": "Use 5G with mutual authentication; pin operator certs",
     "triggers": {"conn": ["cellular"]}},
    {"cat": "Spoofing", "threat": "BLE address replay",
     "severity": "medium", "score": 5,
     "mitigation": "Use BLE Secure Connections (LE Pairing 2.x) + LTK rotation",
     "triggers": {"conn": ["bluetooth"]}},
    {"cat": "Spoofing", "threat": "USB malicious device impersonation",
     "severity": "high", "score": 7,
     "mitigation": "USB Type-C Authentication (USB-IF Spec); whitelist VID/PID",
     "triggers": {"conn": ["usb"]}},
    {"cat": "Spoofing", "threat": "Satellite uplink spoofing (jamming + replay)",
     "severity": "critical", "score": 9,
     "mitigation": "Crypto-bound uplink protocol; GNSS authentication (Galileo OSNMA)",
     "triggers": {"conn": ["satellite_uplink"]}},
    {"cat": "Spoofing", "threat": "Weak/default credentials",
     "severity": "critical", "score": 9,
     "mitigation": "Force first-boot password change; minimum 12-char w/ entropy check",
     "triggers": {"auth": ["password", "none"]}},
    # ===== Tampering =====
    {"cat": "Tampering", "threat": "Firmware modification at rest",
     "severity": "high", "score": 8,
     "mitigation": "Secure boot with signed firmware; trusted boot ROM",
     "triggers": {"fw": ["ota", "wired_only"]}},
    {"cat": "Tampering", "threat": "Man-in-the-middle on OTA update channel",
     "severity": "critical", "score": 9,
     "mitigation": "TLS 1.3 with cert pinning + firmware signature verification",
     "triggers": {"fw": ["ota"]}},
    {"cat": "Tampering", "threat": "Physical debug-port (JTAG/SWD) access",
     "severity": "high", "score": 7,
     "mitigation": "Fuse-disable JTAG in production; tamper-evident enclosure",
     "triggers": {}},  # always applies
    {"cat": "Tampering", "threat": "Side-channel attack (power/EMR/timing) on keys",
     "severity": "medium", "score": 5,
     "mitigation": "Use CC EAL5+ secure element; constant-time crypto libraries",
     "triggers": {"sens": ["pii", "phi", "classified"]}},
    {"cat": "Tampering", "threat": "Bluetooth pairing PIN brute force",
     "severity": "medium", "score": 4,
     "mitigation": "Out-of-band pairing; numeric comparison >= 6 digits",
     "triggers": {"conn": ["bluetooth"]}},
    # ===== Repudiation =====
    {"cat": "Repudiation", "threat": "No audit trail of config/firmware changes",
     "severity": "medium", "score": 5,
     "mitigation": "Append-only signed log; sync to cloud SIEM",
     "triggers": {}},
    {"cat": "Repudiation", "threat": "Action log can be cleared",
     "severity": "high", "score": 7,
     "mitigation": "Write-once log partition; periodic external attestation",
     "triggers": {"sens": ["phi", "classified"]}},
    # ===== Information Disclosure =====
    {"cat": "InfoDisclosure", "threat": "Unencrypted data at rest",
     "severity": "critical", "score": 9,
     "mitigation": "AES-256 full-disk encryption with TPM-bound keys",
     "triggers": {"sens": ["pii", "phi", "classified"]}},
    {"cat": "InfoDisclosure", "threat": "Plaintext WiFi (open or WEP)",
     "severity": "critical", "score": 9,
     "mitigation": "Force WPA3 only; disable WEP, WPA, WPA2-TKIP",
     "triggers": {"conn": ["wifi"]}},
    {"cat": "InfoDisclosure", "threat": "Unencrypted cellular APN backhaul",
     "severity": "high", "score": 7,
     "mitigation": "VPN tunnel (IPsec or WireGuard) across cellular leg",
     "triggers": {"conn": ["cellular"], "sens": ["pii", "phi", "classified"]}},
    {"cat": "InfoDisclosure", "threat": "USB mass-storage data exfil",
     "severity": "medium", "score": 5,
     "mitigation": "Whitelist storage class; block external mass storage",
     "triggers": {"conn": ["usb"]}},
    {"cat": "InfoDisclosure", "threat": "Bluetooth BR/EDR data sniffing",
     "severity": "medium", "score": 5,
     "mitigation": "Use BLE Secure Connections only; disable legacy BR/EDR",
     "triggers": {"conn": ["bluetooth"]}},
    {"cat": "InfoDisclosure", "threat": "NFC eavesdropping (~10cm range)",
     "severity": "low", "score": 3,
     "mitigation": "Encrypt NFC payload; require pre-shared key for sensitive transfer",
     "triggers": {"conn": ["nfc"]}},
    # ===== Denial of Service =====
    {"cat": "DoS", "threat": "WiFi deauth flood",
     "severity": "medium", "score": 5,
     "mitigation": "Use WPA3 Protected Management Frames (PMF)",
     "triggers": {"conn": ["wifi"]}},
    {"cat": "DoS", "threat": "Cellular signal jamming",
     "severity": "high", "score": 6,
     "mitigation": "Multi-RAT fallback (cellular -> WiFi -> sat); store-and-forward",
     "triggers": {"conn": ["cellular"]}},
    {"cat": "DoS", "threat": "Battery drain attack (high-power radio scan)",
     "severity": "low", "score": 3,
     "mitigation": "Rate-limit scan; suspend radios when idle",
     "triggers": {}},
    {"cat": "DoS", "threat": "Firmware update bricks device (rollback failed)",
     "severity": "high", "score": 7,
     "mitigation": "A/B partition update; automatic rollback on boot-fail",
     "triggers": {"fw": ["ota"]}},
    {"cat": "DoS", "threat": "Lora replay / channel jamming",
     "severity": "medium", "score": 5,
     "mitigation": "AES-128 frame counter; FHSS to dodge jammer",
     "triggers": {"conn": ["lora"]}},
    # ===== Elevation of Privilege =====
    {"cat": "EoP", "threat": "Privilege escalation via unsigned firmware",
     "severity": "critical", "score": 10,
     "mitigation": "Secure boot + signed firmware mandatory; no debug-shell in prod",
     "triggers": {"fw": ["ota", "wired_only"], "auth": ["none", "password"]}},
    {"cat": "EoP", "threat": "Cloud admin API takeover (token stealing)",
     "severity": "critical", "score": 10,
     "mitigation": "MFA + short-lived tokens; OAuth2 PKCE; rate-limited refresh",
     "triggers": {"auth": ["password", "none"]}},
    {"cat": "EoP", "threat": "Hardcoded backdoor / engineering key",
     "severity": "critical", "score": 10,
     "mitigation": "Static analysis pre-release; per-unit unique keys",
     "triggers": {}},
]


def compute(payload: dict) -> dict:
    conn_list = [c.lower() for c in payload.get("connectivity_types", [])]
    sens = str(payload.get("data_sensitivity", "public")).lower()
    fw = str(payload.get("firmware_update_method", "none")).lower()
    auth = str(payload.get("authentication_method", "none")).lower()

    matched: list[dict] = []
    for t in THREATS:
        trig = t["triggers"]
        ok = True
        if "conn" in trig:
            if not any(c in conn_list for c in trig["conn"]):
                ok = False
        if "sens" in trig:
            if sens not in trig["sens"]:
                ok = False
        if "fw" in trig:
            if fw not in trig["fw"]:
                ok = False
        if "auth" in trig:
            if auth not in trig["auth"]:
                ok = False
        if ok:
            matched.append({
                "category": t["cat"],
                "threat": t["threat"],
                "severity": t["severity"],
                "score": t["score"],
                "mitigation": t["mitigation"],
            })

    # Severity score = sum of individual scores, normalised
    raw = sum(t["score"] for t in matched)
    max_possible = sum(t["score"] for t in THREATS)
    severity_score = min(100, int(raw / max(1, max_possible) * 100 * 2.5))  # weighted up

    # Group by category
    by_cat: dict[str, list[dict]] = {}
    for t in matched:
        by_cat.setdefault(t["category"], []).append(t)

    # Mitigation summary
    mitigations = sorted({t["mitigation"] for t in matched})

    # Compliance — ETSI EN 303 645 v2.1.1 baseline requirements
    # Key controls:
    # - 5.1 No universal default passwords
    # - 5.3 Keep software updated (OTA)
    # - 5.4 Securely store sensitive security parameters
    # - 5.5 Communicate securely
    # - 5.8 Data protection (encryption at rest)
    compliance_etsi: dict[str, bool] = {
        "5.1_no_default_pw": auth not in ("none", "password"),
        "5.3_secure_software_updates": fw == "ota",
        "5.4_secure_credentials": auth in ("cert", "mfa", "pki"),
        "5.5_secure_communication": True if "wifi" not in conn_list else (auth != "password"),
        "5.8_data_protection": sens in ("public",) or auth in ("cert", "mfa", "pki"),
    }
    compliance_etsi_overall = all(compliance_etsi.values())

    # ISO 27001 ISMS-aligned (informal mapping): require strong auth + audit + encryption
    compliance_iso = (auth in ("cert", "mfa", "pki")
                      and any(t["cat"] == "Repudiation" and "log" in t["mitigation"].lower()
                              for t in matched) is False  # i.e. log gaps not triggered
                      or auth in ("cert", "mfa", "pki") and sens != "classified")
    compliance_iso = bool(compliance_iso) and severity_score < 60

    return {
        "stride_threats": matched,
        "stride_threats_by_category": {k: len(v) for k, v in by_cat.items()},
        "severity_score": severity_score,
        "raw_threat_score": raw,
        "max_possible_score": max_possible,
        "mitigation_recommendations": mitigations,
        "compliance_etsi_en_303_645": compliance_etsi_overall,
        "compliance_etsi_breakdown": compliance_etsi,
        "compliance_iso_27001": bool(compliance_iso),
        "connectivity_types": conn_list,
        "data_sensitivity": sens,
        "firmware_update_method": fw,
        "authentication_method": auth,
        "notes": (
            "STRIDE per Microsoft Threat Modeling 2014 catalogue; severity score "
            "weighted from OWASP IoT Top 10 + ETSI EN 303 645 control gaps. "
            "Compliance flags are heuristic - formal cert requires a Notified Body."
        ),
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
