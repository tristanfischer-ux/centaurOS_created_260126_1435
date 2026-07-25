/* PHANTM tile firmware — reference step-sequencer (portable C99, no deps).
 *
 * Scope: one 24-cell tile. Open-loop stepping into PM detents per report §4.4 +
 * §10.3: HOLD the drive scheme for HOLD_TICKS, RELEASE, wait SETTLE_TICKS —
 * the Ø0.15 mm air damper guarantees capture for any hold ≥ 3 ms (campaign).
 * Direction comes from the phase SEQUENCE. The DUAL pull-and-cancel scheme
 * (needed by the optimised detents) is COMPILED OUT until the demagnetisation
 * gate of report §10.4 is closed: ALLOW_DUAL_DRIVE stays 0 until that FE run
 * clears the cancel coil's reverse MMF against the magnet knee.
 *
 * Hardware abstraction (implemented by the board support package):
 *   hw_coil_set(cell, coil, dir)  dir ∈ {-1, 0, +1} — bridge state per coil
 *   (with ALLOW_DUAL_DRIVE 0 the BSP may map onto the unipolar board: dir -1
 *    is then illegal and asserted against.)
 *
 * Timing: ph_tick() is called every TICK_US microseconds (default 100 µs).
 * Concurrency: at most PH_MAX_PARALLEL cells actively driven (rail budget,
 * report §9.5: 8 ⇒ 15.4 W stepping pulses).
 * Thermal: per-coil energy accumulator with exponential cool-down; a coil
 * over budget refuses new steps until it cools (adiabatic ΔT guard, §10.2).
 */
#ifndef PHANTM_FW_H
#define PHANTM_FW_H

#include <stdint.h>
#include <stdbool.h>

#define PH_CELLS            24
#define PH_COILS            3
#define PH_TICK_US          100u
#define PH_MAX_PARALLEL     8
#define PH_HOLD_TICKS       30u    /* 3.0 ms  — campaign minimum reliable hold */
#define PH_SETTLE_TICKS     55u    /* 5.5 ms  — balanced-set settle (§10.2)    */
#define PH_MAX_STEPS        53     /* usable stroke / mean step ≈ 8.27/0.155   */
#define PH_HOME_OVERDRIVE   6      /* extra steps against the end stop         */

/* demagnetisation gate (report §10.4): dual drive stays off until cleared */
#ifndef ALLOW_DUAL_DRIVE
#define ALLOW_DUAL_DRIVE    0
#endif

/* thermal guard: coil energy budget (µJ) and cool-down time constant (ticks).
 * 2.68 mJ/step stepping regime; budget = 4 steps back-to-back, τ = 0.5 s. */
#define PH_COIL_BUDGET_UJ   12000u
#define PH_COOL_TAU_TICKS   5000u

typedef enum { PH_CELL_IDLE = 0, PH_CELL_HOLD, PH_CELL_SETTLE } ph_cell_state_t;

typedef struct {
    ph_cell_state_t state;
    int16_t  pos;          /* current detent index, valid after homing */
    int16_t  target;
    uint16_t phase_ticks;  /* ticks remaining in current phase          */
    int8_t   step_dir;     /* direction of the in-flight step           */
    bool     homed;
    uint32_t coil_uj[PH_COILS];   /* thermal accumulators                */
} ph_cell_t;

typedef struct {
    ph_cell_t cell[PH_CELLS];
    uint8_t   active;      /* cells currently in HOLD (rail budget)     */
    uint32_t  tick;
} ph_tile_t;

/* board support package — provided by the target (or the host test bench) */
extern void hw_coil_set(uint8_t cell, uint8_t coil, int8_t dir);

/* API */
void ph_init(ph_tile_t *t);
bool ph_request(ph_tile_t *t, uint8_t cell, int16_t target_steps); /* false: bad arg/not homed */
void ph_home_all(ph_tile_t *t);
void ph_tick(ph_tile_t *t);                                        /* call every PH_TICK_US */
bool ph_busy(const ph_tile_t *t);

#endif /* PHANTM_FW_H */
