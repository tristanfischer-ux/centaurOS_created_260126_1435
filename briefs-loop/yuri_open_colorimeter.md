# Portable Single-Wavelength Photometer (Colorimeter) — Yuri Wet-Lab Benchmark 01

We are designing a **portable, single-wavelength photometer (colorimeter)** for analytical and biological assays: a compact, battery-and-USB-powered benchtop instrument that shines a defined wavelength of light through a liquid sample in a standard cuvette and reports the raw intensity, transmittance and absorbance, converting absorbance into concentration via user-stored calibration curves. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** certified medical equipment. Score the delivered dossier against the black-box brief below and against portable single-wavelength absorbance-photometer engineering practice.

Target user: laboratory, education and field users running colorimetric and turbidity assays (e.g. protein, phosphate, nitrate, optical density) who need a local absorbance reading without a computer or a benchtop spectrophotometer.

## System description

- A light path in which a **replaceable LED source module** (single wavelength, selectable across the visible and near-infrared band) illuminates a **standard 10 mm path-length cuvette**, and a photodetector measures the transmitted intensity.
- A **light-tight sample chamber** with a lid/shroud so ambient room light cannot materially affect a measurement.
- Signal-conditioning + digitisation of the detector output and computation of raw intensity, %transmittance and absorbance (A = −log10(I/I₀)).
- A **one-button blank/reference (I₀) procedure** so the user zeroes on a blank cuvette before reading a sample.
- A **local display** (and controls) that reports the result without requiring an attached computer.
- On-board storage of **user calibration curves** (absorbance → concentration) selectable per assay.
- **Power** from USB and from a **rechargeable internal battery** for portable operation, with charge management.
- An enclosure combining commercially available electronics with **additive-manufactured (3D-printed) enclosure parts**, designed for **small-batch manufacture (batches of 20)**.

## Key constraints (state these as the brief's hard targets)

- **Optical path length:** accept a standard **10 mm** path-length cuvette.
- **Source:** replaceable single-wavelength **LED source modules** covering the visible-to-near-infrared range (state the representative wavelengths supported, e.g. a set across ~430–940 nm, and the interchange mechanism).
- **Measured quantities:** raw intensity, **transmittance (%T)** and **absorbance (A)**; state the usable absorbance range and resolution honestly.
- **Blanking:** one-button blank/reference capture of I₀; measurement reports A relative to the stored blank.
- **Calibration:** store multiple user calibration curves converting absorbance to concentration; state the curve model (e.g. linear Beer–Lambert fit + range).
- **Local readout:** results shown on an on-board display with no computer required; state the user-interface flow (blank → insert sample → read).
- **Ambient-light rejection:** the sample chamber must prevent ambient light from materially affecting a reading; state the mechanism (light-tight lid / shroud) and the residual stray-light assumption.
- **Power:** operate from **USB power** and a **rechargeable internal battery**; state battery chemistry, capacity, run-time and charge method.
- **Manufacturability:** manufacturable in **batches of 20** using **commercially available electronics** and **additive-manufactured enclosure parts**.
- **Cost:** target a prototype **bill of materials below £200** excluding labour.
- **Positioning:** research-use engineering hardware. Do **not** present it as a clinical diagnostic device or certified medical equipment unless a separate regulatory programme is specified.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **optical calculations** (Beer–Lambert, light budget, detector SNR / limit-of-detection), **schematic**, **PCB or module interconnect design**, **enclosure CAD**, an **exact bill of materials**, **firmware** (measurement + blanking + calibration + display logic), the **calibration workflow**, **assembly instructions**, a **test fixture**, **performance verification**, and a **risk register**.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with the PCB outline and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability (10 mm cuvette, replaceable single-wavelength LED source, intensity/%T/absorbance, one-button blank, on-board calibration curves, local display, USB + rechargeable battery, ambient-light rejection) with an honestly-priced BOM under £200 and a design manufacturable in batches of 20 from catalogue electronics + printed enclosure parts. Prefer real, catalogue-available parts the engine can price honestly over invented components.
