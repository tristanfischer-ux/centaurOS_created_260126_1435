#!/usr/bin/env python3
"""
ForgeOS Component Catalogue Generator
======================================
Uses local Qwen 3 32B to generate structured component catalogue entries
for the ForgeOS Assembly Builder. Generates real-world components with
accurate specifications across all geometry types.

The component_catalogue table currently has only 6 parts. This script
generates 300-500 real-world components across motors, sensors, bearings,
fasteners, connectors, batteries, PCBs, structural, and more.

Usage:
    python3 scripts/generate-component-catalogue.py
    python3 scripts/generate-component-catalogue.py --dry-run
    python3 scripts/generate-component-catalogue.py --family "Brushless Motors"
    python3 scripts/generate-component-catalogue.py --push-only generated_components/batch_XXXXX.json

Environment:
    SUPABASE_URL              Supabase project URL (or NEXT_PUBLIC_SUPABASE_URL)
    SUPABASE_SERVICE_ROLE_KEY Service role key (bypasses RLS)
    OLLAMA_HOST               Ollama API host (default: http://localhost:11434)
    OLLAMA_MODEL              Ollama model name (default: qwen3:32b)

Dependencies:
    pip install requests python-slugify supabase
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from slugify import slugify


# ─── Configuration ──────────────────────────────────────────────────

# Load .env.local for Supabase credentials
_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip("'\"")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:32b")
OLLAMA_TIMEOUT = 1800
LLM_MAX_RETRIES = 2

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = Path("./generated_components")
LOG_FILE = Path("./component_catalogue_log.txt")


# ─── Component Families ────────────────────────────────────────────

COMPONENT_FAMILIES = [
    # ═══════════════════════════════════════════════════════════════
    # MOTION (7 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Brushless Motors (Drone)",
        "geometry_type_slug": "brushless_motor_outrunner",
        "count": 40,
        "param_fields": "od (outer diameter mm), height (body height mm), shaft_d (shaft diameter mm), shaft_h (shaft height above body mm), bolt_pcd (bolt circle pitch diameter mm), bolt_count (int), bolt_size (bolt thread diameter mm)",
        "context": "Real brushless DC outrunner motors for FPV drones and RC aircraft. Include brands: EMAX, T-Motor, BrotherHobby, iFlight, Sunnysky, RCINPower, XING. Vary sizes (1404-2814), KV ratings (1000-2800KV). Include weight in grams, realistic prices from GetFPV, RaceDayQuads, Banggood, Amazon.",
    },
    {
        "family": "Stepper Motors",
        "geometry_type_slug": "stepper_motor_nema",
        "count": 30,
        "param_fields": "nema_size (11, 14, 17, 23, or 34), body_l (body length mm), shaft_d (shaft diameter mm), shaft_l (shaft length mm)",
        "context": "Real NEMA-standard stepper motors for 3D printers, CNC machines. Include NEMA 11, 14, 17 (most common), 23, 34. Brands: Creality, StepperOnline, Wantai, LDO, Moons. Vary torque, step angles (0.9 or 1.8 deg), body lengths.",
    },
    {
        "family": "Servo Motors",
        "geometry_type_slug": "servo_motor",
        "count": 25,
        "param_fields": "length (body length mm), width (body width mm), height (body height mm), shaft_offset_x (shaft center X offset from body center mm), shaft_d (output shaft diameter mm)",
        "context": "Real RC servo motors. Include micro (SG90, MG90S), standard (MG996R, DS3218), digital (Savox, Hitec, Futaba). Also Dynamixel smart servos (XL330, XL430, XM430). Vary torque (1.5-30 kg.cm), speed, voltage (4.8V-7.4V).",
    },
    {
        "family": "DC Gear Motors",
        "geometry_type_slug": "dc_gear_motor",
        "count": 25,
        "param_fields": "body_d (body diameter mm), body_l (body length mm), shaft_d (output shaft diameter mm), shaft_l (shaft length mm), gearbox_d (gearbox diameter mm), gearbox_l (gearbox length mm)",
        "context": "Real DC gear motors: N20 micro metal gearmotors (10x12x24mm), 25mm GA25 series, 37mm JGB37 series. Brands: Pololu, CHIHAI, DFRobot. Gear ratios from 10:1 to 1000:1. Voltages: 3V, 6V, 12V. Include with and without encoders.",
    },
    {
        "family": "Linear Actuators",
        "geometry_type_slug": "linear_actuator",
        "count": 16,
        "param_fields": "body_l (retracted length mm), stroke (stroke length mm), body_d (body diameter mm), shaft_d (shaft diameter mm), mounting_hole_d (mm)",
        "context": "Real mini linear actuators. Include Actuonix L12, L16, PQ12 micro actuators. Also larger 12V linear actuators (50-300mm stroke) for furniture, automation. Include force ratings (10N-1500N), speed, voltage.",
    },
    {
        "family": "Stepper Drivers",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (PCB thickness mm), corner_r (corner radius mm)",
        "context": "Real stepper motor driver boards. Include TMC2209, TMC2208, TMC5160 (Trinamic), A4988, DRV8825 step-stick modules. Also larger boards: ODrive S1, VESC 6, Makerbase MKS TMC2209. Exact PCB dimensions, mounting holes.",
    },
    {
        "family": "Motor Controllers",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (PCB thickness mm), corner_r (corner radius mm)",
        "context": "Real BLDC/DC motor controllers. Include ODrive v3.6/S1, VESC 4.12/6/75-300, Kelly KLS controllers. Also ESC boards for drones: SpeedyBee 45A, Tekko32 55A. Exact board dimensions.",
    },
    # ═══════════════════════════════════════════════════════════════
    # COMPUTE & SBCs (3 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Single Board Computers",
        "geometry_type_slug": "pcb_board",
        "count": 40,
        "param_fields": "width (board width mm), height (board depth mm), thickness (PCB thickness mm, usually 1.6), corner_r (corner radius mm), holes (JSON array of {x, y, d} mounting holes)",
        "context": "Real SBCs with exact dimensions. Raspberry Pi 5 (85x56mm), Pi 4B, Pi Zero 2W (65x30mm), Pi Pico (51x21mm). NVIDIA Jetson Nano (100x80mm), Jetson Orin Nano. Arduino Uno (68.6x53.4mm), Mega, Nano. ESP32 DevKit. Teensy 4.0/4.1. BeagleBone Black. Orange Pi 5, Lattepanda 3 Delta. Google Coral Dev Board Mini. Seeed XIAO. Use EXACT published dimensions.",
    },
    {
        "family": "Microcontroller Boards",
        "geometry_type_slug": "pcb_board",
        "count": 30,
        "param_fields": "width (board width mm), height (board depth mm), thickness (PCB thickness mm), corner_r (corner radius mm)",
        "context": "Real microcontroller dev boards. ESP32-WROOM (51x25mm), ESP32-S3 DevKit, ESP8266 NodeMCU, STM32 Blue Pill/Nucleo-64, Adafruit Feather M4/nRF52840, SparkFun Thing Plus, Seeed XIAO ESP32C3/RP2040, Raspberry Pi Pico W. Include pin header dimensions, USB connector positions.",
    },
    {
        "family": "FPV Flight Controllers",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (PCB thickness mm), corner_r (corner radius mm), mounting_pattern (20x20 or 30.5x30.5 mm)",
        "context": "Real FPV flight controllers. SpeedyBee F405 V4 (36.5x36.5mm, 30.5x30.5 mount), Matek F722-SE, BetaFPV F4 1S 12A AIO, iFlight SucceX-E F7, Holybro Kakute H7 V2. Include Betaflight/INAV compatibility, gyro type, mounting pattern.",
    },
    # ═══════════════════════════════════════════════════════════════
    # POWER (5 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "DC-DC Converters",
        "geometry_type_slug": "pcb_board",
        "count": 30,
        "param_fields": "width (board width mm), height (board depth mm), thickness (board height including components mm), corner_r (corner radius mm)",
        "context": "Real DC-DC converter modules. Pololu step-down D24V5F5/D24V10F5, Adafruit Mini Buck (5V 1A), MP1584 buck modules, XL6009 boost, LM2596 buck. Also USB-C PD trigger boards (IP2721, CH224K). Include input/output voltage ranges, max current, efficiency. Exact board dimensions.",
    },
    {
        "family": "Battery Cells & Packs",
        "geometry_type_slug": "battery_cell",
        "count": 30,
        "param_fields": "diameter (cell diameter mm), length (cell length mm), capacity_mah (milliamp-hours), voltage_nominal (V)",
        "context": "Real battery cells. 18650: Samsung 30Q (3000mAh), Sony VTC6 (3000mAh), Molicel P42A (4200mAh), Samsung 25R. 21700: Molicel P45B, Samsung 50E. LiPo packs: Tattu 1300mAh 4S, GNB 650mAh 4S. Also TP4056 charging boards (25.4x17mm), BMS boards for 2S-6S. Exact cell dimensions.",
    },
    {
        "family": "Power Distribution Boards",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real power distribution boards. Matek FCHUB-6S, iFlight SucceX PDB, Holybro PM07/PM02. Also Pololu power distribution, Adafruit PowerBoost 1000C. Include voltage regulators, current ratings, mounting patterns.",
    },
    # ═══════════════════════════════════════════════════════════════
    # SENSORS (5 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "IMU & Motion Sensors",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real IMU breakout boards. BMI270 (Bosch), ICM-42688-P, MPU6050 (InvenSense), LSM6DSO (ST), BNO055 (Bosch 9-axis). Adafruit, SparkFun, Pololu breakouts. Include axes, gyro/accel ranges, I2C/SPI interface, exact board dimensions.",
    },
    {
        "family": "Environmental Sensors",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real environmental sensor breakouts. BME280/BME680 (temp/humidity/pressure/gas), SCD40/SCD41 (CO2), SHT40 (temp/humidity), PM2.5 sensors (PMS5003), UV sensors (VEML6070). Adafruit STEMMA QT, SparkFun Qwiic. Exact board dimensions.",
    },
    {
        "family": "LiDAR & Distance Sensors",
        "geometry_type_slug": "sensor_module",
        "count": 20,
        "param_fields": "width (body width mm), height (body depth mm), depth (body depth mm), mounting_holes (description)",
        "context": "Real LiDAR and distance sensors. SLAMTEC RPLidar A1/A2/A3 (spinning LiDAR), VL53L1X ToF (Pololu/Adafruit breakout), HC-SR04 ultrasonic (45x20x15mm), TFMini Plus, Garmin LIDAR-Lite v4. Intel RealSense depth cameras. Exact physical dimensions and mounting.",
    },
    {
        "family": "Current & Voltage Sensors",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real current/voltage sensor modules. INA219, INA260 (Adafruit/SparkFun breakouts), ACS712 (20A/30A), hall effect current sensors. Include measurement ranges, accuracy, I2C addresses.",
    },
    {
        "family": "Encoders & Position Sensors",
        "geometry_type_slug": "sensor_module",
        "count": 16,
        "param_fields": "diameter (body diameter mm), height (body height mm), shaft_d (shaft diameter mm)",
        "context": "Real rotary encoders: AS5048A/AS5600 magnetic encoders (breakout boards), CUI AMT102-V, optical encoders (200-2048 PPR). Linear encoders. Include resolution, interface (SPI/I2C/ABZ). Brands: Broadcom, CUI, AMS-OSRAM.",
    },
    # ═══════════════════════════════════════════════════════════════
    # CONNECTIVITY (4 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "LoRa & LPWAN Modules",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real LoRa modules. RAK Wireless RAK4631/RAK11200, HolyBro SiK Telemetry, Adafruit LoRa Radio FeatherWing (RFM95W), LILYGO TTGO T-Beam, Heltec WiFi LoRa 32 V3. SX1276/SX1262 based. Include frequency bands, range, antenna connector type.",
    },
    {
        "family": "Cellular & GPS Modules",
        "geometry_type_slug": "pcb_board",
        "count": 20,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real cellular and GPS modules. Quectel EC25/EC200U (4G LTE), SIMCom SIM7600, u-blox NEO-M8N/M9N/F9P (RTK GPS), Holybro H-RTK F9P, Adafruit Ultimate GPS, SparkFun GPS-RTK. Include interface, antenna type, accuracy.",
    },
    {
        "family": "WiFi & Bluetooth Modules",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real WiFi/BLE modules. ESP32-WROOM-32 bare module (18x25.5mm), ESP32-C3 module, nRF52840 module (Raytac MDBT50Q), Zigbee modules (CC2530), USB WiFi adapters. Brands: Espressif, Nordic, TI.",
    },
    {
        "family": "RC Receivers & Transmitters",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), corner_r (mm)",
        "context": "Real RC receivers. ELRS receivers (BetaFPV SuperP 2.4GHz, HappyModel EP1/EP2), TBS Crossfire Nano, FrSky R-XSR, Radiomaster RP1/RP2. Also video transmitters: Caddx Vista, HDZero VTX, analog VTX. Exact dimensions.",
    },
    # ═══════════════════════════════════════════════════════════════
    # DISPLAYS & UI (3 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "OLED & LCD Displays",
        "geometry_type_slug": "display_module",
        "count": 25,
        "param_fields": "width (module width mm), height (module height mm), thickness (module depth mm), screen_w (active area width mm), screen_h (active area height mm), mounting_holes (description)",
        "context": "Real display modules. OLED: 0.96\" SSD1306 128x64 (27x27x4mm), 1.3\" SH1106 128x64, 2.42\" SSD1309. TFT: 1.8\" ST7735 (52x35mm), 2.8\" ILI9341 (50x86mm), 3.5\" (56x97mm), 7\" HDMI (165x100mm). E-ink: Waveshare 2.13\" (60x30mm), 4.2\" (91x77mm). Brands: Adafruit, Waveshare, generic.",
    },
    {
        "family": "Buttons, Switches & Encoders",
        "geometry_type_slug": "switch_module",
        "count": 20,
        "param_fields": "width (body width mm), height (body height mm), depth (body depth mm), shaft_d (shaft diameter mm or null)",
        "context": "Real buttons and switches. Tactile pushbuttons (6x6x5mm, 12x12x7mm), rotary encoders (EC11, 12.5x13.5mm), toggle switches (MTS-102), rocker switches, joystick modules (PS2 thumbstick 26x34mm). Include panel mount types with bushing dimensions.",
    },
    {
        "family": "LED Matrices & NeoPixels",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (mm), led_count (int), led_pitch (mm)",
        "context": "Real LED products. NeoPixel strips (WS2812B), Adafruit NeoPixel Ring (various diameters), 8x8 LED matrix (MAX7219, 32x32mm), 16x16 matrix, Pimoroni Unicorn HAT Mini. Also discrete high-power LEDs with star PCBs.",
    },
    # ═══════════════════════════════════════════════════════════════
    # OPTICS (2 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Camera Modules",
        "geometry_type_slug": "camera_module",
        "count": 20,
        "param_fields": "width (module width mm), height (module height mm), depth (module depth including lens mm), lens_mount (M12 or CS or fixed), sensor_size (diagonal mm)",
        "context": "Real camera modules. Raspberry Pi Camera Module 3 (25x24x11mm), Pi Camera V2, Pi HQ Camera (38x38mm, CS mount), Arducam IMX477/IMX519, OAK-D Lite depth camera (91x28x17mm), Caddx Vista/Ratel FPV cameras, RunCam Phoenix 2, FLIR Lepton 3.5 thermal (11.8x12.7mm). Exact physical dimensions.",
    },
    {
        "family": "Audio Components",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (body/board width mm), height (body/board depth mm), depth (depth mm)",
        "context": "Real audio components. Adafruit MAX98357 I2S amp (26x21mm), PAM8403 amp board, Adafruit SPH0645 MEMS mic breakout, SparkFun WM8960 codec breakout. Speakers: 20mm, 28mm, 40mm round speakers. Include interface, power output, impedance.",
    },
    # ═══════════════════════════════════════════════════════════════
    # THERMAL (2 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Cooling Fans",
        "geometry_type_slug": "axial_fan",
        "count": 30,
        "param_fields": "size (fan frame size mm: 25, 30, 40, 60, 80, or 120), depth (fan depth mm), blade_count (int), hole_d (mounting hole diameter mm)",
        "context": "Real axial cooling fans. Sizes: 25mm, 30mm, 40mm, 60mm, 80mm, 120mm. Brands: Noctua (NF-A4x10, NF-A8), Sunon, Delta. Also blower fans (radial, 40x40x10mm, 50x50x15mm). Voltages: 5V, 12V, 24V. Include CFM, noise dBA, connector type (2-pin, 4-pin PWM).",
    },
    {
        "family": "Heatsinks & Thermal",
        "geometry_type_slug": "heatsink",
        "count": 20,
        "param_fields": "width (base width mm), height (base depth mm), fin_h (fin height mm), base_t (base thickness mm), fin_count (number of fins)",
        "context": "Real heatsinks. Small IC heatsinks (14x14x6mm, 20x20x10mm with thermal tape), Raspberry Pi heatsink kits, 40x40x11mm for MOSFETs, large 80x80x27mm for power supplies. Also Peltier TEC modules (TEC1-12706, 40x40mm), heat pipes. Include thermal resistance where known.",
    },
    # ═══════════════════════════════════════════════════════════════
    # CONNECTORS (3 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Panel Mount Connectors",
        "geometry_type_slug": "connector",
        "count": 25,
        "param_fields": "flange_w (flange width mm), flange_h (flange height mm), body_d (body diameter or depth mm), cutout_w (panel cutout width mm), cutout_h (panel cutout height mm)",
        "context": "Real panel mount connectors. USB-C (14x6.5mm cutout), USB-A, Ethernet RJ45, SMA/RP-SMA (6.5mm hole), DC barrel jack (2.1x5.5mm), GX12/GX16 aviation connectors, D-sub DB9/DB25. Include panel cutout dimensions — critical for chassis design.",
    },
    {
        "family": "Wire-to-Board Connectors",
        "geometry_type_slug": "connector",
        "count": 25,
        "param_fields": "pitch (pin pitch mm), pins (number of pins), width (housing width mm), height (housing height mm), depth (housing depth mm)",
        "context": "Real wire-to-board connectors. JST-XH (2.5mm pitch, 2-6 pin), JST-PH (2.0mm pitch), JST-SH (1.0mm pitch), Molex KK 2.54mm, Dupont 2.54mm. Also XT60 (16.5x8.3mm), XT30 (12.7x6.5mm), Anderson PowerPole 15/30/45A. Include mating height.",
    },
    {
        "family": "Board-to-Board & Headers",
        "geometry_type_slug": "connector",
        "count": 16,
        "param_fields": "pitch (pin pitch mm), pins (total pins), rows (1 or 2), width (mm), height (mm), depth (mm)",
        "context": "Real pin headers and sockets. 2.54mm male/female headers (1x20, 2x20 for Pi), 2.0mm headers, FFC/FPC connectors (0.5/1.0mm pitch), edge card connectors (M.2 slots). Also SD card holders (26.5x28.5mm), micro-SD slots.",
    },
    # ═══════════════════════════════════════════════════════════════
    # INDUSTRIAL / AUTOMATION (2 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Relay & SSR Modules",
        "geometry_type_slug": "pcb_board",
        "count": 16,
        "param_fields": "width (board width mm), height (board depth mm), thickness (total height mm), corner_r (mm)",
        "context": "Real relay modules. 1-channel, 2-channel, 4-channel, 8-channel 5V relay boards (Keyes, Sainsmart). Solid state relays (SSR-25DA, 40A). Also MOSFET switching modules. Brands: Seeed Studio, Adafruit, generic. Include coil voltage, contact rating.",
    },
    {
        "family": "Industrial Connectors & Terminal Blocks",
        "geometry_type_slug": "connector",
        "count": 16,
        "param_fields": "width (mm), height (mm), depth (mm), pitch (mm), ways (number of terminals)",
        "context": "Real industrial connectors. M12 panel mount (4/5/8-pin, A/B/D coded), M8 connectors, DIN rail terminal blocks (5.08mm pitch, Phoenix Contact), screw terminal blocks (2.54-5.08mm pitch), CAN bus DB9 connectors. Include IP ratings for M12/M8.",
    },
    # ═══════════════════════════════════════════════════════════════
    # MECHANICAL (existing families, expanded)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Ball Bearings",
        "geometry_type_slug": "ball_bearing",
        "count": 40,
        "param_fields": "id (inner diameter mm), od (outer diameter mm), width (bearing width mm), shielded (true or false)",
        "context": "Real miniature and standard ball bearings. Include sizes: 603, 604, 605, 606, 607, 608, 609, 623, 624, 625, 683, 684, 685, 686, 688, 6000, 6001, 6002, 6003, 6200, 6201. Brands: SKF, NTN, NSK, generic. Include 2RS and ZZ variants.",
    },
    {
        "family": "Socket Head Cap Screws",
        "geometry_type_slug": "socket_head_cap_screw",
        "count": 40,
        "param_fields": "thread_d (nominal diameter mm), thread_l (screw length mm)",
        "context": "Real metric socket head cap screws (ISO 4762). Include M2, M2.5, M3, M4, M5, M6, M8 in lengths 6-50mm. Materials: A2 stainless, black oxide, titanium. Suppliers: Bolt Base, Amazon, RS Components, Accu.",
    },
    {
        "family": "Hex Nuts & Washers",
        "geometry_type_slug": "hex_nut",
        "count": 25,
        "param_fields": "thread_d (nominal diameter mm), af (across flats mm)",
        "context": "Real metric hex nuts (ISO 4032) and flat washers. Include standard, nyloc, flange nuts, and flat/spring washers in M2-M8. Materials: A2 stainless, zinc-plated steel, brass, nylon.",
    },
    {
        "family": "Aluminum Extrusion & Rails",
        "geometry_type_slug": "aluminum_extrusion",
        "count": 25,
        "param_fields": "profile_w (width mm: 20, 30, 40), profile_h (height mm: 20, 40, 60, 80), length (cut length mm), slot_w (T-slot width mm)",
        "context": "Real V-slot and T-slot aluminum extrusion profiles. Include 2020, 2040, 3030, 4040, 4080. Brands: OpenBuilds, Misumi, 80/20 Inc. Lengths: 250, 300, 500, 1000mm.",
    },
    {
        "family": "Linear Guides",
        "geometry_type_slug": "linear_guide",
        "count": 25,
        "param_fields": "rail_w (rail width mm), rail_h (rail height mm), length (rail length mm), carriage_l (carriage block length mm), carriage_w (carriage block width mm), carriage_h (carriage block height mm)",
        "context": "Real linear guides. MGN7, MGN9, MGN12, MGN15 miniature rails. Also HGR15, HGR20 industrial. Brands: Hiwin, ReliaBot, generic. Lengths: 200-500mm.",
    },
    {
        "family": "Springs & Couplings",
        "geometry_type_slug": "spring_compression",
        "count": 20,
        "param_fields": "od (outer coil diameter mm), wire_d (wire diameter mm), free_l (free length mm), coils (number of active coils)",
        "context": "Real compression springs and flexible shaft couplings. Springs for 3D printer beds. Jaw couplings, beam couplings, Oldham couplings. Bore combos: 5-5, 5-8, 8-8mm.",
    },
    {
        "family": "Structural (Tubes, Brackets)",
        "geometry_type_slug": "l_bracket",
        "count": 20,
        "param_fields": "arm_a (first arm length mm), arm_b (second arm length mm), width (bracket width mm), thickness (material thickness mm), hole_d (mounting hole diameter mm)",
        "context": "Real L-brackets, corner brackets for 2020/4040 extrusion. Carbon fiber tubes (10-25mm OD) for drone arms. Standoffs (M2.5, M3, nylon/brass, 5-25mm heights). Brands: OpenBuilds, generic.",
    },
    # ═══════════════════════════════════════════════════════════════
    # STORAGE (1 family)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Storage & Carriers",
        "geometry_type_slug": "pcb_board",
        "count": 12,
        "param_fields": "width (mm), height (mm), thickness (mm), corner_r (mm)",
        "context": "Real storage modules. M.2 NVMe USB 3.1 enclosures, M.2 breakout boards for Pi CM4, SD card breakout boards (Adafruit, SparkFun), USB flash drive industrial (Transcend, Kingston). Include form factors (2230, 2242, 2280).",
    },
    # ═══════════════════════════════════════════════════════════════
    # PNEUMATICS & HYDRAULICS (3 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Pneumatic Cylinders",
        "geometry_type_slug": "linear_actuator",
        "count": 15,
        "param_fields": "bore_d (bore diameter mm), stroke (stroke length mm), body_l (body length mm), rod_d (rod diameter mm), mounting_hole_d (mm)",
        "context": "Real pneumatic cylinders from SMC, Festo, Parker, Norgren. Include micro cylinders (6-16mm bore), compact (20-32mm), and standard (40-100mm). Single and double acting. ISO 6432 and ISO 15552 standards.",
    },
    {
        "family": "Solenoid Valves",
        "geometry_type_slug": "pcb_board",
        "count": 12,
        "param_fields": "width (body width mm), height (body height mm), thickness (body depth mm), corner_r (corner radius mm)",
        "context": "Real solenoid valves from SMC, Festo, Burkert, ASCO. Include 2/2-way, 3/2-way, 5/2-way. Port sizes G1/8 to G1/2. 12V and 24V DC coils. Direct acting and pilot operated.",
    },
    {
        "family": "Pressure Regulators",
        "geometry_type_slug": "generic_cylinder",
        "count": 10,
        "param_fields": "body_d (body diameter mm), body_h (body height mm), port_d (port diameter mm)",
        "context": "Real pressure regulators from SMC, Festo, Norgren. Include miniature (AR20), standard (AR40), precision regulators. Pressure ranges 0.05-1.0 MPa. With and without gauge.",
    },
    # ═══════════════════════════════════════════════════════════════
    # ROBOTICS SPECIFIC (3 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Harmonic Drives & Strain Wave Gears",
        "geometry_type_slug": "generic_cylinder",
        "count": 10,
        "param_fields": "body_d (outer diameter mm), body_h (height mm), shaft_d (output shaft diameter mm)",
        "context": "Real harmonic drive reducers from Harmonic Drive AG, Leaderdrive, SHD series. Ratios 50:1 to 160:1. Sizes 14-40. Used in robot joints, CNC rotary tables. Include torque ratings and backlash specs.",
    },
    {
        "family": "Robot Grippers",
        "geometry_type_slug": "generic_box",
        "count": 12,
        "param_fields": "width (body width mm), height (body height mm), depth (body depth mm)",
        "context": "Real robot grippers: Robotiq 2F-85, 2F-140, Hand-E. OnRobot RG2, RG6, VGC10 vacuum. Schunk PGN-plus, EGP. DH-Robotics AG-95. Include parallel jaw, adaptive, vacuum, and soft grippers. Stroke, force, weight specs.",
    },
    {
        "family": "Force/Torque Sensors",
        "geometry_type_slug": "generic_cylinder",
        "count": 8,
        "param_fields": "body_d (outer diameter mm), body_h (height mm), mounting_hole_d (mm)",
        "context": "Real force/torque sensors from ATI Industrial (Mini45, Nano17, Gamma), OnRobot HEX, Robotiq FT 300, Bota Systems SensONE. 6-axis F/T sensors for robot wrists. Include measurement ranges, resolution, communication interfaces.",
    },
    # ═══════════════════════════════════════════════════════════════
    # OPTICS & IMAGING (2 families)
    # ═══════════════════════════════════════════════════════════════
    {
        "family": "Lenses & Optical Filters",
        "geometry_type_slug": "generic_cylinder",
        "count": 12,
        "param_fields": "body_d (outer diameter mm), body_h (height mm), thread_d (thread diameter mm)",
        "context": "Real optical components from Thorlabs, Edmund Optics, Newport. Include M12 lenses for machine vision (2.8mm-25mm focal), C-mount lenses, IR filters, bandpass filters, beam splitters. Arducam lenses for Raspberry Pi cameras.",
    },
    {
        "family": "LiDAR Modules",
        "geometry_type_slug": "pcb_board",
        "count": 10,
        "param_fields": "width (module width mm), height (module height mm), thickness (module depth mm), corner_r (corner radius mm)",
        "context": "Real LiDAR modules: RPLidar A1/A2/S2 (Slamtec), Livox Mid-360, Velodyne VLP-16, Hokuyo URG-04LX, TFmini Plus, Garmin LIDAR-Lite v4, Intel RealSense L515. Include range, scan rate, FOV, interface specs.",
    },
]


# ─── LLM Prompt Template ──────────────────────────────────────────

GENERATION_PROMPT = """You are a hardware engineering assistant with deep knowledge of commercially available electronic and mechanical components.

Generate exactly {count} REAL, commercially available "{family}" components as a JSON array.

GEOMETRY TYPE: {geometry_type_slug}
GEOMETRY PARAMS (fields to include in geometry_params): {param_fields}

CONTEXT:
{context}

For EACH component, output a JSON object with these EXACT fields:
{{
  "name": "Full product name (e.g., 'EMAX ECO II 2807 1300KV')",
  "manufacturer": "Brand name",
  "part_number": "Manufacturer part number",
  "geometry_params": {{ ... param fields with numeric values ... }},
  "weight_g": number (weight in grams),
  "material": "Primary material(s)",
  "sources": [
    {{
      "supplier": "Store name",
      "url": "https://example.com/product",
      "price": number,
      "currency": "USD" or "GBP" or "EUR",
      "in_stock": true
    }}
  ],
  "tags": ["tag1", "tag2", "tag3"],
  "datasheet_url": "URL if known, or null"
}}

CRITICAL RULES:
1. ONLY include REAL components that actually exist in the market
2. geometry_params values must be NUMBERS (not strings)
3. Weight must be realistic in grams
4. Include at least one source with realistic pricing
5. Tags should be useful for search (size, use case, brand, spec)
6. Vary the components: different sizes, power ratings, price points, manufacturers
7. Part numbers should be real manufacturer part numbers
8. URLs can be approximate (correct domain, plausible path)

Output ONLY the JSON array. No commentary, no markdown fences, just the raw JSON array starting with [ and ending with ]."""


# ─── Logging ─────────────────────────────────────────────────────

def log(msg: str) -> None:
    """Print and log a message."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


# ─── LLM Interaction ─────────────────────────────────────────────

def generate_with_qwen(prompt: str, attempt: int = 1) -> list[dict] | None:
    """Send prompt to Qwen via Ollama streaming. Returns parsed JSON array."""
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.3,
            "num_predict": 8192,
        },
    }

    try:
        label = f" (retry {attempt})" if attempt > 1 else ""
        log(f"    🤖 Streaming from {OLLAMA_MODEL}{label}...")
        start = time.time()
        resp = requests.post(url, json=payload, stream=True, timeout=OLLAMA_TIMEOUT)

        if resp.status_code != 200:
            log(f"    ❌ Ollama HTTP {resp.status_code}")
            return None

        full_response = ""
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                full_response += chunk.get("response", "")
                if chunk.get("done"):
                    break

        elapsed = time.time() - start
        log(f"    ⏱️  Response in {elapsed:.1f}s ({len(full_response)} chars)")

        if not full_response.strip():
            log(f"    ⚠️  Empty response")
            if attempt < LLM_MAX_RETRIES:
                time.sleep(5)
                return generate_with_qwen(prompt, attempt + 1)
            return None

        # Strip Qwen 3 <think> blocks
        cleaned = re.sub(r"<think>.*?</think>", "", full_response, flags=re.DOTALL).strip()
        if not cleaned:
            log(f"    ⚠️  Response was entirely think tags")
            if attempt < LLM_MAX_RETRIES:
                time.sleep(5)
                return generate_with_qwen(prompt, attempt + 1)
            return None

        result = _parse_json_array(cleaned)
        if result is None and attempt < LLM_MAX_RETRIES:
            log(f"    🔄 Retrying generation...")
            time.sleep(5)
            return generate_with_qwen(prompt, attempt + 1)

        return result

    except requests.RequestException as e:
        log(f"    ❌ Ollama request failed: {e}")
        if attempt < LLM_MAX_RETRIES:
            time.sleep(10)
            return generate_with_qwen(prompt, attempt + 1)
        return None


def _parse_json_array(text: str) -> list[dict] | None:
    """Extract a JSON array from LLM response text."""
    # Strategy 1: direct parse
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 2: find outermost [ ... ]
    bracket_depth = 0
    start_idx = None
    for i, ch in enumerate(text):
        if ch == "[":
            if bracket_depth == 0:
                start_idx = i
            bracket_depth += 1
        elif ch == "]":
            bracket_depth -= 1
            if bracket_depth == 0 and start_idx is not None:
                try:
                    result = json.loads(text[start_idx:i + 1])
                    if isinstance(result, list):
                        return result
                except json.JSONDecodeError:
                    start_idx = None

    # Strategy 3: strip markdown fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    try:
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    log(f"    ❌ Could not parse JSON array from response")
    log(f"    📝 First 300 chars: {text[:300]}")
    return None


# ─── Validation & Normalization ───────────────────────────────────

def validate_component(comp: dict, family: dict) -> tuple[bool, list[str]]:
    """Validate a generated component entry."""
    errors: list[str] = []

    for field in ["name", "geometry_params"]:
        if field not in comp:
            errors.append(f"Missing required field: {field}")

    gp = comp.get("geometry_params", {})
    if not isinstance(gp, dict) or len(gp) == 0:
        errors.append("geometry_params must be a non-empty object")

    weight = comp.get("weight_g")
    if weight is not None and (not isinstance(weight, (int, float)) or weight <= 0):
        errors.append(f"Invalid weight: {weight}")

    sources = comp.get("sources", [])
    if isinstance(sources, list):
        for src in sources:
            if isinstance(src, dict):
                price = src.get("price")
                if price is not None and isinstance(price, str):
                    try:
                        src["price"] = float(price)
                    except ValueError:
                        errors.append(f"Invalid price: {price}")

    return len(errors) == 0, errors


def fix_component(comp: dict, family: dict) -> dict:
    """Apply fixes and defaults to a generated component."""
    slug = family["geometry_type_slug"]
    comp["geometry_type_slug"] = slug

    if not comp.get("manufacturer"):
        comp["manufacturer"] = "Generic"

    if not comp.get("tags"):
        comp["tags"] = []

    if not isinstance(comp.get("tags"), list):
        comp["tags"] = [str(comp["tags"])]

    # Coerce geometry_params values to numbers where possible
    gp = comp.get("geometry_params", {})
    if isinstance(gp, dict):
        for k, v in gp.items():
            if isinstance(v, str):
                try:
                    gp[k] = float(v)
                except ValueError:
                    pass
        comp["geometry_params"] = gp

    # Ensure weight is a number
    w = comp.get("weight_g")
    if isinstance(w, str):
        try:
            comp["weight_g"] = float(w)
        except ValueError:
            comp["weight_g"] = None

    # Ensure sources have proper structure
    sources = comp.get("sources", [])
    if isinstance(sources, list):
        fixed_sources = []
        for src in sources:
            if isinstance(src, dict) and src.get("supplier"):
                price = src.get("price")
                if isinstance(price, str):
                    try:
                        src["price"] = float(price)
                    except ValueError:
                        src["price"] = 0
                fixed_sources.append(src)
        comp["sources"] = fixed_sources

    return comp


# ─── Supabase Push ───────────────────────────────────────────────

def push_to_supabase(components: list[dict]) -> int:
    """Push generated components to Supabase component_catalogue table."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        return 0

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # Fetch existing entries to avoid duplicates
    log("📡 Fetching existing catalogue entries...")
    existing_url = f"{SUPABASE_URL}/rest/v1/component_catalogue?select=name,part_number"
    resp = requests.get(existing_url, headers=headers, timeout=30)
    existing_names: set[str] = set()
    existing_parts: set[str] = set()
    if resp.status_code == 200:
        for row in resp.json():
            existing_names.add(row.get("name", "").lower())
            if row.get("part_number"):
                existing_parts.add(row["part_number"].lower())

    log(f"  Found {len(existing_names)} existing entries")

    pushed = 0
    skipped = 0
    for comp in components:
        name_lower = comp.get("name", "").lower()
        part_lower = (comp.get("part_number") or "").lower()

        if name_lower in existing_names or (part_lower and part_lower in existing_parts):
            skipped += 1
            continue

        row = {
            "name": comp["name"],
            "manufacturer": comp.get("manufacturer"),
            "part_number": comp.get("part_number"),
            "geometry_type_slug": comp["geometry_type_slug"],
            "geometry_params": comp.get("geometry_params", {}),
            "mounting_points": comp.get("mounting_points", []),
            "weight_g": comp.get("weight_g"),
            "material": comp.get("material"),
            "sources": comp.get("sources", []),
            "datasheet_url": comp.get("datasheet_url"),
            "tags": comp.get("tags", []),
            "verified": False,
        }

        insert_url = f"{SUPABASE_URL}/rest/v1/component_catalogue"
        resp = requests.post(insert_url, headers=headers, json=row, timeout=15)
        if resp.status_code in (200, 201):
            pushed += 1
        else:
            log(f"  ⚠️  Failed to insert '{comp['name']}': {resp.status_code} {resp.text[:200]}")

    log(f"✅ Pushed {pushed} components, skipped {skipped} duplicates")
    return pushed


# ─── Main ────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate component catalogue entries with Qwen")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't push to Supabase")
    parser.add_argument("--family", type=str, help="Generate only a specific family (by name)")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip families already present in the latest batch file in generated_components/",
    )
    parser.add_argument("--push-only", type=str, help="Push previously generated batch file to Supabase")
    parser.add_argument("--model", type=str, help="Override Ollama model (e.g. qwen3:14b)")
    args = parser.parse_args()

    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    OUTPUT_DIR.mkdir(exist_ok=True)
    LOG_FILE.parent.mkdir(exist_ok=True)

    log("=" * 60)
    log("ForgeOS Component Catalogue Generator")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log(f"Families: {len(COMPONENT_FAMILIES)}")
    log(f"Estimated components: {sum(f['count'] for f in COMPONENT_FAMILIES)}")
    log("=" * 60)

    # Push-only mode
    if args.push_only:
        log(f"📤 Push-only mode: {args.push_only}")
        with open(args.push_only, "r") as f:
            all_components = json.load(f)
        log(f"  Loaded {len(all_components)} components")
        push_to_supabase(all_components)
        return

    # Filter families if requested
    families = COMPONENT_FAMILIES
    if args.family:
        families = [f for f in families if args.family.lower() in f["family"].lower()]
        if not families:
            log(f"❌ No family matching '{args.family}'")
            sys.exit(1)
        log(f"🎯 Filtered to {len(families)} families matching '{args.family}'")
    elif args.resume:
        # Skip families already in the latest batch file
        batch_files = sorted(OUTPUT_DIR.glob("batch_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if batch_files:
            with open(batch_files[0], "r") as f:
                existing = json.load(f)
            done_families = {c.get("family") for c in existing if isinstance(c, dict) and c.get("family")}
            if done_families:
                families = [f for f in families if f["family"] not in done_families]
                log(f"🔄 Resume: skipping {len(done_families)} families already in {batch_files[0].name}")
        if not families:
            log("✅ No families left to generate (resume).")
            return

    all_components: list[dict] = []
    success_count = 0
    fail_count = 0

    for i, family in enumerate(families, 1):
        log("")
        log(f"[{i}/{len(families)}] 🏭 Generating: {family['family']} ({family['count']} components)")

        prompt = GENERATION_PROMPT.format(
            count=family["count"],
            family=family["family"],
            geometry_type_slug=family["geometry_type_slug"],
            param_fields=family["param_fields"],
            context=family["context"],
        )

        components = generate_with_qwen(prompt)
        if not components:
            log(f"  ❌ Failed to generate {family['family']}")
            fail_count += 1
            continue

        log(f"  📦 Got {len(components)} raw components")

        valid_components: list[dict] = []
        for comp in components:
            if not isinstance(comp, dict):
                continue
            comp = fix_component(comp, family)
            is_valid, errors = validate_component(comp, family)
            if is_valid:
                comp["family"] = family["family"]
                valid_components.append(comp)
            else:
                log(f"    ⚠️  Skipping '{comp.get('name', '?')}': {'; '.join(errors)}")

        log(f"  ✅ {family['family']}: {len(valid_components)}/{len(components)} valid")
        all_components.extend(valid_components)
        success_count += 1

    # Save results
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = OUTPUT_DIR / f"batch_{ts}.json"
    with open(output_file, "w") as f:
        json.dump(all_components, f, indent=2)
    log(f"\n💾 Saved {len(all_components)} components to {output_file}")
    log(f"📊 Families: {success_count} success, {fail_count} failed")

    # Push to Supabase
    if not args.dry_run:
        log("\n📤 Pushing to Supabase...")
        push_to_supabase(all_components)
    else:
        log("\n🏷️  Dry run - skipping Supabase push")
        log(f"   To push later: python3 {sys.argv[0]} --push-only {output_file}")

    log("\n✅ Component catalogue generation complete!")


if __name__ == "__main__":
    main()
