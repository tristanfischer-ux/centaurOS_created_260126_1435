/* Virtual I²C bus — imagined peripherals for QEMU MCU-sim (not HIL).
 * INTENT: firmware must virt_i2c_read8() modelled devices; canned PASS is theatre.
 */
#ifndef FORGE_VIRT_I2C_H
#define FORGE_VIRT_I2C_H
#include <stdint.h>
#define FORGE_VIRT_I2C_MAGIC 0xA5
int virt_i2c_read8(uint8_t addr, uint8_t reg);
int virt_i2c_device_count(void);
#endif
