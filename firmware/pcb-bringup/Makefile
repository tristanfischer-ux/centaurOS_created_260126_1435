# Tier-1 compile + QEMU virtual-I²C MCU-sim
# SOURCE: firmware/pcb-bringup/ (first-class tree)
TARGET   ?= tier1_proof
MCUFLAGS ?= -mcpu=cortex-m0plus -mthumb
SIMFLAGS ?= -mcpu=cortex-m3 -mthumb -DFORGE_MCU_SIM
CFLAGS   ?= $(MCUFLAGS) -ffreestanding -nostdlib -Wall -Werror -Os
LDFLAGS  ?= $(MCUFLAGS) -nostdlib -T link.ld -Wl,--gc-sections
SIM_CFLAGS  ?= $(SIMFLAGS) -ffreestanding -nostdlib -Wall -Werror -Os
SIM_LDFLAGS ?= $(SIMFLAGS) -nostdlib -T link.ld -Wl,--gc-sections

.PHONY: all sim clean
all: $(TARGET).elf
sim: $(TARGET)_sim.elf

$(TARGET).elf: main.c startup.S link.ld pinmap.h pin_asserts.inc
	arm-none-eabi-gcc $(CFLAGS) -c main.c -o main.o
	arm-none-eabi-gcc $(CFLAGS) -c startup.S -o startup.o
	arm-none-eabi-gcc $(LDFLAGS) main.o startup.o -o $@

$(TARGET)_sim.elf: main.c virt_i2c.c virt_i2c.h virt_i2c_board.inc startup.S link.ld pinmap.h \
		pin_asserts.inc board_probes.inc board_identity.inc
	arm-none-eabi-gcc $(SIM_CFLAGS) -c main.c -o main_sim.o
	arm-none-eabi-gcc $(SIM_CFLAGS) -c virt_i2c.c -o virt_i2c_sim.o
	arm-none-eabi-gcc $(SIM_CFLAGS) -c startup.S -o startup_sim.o
	arm-none-eabi-gcc $(SIM_LDFLAGS) main_sim.o virt_i2c_sim.o startup_sim.o -o $@

clean:
	rm -f *.o *.elf
