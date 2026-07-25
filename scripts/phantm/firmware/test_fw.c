/* PHANTM firmware — host test bench (no hardware). cc -std=c99 -Wall -Wextra -Werror */
#include "phantm_fw.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>

/* ---- BSP stub: records every coil command, enforces invariants live ---- */
static int8_t coil_state[PH_CELLS][PH_COILS];
static int reverse_current_seen = 0;
static int max_cells_driven = 0;

void hw_coil_set(uint8_t cell, uint8_t coil, int8_t dir)
{
    assert(cell < PH_CELLS && coil < PH_COILS);
    assert(dir >= -1 && dir <= 1);
    if (dir < 0)
        reverse_current_seen = 1;
    coil_state[cell][coil] = dir;
}

static void scan_invariants(void)
{
    int driven = 0;
    for (int c = 0; c < PH_CELLS; c++) {
        int on = 0;
        for (int k = 0; k < PH_COILS; k++)
            if (coil_state[c][k] != 0)
                on = 1;
        driven += on;
    }
    if (driven > max_cells_driven)
        max_cells_driven = driven;
    assert(driven <= PH_MAX_PARALLEL && "rail budget violated");
}

static void run(ph_tile_t *t, unsigned max_ticks)
{
    for (unsigned i = 0; i < max_ticks && ph_busy(t); i++) {
        ph_tick(t);
        scan_invariants();
    }
}

int main(void)
{
    static ph_tile_t t;

    /* 1 — init: everything off, nothing homed, requests refused */
    ph_init(&t);
    for (int c = 0; c < PH_CELLS; c++)
        for (int k = 0; k < PH_COILS; k++)
            assert(coil_state[c][k] == 0);
    assert(!ph_request(&t, 0, 5) && "request before homing must fail");
    assert(!ph_request(&t, 0, PH_MAX_STEPS + 1) && "range check");
    assert(!ph_request(&t, PH_CELLS, 1) && "cell bound");

    /* 2 — homing: all cells walk to the stop; ends idle at pos 0, coils off */
    ph_home_all(&t);
    run(&t, 30u * 1000u * 1000u / PH_TICK_US);  /* ≤30 s: dual-drive homing is thermally paced */
    assert(!ph_busy(&t) && "homing must complete");
    for (int c = 0; c < PH_CELLS; c++) {
        assert(t.cell[c].pos == 0);
        for (int k = 0; k < PH_COILS; k++)
            assert(coil_state[c][k] == 0);
    }
    assert(t.active == 0);
    assert(max_cells_driven <= PH_MAX_PARALLEL);
    printf("homing OK: 24 cells x %d steps, max %d driven in parallel\n",
           PH_MAX_STEPS + PH_HOME_OVERDRIVE, max_cells_driven);

    /* 3 — single-cell move: exact step count, ends captured */
    assert(ph_request(&t, 3, 7));
    run(&t, 2u * 1000u * 1000u / PH_TICK_US);
    assert(t.cell[3].pos == 7 && !ph_busy(&t));

    /* 4 — full-tile re-point: every cell to a distinct depth */
    for (int c = 0; c < PH_CELLS; c++)
        assert(ph_request(&t, (uint8_t)c, (int16_t)((c * 2) % (PH_MAX_STEPS + 1))));
    run(&t, 30u * 1000u * 1000u / PH_TICK_US);
    assert(!ph_busy(&t) && "tile re-point must complete");
    for (int c = 0; c < PH_CELLS; c++)
        assert(t.cell[c].pos == (c * 2) % (PH_MAX_STEPS + 1));

    /* 5 — demagnetisation gate: with ALLOW_DUAL_DRIVE 0 no reverse current ever */
#if !ALLOW_DUAL_DRIVE
    assert(!reverse_current_seen && "demag gate breached: reverse current emitted");
    printf("demag gate OK: zero reverse-current commands across the whole run\n");
#endif

    /* 6 — thermal guard: hammer one cell back and forth; budget must hold */
    uint32_t peak_uj = 0;
    for (int rep = 0; rep < 40; rep++) {
        assert(ph_request(&t, 0, (rep % 2) ? 10 : 2));
        for (unsigned i = 0; i < 2u * 1000u * 1000u / PH_TICK_US && ph_busy(&t); i++) {
            ph_tick(&t);
            scan_invariants();
            for (int k = 0; k < PH_COILS; k++)
                if (t.cell[0].coil_uj[k] > peak_uj)
                    peak_uj = t.cell[0].coil_uj[k];
        }
    }
    /* one hold adds ~5.4 mJ; budget 12 mJ + one hold of overshoot allowed */
    assert(peak_uj < PH_COIL_BUDGET_UJ + 6000u && "thermal budget breached");
    printf("thermal guard OK: peak coil accumulator %u uJ (budget %u)\n",
           (unsigned)peak_uj, (unsigned)PH_COIL_BUDGET_UJ);

    printf("ALL FIRMWARE TESTS PASS\n");
    return 0;
}
