/* Freestanding bring-up — Tier-1 compile + QEMU virtual-board test.
 * SOURCE OF TRUTH: firmware/pcb-bringup/ (copied into out/…/mcu-project at emit).
 * Board binding via pin_asserts.inc / board_probes.inc / board_identity.inc.
 */
#include "pinmap.h"
#if defined(FORGE_MCU_SIM)
#include "virt_i2c.h"
#include "board_identity.inc"
#endif

void Reset_Handler(void);

#if defined(FORGE_MCU_SIM)
/* Angel/ARM semihosting — only valid under QEMU -semihosting. */
static inline int forge_sh_call(int op, void *arg) {
  register int r0 asm("r0") = op;
  register void *r1 asm("r1") = arg;
  asm volatile ("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  return r0;
}
static void forge_sh_write0(const char *s) {
  (void)forge_sh_call(0x04 /* SYS_WRITE0 */, (void *)s);
}
static void forge_sh_exit(unsigned int code) {
  unsigned int packed = 0x20026;
  (void)code;
  (void)forge_sh_call(0x18 /* SYS_EXIT */, &packed);
}
#endif

void Reset_Handler(void) {
#include "pin_asserts.inc"
#if defined(FORGE_MCU_SIM)
  forge_sh_write0("MCU_SIM|" FORGE_PROOF_TARGET "|BOOT\n");
  /* GOTCHA: must call virt_i2c_read8 — do not invent CHECK PASS without a probe. */
  if (virt_i2c_device_count() <= 0) {
    forge_sh_write0("CHECK i2c_bus FAIL empty_virtual_board\n");
    forge_sh_exit(1);
  }
#include "board_probes.inc"
  forge_sh_write0("CHECK mcu_sim PASS\n");
  forge_sh_exit(0);
#endif
  for (;;) { }
}
