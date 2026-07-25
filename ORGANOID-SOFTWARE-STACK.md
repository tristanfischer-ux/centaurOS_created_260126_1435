# Organoid bioreactor — operating software stack (council, 2026-07-25)
The chain auto-generates only the Tier-1 firmware PROOF (contract). This is the REAL operating
software the device needs. Council: Gemini-3.1-Pro, Kimi-K2.6, Grok-4.3.

## Topology: WORKER-HOST (ESP32 worker + Raspberry Pi/PC host)
ESP32-S3 alone is INSUFFICIENT for a multi-week culture (RAM/flash, Wi-Fi stalls block control,
heap fragments, no safe OTA/data). ESP32 = real-time control + safety brain (keeps culture alive
autonomously); Pi/PC host = UI + protocol engine + data + OTA orchestration.

## Layers (real refs)
1. Firmware — ESP-IDF/FreeRTOS (C). Control loops + safety + state machine. Ref: eVOLVER, Klipper.
2. Connectivity — MQTT (Mosquitto) + REST + SNTP + offline flash buffer. Ref: Pioreactor.
3. Host — Python FastAPI + Paho-MQTT on a Pi; protocol→setpoints. Ref: OctoPrint, Pioreactor leader.
4. Web UI — React/Vue SPA + ECharts/Plotly; growth curve, protocol editor, calibration wizards. Ref: Mainsail/Fluidd, Pioreactor UI.
5. Data — InfluxDB (time-series) + SQLite (metadata) + Pandas (dOD/dt). Ref: eVOLVER.

## Control loops (Kimi)
- Temperature: asymmetric PI + anti-windup + dead-band, 2 Hz (Peltier bidirectional; windup overshoot >0.5K cooks organoids)
- Stirrer: CLOSED-loop PI on Hall-tach period, 20 Hz (open-loop stalls <=100 RPM → shear kills organoids)
- Perfusion: positional step-count + slow volumetric PI trim, inner 1 kHz / outer 0.1 Hz (peristaltic pulsation)
- OD600: synchronous lock-in (LED modulated, ADC in/out-of-phase), 1 kHz → report per 5 min

## Safety MUST live in firmware (not host)
Thermal-runaway cutoff (>38.5C → TEC off, fan 100%); stirrer-stall; pump-runaway/over-perfusion;
"Survival Mode" on host-crash/Wi-Fi-loss (autonomous 37C + basal stir + pump-off); leak/media-
depletion safe-off. PLUS a HARDWARE dead-man switch (safety-task GPIO toggle → logic gate cuts
TEC/pump enable) even if the MCU boot-loops.

## #1 RISK (all seats): safety-task STARVATION by Wi-Fi/telemetry blocking → thermal PID stops →
actuators hold last PWM → temp drifts to necrosis silently over days. FIX: safety task pinned Core 1
(Wi-Fi Core 0), highest priority, zero-blocking, watchdog + hardware dead-man.

## Grok under-scoping (regulated bio): immutable audit trail (setpoint+user+time), calibration/drift
records, sterility/contamination logging, protocol versioning+hash, alarm escalation+ack, power-loss
checkpoint/resume, 21 CFR Part 11 data integrity. MQTT traps: auth (unauth topics = anyone changes
temp!), OTA bricking, offline buffer, local control authority when broker down, message ordering.

## MVP day-1 vs full
MVP: ESP32 FreeRTOS + hardcoded 37C PID + OD/temp read + embedded AsyncWebServer page + WebSocket
charts + CSV download + manual setpoints. Full: MQTT setpoints + safe OTA + crash recovery + offline
buffer; Pi host multi-unit; InfluxDB+SQLite; React SPA + protocol builder + calibration + dOD/dt.
