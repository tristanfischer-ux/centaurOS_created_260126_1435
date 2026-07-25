/* PHANTM tile firmware — reference implementation. See phantm_fw.h. */
#include "phantm_fw.h"
#include <string.h>

/* Commutation: detents advance one third-pitch per step. To step FORWARD from
 * detent k, PULL with phase (k+1) mod 3; the DUAL scheme additionally CANCELS
 * the holding phase k with reverse current (gated by ALLOW_DUAL_DRIVE).
 * Backward mirrors: pull (k+2) mod 3 ≡ (k-1), cancel k.                      */
static void drive_on(ph_tile_t *t, uint8_t c)
{
    ph_cell_t *cl = &t->cell[c];
    uint8_t k = (uint8_t)(((cl->pos % 3) + 3) % 3);
    uint8_t pull = (uint8_t)((k + (cl->step_dir > 0 ? 1 : 2)) % 3);
    hw_coil_set(c, pull, +1);
#if ALLOW_DUAL_DRIVE
    hw_coil_set(c, k, -1);                 /* cancel the holding pole */
    cl->coil_uj[k] += 2680u * PH_TICK_US / 1500u; /* same-order accumulation */
#endif
    cl->coil_uj[pull] += 2680u * PH_TICK_US / 1500u; /* 2.68 mJ per 1.5 ms of drive */
}

static void drive_off(ph_tile_t *t, uint8_t c)
{
    for (uint8_t i = 0; i < PH_COILS; i++)
        hw_coil_set(c, i, 0);
    (void)t;
}

void ph_init(ph_tile_t *t)
{
    memset(t, 0, sizeof *t);
    for (uint8_t c = 0; c < PH_CELLS; c++)
        drive_off(t, c);
}

bool ph_busy(const ph_tile_t *t)
{
    for (uint8_t c = 0; c < PH_CELLS; c++)
        if (t->cell[c].state != PH_CELL_IDLE ||
            t->cell[c].pos != t->cell[c].target)
            return true;
    return false;
}

bool ph_request(ph_tile_t *t, uint8_t cell, int16_t target)
{
    if (cell >= PH_CELLS || target < 0 || target > PH_MAX_STEPS)
        return false;
    ph_cell_t *cl = &t->cell[cell];
    if (!cl->homed || cl->state != PH_CELL_IDLE)
        return false;
    cl->target = target;
    return true;
}

void ph_home_all(ph_tile_t *t)
{
    /* open-loop homing: assume the worst-case position (full stroke + margin)
     * and command a walk to 0. The translator reaches the hard stop early and
     * the surplus "steps" are harmless stall pulses against it; on completion
     * the logical position 0 IS the stop. Uses the normal state machine, so
     * the rail and thermal guards hold during homing too.                    */
    for (uint8_t c = 0; c < PH_CELLS; c++) {
        ph_cell_t *cl = &t->cell[c];
        cl->homed = true;
        cl->pos = PH_MAX_STEPS + PH_HOME_OVERDRIVE;
        cl->target = 0;
        cl->state = PH_CELL_IDLE;
    }
}

static bool thermal_ok(const ph_cell_t *cl, uint8_t k, uint8_t pull)
{
    if (cl->coil_uj[pull] > PH_COIL_BUDGET_UJ) return false;
#if ALLOW_DUAL_DRIVE
    if (cl->coil_uj[k] > PH_COIL_BUDGET_UJ) return false;
#else
    (void)k;
#endif
    return true;
}

void ph_tick(ph_tile_t *t)
{
    t->tick++;
    for (uint8_t c = 0; c < PH_CELLS; c++) {
        ph_cell_t *cl = &t->cell[c];
        /* thermal cool-down (linear leak approximating exp, integer-safe) */
        for (uint8_t i = 0; i < PH_COILS; i++)
            if (cl->coil_uj[i])
                cl->coil_uj[i] -= (cl->coil_uj[i] + PH_COOL_TAU_TICKS - 1) / PH_COOL_TAU_TICKS;

        switch (cl->state) {
        case PH_CELL_IDLE:
            if (cl->pos != cl->target && t->active < PH_MAX_PARALLEL) {
                cl->step_dir = (cl->target > cl->pos) ? +1 : -1;
                uint8_t k = (uint8_t)(((cl->pos % 3) + 3) % 3);
                uint8_t pull = (uint8_t)((k + (cl->step_dir > 0 ? 1 : 2)) % 3);
                if (!thermal_ok(cl, k, pull))
                    break;                       /* wait for cool-down */
                cl->state = PH_CELL_HOLD;
                cl->phase_ticks = PH_HOLD_TICKS;
                t->active++;
                drive_on(t, c);
            }
            break;

        case PH_CELL_HOLD:
            if (cl->phase_ticks) { cl->phase_ticks--; drive_on(t, c); break; }
            drive_off(t, c);
            cl->pos = (int16_t)(cl->pos + cl->step_dir);
            cl->phase_ticks = PH_SETTLE_TICKS;
            cl->state = PH_CELL_SETTLE;
            break;

        case PH_CELL_SETTLE:
            if (cl->phase_ticks) { cl->phase_ticks--; break; }
            t->active--;
            cl->state = PH_CELL_IDLE;            /* IDLE branch launches next step */
            break;
        }
    }
}
