/* Virtual I²C peripheral models — DEVS[] filled from virt_i2c_board.inc at emit. */
#include "virt_i2c.h"

typedef struct {
  uint8_t addr;
  uint8_t present;
  uint8_t regs[16];
} virt_dev_t;

static virt_dev_t DEVS[] = {
#include "virt_i2c_board.inc"
};

int virt_i2c_device_count(void) {
  /* Count present devices only — stub row uses present=0 so empty boards FAIL. */
  int n = (int)(sizeof(DEVS) / sizeof(DEVS[0]));
  int c = 0;
  for (int i = 0; i < n; i++) {
    if (DEVS[i].present) c++;
  }
  return c;
}

int virt_i2c_read8(uint8_t addr, uint8_t reg) {
  int n = (int)(sizeof(DEVS) / sizeof(DEVS[0]));
  for (int i = 0; i < n; i++) {
    if (DEVS[i].present && DEVS[i].addr == addr) {
      return (int)DEVS[i].regs[reg & 0x0Fu];
    }
  }
  return -1; /* NACK — device not on the virtual bus */
}
