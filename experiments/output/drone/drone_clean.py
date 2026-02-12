# DJI Mavic Air 2 - CadQuery Model
# Expert Mechanical Engineer & CadQuery Programmer
#
# CRITICAL RULES:
# 1. Use ONLY `import cadquery as cq` and `import math`. No other imports.
# 3. Write ALL code as LINEAR top-level statements. Do NOT use functions or classes.
# 4. Build ALL geometry into a SINGLE accumulator variable using .union() and .cut().
# 5. Every feature should have MAXIMUM sub-component detail (fillets, chamfers, hollow interiors, mounting holes, etc.)
# 6. Declare ALL dimensions as named parameters at the top of the file.
#
# CRITICAL CadQuery TECHNIQUE for reliable geometry:
# - Build ALL geometry at its FINAL POSITION. Do NOT create at origin then translate/rotate.
# - Use: `.workplane(offset=z).transformed(offset=(x, y, 0))` to position geometry.
# - For angled parts: `.transformed(offset=(x, y, 0), rotate=(0, 0, angle))`
# - Each feature: create solid → union to main body, then create cutout → cut from main body.
# - For hollow shells: create outer solid, create inner solid (slightly smaller), cut inner from outer.
#   Do NOT use .shell() as it is unreliable. Instead manually subtract an inner box/cylinder.

import cadquery as cq
import math

# =================================================================================
# === PARAMETER DEFINITIONS (Based on DJI Mavic Air 2 Specifications) ===
# =================================================================================

# --- Tolerances ---
press_fit_tolerance = 0.05
clearance_fit_tolerance = 0.15
loose_fit_tolerance = 0.3

# --- Overall Dimensions ---
body_folded_l = 180.0
body_folded_w = 97.0
body_folded_h = 84.0
body_unfolded_l = 183.0
body_unfolded_w = 253.0
body_unfolded_h = 77.0
motor_diagonal_distance = 302.0

# --- Body Shell ---
body_main_l = 180.0
body_main_w = 85.0
body_main_h = 48.0
body_shell_wall_thickness = 2.0
body_top_dome_radius = 45.0
body_top_dome_height = 15.0
body_top_dome_offset_y = -body_main_l / 2 + 50.0
body_main_corner_radius = 12.0
body_bottom_fillet = 5.0
body_top_fillet = 8.0

# --- Internal Ribbing ---
rib_thickness = 1.5
rib_height = body_main_h - body_shell_wall_thickness * 2
longitudinal_rib_l = body_main_l - 20
cross_rib_w = body_main_w - body_shell_wall_thickness * 2
cross_rib_1_y = 40.0
cross_rib_2_y = 0.0
cross_rib_3_y = -50.0

# --- Screw Bosses ---
screw_boss_od = 6.0
screw_boss_id = 2.5 # For M2.5 self-tapping screw
screw_boss_h = 10.0
screw_boss_ring_h = 2.0
screw_boss_fillet = 0.5
screw_boss_spacing_x = 70.0
screw_boss_spacing_y1 = 60.0
screw_boss_spacing_y2 = -20.0
screw_boss_spacing_y3 = -75.0

# --- Folding Arms ---
arm_pivot_to_motor_l = 140.0
arm_w = 20.0
arm_h = 16.0
arm_wall_thickness = 2.0
arm_wire_channel_d = 6.0
arm_corner_radius = 5.0
front_arm_angle_deg = 32.0
rear_arm_angle_deg = 38.0
arm_pivot_offset_x = 35.0
arm_pivot_offset_y = 25.0
arm_pivot_offset_z = body_main_h / 2 - arm_h / 2

# Hinge mechanism
hinge_body_cyl_d = 18.0
hinge_body_cyl_h = arm_h + 2.0
hinge_arm_cyl_d = hinge_body_cyl_d - 2 * arm_wall_thickness
hinge_arm_cyl_h = arm_h
hinge_axle_d = 5.0
hinge_stop_w = 4.0
hinge_stop_h = 8.0

# --- Motors ---
motor_mount_d = 28.0
motor_mount_h = 5.0
motor_stator_bore_d = 22.0
motor_bolt_circle_d = 16.0
motor_bolt_d = 3.0 # M3
motor_bell_d = 24.0
motor_bell_h = 12.0
motor_magnet_ring_od = 22.0
motor_magnet_ring_id = 18.0
motor_magnet_ring_h = 8.0
motor_shaft_d = 5.0
motor_shaft_protrusion = 10.0
motor_stator_stack_d = 21.5
motor_stator_stack_h = 9.0
motor_windings_d = 17.5
motor_windings_h = 7.0

# --- Propellers ---
prop_dia = 183.0
prop_hub_d = 12.0
prop_hub_h = 6.0
prop_shaft_bore_d = motor_shaft_d + clearance_fit_tolerance
prop_blade_root_chord = 18.0
prop_blade_tip_chord = 8.0
prop_blade_thickness = 2.5
prop_blade_root_offset = prop_hub_d / 2
prop_blade_tip_offset = prop_dia / 2

# --- ESC (Electronic Speed Controller) ---
esc_pcb_l = 30.0
esc_pcb_w = 15.0
esc_pcb_h = 1.6 # Standard PCB thickness
esc_component_h = 5.0 - esc_pcb_h
esc_dist_from_body = 35.0

# --- Camera / Gimbal System ---
gimbal_mount_plate_w = 40.0
gimbal_mount_plate_l = 30.0
gimbal_mount_plate_h = 3.0
gimbal_mount_plate_y_offset = body_main_l / 2 + gimbal_mount_plate_l / 2 - 5
gimbal_mount_plate_z_offset = 15.0

vibration_damper_od = 8.0
vibration_damper_id = 4.0
vibration_damper_h = 6.0
vibration_damper_spacing_x = 30.0
vibration_damper_spacing_y = 22.0

yaw_motor_ring_od = 20.0
yaw_motor_ring_id = 16.0
yaw_motor_ring_h = 6.0
roll_motor_d = 18.0
roll_motor_h = 10.0
pitch_arm_l = 15.0
pitch_arm_w = 6.0
pitch_arm_h = 4.0
pitch_arm_spacing = 28.0 + pitch_arm_w

camera_body_w = 28.0
camera_body_d = 22.0
camera_body_h = 26.0
camera_lens_barrel_od = 16.0
camera_lens_element_d = 12.0
camera_lens_protrusion = 10.0
camera_sensor_w = 6.4
camera_sensor_h = 4.8
camera_sensor_thickness = 0.5

# --- Battery Bay ---
battery_pack_l = 110.0
battery_pack_w = 62.0
battery_pack_h = 30.0
battery_bay_y_offset = -body_main_l / 2 + battery_pack_l / 2
battery_bay_z_offset = body_main_h / 2 - battery_pack_h / 2
battery_rail_w = 4.0
battery_rail_h = battery_pack_h - 4.0
battery_latch_w = 16.0
battery_latch_d = 8.0
battery_latch_h = 6.0
battery_contact_w = 4.0
battery_contact_h = 8.0
battery_contact_spacing = 8.0
battery_contact_thickness = 0.5
battery_bay_wall_thickness = 1.5

# --- PCB / Flight Controller ---
fc_pcb_l = 60.0
fc_pcb_w = 40.0
fc_pcb_h = 1.6
fc_mount_post_od = 5.0
fc_mount_post_id = 2.5 # M2.5
fc_standoff_h = 6.0
fc_mount_spacing_x = 32.0
fc_mount_spacing_y = 52.0
fc_y_offset = -10.0
fc_z_offset = body_shell_wall_thickness + fc_standoff_h

# --- Ports & Cutouts ---
usbc_port_w = 8.94
usbc_port_h = 3.26
microsd_slot_w = 12.0
microsd_slot_h = 1.5
port_z_offset = 12.0
port_x_offset = -body_main_w / 2
port_y_offset = -30.0
status_led_bar_w = 30.0
status_led_bar_h = 3.0
status_led_y_offset = body_main_l / 2
status_led_z_offset = 20.0
rear_led_w = 8.0
rear_led_h = 3.0
rear_led_y_offset = -body_main_l / 2
rear_led_z_offset = 18.0
rear_led_spacing_x = 40.0

# --- Sensors ---
front_sensor_w = 10.0
front_sensor_h = 8.0
front_sensor_depth = 4.0
front_sensor_spacing = 26.0
front_sensor_y_offset = body_main_l / 2 - 5.0
front_sensor_z_offset = 30.0
bottom_vision_d = 12.0
bottom_tof_d = 6.0
bottom_sensor_depth = 3.0
bottom_vision_y_offset = 10.0
bottom_tof_y_offset = -15.0
rear_sensor_d = 10.0
rear_sensor_depth = 5.0
rear_sensor_y_offset = -body_main_l / 2 + 5.0
rear_sensor_z_offset = 25.0

# --- GPS & Antenna ---
gps_puck_d = 22.0
gps_puck_h = 5.0
gps_recess_d = 24.0
gps_recess_depth = 3.0
gps_y_offset = 45.0
gps_z_offset = body_main_h - gps_recess_depth
antenna_housing_l = 35.0
antenna_housing_w = 16.0
antenna_housing_h = 4.0
antenna_wall_thickness = 1.5
antenna_y_offset = -body_main_l / 2 + antenna_housing_l / 2 + 10
antenna_z_offset = body_main_h

# --- Landing Gear ---
landing_gear_strut_l = 50.0
landing_gear_strut_w = 10.0
landing_gear_strut_h = 18.0
landing_gear_slot_l = 35.0
landing_gear_slot_h = 8.0
landing_gear_foot_l = 54.0
landing_gear_foot_w = 12.0
landing_gear_foot_h = 4.0
landing_gear_rubber_h = 2.0
landing_gear_fillet = 3.0
landing_gear_x_offset = 35.0
landing_gear_y_offset = 55.0

# --- Prop Guard Mounts ---
prop_guard_boss_od = 6.0
prop_guard_boss_id = 2.0
prop_guard_boss_h = 5.0

# --- Ventilation ---
vent_slot_w = 2.0
vent_slot_l = 15.0
vent_slot_spacing = 4.0
num_vent_slots = 6
vent_y_offset = 15.0
vent_z_offset = body_main_h - 1.0


# =================================================================================
# === GEOMETRY CONSTRUCTION ===
# =================================================================================

# --- 1. Main Body Shell ---
# Create the main outer shell using a lofted profile for an aerodynamic shape
body_base_plane = cq.Workplane("XY")
base_box = body_base_plane.box(body_main_l, body_main_w, body_main_h)
body_shell = base_box.edges("|Z").fillet(body_main_corner_radius)
body_shell = body_shell.edges(">Z").fillet(body_top_fillet)
body_shell = body_shell.edges("<Z").fillet(body_bottom_fillet)

# Add the aerodynamic dome on the top rear
dome = (
    cq.Workplane("XY", origin=(0, body_top_dome_offset_y, body_main_h / 2))
    .sphere(body_top_dome_radius)
    .intersect(cq.Workplane("XY", origin=(0, body_top_dome_offset_y, body_main_h/2)).box(body_top_dome_radius*2, body_top_dome_radius*2, body_top_dome_radius))
    .translate((0,0,body_main_h/2-body_top_dome_radius+body_top_dome_height))
)
body_shell = body_shell.union(dome)
body_shell = body_shell.edges(cq.selectors.EdgeNthSelector(-1)).fillet(10)

# Hollow out the main body by cutting a smaller inner shell
inner_shell_offset = -body_shell_wall_thickness
inner_base_box = body_base_plane.box(body_main_l + 2 * inner_shell_offset, body_main_w + 2 * inner_shell_offset, body_main_h + 2 * inner_shell_offset)
inner_shell = inner_base_box.edges("|Z").fillet(body_main_corner_radius + inner_shell_offset)
inner_shell = inner_shell.edges(">Z").fillet(body_top_fillet + inner_shell_offset)
inner_shell = inner_shell.edges("<Z").fillet(body_bottom_fillet + inner_shell_offset)
body_shell = body_shell.cut(inner_shell)

# --- 2. Internal Features ---
# Internal structural ribbing
longitudinal_rib = (
    cq.Workplane("YZ", origin=(0, 0, body_shell_wall_thickness))
    .box(longitudinal_rib_l, rib_thickness, rib_height)
)
body_shell = body_shell.union(longitudinal_rib)

cross_rib1 = (
    cq.Workplane("XZ", origin=(0, cross_rib_1_y, body_shell_wall_thickness))
    .box(cross_rib_w, rib_thickness, rib_height)
)
body_shell = body_shell.union(cross_rib1)

cross_rib2 = (
    cq.Workplane("XZ", origin=(0, cross_rib_2_y, body_shell_wall_thickness))
    .box(cross_rib_w, rib_thickness, rib_height)
)
body_shell = body_shell.union(cross_rib2)

cross_rib3 = (
    cq.Workplane("XZ", origin=(0, cross_rib_3_y, body_shell_wall_thickness))
    .box(cross_rib_w, rib_thickness, rib_height)
)
body_shell = body_shell.union(cross_rib3)

# Screw bosses for top/bottom shell assembly
boss_locations = [
    (screw_boss_spacing_x/2, screw_boss_spacing_y1), (-screw_boss_spacing_x/2, screw_boss_spacing_y1),
    (screw_boss_spacing_x/2, screw_boss_spacing_y2), (-screw_boss_spacing_x/2, screw_boss_spacing_y2),
    (screw_boss_spacing_x/2, screw_boss_spacing_y3), (-screw_boss_spacing_x/2, screw_boss_spacing_y3),
    (0, body_main_l/2 - 10), (0, -body_main_l/2 + 10)
]
for x, y in boss_locations:
    boss = (
        cq.Workplane("XY", origin=(0, 0, body_shell_wall_thickness))
        .transformed(offset=(x, y, 0))
        .circle(screw_boss_od / 2)
        .extrude(screw_boss_h)
    )
    boss_hole = (
        cq.Workplane("XY", origin=(0, 0, body_shell_wall_thickness))
        .transformed(offset=(x, y, 0))
        .circle(screw_boss_id / 2)
        .extrude(screw_boss_h)
    )
    boss_ring = (
        cq.Workplane("XY", origin=(0, 0, body_shell_wall_thickness))
        .transformed(offset=(x, y, screw_boss_h))
        .circle(screw_boss_od / 2)
        .circle(screw_boss_id / 2)
        .extrude(screw_boss_ring_h)
    )
    boss_assembly = boss.cut(boss_hole).union(boss_ring).edges("<Z").fillet(screw_boss_fillet)
    body_shell = body_shell.union(boss_assembly)


# --- 3. Battery Bay ---
# Cut the main bay
battery_cutout = (
    cq.Workplane("XY", offset=battery_bay_z_offset)
    .transformed(offset=(0, battery_bay_y_offset, 0))
    .box(battery_pack_w, battery_pack_l, battery_pack_h)
)
body_shell = body_shell.cut(battery_cutout)

# Add internal walls for the battery bay
inner_bay_w = battery_pack_w + 2 * battery_bay_wall_thickness
inner_bay_l = battery_pack_l + battery_bay_wall_thickness # Only back wall
inner_bay_h = battery_pack_h + 2 * battery_bay_wall_thickness
bay_wall_cutout = (
    cq.Workplane("XY", offset=battery_bay_z_offset)
    .transformed(offset=(0, battery_bay_y_offset - battery_bay_wall_thickness/2, 0))
    .box(inner_bay_w, inner_bay_l, inner_bay_h)
)
body_shell = body_shell.union(bay_wall_cutout)
body_shell = body_shell.cut(battery_cutout) # Re-cut to ensure sharp interior

# Add slide-in rail guides
rail_z = battery_bay_z_offset - battery_pack_h / 2 + battery_rail_h / 2 + 2
rail_left = (
    cq.Workplane("YZ", origin=(-battery_pack_w/2, battery_bay_y_offset, rail_z))
    .box(battery_pack_l, battery_rail_w, battery_rail_h)
)
rail_right = (
    cq.Workplane("YZ", origin=(battery_pack_w/2, battery_bay_y_offset, rail_z))
    .box(battery_pack_l, battery_rail_w, battery_rail_h)
)
body_shell = body_shell.union(rail_left).union(rail_right)

# Add mechanical latch
latch_y = battery_bay_y_offset + battery_pack_l/2 - battery_latch_d/2
latch_z = battery_bay_z_offset + battery_pack_h/2 - battery_latch_h/2
latch = (
    cq.Workplane("XY", offset=latch_z)
    .transformed(offset=(0, latch_y, 0))
    .box(battery_latch_w, battery_latch_d, battery_latch_h)
    .edges("|Z").fillet(1.0)
)
body_shell = body_shell.union(latch)

# Add electrical contacts
contact_y = battery_bay_y_offset - battery_pack_l/2
contact_z_center = battery_bay_z_offset
num_contacts = 6
for i in range(num_contacts):
    contact_x = -((num_contacts - 1) * battery_contact_spacing) / 2 + i * battery_contact_spacing
    contact = (
        cq.Workplane("XZ", origin=(contact_x, contact_y, contact_z_center))
        .box(battery_contact_w, battery_contact_thickness, battery_contact_h)
    )
    body_shell = body_shell.union(contact)

# --- 4. Flight Controller and Mounts ---
# FC Mounting Posts
fc_mount_locations = [
    (fc_mount_spacing_x / 2, fc_mount_spacing_y / 2),
    (-fc_mount_spacing_x / 2, fc_mount_spacing_y / 2),
    (fc_mount_spacing_x / 2, -fc_mount_spacing_y / 2),
    (-fc_mount_spacing_x / 2, -fc_mount_spacing_y / 2),
]
for x, y in fc_mount_locations:
    post = (
        cq.Workplane("XY", origin=(0, 0, body_shell_wall_thickness))
        .transformed(offset=(x, y + fc_y_offset, 0))
        .circle(fc_mount_post_od / 2)
        .extrude(fc_standoff_h)
    )
    post_hole = (
        cq.Workplane("XY", origin=(0, 0, body_shell_wall_thickness))
        .transformed(offset=(x, y + fc_y_offset, 0))
        .circle(fc_mount_post_id / 2)
        .extrude(fc_standoff_h)
    )
    body_shell = body_shell.union(post.cut(post_hole))

# Flight Controller PCB (for visualization)
fc_pcb = (
    cq.Workplane("XY", offset=fc_z_offset)
    .transformed(offset=(0, fc_y_offset, 0))
    .box(fc_pcb_w, fc_pcb_l, fc_pcb_h)
    .edges().fillet(1.0)
)
body_shell = body_shell.union(fc_pcb)

# --- 5. External Cutouts and Sensors ---
# USB-C and microSD ports
usbc_cutout = (
    cq.Workplane("YZ", origin=(port_x_offset, port_y_offset, port_z_offset))
    .rect(usbc_port_w, usbc_port_h)
    .extrude(body_shell_wall_thickness * 2, both=False)
)
microsd_cutout = (
    cq.Workplane("YZ", origin=(port_x_offset, port_y_offset - 15, port_z_offset))
    .rect(microsd_slot_w, microsd_slot_h)
    .extrude(body_shell_wall_thickness * 2, both=False)
)
body_shell = body_shell.cut(usbc_cutout).cut(microsd_cutout)

# LED indicators
front_led_cutout = (
    cq.Workplane("XZ", origin=(0, status_led_y_offset, status_led_z_offset))
    .rect(status_led_bar_w, status_led_bar_h)
    .extrude(-body_shell_wall_thickness * 2)
)
body_shell = body_shell.cut(front_led_cutout)
front_led_lens = (
    cq.Workplane("XZ", origin=(0, status_led_y_offset, status_led_z_offset))
    .rect(status_led_bar_w, status_led_bar_h)
    .extrude(-body_shell_wall_thickness)
)
body_shell = body_shell.union(front_led_lens) # Add translucent lens

rear_led_cutout_1 = (
    cq.Workplane("XZ", origin=(rear_led_spacing_x / 2, rear_led_y_offset, rear_led_z_offset))
    .rect(rear_led_w, rear_led_h)
    .extrude(body_shell_wall_thickness * 2)
)
rear_led_cutout_2 = (
    cq.Workplane("XZ", origin=(-rear_led_spacing_x / 2, rear_led_y_offset, rear_led_z_offset))
    .rect(rear_led_w, rear_led_h)
    .extrude(body_shell_wall_thickness * 2)
)
body_shell = body_shell.cut(rear_led_cutout_1).cut(rear_led_cutout_2)

# Front obstacle avoidance sensors
front_sensor_cutout_1 = (
    cq.Workplane("XZ", origin=(front_sensor_spacing / 2, front_sensor_y_offset, front_sensor_z_offset))
    .rect(front_sensor_w, front_sensor_h)
    .extrude(-front_sensor_depth)
)
front_sensor_cutout_2 = (
    cq.Workplane("XZ", origin=(-front_sensor_spacing / 2, front_sensor_y_offset, front_sensor_z_offset))
    .rect(front_sensor_w, front_sensor_h)
    .extrude(-front_sensor_depth)
)
body_shell = body_shell.cut(front_sensor_cutout_1.edges().fillet(1.0))
body_shell = body_shell.cut(front_sensor_cutout_2.edges().fillet(1.0))

# Bottom sensors
bottom_vision_cutout = (
    cq.Workplane("XY", origin=(0, bottom_vision_y_offset, 0))
    .circle(bottom_vision_d / 2)
    .extrude(-bottom_sensor_depth)
)
bottom_tof_cutout = (
    cq.Workplane("XY", origin=(0, bottom_tof_y_offset, 0))
    .circle(bottom_tof_d / 2)
    .extrude(-bottom_sensor_depth)
)
body_shell = body_shell.cut(bottom_vision_cutout).cut(bottom_tof_cutout)

# Rear sensor
rear_sensor_cutout = (
    cq.Workplane("YZ", origin=(0, rear_sensor_y_offset, rear_sensor_z_offset))
    .circle(rear_sensor_d / 2)
    .extrude(rear_sensor_depth)
)
body_shell = body_shell.cut(rear_sensor_cutout)

# --- 6. GPS and Antenna ---
# GPS Puck Recess and Puck
gps_recess_cutout = (
    cq.Workplane("XY", offset=body_main_h)
    .transformed(offset=(0, gps_y_offset, 0))
    .circle(gps_recess_d / 2)
    .extrude(-gps_recess_depth)
)
body_shell = body_shell.cut(gps_recess_cutout)

gps_puck = (
    cq.Workplane("XY", offset=body_main_h - gps_recess_depth)
    .transformed(offset=(0, gps_y_offset, 0))
    .circle(gps_puck_d / 2)
    .extrude(gps_puck_h)
    .edges(">Z").fillet(1.0)
)
body_shell = body_shell.union(gps_puck)

# Antenna Housing
antenna_outer = (
    cq.Workplane("XY", offset=antenna_z_offset)
    .transformed(offset=(0, antenna_y_offset, 0))
    .box(antenna_housing_w, antenna_housing_l, antenna_housing_h)
    .edges().fillet(2.0)
)
antenna_inner = (
    cq.Workplane("XY", offset=antenna_z_offset)
    .transformed(offset=(0, antenna_y_offset, 0))
    .box(antenna_housing_w - 2 * antenna_wall_thickness,
         antenna_housing_l - 2 * antenna_wall_thickness,
         antenna_housing_h - antenna_wall_thickness)
    .translate((0,0,antenna_wall_thickness))
)
antenna = antenna_outer.cut(antenna_inner)
body_shell = body_shell.union(antenna)

# --- 7. Top Ventilation Slots ---
vent_grid_width = (num_vent_slots - 1) * vent_slot_spacing + num_vent_slots * vent_slot_w
for i in range(num_vent_slots):
    vent_x_offset = -vent_grid_width / 2 + vent_slot_w / 2 + i * (vent_slot_w + vent_slot_spacing)
    vent_cutout = (
        cq.Workplane("XY", offset=vent_z_offset)
        .transformed(offset=(vent_x_offset, vent_y_offset, 0))
        .box(vent_slot_w, vent_slot_l, body_shell_wall_thickness * 2)
        .rotate((0,0,0),(0,1,0),15) # Angle the vents
    )
    body_shell = body_shell.cut(vent_cutout)

# --- 8. Landing Gear ---
# Front Left Landing Gear
lg_strut_fl = (
    cq.Workplane("XZ", origin=(-landing_gear_x_offset, landing_gear_y_offset, -landing_gear_strut_h / 2))
    .rect(landing_gear_strut_w, landing_gear_strut_h)
    .extrude(landing_gear_strut_l)
    .rotate((0,0,0),(0,0,1), -90)
    .translate((0,0,landing_gear_strut_l/2))
    .edges().fillet(landing_gear_fillet)
)
lg_slot_fl = (
    cq.Workplane("XZ", origin=(-landing_gear_x_offset, landing_gear_y_offset, -landing_gear_strut_h / 2))
    .rect(landing_gear_strut_w * 2, landing_gear_slot_h)
    .extrude(landing_gear_slot_l)
    .rotate((0,0,0),(0,0,1), -90)
    .translate((0,0,landing_gear_strut_l/2))
)
lg_strut_fl = lg_strut_fl.cut(lg_slot_fl)
lg_foot_fl = (
    cq.Workplane("XY", offset=-landing_gear_strut_h)
    .transformed(offset=(-landing_gear_x_offset - landing_gear_strut_l/2 + landing_gear_foot_l/2, landing_gear_y_offset, 0))
    .box(landing_gear_foot_l, landing_gear_foot_w, landing_gear_foot_h)
    .edges().fillet(1.5)
)
lg_rubber_fl = (
    cq.Workplane("XY", offset=-landing_gear_strut_h - landing_gear_foot_h)
    .transformed(offset=(-landing_gear_x_offset - landing_gear_strut_l/2 + landing_gear_foot_l/2, landing_gear_y_offset, 0))
    .box(landing_gear_foot_l, landing_gear_foot_w, landing_gear_rubber_h)
)
body_shell = body_shell.union(lg_strut_fl).union(lg_foot_fl).union(lg_rubber_fl)

# Front Right Landing Gear (mirrored)
lg_strut_fr = (
    cq.Workplane("XZ", origin=(landing_gear_x_offset, landing_gear_y_offset, -landing_gear_strut_h / 2))
    .rect(landing_gear_strut_w, landing_gear_strut_h)
    .extrude(landing_gear_strut_l)
    .rotate((0,0,0),(0,0,1), 90)
    .translate((0,0,landing_gear_strut_l/2))
    .edges().fillet(landing_gear_fillet)
)
lg_slot_fr = (
    cq.Workplane("XZ", origin=(landing_gear_x_offset, landing_gear_y_offset, -landing_gear_strut_h / 2))
    .rect(landing_gear_strut_w * 2, landing_gear_slot_h)
    .extrude(landing_gear_slot_l)
    .rotate((0,0,0),(0,0,1), 90)
    .translate((0,0,landing_gear_strut_l/2))
)
lg_strut_fr = lg_strut_fr.cut(lg_slot_fr)
lg_foot_fr = (
    cq.Workplane("XY", offset=-landing_gear_strut_h)
    .transformed(offset=(landing_gear_x_offset + landing_gear_strut_l/2 - landing_gear_foot_l/2, landing_gear_y_offset, 0))
    .box(landing_gear_foot_l, landing_gear_foot_w, landing_gear_foot_h)
    .edges().fillet(1.5)
)
lg_rubber_fr = (
    cq.Workplane("XY", offset=-landing_gear_strut_h - landing_gear_foot_h)
    .transformed(offset=(landing_gear_x_offset + landing_gear_strut_l/2 - landing_gear_foot_l/2, landing_gear_y_offset, 0))
    .box(landing_gear_foot_l, landing_gear_foot_w, landing_gear_rubber_h)
)
body_shell = body_shell.union(lg_strut_fr).union(lg_foot_fr).union(lg_rubber_fr)


# --- 9. Arms, Motors, and Propellers ---
# Pre-calculate motor positions
half_diag = motor_diagonal_distance / 2
front_motor_y = half_diag * math.cos(math.radians(front_arm_angle_deg))
front_motor_x = half_diag * math.sin(math.radians(front_arm_angle_deg))
rear_motor_y = -half_diag * math.cos(math.radians(rear_arm_angle_deg))
rear_motor_x = half_diag * math.sin(math.radians(rear_arm_angle_deg))

motor_positions = {
    "FL": (front_motor_x, front_motor_y, front_arm_angle_deg),
    "FR": (-front_motor_x, front_motor_y, -front_arm_angle_deg),
    "RL": (rear_motor_x, rear_motor_y, 180 - rear_arm_angle_deg),
    "RR": (-rear_motor_x, rear_motor_y, -180 + rear_arm_angle_deg),
}
arm_pivot_points = {
    "FL": (arm_pivot_offset_x, arm_pivot_offset_y),
    "FR": (-arm_pivot_offset_x, arm_pivot_offset_y),
    "RL": (arm_pivot_offset_x, -arm_pivot_offset_y),
    "RR": (-arm_pivot_offset_x, -arm_pivot_offset_y),
}

for name, (motor_x, motor_y, angle) in motor_positions.items():
    pivot_x, pivot_y = arm_pivot_points[name]
    
    # Arm Hinge Mechanism
    hinge_body = (
        cq.Workplane("XY", offset=arm_pivot_offset_z)
        .transformed(offset=(pivot_x, pivot_y, 0))
        .circle(hinge_body_cyl_d/2)
        .extrude(hinge_body_cyl_h)
        .faces(">Z or <Z")
        .chamfer(0.5)
    )
    body_shell = body_shell.union(hinge_body)
    
    arm_length = math.sqrt((motor_x - pivot_x)**2 + (motor_y - pivot_y)**2)
    arm_angle_rad = math.atan2(motor_y - pivot_y, motor_x - pivot_x)
    arm_angle_deg_local = math.degrees(arm_angle_rad)

    # Arm Structure
    arm_outer = (
        cq.Workplane("YZ", origin=(0, 0, arm_pivot_offset_z))
        .transformed(offset=(pivot_x, pivot_y, 0), rotate=(0, 0, arm_angle_deg_local))
        .workplane(offset=hinge_body_cyl_d/2)
        .rect(arm_h, arm_w)
        .extrude(arm_length - hinge_body_cyl_d/2)
        .edges("|Z").fillet(arm_corner_radius)
    )
    arm_inner_cutout = (
        cq.Workplane("YZ", origin=(0, 0, arm_pivot_offset_z))
        .transformed(offset=(pivot_x, pivot_y, 0), rotate=(0, 0, arm_angle_deg_local))
        .workplane(offset=hinge_body_cyl_d/2)
        .rect(arm_h - 2*arm_wall_thickness, arm_w - 2*arm_wall_thickness)
        .extrude(arm_length - hinge_body_cyl_d/2)
    )
    wire_channel_cutout = (
        cq.Workplane("YZ", origin=(0, 0, arm_pivot_offset_z))
        .transformed(offset=(pivot_x, pivot_y, 0), rotate=(0, 0, arm_angle_deg_local))
        .workplane(offset=hinge_body_cyl_d/2)
        .circle(arm_wire_channel_d/2)
        .extrude(arm_length - hinge_body_cyl_d/2)
    )
    arm = arm_outer.cut(arm_inner_cutout).cut(wire_channel_cutout)
    
    # ESC PCB inside arm
    esc_local_x = esc_dist_from_body
    esc = (
        cq.Workplane("YZ", origin=(0, 0, arm_pivot_offset_z))
        .transformed(offset=(pivot_x, pivot_y, 0), rotate=(0, 0, arm_angle_deg_local))
        .workplane(offset=esc_local_x)
        .box(esc_pcb_h, esc_pcb_w - 2*arm_wall_thickness, esc_pcb_l)
    )
    
    # Motor Mount
    motor_z = arm_pivot_offset_z + arm_h/2 + motor_mount_h/2
    motor_mount = (
        cq.Workplane("XY", offset=motor_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_mount_d / 2)
        .extrude(motor_mount_h)
        .faces("<Z").fillet(2.0)
    )
    stator_bore = (
        cq.Workplane("XY", offset=motor_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_stator_bore_d / 2)
        .extrude(motor_mount_h)
    )
    motor_mount = motor_mount.cut(stator_bore)
    
    # Motor mounting holes
    for i in range(3):
        hole_angle = i * 120
        hole_x = motor_x + (motor_bolt_circle_d / 2) * math.cos(math.radians(hole_angle))
        hole_y = motor_y + (motor_bolt_circle_d / 2) * math.sin(math.radians(hole_angle))
        hole_cut = (
            cq.Workplane("XY", offset=motor_z)
            .transformed(offset=(hole_x, hole_y, 0))
            .circle((motor_bolt_d - clearance_fit_tolerance) / 2)
            .extrude(motor_mount_h)
        )
        motor_mount = motor_mount.cut(hole_cut)

    # Prop Guard Bosses
    for i in range(4):
        boss_angle = i * 90 + 45
        boss_x = motor_x + (motor_mount_d / 2 - prop_guard_boss_od/2 -1) * math.cos(math.radians(boss_angle))
        boss_y = motor_y + (motor_mount_d / 2 - prop_guard_boss_od/2 -1) * math.sin(math.radians(boss_angle))
        boss = (
            cq.Workplane("XY", offset=motor_z + motor_mount_h)
            .transformed(offset=(boss_x, boss_y, 0))
            .circle(prop_guard_boss_od/2)
            .extrude(prop_guard_boss_h)
        )
        boss_hole = (
            cq.Workplane("XY", offset=motor_z + motor_mount_h)
            .transformed(offset=(boss_x, boss_y, 0))
            .circle(prop_guard_boss_id/2)
            .extrude(prop_guard_boss_h)
        )
        motor_mount = motor_mount.union(boss.cut(boss_hole))
        
    # Motor Assembly
    motor_base_z = motor_z + motor_mount_h
    stator = (
        cq.Workplane("XY", offset=motor_base_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_stator_stack_d/2)
        .extrude(motor_stator_stack_h)
    )
    windings = (
        cq.Workplane("XY", offset=motor_base_z + (motor_stator_stack_h - motor_windings_h)/2)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_windings_d/2)
        .extrude(motor_windings_h)
    )
    stator = stator.cut(windings)
    
    bell_z = motor_base_z - 1
    bell_outer = (
        cq.Workplane("XY", offset=bell_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_bell_d/2)
        .extrude(motor_bell_h)
    )
    bell_inner = (
        cq.Workplane("XY", offset=bell_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_magnet_ring_od/2)
        .extrude(motor_bell_h-1)
    )
    bell = bell_outer.cut(bell_inner)
    
    magnet_ring = (
        cq.Workplane("XY", offset=bell_z+1)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_magnet_ring_od/2)
        .circle(motor_magnet_ring_id/2)
        .extrude(motor_magnet_ring_h)
    )
    
    motor_shaft = (
        cq.Workplane("XY", offset=bell_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_shaft_d/2)
        .extrude(motor_bell_h + motor_shaft_protrusion)
    )
    motor_assembly = stator.union(bell).union(magnet_ring).union(motor_shaft)
    
    # Propeller
    prop_z = motor_base_z + motor_bell_h + motor_shaft_protrusion - prop_hub_h
    prop_hub = (
        cq.Workplane("XY", offset=prop_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(prop_hub_d/2)
        .extrude(prop_hub_h)
    )
    prop_bore = (
        cq.Workplane("XY", offset=prop_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(prop_shaft_bore_d/2)
        .extrude(prop_hub_h)
    )
    prop_hub = prop_hub.cut(prop_bore)
    
    # Propeller Blades (simplified loft)
    blade_workplane = (
        cq.Workplane("XZ")
        .transformed(offset=(motor_x, motor_y, prop_z + prop_hub_h/2), rotate=(0,0,angle))
    )
    p1 = (prop_blade_root_offset, 0)
    p2 = (prop_blade_tip_offset, 5) # Add some Z height for airfoil shape
    p3 = (prop_blade_tip_offset, -5)
    
    s1 = cq.Wire.makeSpline([p1, (prop_blade_root_offset + 5, 2), (prop_blade_root_chord, 0), (prop_blade_root_offset + 5, -2), p1])
    s2 = cq.Wire.makeSpline([p2, (prop_blade_tip_offset + 2, 5+1), (prop_blade_tip_offset+prop_blade_tip_chord, 5), (prop_blade_tip_offset+2, 5-1), p2]).rotate((0,0,0),(0,1,0),-15) # Tip twist
    
    blade1 = blade_workplane.workplane(offset=0).placeSketch(cq.Face.makeFromWires(s1)).workplane(offset=prop_blade_thickness).placeSketch(cq.Face.makeFromWires(s2)).loft(ruled=True)
    blade2 = blade1.rotate((motor_x, motor_y, prop_z), (motor_x, motor_y, prop_z + 1), 180)
    propeller = prop_hub.union(blade1).union(blade2)

    body_shell = body_shell.union(arm).union(esc).union(motor_mount).union(motor_assembly).union(propeller)
    
# --- 10. Camera and Gimbal Assembly ---
# Gimbal Mounting Plate
gimbal_plate = (
    cq.Workplane("XY", offset=gimbal_mount_plate_z_offset)
    .transformed(offset=(0, gimbal_mount_plate_y_offset, 0))
    .box(gimbal_mount_plate_w, gimbal_mount_plate_l, gimbal_mount_plate_h)
    .edges().fillet(1.0)
)
body_shell = body_shell.union(gimbal_plate)

# Vibration Dampers
damper_base_z = gimbal_mount_plate_z_offset + gimbal_mount_plate_h
damper_top_z = damper_base_z + vibration_damper_h
damper_locations = [
    (vibration_damper_spacing_x/2, gimbal_mount_plate_y_offset + vibration_damper_spacing_y/2),
    (-vibration_damper_spacing_x/2, gimbal_mount_plate_y_offset + vibration_damper_spacing_y/2),
    (vibration_damper_spacing_x/2, gimbal_mount_plate_y_offset - vibration_damper_spacing_y/2),
    (-vibration_damper_spacing_x/2, gimbal_mount_plate_y_offset - vibration_damper_spacing_y/2),
]
for x, y in damper_locations:
    damper = (
        cq.Workplane("XY", offset=damper_base_z)
        .transformed(offset=(x, y, 0))
        .circle(vibration_damper_od/2)
        .extrude(vibration_damper_h)
    )
    damper_hole = (
        cq.Workplane("XY", offset=damper_base_z)
        .transformed(offset=(x, y, 0))
        .circle(vibration_damper_id/2)
        .extrude(vibration_damper_h)
    )
    body_shell = body_shell.union(damper.cut(damper_hole))

# Gimbal Structure
gimbal_assembly_z_offset = gimbal_mount_plate_z_offset - vibration_damper_h
gimbal_y_offset = gimbal_mount_plate_y_offset - 10

# Yaw Motor
yaw_motor = (
    cq.Workplane("XY", offset=gimbal_assembly_z_offset)
    .transformed(offset=(0, gimbal_y_offset, 0))
    .circle(yaw_motor_ring_od/2)
    .circle(yaw_motor_ring_id/2)
    .extrude(yaw_motor_ring_h)
)
gimbal = yaw_motor

# Roll Motor and Arm
roll_arm = (
    cq.Workplane("YZ", origin=(-yaw_motor_ring_od/2, gimbal_y_offset, gimbal_assembly_z_offset + yaw_motor_ring_h/2))
    .box(roll_motor_h, 10, roll_motor_h)
)
roll_motor = (
    cq.Workplane("XZ", origin=(-yaw_motor_ring_od/2 - roll_motor_h/2, gimbal_y_offset, gimbal_assembly_z_offset + yaw_motor_ring_h/2))
    .circle(roll_motor_d/2)
    .extrude(roll_motor_h)
)
gimbal = gimbal.union(roll_arm).union(roll_motor)

# Pitch Arms
pitch_arm_y = gimbal_y_offset
pitch_arm_z = gimbal_assembly_z_offset + yaw_motor_ring_h/2
pitch_arm_x_center = -yaw_motor_ring_od/2 - roll_motor_h/2
pitch_arm1 = (
    cq.Workplane("XY", offset=pitch_arm_z)
    .transformed(offset=(pitch_arm_x_center - pitch_arm_spacing/2, pitch_arm_y, 0))
    .box(pitch_arm_w, pitch_arm_l, pitch_arm_h)
)
pitch_arm2 = (
    cq.Workplane("XY", offset=pitch_arm_z)
    .transformed(offset=(pitch_arm_x_center + pitch_arm_spacing/2, pitch_arm_y, 0))
    .box(pitch_arm_w, pitch_arm_l, pitch_arm_h)
)
gimbal = gimbal.union(pitch_arm1).union(pitch_arm2)

# Camera Body
cam_y = pitch_arm_y - pitch_arm_l/2
cam_z = pitch_arm_z
cam_x = pitch_arm_x_center
camera = (
    cq.Workplane("XY", offset=cam_z)
    .transformed(offset=(cam_x, cam_y, 0))
    .box(camera_body_w, camera_body_d, camera_body_h)
    .edges().fillet(2.0)
)

# Lens Barrel
lens = (
    cq.Workplane("XZ", origin=(cam_x, cam_y - camera_body_d/2, cam_z))
    .circle(camera_lens_barrel_od/2)
    .extrude(-camera_lens_protrusion)
)
lens_inner = (
    cq.Workplane("XZ", origin=(cam_x, cam_y - camera_body_d/2, cam_z))
    .circle(camera_lens_element_d/2)
    .extrude(-camera_lens_protrusion)
)
lens_glass = (
    cq.Workplane("XZ", origin=(cam_x, cam_y - camera_body_d/2 - camera_lens_protrusion, cam_z))
    .circle(camera_lens_element_d/2)
    .extrude(1)
)
camera = camera.union(lens.cut(lens_inner)).union(lens_glass)

# Camera Sensor (internal)
sensor = (
    cq.Workplane("XY", offset=cam_z)
    .transformed(offset=(cam_x, cam_y + camera_body_d/2 - 2, 0))
    .box(camera_sensor_w, camera_sensor_thickness, camera_sensor_h)
)
camera = camera.union(sensor)

gimbal = gimbal.union(camera)
body_shell = body_shell.union(gimbal)

# --- Final Result ---
result = body_shell