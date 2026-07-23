/* Minimal Cortex-M vectors — Reset from C + weak defaults. */
  .syntax unified
  .thumb

  .extern Reset_Handler

  .section .vectors, "a", %progbits
  .globl __vectors
__vectors:
  .word _estack
  .word Reset_Handler
  .word Default_Handler /* NMI */
  .word Default_Handler /* HardFault */
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word Default_Handler /* SVCall */
  .word 0
  .word 0
  .word Default_Handler /* PendSV */
  .word Default_Handler /* SysTick */

  .section .text.Default_Handler, "ax", %progbits
  .weak Default_Handler
  .thumb_func
  .globl Default_Handler
Default_Handler:
  b .
