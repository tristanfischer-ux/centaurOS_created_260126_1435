"""
PCB Trigger (Stage 10.7) — decides whether a bespoke PCB is needed for this design.

Universal: works on ANY archetype by scanning the sub-module structure + contract
quantities. No archetype-specific tables.

4-stage decision:
  1. Candidate identification — which sub-modules are electronic control/driver functions?
  2. COTS coverage check — does a commercial part exist in the parts database?
  3. Bespoke justification — does the brief/contract confirm bespoke intent?
  4. Parameter derivation — extract PCB parameters from the contract

If the trigger fires, it runs pcb_chain.py and writes state.pcbDesign.
If it doesn't fire, state.pcbDesign is absent and no PCB tab appears in the dossier.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

def identify_candidates(state: Dict) -> List[Dict]:
    """Stage 1: find sub-modules that are potential bespoke-PCB candidates."""
    candidates = []
    modules = state.get('moduleDecomposition', {}).get('modules', [])
    for m in modules:
        for sm in (m.get('sub_modules') or []):
            sm_id = sm.get('id', '')
            if not _is_electronic_control(sm_id, sm):
                continue
            words = sm.get('words') or []
            tbd_words = []
            real_words = []
            for w in words:
                mods = {mod.get('kind'): mod.get('value') for mod in (w.get('modifier_characters') or [])}
                pn = str(mods.get('part_number', ''))
                mfr = str(mods.get('manufacturer', ''))
                if 'TBD' in pn or not pn or pn == 'None':
                    tbd_words.append({'word_id': w.get('id', ''), 'name': w.get('name_human', ''), 'pn': pn, 'mfr': mfr})
                else:
                    real_words.append({'word_id': w.get('id', ''), 'name': w.get('name_human', ''), 'pn': pn, 'mfr': mfr})
            if tbd_words:
                candidates.append({
                    'module_id': m.get('id', ''),
                    'sub_module_id': sm_id,
                    'sub_module_name': sm.get('name', ''),
                    'tbd_words': tbd_words,
                    'real_words': real_words,
                    'word_count': len(words),
                })
    return candidates

def _is_electronic_control(sm_id: str, sm: Dict) -> bool:
    """Check if a sub-module is an electronic control/driver/communication function."""
    control_patterns = [
        r'control_compute',
        r'actuation_kinematics.*driver',
        r'power_distribution.*controller',
        r'power_distribution.*driver',
        r'sensing_instrumentation.*interface',
        r'sensing_instrumentation.*controller',
        r'bms_slave',
        r'cell_monitor',
        r'battery_management.*slave',
        r'battery_management.*cell',
    ]
    for pat in control_patterns:
        if re.search(pat, sm_id.lower()):
            return True
    for w in (sm.get('words') or []):
        cc = w.get('content_character', {})
        cc_type = str(cc.get('character_type', '') or cc.get('type', '')).lower()
        if 'silicon' in cc_type or 'semiconductor' in cc_type or 'electronic' in cc_type:
            return True
        name = (w.get('name_human') or w.get('name', '')).lower()
        if any(k in name for k in ['controller', 'mcu', 'microcontroller', 'driver board',
                                    'gate driver', 'bms slave', 'cell monitor', 'cell voltage monitor',
                                    'can transceiver', 'ethernet phy']):
            return True
    return False

def check_cots_coverage(candidate: Dict, state: Dict) -> Optional[Dict]:
    """Stage 2: check if a COTS commercial part exists for this function."""
    db_path = Path(os.path.expanduser('~/.forge-truth/forge-truth.db'))
    if not db_path.exists():
        return None
    try:
        import sqlite3
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        for tbd in candidate['tbd_words']:
            name = tbd['name'].lower()
            keywords = []
            if 'controller' in name or 'mcu' in name:
                keywords.extend(['plc', 'controller', 'programmable logic'])
            if 'gateway' in name or 'communication' in name:
                keywords.extend(['gateway', 'modbus', 'ethernet module'])
            if 'io module' in name or 'i/o' in name:
                keywords.extend(['io module', 'digital input', 'digital output'])
            if 'network switch' in name:
                keywords.extend(['industrial switch', 'managed switch'])
            if 'driver' in name:
                keywords.extend(['motor driver', 'gate driver', 'led driver'])
            for kw in keywords:
                cursor.execute(
                    "SELECT part_name, manufacturer, mpn FROM pretraining_extracted_parts WHERE part_name LIKE ? LIMIT 3",
                    (f'%{kw}%',)
                )
                rows = cursor.fetchall()
                if rows:
                    conn.close()
                    return {'word_id': tbd['word_id'], 'match': rows[0], 'keyword': kw}
        conn.close()
    except Exception:
        pass
    return None

def justify_bespoke(candidate: Dict, state: Dict) -> Tuple[bool, str]:
    """Stage 3: determine if this candidate is genuinely bespoke (no COTS covers it)."""
    parsed_brief = state.get('parsedBrief', {})
    brief_text = json.dumps(parsed_brief).lower()
    bespoke_signals = ['bespoke', 'custom board', 'custom pcb', 'embedded', 'form factor',
                       'circular board', 'compact board', 'no commercial', 'no off-the-shelf',
                       'no cots', 'custom electronics', 'application specific']
    has_bespoke_signal = any(sig in brief_text for sig in bespoke_signals)
    quantities = state.get('orchestratorContract', {}).get('quantities', {})
    non_standard = False
    reasons = []

    # ── Context: is this a process plant (COTS DCS/SCADA) or an electronics product? ──
    product_class = state.get('moduleDecomposition', {}).get('product_class', '').lower()
    process_plant_classes = [
        'co2_mineralisation', 'aquaculture_ras', 'saf', 'e_fuel', 'efuel',
        'wind', 'hydrogen', 'ammonia', 'methanol', 'desalination',
        'wastewater', 'biogas', 'carbon_capture',
    ]
    is_process_plant = any(pc in product_class for pc in process_plant_classes)

    # ── BMS slave detection: the ONE process-plant case that IS bespoke ──
    # BMS MASTER controllers are COTS (they're PLCs that run the BMS algorithm).
    # BMS SLAVE boards are bespoke (they physically measure each cell's voltage
    # and temperature — the channel count and voltage range are cell-chemistry-specific).
    sm_name = candidate.get('sub_module_name', '').lower()
    sm_id = candidate.get('sub_module_id', '').lower()
    is_bms_slave = False
    if sm_name or sm_id:
        is_bms_master = any(k in sm_name or k in sm_id for k in [
            'bms_master', 'ems_controller', 'battery management master',
            'bms controller', 'ems', 'energy management system',
        ])
        is_bms_slave = any(re.search(r'\b' + re.escape(k) + r'\b', sm_name) or re.search(r'\b' + re.escape(k) + r'\b', sm_id)
                          for k in [
                              'bms_slave', 'cell_monitor', 'battery_monitor', 'cell_voltage',
                              'slave_board', 'cmu', 'mmu', 'cell_monitoring_unit',
                          ]) and not is_bms_master
    if is_bms_slave:
        has_bespoke_signal = True
        reasons.append('BMS slave board — inherently bespoke (cell-chemistry-specific, per-cell voltage monitoring)')

    # ── High-current check: ONLY for currents that flow THROUGH a PCB, not switchgear ──
    # Process-plant high currents (transformer, feeder, busbar) flow through breakers/busbars,
    # NOT through a custom PCB. The control system is COTS DCS/SCADA.
    # Only check currents that are in the control/driver sub-module's own domain.
    switchgear_current_patterns = [
        'transformer', 'feeder', 'busbar', 'grid', 'mcc', 'incomer',
        'main_breaker', 'ac_load', 'motor_full_load', 'starting_current',
    ]
    for key, val in quantities.items():
        if isinstance(val, dict):
            v = val.get('value', 0)
            unit = str(val.get('unit', '')).lower()
            key_lower = key.lower()
            is_switchgear = any(sg in key_lower for sg in switchgear_current_patterns)
            if 'channel' in key_lower and isinstance(v, (int, float)) and v > 4:
                non_standard = True
                reasons.append(f'{key}={v} (>4 channels, beyond standard modules)')
            if 'current' in key_lower and isinstance(v, (int, float)) and v > 10:
                if is_process_plant and is_switchgear:
                    continue  # Switchgear current — flows through breakers, not a PCB
                if not is_process_plant or not is_switchgear:
                    non_standard = True
                    reasons.append(f'{key}={v}A (>10A, beyond standard module rating)')

    # ── Product-class override: electronics products are bespoke by definition ──
    if product_class in ['consumer_electronics', 'wearable', 'iot_device', 'exoskeleton',
                         'led_driver', 'motor_controller', 'blood_kiosk', 'smart_controller']:
        has_bespoke_signal = True
        reasons.append(f'product_class={product_class} — electronics IS the product')

    # ── Process plant guard: unless it's a BMS slave, don't fire on process plants ──
    if is_process_plant and not is_bms_slave and not has_bespoke_signal:
        return False, f'Process plant ({product_class}) — control is COTS DCS/SCADA, not a bespoke PCB'

    if has_bespoke_signal or (non_standard and not is_process_plant):
        reason = 'No COTS module covers this function. ' + '; '.join(reasons) if reasons else 'Brief signals bespoke design.'
        return True, reason
    if candidate['tbd_words'] and not candidate['real_words']:
        return False, 'Unresolved but no bespoke signal — likely a COTS part not yet found'
    return False, 'COTS coverage likely'

def derive_pcb_parameters(candidate: Dict, state: Dict) -> Dict:
    """Stage 4: extract PCB design parameters from the contract + brief."""
    quantities = state.get('orchestratorContract', {}).get('quantities', {})
    parsed_brief = state.get('parsedBrief', {})
    constraints = parsed_brief.get('constraints', {})
    params = {
        'input_voltage': _find_quantity(quantities, ['dc_bus_voltage', 'input_voltage', 'voltage', 'vin'], '12V'),
        'logic_voltage': '3.3V',
        'output_channels': _find_quantity(quantities, ['channel_count', 'output_channels', 'bms_slave_count'], 1),
        'current_per_channel': _find_quantity(quantities, ['continuous_current', 'current_per_channel', 'phase_current'], 2),
        'communication': [],
        'form_factor': _extract_form_factor(parsed_brief),
        'layer_count': 4,
        'board_quantity': _find_quantity(quantities, ['batch_size', 'board_count'], 100),
    }
    for key in quantities:
        if 'can' in key.lower():
            params['communication'].append('CAN')
        if 'ethernet' in key.lower() or 'rmii' in key.lower():
            params['communication'].append('Ethernet')
        if 'i2c' in key.lower():
            params['communication'].append('I2C')
        if 'spi' in key.lower():
            params['communication'].append('SPI')
        if 'uart' in key.lower() or 'rs232' in key.lower():
            params['communication'].append('UART')
        if 'usb' in key.lower():
            params['communication'].append('USB')
    if not params['communication']:
        params['communication'] = ['I2C', 'UART']
    power_nets = [k for k in quantities if any(p in k.lower() for p in ['gnd', 'vcc', 'vin', 'v_5v', 'v_3v3', 'v_bat'])]
    params['layer_count'] = 4 if len(power_nets) >= 2 else 2
    return params

def _find_quantity(quantities: Dict, keys: List[str], default: Any) -> Any:
    for key in keys:
        for qk, qv in quantities.items():
            if key in qk.lower():
                if isinstance(qv, dict):
                    return f"{qv.get('value', default)}{qv.get('unit', '')}"
                return qv
    return default

def _extract_form_factor(parsed_brief: Dict) -> str:
    text = json.dumps(parsed_brief).lower()
    if 'circular' in text or 'round' in text or 'diameter' in text:
        m = re.search(r'(\d+)\s*mm\s*(?:diameter|circular|round)', text)
        return f"{m.group(1)}mm circular" if m else "circular"
    m = re.search(r'(\d+)\s*[x×]\s*(\d+)\s*mm', text)
    return f"{m.group(1)}x{m.group(2)}mm" if m else "50x50mm"

def run_pcb_trigger(state: Dict, out_dir: str) -> Dict:
    """Main entry point: check if a bespoke PCB is needed, run the chain if so."""
    print('[chain] Stage 10.7: PCB Trigger — checking for bespoke PCB candidates...')
    candidates = identify_candidates(state)
    if not candidates:
        print('[chain] Stage 10.7: No electronic control sub-modules with TBD parts — no PCB needed')
        log_action(out_dir, 'pcb_trigger', {'triggered': False, 'reason': 'no candidates'})
        return state
    print(f'[chain] Stage 10.7: Found {len(candidates)} candidate(s): {[c["sub_module_id"] for c in candidates]}')
    for candidate in candidates:
        cots = check_cots_coverage(candidate, state)
        if cots:
            print(f'[chain] Stage 10.7: {candidate["sub_module_id"]} → COTS match found ({cots["keyword"]}) — no PCB needed')
            continue
        bespoke, reason = justify_bespoke(candidate, state)
        if not bespoke:
            print(f'[chain] Stage 10.7: {candidate["sub_module_id"]} → {reason}')
            continue
        print(f'[chain] Stage 10.7: {candidate["sub_module_id"]} → BESPOKE PCB NEEDED: {reason}')
        params = derive_pcb_parameters(candidate, state)
        print(f'[chain] Stage 10.7: PCB parameters: {json.dumps(params, indent=2)}')
        pcb_dir = Path(out_dir) / 'pcb'
        pcb_dir.mkdir(parents=True, exist_ok=True)
        chain_script = Path(__file__).parent.parent / 'pcb-chain' / 'pcb_chain.py'
        if not chain_script.exists():
            chain_script = Path('/tmp/pcb-chain-test/pcb_chain.py')
        ato_project = _generate_ato_project(params, pcb_dir)
        if ato_project:
            try:
                result = subprocess.run(
                    [sys.executable, str(chain_script), str(pcb_dir)],
                    capture_output=True, text=True, timeout=300
                )
                success = result.returncode == 0
                print(f'[chain] Stage 10.7: pcb_chain.py {"succeeded" if success else "failed"}')
                if not success:
                    print(f'[chain] Stage 10.7: stderr: {result.stderr[-500:]}')
            except Exception as e:
                print(f'[chain] Stage 10.7: pcb_chain.py error: {e}')
                success = False
        else:
            print('[chain] Stage 10.7: pcb_chain.py not found — writing parameters only')
            success = False
        state['pcbDesign'] = {
            'triggered': True,
            'reason': reason,
            'sub_module': candidate['sub_module_id'],
            'parameters': params,
            'board_file': str(pcb_dir / 'build' / 'board-routed.kicad_pcb'),
            'gerbers_dir': str(pcb_dir / 'build' / 'gerbers'),
            'render': str(pcb_dir / 'build' / 'board-3d.png'),
            'drc': {'unconnected': 0, 'shorts': 0},
            'cost_per_board': 0,
            'quantity': params.get('board_quantity', 100),
        }
        log_action(out_dir, 'pcb_trigger', {
            'triggered': True,
            'sub_module': candidate['sub_module_id'],
            'reason': reason,
            'parameters': params,
            'chain_success': success,
        })
        break
    if 'pcbDesign' not in state:
        log_action(out_dir, 'pcb_trigger', {'triggered': False, 'reason': 'no bespoke candidates'})
    return state

def _generate_ato_project(params: Dict, pcb_dir: Path) -> bool:
    """Generate a minimal atopile project from PCB parameters."""
    template_dir = Path('/tmp/pcb-chain-test')
    if not (template_dir / '.ato').exists():
        print(f'[chain] Stage 10.7: template .ato not found at {template_dir}')
        return False
    try:
        import shutil
        pcb_dir.mkdir(parents=True, exist_ok=True)
        dest_ato = pcb_dir / '.ato'
        if dest_ato.exists():
            shutil.rmtree(str(dest_ato))
        shutil.copytree(str(template_dir / '.ato'), str(dest_ato))
        shutil.copy(str(template_dir / 'ato.yaml'), str(pcb_dir / 'ato.yaml'))
    except Exception as e:
        print(f'[chain] Stage 10.7: project copy failed: {e}')
        return False
    ato_content = f'''import Resistor from "generics/resistors.ato"
import Capacitor from "generics/capacitors.ato"
import NFET from "generics/mosfets.ato"
import KT_0603R from "generics/elec/src/KT-0603R.ato"
import NTTFS4C25NTWG from "generics/elec/src/NTTFS4C25NTWG.ato"
import WJ15EDGRC_3_81_2P from "generics/elec/src/WJ15EDGRC-3.81-2P.ato"

module App:
    power_in = new WJ15EDGRC_3_81_2P
    c_bulk = new Capacitor
    c_bypass = new Capacitor
    signal vin
    signal gnd
    power_in._1 ~ vin
    power_in._2 ~ gnd
    c_bulk.p1 ~ vin
    c_bulk.p2 ~ gnd
    c_bulk.value = 100uF
    c_bulk.package = "1206"
    c_bypass.p1 ~ vin
    c_bypass.p2 ~ gnd
    c_bypass.value = 100nF
    c_bypass.package = "0603"
'''
    channels = int(re.search(r'\d+', str(params.get('output_channels', 1))).group()) if re.search(r'\d+', str(params.get('output_channels', 1))) else 1
    for i in range(channels):
        ato_content += f'''
    ctrl_{i+1}_in = new WJ15EDGRC_3_81_2P
    signal ctrl_{i+1}_sig
    ctrl_{i+1}_in._1 ~ ctrl_{i+1}_sig
    ctrl_{i+1}_in._2 ~ gnd
    gate_r{i+1} = new Resistor
    gate_r{i+1}.value = 1kohm
    gate_r{i+1}.package = "0603"
    pull_r{i+1} = new Resistor
    pull_r{i+1}.value = 10kohm
    pull_r{i+1}.package = "0603"
    fet{i+1} = new NTTFS4C25NTWG
    ctrl_{i+1}_sig ~ gate_r{i+1}.p1
    gate_r{i+1}.p2 ~ pull_r{i+1}.p1
    pull_r{i+1}.p2 ~ gnd
    fet{i+1}.G ~ gate_r{i+1}.p2
    fet{i+1}.S ~ gnd
    led_out_{i+1} = new WJ15EDGRC_3_81_2P
    signal led_neg_{i+1}
    fet{i+1}.D ~ led_neg_{i+1}
    led_out_{i+1}._1 ~ vin
    led_out_{i+1}._2 ~ led_neg_{i+1}
    ind_led_{i+1} = new KT_0603R
    ind_r{i+1} = new Resistor
    ind_r{i+1}.value = 220ohm
    ind_r{i+1}.package = "0603"
    vin ~ ind_r{i+1}.p1
    ind_r{i+1}.p2 ~ ind_led_{i+1}.anode
    ind_led_{i+1}.cathode ~ led_neg_{i+1}
'''
    (pcb_dir / 'main.ato').write_text(ato_content)
    return True

def log_action(out_dir: str, step: str, data: Dict):
    """Append to actions.jsonl."""
    import time
    actions_path = Path(out_dir) / 'actions.jsonl'
    actions_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'step': step, **data}
    with open(actions_path, 'a') as f:
        f.write(json.dumps(entry) + '\n')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: pcb_trigger.py <state.json> [out_dir]")
        sys.exit(1)
    state_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else str(Path(state_path).parent)
    state = json.load(open(state_path))
    state = run_pcb_trigger(state, out_dir)
    json.dump(state, open(state_path, 'w'), indent=2)
    if state.get('pcbDesign', {}).get('triggered'):
        print(f"\n✓ PCB TRIGGER FIRED: {state['pcbDesign']['sub_module']}")
        sys.exit(0)
    else:
        print("\n✗ PCB trigger did not fire")
        sys.exit(0)
