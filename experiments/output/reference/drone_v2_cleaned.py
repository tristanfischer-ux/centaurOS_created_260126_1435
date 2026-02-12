"""
Manufacturing-Ready Quadcopter Drone - CadQuery Model
======================================================
Detailed DJI Mavic-class quadcopter designed for manufacturing.

Features:
- Shell body with internal ribbing and wall thickness
- Screw bosses and mounting points
- PCB mounting posts with standoffs
- Wire routing channels through arms
- Realistic motor mounts with bolt patterns
- Camera gimbal with 3-axis pivot geometry
- Ventilation grilles (functional)
- Battery bay with rails and latch mechanism
- Antenna cavity
- GPS puck recess
- Landing gear with shock-absorbing geometry
- Prop guard mounting points
- USB-C port and SD card slot cutouts
- Front/rear/bottom obstacle avoidance sensor recesses
- LED light bar channels
- ESC mounting bays in arms
- Realistic propeller geometry with airfoil cross-section hints
"""

import cadquery as cq
import math

# Output directory

# ============================================================
# GLOBAL PARAMETERS (all in mm)
# ============================================================

# --- Body shell ---
body_length = 200
body_width = 85
body_height = 48
body_wall = 2.0          # shell wall thickness
body_fillet_outer = 14
body_fillet_inner = 10
top_dome_height = 10

# --- Arms ---
arm_length = 140          # center to motor center
arm_width = 20
arm_height = 16
arm_wall = 2.0
arm_fillet = 4
arm_wire_channel_dia = 6  # internal wire routing
arm_angle_front = 32      # degrees from forward axis
arm_angle_rear = 38       # degrees from rear axis

# --- Motor mount ---
motor_mount_od = 28       # outer diameter
motor_mount_id = 22       # stator bore
motor_mount_height = 5
motor_bolt_circle = 16    # M3 bolt circle diameter
motor_bolt_dia = 3.2      # M3 clearance
motor_bolt_count = 4
motor_bell_od = 24
motor_bell_height = 12
motor_shaft_dia = 5
motor_shaft_length = 10
motor_magnet_ring_od = 22
motor_magnet_ring_id = 18
motor_magnet_ring_h = 8

# --- ESC bay (in arm) ---
esc_length = 30
esc_width = 15
esc_height = 5
esc_offset = 35  # from body center along arm

# --- Propellers ---
prop_diameter = 230       # 9 inch props
prop_chord_root = 18
prop_chord_tip = 8
prop_thickness = 2.5
prop_hub_od = 12
prop_hub_id = 5.2
prop_hub_height = 6

# --- Camera / Gimbal ---
gimbal_plate_w = 40
gimbal_plate_d = 30
gimbal_plate_h = 3
gimbal_yaw_ring_od = 20
gimbal_yaw_ring_h = 6
gimbal_pitch_arm_l = 15
gimbal_pitch_arm_w = 6
gimbal_pitch_arm_h = 4
camera_body_w = 28
camera_body_h = 22
camera_body_d = 26
camera_lens_od = 16
camera_lens_id = 12
camera_lens_depth = 10
camera_sensor_w = 8
camera_sensor_h = 6
gimbal_damper_od = 8
gimbal_damper_id = 4
gimbal_damper_h = 6

# --- Battery bay ---
batt_length = 110
batt_width = 62
batt_height = 30
batt_wall = 1.5
batt_rail_w = 4
batt_rail_h = 3
batt_latch_w = 16
batt_latch_h = 8
batt_latch_d = 6
batt_contact_w = 4
batt_contact_h = 8
batt_contact_d = 2
batt_contact_count = 6
batt_contact_spacing = 8

# --- PCB mounting ---
pcb_length = 60
pcb_width = 40
pcb_standoff_dia = 5
pcb_standoff_hole = 2.5  # M2.5
pcb_standoff_h = 6
pcb_screw_head_dia = 5

# --- Screw bosses (body assembly) ---
boss_od = 8
boss_id = 2.5             # M2.5 self-tap
boss_height = 12

# --- Ports & cutouts ---
usbc_w = 9.0
usbc_h = 3.4
usbc_depth = 8
sdcard_w = 12
sdcard_h = 1.5
sdcard_depth = 15
status_led_w = 30
status_led_h = 3
status_led_d = 2

# --- Sensors ---
front_sensor_w = 10
front_sensor_h = 8
front_sensor_d = 4
front_sensor_spacing = 26  # stereo baseline
bottom_sensor_dia = 12
rear_sensor_dia = 10

# --- Ventilation ---
vent_slot_w = 2
vent_slot_l = 15
vent_slot_spacing = 4
vent_count = 6

# --- GPS ---
gps_puck_od = 22
gps_puck_h = 5
gps_recess_od = 24
gps_recess_depth = 3

# --- Antenna ---
antenna_length = 35
antenna_width = 16
antenna_height = 4
antenna_cavity_wall = 1.5

# --- Landing gear ---
lg_strut_length = 50
lg_strut_w = 10
lg_strut_h = 18
lg_foot_l = 54
lg_foot_w = 12
lg_foot_h = 4
lg_foot_rubber_h = 2
lg_fillet = 3

# --- Prop guards (mount points only) ---
pg_boss_od = 6
pg_boss_id = 2.0
pg_boss_h = 5

# --- Tolerances ---
tol_press = 0.05
tol_clearance = 0.15
tol_loose = 0.3


# ============================================================
# HELPER FUNCTIONS
# ============================================================
def motor_arm_endpoints():
    """Calculate the 4 motor center positions"""
    positions = []
    for sign_x, sign_y, angle in [
        (1, 1, arm_angle_front),
        (1, -1, arm_angle_front),
        (-1, 1, arm_angle_rear),
        (-1, -1, arm_angle_rear),
    ]:
        rad = math.radians(angle)
        x = sign_x * arm_length * math.cos(rad)
        y = sign_y * arm_length * math.sin(rad)
        positions.append((x, y))
    return positions


def arm_angle_for(sign_x, sign_y, base_angle):
    """Get the rotation angle in degrees for an arm"""
    return math.degrees(math.atan2(sign_y * math.sin(math.radians(base_angle)),
                                    sign_x * math.cos(math.radians(base_angle))))


MOTOR_POSITIONS = motor_arm_endpoints()

# ============================================================
# 1. MAIN BODY - UPPER SHELL
# ============================================================

# Outer body
body_outer = (
    cq.Workplane("XY")
    .box(body_length, body_width, body_height, centered=True)
    .edges("|Z").fillet(body_fillet_outer)
    .edges(">Z").fillet(8)
    .edges("<Z").fillet(4)
)

# Top dome for aerodynamics
body_dome = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 - 4)
    .ellipse(body_length / 2 - 5, body_width / 2 - 5)
    .extrude(top_dome_height)
    .edges(">Z").fillet(8)
)
body_outer = body_outer.union(body_dome)

# Hollow out the body (shell)
body_inner = (
    cq.Workplane("XY")
    .workplane(offset=-1)
    .box(body_length - body_wall * 2, body_width - body_wall * 2,
         body_height - body_wall, centered=True)
    .edges("|Z").fillet(body_fillet_inner)
    .edges(">Z").fillet(6)
)
body_shell = body_outer.cut(body_inner)

# ============================================================
# 2. INTERNAL RIBS (structural)
# ============================================================

# Longitudinal center rib
center_rib = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 + body_wall)
    .box(body_length - body_wall * 4, 2, body_height - body_wall * 2 - 4, centered=True)
)
body_shell = body_shell.union(center_rib)

# Cross ribs at 3 positions
for x_pos in [-40, 0, 40]:
    cross_rib = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 + body_wall)
        .transformed(offset=(x_pos, 0, 0))
        .box(2, body_width - body_wall * 4, body_height - body_wall * 2 - 8, centered=True)
    )
    body_shell = body_shell.union(cross_rib)

# ============================================================
# 3. SCREW BOSSES (8 mounting points for top/bottom shell assembly)
# ============================================================

boss_positions = [
    (body_length / 2 - 15, body_width / 2 - 12),
    (body_length / 2 - 15, -body_width / 2 + 12),
    (-body_length / 2 + 15, body_width / 2 - 12),
    (-body_length / 2 + 15, -body_width / 2 + 12),
    (30, body_width / 2 - 10),
    (30, -body_width / 2 + 10),
    (-30, body_width / 2 - 10),
    (-30, -body_width / 2 + 10),
]

for bx, by in boss_positions:
    boss = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 + body_wall)
        .transformed(offset=(bx, by, 0))
        .circle(boss_od / 2).extrude(boss_height)
    )
    boss_hole = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 + body_wall - 1)
        .transformed(offset=(bx, by, 0))
        .circle(boss_id / 2).extrude(boss_height + 2)
    )
    body_shell = body_shell.union(boss).cut(boss_hole)

# ============================================================
# 4. PCB MOUNTING POSTS
# ============================================================

pcb_posts = [
    (pcb_length / 2 - 4, pcb_width / 2 - 4),
    (pcb_length / 2 - 4, -pcb_width / 2 + 4),
    (-pcb_length / 2 + 4, pcb_width / 2 - 4),
    (-pcb_length / 2 + 4, -pcb_width / 2 + 4),
]

for px, py in pcb_posts:
    post = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 + body_wall)
        .transformed(offset=(px, py, 0))
        .circle(pcb_standoff_dia / 2).extrude(pcb_standoff_h)
    )
    post_hole = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 + body_wall - 0.5)
        .transformed(offset=(px, py, 0))
        .circle(pcb_standoff_hole / 2).extrude(pcb_standoff_h + 1)
    )
    body_shell = body_shell.union(post).cut(post_hole)

# ============================================================
# 5. VENTILATION GRILLES (top surface)
# ============================================================

for i in range(vent_count):
    x_off = -((vent_count - 1) * vent_slot_spacing) / 2 + i * vent_slot_spacing - 25
    vent_slot = (
        cq.Workplane("XY")
        .workplane(offset=body_height / 2 + top_dome_height - 3)
        .transformed(offset=(x_off, 0, 0))
        .box(vent_slot_w, vent_slot_l, 10, centered=True)
    )
    body_shell = body_shell.cut(vent_slot)

# ============================================================
# 6. PORT CUTOUTS
# ============================================================

# USB-C port (left side)
usbc_cut = (
    cq.Workplane("XZ")
    .workplane(offset=-body_width / 2 - 1)
    .transformed(offset=(-20, -5, 0))
    .box(usbc_w, usbc_h, body_wall + 4, centered=True)
    .edges("|Y").fillet(usbc_h / 2 - 0.3)
)
body_shell = body_shell.cut(usbc_cut)

# SD card slot (left side)
sd_cut = (
    cq.Workplane("XZ")
    .workplane(offset=-body_width / 2 - 1)
    .transformed(offset=(-5, -3, 0))
    .box(sdcard_w, sdcard_h, body_wall + 4, centered=True)
)
body_shell = body_shell.cut(sd_cut)

# Status LED bar (front)
led_cut = (
    cq.Workplane("YZ")
    .workplane(offset=body_length / 2 - 1)
    .transformed(offset=(0, 8, 0))
    .box(status_led_w, status_led_h, body_wall + 2, centered=True)
    .edges("|X").fillet(1)
)
body_shell = body_shell.cut(led_cut)

# Rear status LEDs (2x on rear)
for y_off in [-15, 15]:
    rear_led = (
        cq.Workplane("YZ")
        .workplane(offset=-body_length / 2 - 1)
        .transformed(offset=(y_off, 5, 0))
        .box(8, 3, body_wall + 2, centered=True)
        .edges("|X").fillet(1)
    )
    body_shell = body_shell.cut(rear_led)

# ============================================================
# 7. SENSOR RECESSES
# ============================================================

# Front stereo obstacle avoidance (pair)
for y_off in [-front_sensor_spacing / 2, front_sensor_spacing / 2]:
    sensor_recess = (
        cq.Workplane("YZ")
        .workplane(offset=body_length / 2 - 2)
        .transformed(offset=(y_off, 0, 0))
        .box(front_sensor_w, front_sensor_h, front_sensor_d + 2, centered=True)
        .edges("|X").fillet(2)
    )
    body_shell = body_shell.cut(sensor_recess)

# Bottom downward vision / ultrasonic sensor
bottom_sensor = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 - 1)
    .transformed(offset=(20, 0, 0))
    .circle(bottom_sensor_dia / 2).extrude(body_wall + 2)
)
body_shell = body_shell.cut(bottom_sensor)

# Second bottom sensor (ToF)
bottom_tof = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 - 1)
    .transformed(offset=(35, 0, 0))
    .circle(6).extrude(body_wall + 2)
)
body_shell = body_shell.cut(bottom_tof)

# Rear obstacle avoidance
rear_sensor = (
    cq.Workplane("YZ")
    .workplane(offset=-body_length / 2 - 1)
    .transformed(offset=(0, 0, 0))
    .circle(rear_sensor_dia / 2).extrude(body_wall + 2)
    .edges(">X").fillet(2)
)
body_shell = body_shell.cut(rear_sensor)

# ============================================================
# 8. GPS PUCK RECESS (top surface)
# ============================================================

gps_recess = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 + top_dome_height - gps_recess_depth)
    .transformed(offset=(-30, 0, 0))
    .circle(gps_recess_od / 2).extrude(gps_recess_depth + 2)
)
body_shell = body_shell.cut(gps_recess)

# GPS puck (sits in recess)
gps_puck = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 + top_dome_height - gps_recess_depth + 0.5)
    .transformed(offset=(-30, 0, 0))
    .circle(gps_puck_od / 2).extrude(gps_puck_h)
    .edges(">Z").fillet(2)
    .edges("<Z").fillet(1)
)
body_shell = body_shell.union(gps_puck)

# ============================================================
# 9. ANTENNA HOUSING (rear top)
# ============================================================

antenna_outer = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 + 2)
    .transformed(offset=(-body_length / 3 - 5, 0, 0))
    .box(antenna_length, antenna_width, antenna_height, centered=True)
    .edges("|Z").fillet(5)
    .edges(">Z").fillet(2)
)
# Hollow antenna cavity
antenna_inner = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 + 1)
    .transformed(offset=(-body_length / 3 - 5, 0, 0))
    .box(antenna_length - antenna_cavity_wall * 2,
         antenna_width - antenna_cavity_wall * 2,
         antenna_height, centered=True)
    .edges("|Z").fillet(3)
)
antenna = antenna_outer.cut(antenna_inner)
body_shell = body_shell.union(antenna)

# ============================================================
# 10. MOTOR ARMS WITH WIRE CHANNELS & ESC BAYS
# ============================================================

arm_configs = [
    (1, 1, arm_angle_front),
    (1, -1, arm_angle_front),
    (-1, 1, arm_angle_rear),
    (-1, -1, arm_angle_rear),
]

for idx, ((mx, my), (sx, sy, angle)) in enumerate(zip(MOTOR_POSITIONS, arm_configs)):
    # Arm direction
    actual_angle = math.degrees(math.atan2(my, mx))
    arm_center_x = mx / 2
    arm_center_y = my / 2
    arm_true_length = math.sqrt(mx ** 2 + my ** 2)

    # Outer arm
    arm_outer = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2)
        .transformed(offset=(arm_center_x, arm_center_y, 0),
                     rotate=(0, 0, actual_angle))
        .box(arm_true_length, arm_width, arm_height, centered=True)
        .edges("|Z").fillet(arm_fillet)
        .edges("#Z").fillet(2)
    )

    # Hollow arm (wire channel + weight reduction)
    arm_inner = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2 + arm_wall)
        .transformed(offset=(arm_center_x, arm_center_y, 0),
                     rotate=(0, 0, actual_angle))
        .box(arm_true_length - 10, arm_width - arm_wall * 2,
             arm_height - arm_wall * 2, centered=True)
        .edges("|Z").fillet(arm_fillet - 1)
    )
    arm_piece = arm_outer.cut(arm_inner)

    body_shell = body_shell.union(arm_piece)

    # ESC mounting bay (recessed area in arm near body)
    esc_dist = 45  # along arm from center
    esc_cx = esc_dist * math.cos(math.radians(actual_angle))
    esc_cy = esc_dist * math.sin(math.radians(actual_angle))

    esc_bay = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2 + arm_wall - 0.5)
        .transformed(offset=(esc_cx, esc_cy, 0),
                     rotate=(0, 0, actual_angle))
        .box(esc_length, esc_width, esc_height, centered=True)
    )
    body_shell = body_shell.cut(esc_bay)

    # ESC mounting holes (2x M2)
    for esc_off in [-esc_length / 2 + 4, esc_length / 2 - 4]:
        esc_hole_x = esc_cx + esc_off * math.cos(math.radians(actual_angle))
        esc_hole_y = esc_cy + esc_off * math.sin(math.radians(actual_angle))
        esc_hole = (
            cq.Workplane("XY")
            .workplane(offset=-arm_height / 2 - 1)
            .transformed(offset=(esc_hole_x, esc_hole_y, 0))
            .circle(1.1).extrude(arm_height + 2)
        )
        body_shell = body_shell.cut(esc_hole)

# ============================================================
# 11. MOTOR MOUNTS WITH BOLT PATTERNS
# ============================================================

for idx, (mx, my) in enumerate(MOTOR_POSITIONS):
    # Motor mount plate (raised platform)
    mount_plate = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2)
        .transformed(offset=(mx, my, 0))
        .circle(motor_mount_od / 2).extrude(motor_mount_height)
        .edges(">Z").fillet(1.5)
        .edges("<Z").fillet(1)
    )

    # Center bore for motor shaft/wires
    center_bore = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2 - 1)
        .transformed(offset=(mx, my, 0))
        .circle(motor_mount_id / 2).extrude(motor_mount_height + 2)
    )
    mount_plate = mount_plate.cut(center_bore)

    # M3 bolt holes on bolt circle
    for bolt_i in range(motor_bolt_count):
        bolt_angle = math.radians(bolt_i * 360 / motor_bolt_count + 45)
        bx = mx + (motor_bolt_circle / 2) * math.cos(bolt_angle)
        by = my + (motor_bolt_circle / 2) * math.sin(bolt_angle)
        bolt_hole = (
            cq.Workplane("XY")
            .workplane(offset=-arm_height / 2 - 1)
            .transformed(offset=(bx, by, 0))
            .circle(motor_bolt_dia / 2).extrude(motor_mount_height + 4)
        )
        mount_plate = mount_plate.cut(bolt_hole)

    body_shell = body_shell.union(mount_plate)

    # Motor bell (outer rotor representation)
    bell_z = -arm_height / 2 + motor_mount_height
    motor_bell = (
        cq.Workplane("XY")
        .workplane(offset=bell_z)
        .transformed(offset=(mx, my, 0))
        .circle(motor_bell_od / 2).extrude(motor_bell_height)
        .edges(">Z").fillet(3)
    )
    # Hollow bell interior
    bell_inner = (
        cq.Workplane("XY")
        .workplane(offset=bell_z - 0.5)
        .transformed(offset=(mx, my, 0))
        .circle(motor_bell_od / 2 - 2).extrude(motor_bell_height - 2)
    )
    motor_bell = motor_bell.cut(bell_inner)

    # Magnet ring inside bell
    magnet_ring = (
        cq.Workplane("XY")
        .workplane(offset=bell_z + 1)
        .transformed(offset=(mx, my, 0))
        .circle(motor_magnet_ring_od / 2).circle(motor_magnet_ring_id / 2)
        .extrude(motor_magnet_ring_h)
    )
    motor_bell = motor_bell.union(magnet_ring)

    body_shell = body_shell.union(motor_bell)

    # Motor shaft
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=bell_z + motor_bell_height - 2)
        .transformed(offset=(mx, my, 0))
        .circle(motor_shaft_dia / 2).extrude(motor_shaft_length)
    )
    body_shell = body_shell.union(shaft)

    # Prop guard mount boss (on motor mount)
    pg_angle = math.degrees(math.atan2(my, mx))
    pg_x = mx + (motor_mount_od / 2 + 3) * math.cos(math.radians(pg_angle))
    pg_y = my + (motor_mount_od / 2 + 3) * math.sin(math.radians(pg_angle))
    pg_boss = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2)
        .transformed(offset=(pg_x, pg_y, 0))
        .circle(pg_boss_od / 2).extrude(pg_boss_h)
    )
    pg_hole = (
        cq.Workplane("XY")
        .workplane(offset=-arm_height / 2 - 1)
        .transformed(offset=(pg_x, pg_y, 0))
        .circle(pg_boss_id / 2).extrude(pg_boss_h + 2)
    )
    body_shell = body_shell.union(pg_boss).cut(pg_hole)

# ============================================================
# 12. PROPELLERS (realistic 2-blade with variable chord)
# ============================================================

for idx, (mx, my) in enumerate(MOTOR_POSITIONS):
    prop_z = (-arm_height / 2 + motor_mount_height + motor_bell_height
              + motor_shaft_length - 2)

    # Prop hub with shaft bore
    hub = (
        cq.Workplane("XY")
        .workplane(offset=prop_z)
        .transformed(offset=(mx, my, 0))
        .circle(prop_hub_od / 2).extrude(prop_hub_height)
        .edges(">Z").fillet(2)
        .edges("<Z").fillet(1)
    )
    hub_bore = (
        cq.Workplane("XY")
        .workplane(offset=prop_z - 0.5)
        .transformed(offset=(mx, my, 0))
        .circle(prop_hub_id / 2).extrude(prop_hub_height + 1)
    )
    hub = hub.cut(hub_bore)
    body_shell = body_shell.union(hub)

    # Blades - elliptical planform with tapered chord
    base_rotation = 20 if idx % 2 == 0 else -20

    for blade_i in range(2):
        blade_angle = base_rotation + blade_i * 180
        blade_length = prop_diameter / 2 - prop_hub_od / 2

        blade = (
            cq.Workplane("XY")
            .workplane(offset=prop_z + prop_hub_height / 2 - prop_thickness / 2)
            .transformed(offset=(mx, my, 0),
                        rotate=(0, 0, blade_angle))
            .transformed(offset=(prop_hub_od / 2 + blade_length / 2, 0, 0))
            .ellipse(blade_length / 2, prop_chord_root / 2)
            .extrude(prop_thickness)
            .edges(">Z").fillet(0.3)
            .edges("<Z").fillet(0.3)
        )
        body_shell = body_shell.union(blade)

# ============================================================
# 13. CAMERA GIMBAL ASSEMBLY
# ============================================================

gimbal_base_z = -body_height / 2 - 3
gimbal_x = body_length / 4 + 5

# Vibration damping mounts (4x rubber grommets)
damper_positions = [
    (gimbal_x - 12, -12), (gimbal_x - 12, 12),
    (gimbal_x + 12, -12), (gimbal_x + 12, 12),
]
for dx, dy in damper_positions:
    damper = (
        cq.Workplane("XY")
        .workplane(offset=gimbal_base_z)
        .transformed(offset=(dx, dy, 0))
        .circle(gimbal_damper_od / 2).extrude(gimbal_damper_h)
        .edges(">Z").fillet(1)
    )
    damper_hole = (
        cq.Workplane("XY")
        .workplane(offset=gimbal_base_z - 0.5)
        .transformed(offset=(dx, dy, 0))
        .circle(gimbal_damper_id / 2).extrude(gimbal_damper_h + 1)
    )
    body_shell = body_shell.union(damper).cut(damper_hole)

# Gimbal mounting plate
gimbal_plate = (
    cq.Workplane("XY")
    .workplane(offset=gimbal_base_z - gimbal_damper_h)
    .transformed(offset=(gimbal_x, 0, 0))
    .box(gimbal_plate_d, gimbal_plate_w, gimbal_plate_h, centered=True)
    .edges("|Z").fillet(4)
    .edges("#Z").fillet(1)
)
body_shell = body_shell.union(gimbal_plate)

# Yaw motor ring
yaw_ring_z = gimbal_base_z - gimbal_damper_h - gimbal_plate_h
yaw_ring = (
    cq.Workplane("XY")
    .workplane(offset=yaw_ring_z)
    .transformed(offset=(gimbal_x, 0, 0))
    .circle(gimbal_yaw_ring_od / 2)
    .circle(gimbal_yaw_ring_od / 2 - 3)
    .extrude(gimbal_yaw_ring_h)
)
body_shell = body_shell.union(yaw_ring)

# Pitch arms (pair)
pitch_z = yaw_ring_z - gimbal_yaw_ring_h + 1
for y_off in [-gimbal_yaw_ring_od / 2 - gimbal_pitch_arm_l / 2 + 2,
               gimbal_yaw_ring_od / 2 + gimbal_pitch_arm_l / 2 - 2]:
    pitch_arm = (
        cq.Workplane("XY")
        .workplane(offset=pitch_z)
        .transformed(offset=(gimbal_x, y_off, 0))
        .box(gimbal_pitch_arm_w, gimbal_pitch_arm_l, gimbal_pitch_arm_h, centered=True)
        .edges().fillet(1.5)
    )
    body_shell = body_shell.union(pitch_arm)

# Camera body
cam_z = pitch_z - gimbal_pitch_arm_h / 2 - camera_body_h / 2
camera_body = (
    cq.Workplane("XY")
    .workplane(offset=cam_z)
    .transformed(offset=(gimbal_x, 0, 0))
    .box(camera_body_d, camera_body_w, camera_body_h, centered=True)
    .edges("|Z").fillet(5)
    .edges("#Z").fillet(3)
)
body_shell = body_shell.union(camera_body)

# Camera lens barrel
lens_barrel = (
    cq.Workplane("YZ")
    .workplane(offset=gimbal_x + camera_body_d / 2 - 2)
    .circle(camera_lens_od / 2).extrude(camera_lens_depth)
    .edges(">X").fillet(1.5)
)
body_shell = body_shell.union(lens_barrel)

# Lens glass element (recessed)
lens_glass = (
    cq.Workplane("YZ")
    .workplane(offset=gimbal_x + camera_body_d / 2 + camera_lens_depth - 3)
    .circle(camera_lens_id / 2).extrude(3)
    .edges(">X").fillet(0.5)
)
body_shell = body_shell.union(lens_glass)

# ============================================================
# 14. BATTERY BAY
# ============================================================

batt_x = -15

# Battery shell (represents removable battery pack)
battery_outer = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 - 4)
    .transformed(offset=(batt_x, 0, 0))
    .box(batt_length, batt_width, batt_height, centered=True)
    .edges("|Z").fillet(6)
    .edges("#Z").fillet(3)
)

# Hollow battery
battery_inner = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 - 4 + batt_wall)
    .transformed(offset=(batt_x, 0, 0))
    .box(batt_length - batt_wall * 2, batt_width - batt_wall * 2,
         batt_height - batt_wall * 2, centered=True)
    .edges("|Z").fillet(4)
)
battery = battery_outer.cut(battery_inner)

# Battery rail guides (2x along sides)
for y_off in [-batt_width / 2 + batt_rail_w / 2 + 1,
               batt_width / 2 - batt_rail_w / 2 - 1]:
    rail = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - 4 - batt_height / 2 + batt_rail_h / 2 + batt_wall)
        .transformed(offset=(batt_x, y_off, 0))
        .box(batt_length - 20, batt_rail_w, batt_rail_h, centered=True)
        .edges("|Z").fillet(1)
    )
    battery = battery.union(rail)

# Battery latch
latch = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 - 4 - batt_height / 2)
    .transformed(offset=(batt_x - batt_length / 2 + batt_latch_d / 2 + 3, 0, 0))
    .box(batt_latch_d, batt_latch_w, batt_latch_h, centered=True)
    .edges().fillet(1.5)
)
battery = battery.union(latch)

# Electrical contacts
contact_start_y = -((batt_contact_count - 1) * batt_contact_spacing) / 2
for ci in range(batt_contact_count):
    cy = contact_start_y + ci * batt_contact_spacing
    contact = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - 4 + batt_height / 2 - 1)
        .transformed(offset=(batt_x + batt_length / 2 - batt_contact_d, cy, 0))
        .box(batt_contact_d, batt_contact_w, batt_contact_h, centered=True)
    )
    battery = battery.union(contact)

body_shell = body_shell.union(battery)

# ============================================================
# 15. LANDING GEAR
# ============================================================

for y_sign in [-1, 1]:
    y_off = y_sign * (body_width / 2 - 5)

    # Main strut (with weight-saving slot)
    strut = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - lg_strut_h)
        .transformed(offset=(0, y_off, 0))
        .box(lg_strut_length, lg_strut_w, lg_strut_h, centered=True)
        .edges("|Z").fillet(lg_fillet)
        .edges("#Z").fillet(2)
    )

    # Strut lightening slot
    strut_slot = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - lg_strut_h + 3)
        .transformed(offset=(0, y_off, 0))
        .box(lg_strut_length - 16, lg_strut_w - 4, lg_strut_h - 4, centered=True)
        .edges("|Z").fillet(2)
    )
    strut = strut.cut(strut_slot)

    body_shell = body_shell.union(strut)

    # Foot pad with rubber layer
    foot = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - lg_strut_h - lg_foot_h)
        .transformed(offset=(0, y_off, 0))
        .box(lg_foot_l, lg_foot_w, lg_foot_h, centered=True)
        .edges("|Z").fillet(lg_fillet)
        .edges("#Z").fillet(1.5)
    )
    body_shell = body_shell.union(foot)

    # Rubber grip layer
    rubber = (
        cq.Workplane("XY")
        .workplane(offset=-body_height / 2 - lg_strut_h - lg_foot_h - lg_foot_rubber_h)
        .transformed(offset=(0, y_off, 0))
        .box(lg_foot_l - 4, lg_foot_w - 2, lg_foot_rubber_h, centered=True)
        .edges().fillet(0.8)
    )
    body_shell = body_shell.union(rubber)


# ============================================================

# Assign for Modal export wrapper
result = body_shell
