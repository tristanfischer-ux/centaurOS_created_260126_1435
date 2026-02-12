import cadquery as cq
import math

# =============================================================================
# --- Dimensions ---
# =============================================================================

# --- Overall Body ---
body_l = 180.0
body_w = 85.0
body_h = 48.0
wall_th = 2.0
vert_cr = 12.0
top_fr = 8.0
bottom_fr = 4.0

# --- Top Features ---
dome_h = 15.0
dome_base_l = 100.0
dome_base_w = 60.0
gps_puck_dia = 22.0
gps_puck_h = 5.0
gps_recess_dia = 24.0
gps_recess_depth = 3.0
antenna_l = 35.0
antenna_w = 16.0
antenna_h = 4.0
antenna_wall = 1.5
vent_l = 15.0
vent_w = 2.0
vent_spacing = 4.0
num_vents = 6

# --- Internal Features ---
rib_th = 1.5
boss_od = 6.0
boss_id = 2.5 # M2.5 hole
boss_h = 10.0
pcb_l = 60.0
pcb_w = 40.0
pcb_th = 1.6
pcb_standoff_od = 5.0
pcb_standoff_id = 2.5 # M2.5 hole
pcb_standoff_h = 6.0

# --- Battery Bay ---
bay_l = 110.0
bay_w = 62.0
bay_h = 30.0
bay_rail_w = 4.0
bay_rail_h = 2.0
contact_l = 8.0
contact_w = 4.0
contact_spacing = 8.0
latch_l = 16.0
latch_w = 8.0
latch_h = 6.0

# --- Arms ---
arm_pivot_to_motor = 140.0
arm_w = 20.0
arm_h = 16.0
arm_fr = 4.0
arm_wire_channel_dia = 6.0
front_arm_angle_deg = 32.0
rear_arm_angle_deg = 38.0
# Pivot points relative to body center
arm_pivot_x = body_l / 2 - 40.0
arm_pivot_y = body_w / 2 - 10.0
arm_pivot_z = -body_h / 2 + 15.0

# --- Motors ---
motor_mount_od = 28.0
motor_mount_h = 5.0
motor_mount_bore_dia = 22.0
motor_bolt_circle_dia = 16.0
motor_bolt_dia = 3.0 # M3
motor_bell_od = 24.0
motor_bell_h = 12.0
motor_bell_wall = 2.0
magnet_ring_od = 22.0
magnet_ring_id = 18.0
magnet_ring_h = 8.0
motor_shaft_dia = 5.0
motor_shaft_protrusion = 10.0
prop_guard_boss_od = 6.0
prop_guard_boss_id = 2.0
prop_guard_boss_h = 5.0

# --- Propellers ---
prop_dia = 183.0
prop_hub_od = 12.0
prop_hub_h = 6.0
prop_hub_bore_dia = 5.2
prop_blade_root_chord = 18.0
prop_blade_tip_chord = 8.0
prop_blade_th = 2.5
prop_blade_angle = 10.0 # A slight angle for visual representation

# --- ESC ---
esc_pcb_l = 30.0
esc_pcb_w = 15.0
esc_pcb_h = 5.0
esc_mount_hole_spacing = 22.0
esc_mount_hole_dia = 2.0 # M2
esc_dist_from_body = 35.0

# --- Camera & Gimbal ---
gimbal_plate_l = 40.0
gimbal_plate_w = 30.0
gimbal_plate_h = 3.0
damper_od = 8.0
damper_h = 5.0
yaw_motor_od = 20.0
yaw_motor_h = 6.0
pitch_arm_l = 15.0
pitch_arm_w = 6.0
pitch_arm_h = 4.0
camera_l = 28.0
camera_w = 22.0
camera_h = 26.0
lens_barrel_od = 16.0
lens_barrel_depth = 10.0
lens_dia = 12.0

# --- Ports & Sensors ---
usbc_w = 8.94
usbc_h = 3.26
microsd_w = 12.0
microsd_h = 1.5
front_sensor_w = 10.0
front_sensor_h = 8.0
front_sensor_spacing = 26.0
bottom_vision_dia = 12.0
bottom_tof_dia = 6.0
rear_sensor_dia = 10.0

# --- LEDs ---
front_led_l = 30.0
front_led_h = 3.0
rear_led_w = 8.0
rear_led_h = 3.0
rear_led_spacing = 40.0

# --- Landing Gear ---
lg_strut_l = 10.0
lg_strut_w = 50.0
lg_strut_h = 18.0
lg_foot_l = 54.0
lg_foot_w = 12.0
lg_foot_h = 4.0
lg_rubber_h = 2.0
lg_slot_l = 4.0
lg_slot_h = 25.0
lg_fr = 3.0

# =============================================================================
# --- 1. Main Body Shell ---
# =============================================================================
# Using PATTERN 1 for the main shell
body_outer = (
    cq.Workplane("XY")
    .box(body_l, body_w, body_h, centered=True)
    .edges("|Z").fillet(vert_cr)
    .edges(">Z").fillet(top_fr)
    .edges("<Z").fillet(bottom_fr)
)

body_inner = (
    cq.Workplane("XY")
    .box(body_l - 2 * wall_th, body_w - 2 * wall_th, body_h - 2 * wall_th, centered=True)
    .edges("|Z").fillet(vert_cr - wall_th)
    .edges(">Z").fillet(top_fr - wall_th)
    # No fillet on the inner bottom edge to keep it flat
)

body_shell = body_outer.cut(body_inner)

# =============================================================================
# --- 2. Top Aerodynamic Dome ---
# =============================================================================
# Using PATTERN 5 for the dome
dome = (
    cq.Workplane("XY")
    .workplane(offset=body_h / 2 - dome_h / 2)
    .transformed(offset=(-body_l / 4, 0, 0))
    .ellipse(dome_base_l / 2, dome_base_w / 2)
    .extrude(dome_h)
    .edges(">Z").fillet(dome_h * 0.9) # Smooth dome fillet
)
body_shell = body_shell.union(dome)

# =============================================================================
# --- 3. Internal Structural Ribbing ---
# =============================================================================
# Using PATTERN 2 for ribs
# Longitudinal rib
long_rib = (
    cq.Workplane("XY")
    .workplane(offset=-body_h / 2 + wall_th)
    .box(body_l - 2 * wall_th, rib_th, body_h - 2 * wall_th, centered=True)
)
body_shell = body_shell.union(long_rib)

# Cross ribs
cross_rib_l = body_w - 2 * wall_th
cross_rib_h = body_h - 2 * wall_th
cross_rib_x_positions = [-body_l/4, 0, body_l/4]
for x_pos in cross_rib_x_positions:
    cross_rib = (
        cq.Workplane("XY")
        .workplane(offset=-body_h / 2 + wall_th)
        .transformed(offset=(x_pos, 0, 0))
        .box(rib_th, cross_rib_l, cross_rib_h, centered=True)
    )
    body_shell = body_shell.union(cross_rib)

# =============================================================================
# --- 4. Battery Bay Cutout and Features ---
# =============================================================================
# Using PATTERN 4 for the main cutout
bay_cutout = (
    cq.Workplane("XY")
    .workplane(offset=-bay_h / 2)
    .transformed(offset=(-(body_l - bay_l) / 2, 0, 0))
    .box(bay_l, bay_w, bay_h, centered=True)
)
body_shell = body_shell.cut(bay_cutout)

# Using PATTERN 2 for guide rails
# Top rails
rail_z_pos = bay_h / 2 - wall_th - bay_rail_h / 2
rail_y_pos = bay_w / 2 - bay_rail_w / 2
rail_x_pos = -(body_l - bay_l) / 2
top_rail_left = (
    cq.Workplane("XY")
    .workplane(offset=rail_z_pos)
    .transformed(offset=(rail_x_pos, rail_y_pos, 0))
    .box(bay_l, bay_rail_w, bay_rail_h, centered=True)
)
top_rail_right = (
    cq.Workplane("XY")
    .workplane(offset=rail_z_pos)
    .transformed(offset=(rail_x_pos, -rail_y_pos, 0))
    .box(bay_l, bay_rail_w, bay_rail_h, centered=True)
)
body_shell = body_shell.union(top_rail_left).union(top_rail_right)

# Bottom rails
rail_z_pos_bottom = -bay_h / 2 + wall_th + bay_rail_h / 2
bottom_rail_left = (
    cq.Workplane("XY")
    .workplane(offset=rail_z_pos_bottom)
    .transformed(offset=(rail_x_pos, rail_y_pos, 0))
    .box(bay_l, bay_rail_w, bay_rail_h, centered=True)
)
bottom_rail_right = (
    cq.Workplane("XY")
    .workplane(offset=rail_z_pos_bottom)
    .transformed(offset=(rail_x_pos, -rail_y_pos, 0))
    .box(bay_l, bay_rail_w, bay_rail_h, centered=True)
)
body_shell = body_shell.union(bottom_rail_left).union(bottom_rail_right)

# Electrical contacts
contact_x = -body_l/2 + wall_th + bay_l + contact_l/2
contact_z = -bay_h/2 + wall_th + contact_w/2
num_contacts = 6
for i in range(num_contacts):
    y_pos = -((num_contacts - 1) * contact_spacing) / 2 + i * contact_spacing
    contact = (
        cq.Workplane("XY")
        .workplane(offset=contact_z)
        .transformed(offset=(contact_x, y_pos, 0), rotate=(0, 90, 0))
        .box(contact_w, contact_l, 1, centered=True)
    )
    body_shell = body_shell.union(contact)

# Mechanical Latch
latch_x = -body_l/2 + wall_th + bay_l - latch_l/2
latch_z = bay_h/2 - wall_th - latch_h/2
latch = (
    cq.Workplane("XY")
    .workplane(offset=latch_z)
    .transformed(offset=(latch_x, 0, 0))
    .box(latch_l, latch_w, latch_h, centered=True)
)
body_shell = body_shell.union(latch)

# =============================================================================
# --- 5. Internal Mounting Bosses (Screws & PCB) ---
# =============================================================================
boss_z_offset = -body_h / 2 + wall_th
boss_positions = [
    (body_l/2 - 15, body_w/2 - 15), (body_l/2 - 15, -body_w/2 + 15),
    (-body_l/2 + 15, body_w/2 - 15), (-body_l/2 + 15, -body_w/2 + 15),
    (body_l/4, body_w/2 - 15), (body_l/4, -body_w/2 + 15),
    (-body_l/4, body_w/2 - 15), (-body_l/4, -body_w/2 + 15)
]

for x, y in boss_positions:
    # Using PATTERN 2 for boss body
    boss_solid = (
        cq.Workplane("XY")
        .workplane(offset=boss_z_offset)
        .transformed(offset=(x, y, 0))
        .circle(boss_od / 2).extrude(boss_h)
    )
    body_shell = body_shell.union(boss_solid)
    # Using PATTERN 4 for boss hole
    boss_hole = (
        cq.Workplane("XY")
        .workplane(offset=boss_z_offset - 1)
        .transformed(offset=(x, y, 0))
        .circle(boss_id / 2).extrude(boss_h + 2)
    )
    body_shell = body_shell.cut(boss_hole)

# PCB Standoffs
pcb_z_offset = -body_h / 2 + wall_th
pcb_standoff_positions = [
    (pcb_l/2, pcb_w/2), (pcb_l/2, -pcb_w/2),
    (-pcb_l/2, pcb_w/2), (-pcb_l/2, -pcb_w/2)
]
for x, y in pcb_standoff_positions:
    standoff_solid = (
        cq.Workplane("XY")
        .workplane(offset=pcb_z_offset)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_od / 2).extrude(pcb_standoff_h)
    )
    body_shell = body_shell.union(standoff_solid)
    standoff_hole = (
        cq.Workplane("XY")
        .workplane(offset=pcb_z_offset - 1)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_id / 2).extrude(pcb_standoff_h + 2)
    )
    body_shell = body_shell.cut(standoff_hole)

# =============================================================================
# --- 6. Side Ports (USB-C, microSD) ---
# =============================================================================
# Using PATTERN 4 for cutouts
port_y = -body_w / 2 - 1
port_z_usbc = 0
port_z_microsd = port_z_usbc - 15

usbc_cutout = (
    cq.Workplane("XY")
    .workplane(offset=port_z_usbc)
    .transformed(offset=(-body_l/4, port_y, 0), rotate=(90, 0, 0))
    .rect(usbc_w, wall_th * 2).extrude(usbc_h)
    .rotate((0,0,0), (0,1,0), 90) # Align with body
)
body_shell = body_shell.cut(usbc_cutout)

microsd_cutout = (
    cq.Workplane("XY")
    .workplane(offset=port_z_microsd)
    .transformed(offset=(-body_l/4, port_y, 0), rotate=(90, 0, 0))
    .rect(microsd_w, wall_th * 2).extrude(microsd_h)
    .rotate((0,0,0), (0,1,0), 90) # Align with body
)
body_shell = body_shell.cut(microsd_cutout)

# =============================================================================
# --- 7. Sensors (Front, Bottom, Rear) ---
# =============================================================================
# Front Sensors
front_sensor_x = body_l / 2 + 1
front_sensor_z = 5
front_sensor_y_offset = front_sensor_spacing / 2
front_sensor_cutout = (
    cq.Workplane("XY")
    .workplane(offset=front_sensor_z)
    .box(wall_th * 2, front_sensor_w, front_sensor_h, centered=True)
    .translate((front_sensor_x, 0, 0))
)
body_shell = body_shell.cut(front_sensor_cutout.translate((0, front_sensor_y_offset, 0)))
body_shell = body_shell.cut(front_sensor_cutout.translate((0, -front_sensor_y_offset, 0)))


# Bottom Sensors
bottom_z = -body_h / 2 - 1
bottom_vision_hole = (
    cq.Workplane("XY")
    .workplane(offset=bottom_z)
    .transformed(offset=(body_l/4, 0, 0))
    .circle(bottom_vision_dia / 2).extrude(wall_th + 2)
)
body_shell = body_shell.cut(bottom_vision_hole)

bottom_tof_hole = (
    cq.Workplane("XY")
    .workplane(offset=bottom_z)
    .transformed(offset=(body_l/4 + 20, 0, 0))
    .circle(bottom_tof_dia / 2).extrude(wall_th + 2)
)
body_shell = body_shell.cut(bottom_tof_hole)

# Rear Sensor
rear_sensor_x = -body_l / 2 - 1
rear_sensor_hole = (
    cq.Workplane("XY")
    .workplane(offset=rear_sensor_x)
    .transformed(offset=(0, 0, 0))
    .circle(rear_sensor_dia / 2).extrude(wall_th + 2)
    .rotate((0,0,0), (0,1,0), 90)
)
body_shell = body_shell.cut(rear_sensor_hole)

# =============================================================================
# --- 8. LEDs and Vents ---
# =============================================================================
# Front LED Bar
front_led_cutout = (
    cq.Workplane("XY")
    .workplane(offset=front_led_h)
    .transformed(offset=(body_l/2 + 1, 0, 0))
    .rect(wall_th * 2, front_led_l).extrude(front_led_h)
    .rotate((0,0,0), (0,1,0), 90)
)
body_shell = body_shell.cut(front_led_cutout)

# Rear LEDs
rear_led_x = -body_l / 2 - 1
rear_led_y_offset = rear_led_spacing / 2
rear_led_cutout_shape = (
    cq.Workplane("XY")
    .workplane(offset=0)
    .rect(wall_th * 2, rear_led_w).extrude(rear_led_h)
    .rotate((0,0,0), (0,1,0), 90)
)
body_shell = body_shell.cut(rear_led_cutout_shape.translate((rear_led_x, rear_led_y_offset, 0)))
body_shell = body_shell.cut(rear_led_cutout_shape.translate((rear_led_x, -rear_led_y_offset, 0)))

# Top Vents
vent_z = body_h / 2 + 1
vent_x_start = - (num_vents - 1) * (vent_w + vent_spacing) / 2
for i in range(num_vents):
    x_pos = vent_x_start + i * (vent_w + vent_spacing)
    vent_cut = (
        cq.Workplane("XY")
        .workplane(offset=vent_z)
        .transformed(offset=(x_pos, 0, 0))
        .rect(vent_w, vent_l).extrude(-(wall_th + 2))
    )
    body_shell = body_shell.cut(vent_cut)

# =============================================================================
# --- 9. GPS Puck and Antenna Housing ---
# =============================================================================
# GPS Puck Recess
gps_recess_z = body_h / 2 + 1
gps_recess = (
    cq.Workplane("XY")
    .workplane(offset=gps_recess_z)
    .transformed(offset=(body_l/4, 0, 0))
    .circle(gps_recess_dia / 2).extrude(-gps_recess_depth - 1)
)
body_shell = body_shell.cut(gps_recess)

# GPS Puck
gps_puck_z = body_h / 2 - gps_recess_depth + gps_puck_h/2
gps_puck = (
    cq.Workplane("XY")
    .workplane(offset=gps_puck_z)
    .transformed(offset=(body_l/4, 0, 0))
    .circle(gps_puck_dia / 2).extrude(gps_puck_h)
    .edges(">Z").fillet(1.5)
)
body_shell = body_shell.union(gps_puck)

# Antenna Housing
antenna_z = body_h / 2
antenna_x = -body_l / 2 + 25
antenna_outer = (
    cq.Workplane("XY")
    .workplane(offset=antenna_z)
    .transformed(offset=(antenna_x, 0, 0))
    .box(antenna_l, antenna_w, antenna_h, centered=True)
    .edges().fillet(1)
)
antenna_inner = (
    cq.Workplane("XY")
    .workplane(offset=antenna_z)
    .transformed(offset=(antenna_x, 0, 0))
    .box(antenna_l - 2*antenna_wall, antenna_w - 2*antenna_wall, antenna_h, centered=True)
)
antenna_shell = antenna_outer.cut(antenna_inner)
body_shell = body_shell.union(antenna_shell)

# =============================================================================
# --- 10. Camera and Gimbal Assembly ---
# =============================================================================
gimbal_base_z = -body_h / 2 - gimbal_plate_h / 2
gimbal_base_x = body_l / 2 - 30

# Gimbal Plate
gimbal_plate = (
    cq.Workplane("XY")
    .workplane(offset=gimbal_base_z)
    .transformed(offset=(gimbal_base_x, 0, 0))
    .box(gimbal_plate_l, gimbal_plate_w, gimbal_plate_h, centered=True)
)
body_shell = body_shell.union(gimbal_plate)

# Dampers
damper_z = gimbal_base_z + gimbal_plate_h/2 + damper_h/2
damper_positions = [
    (gimbal_plate_l/2 - 5, gimbal_plate_w/2 - 5), (gimbal_plate_l/2 - 5, -gimbal_plate_w/2 + 5),
    (-gimbal_plate_l/2 + 5, gimbal_plate_w/2 - 5), (-gimbal_plate_l/2 + 5, -gimbal_plate_w/2 + 5)
]
for dx, dy in damper_positions:
    damper = (
        cq.Workplane("XY")
        .workplane(offset=damper_z)
        .transformed(offset=(gimbal_base_x + dx, dy, 0))
        .circle(damper_od / 2).extrude(damper_h)
    )
    body_shell = body_shell.union(damper)

# Yaw Motor
yaw_motor_z = gimbal_base_z - gimbal_plate_h/2 - yaw_motor_h/2
yaw_motor = (
    cq.Workplane("XY")
    .workplane(offset=yaw_motor_z)
    .transformed(offset=(gimbal_base_x, 0, 0))
    .circle(yaw_motor_od / 2).extrude(yaw_motor_h)
)
body_shell = body_shell.union(yaw_motor)

# Pitch Arms
pitch_arm_z = yaw_motor_z - yaw_motor_h/2 - pitch_arm_h/2
pitch_arm_y_offset = camera_w/2 + pitch_arm_w/2
pitch_arm_left = (
    cq.Workplane("XY")
    .workplane(offset=pitch_arm_z)
    .transformed(offset=(gimbal_base_x, pitch_arm_y_offset, 0))
    .box(pitch_arm_l, pitch_arm_w, pitch_arm_h, centered=True)
)
pitch_arm_right = (
    cq.Workplane("XY")
    .workplane(offset=pitch_arm_z)
    .transformed(offset=(gimbal_base_x, -pitch_arm_y_offset, 0))
    .box(pitch_arm_l, pitch_arm_w, pitch_arm_h, centered=True)
)
body_shell = body_shell.union(pitch_arm_left).union(pitch_arm_right)

# Camera Body
camera_z = pitch_arm_z
camera_x = gimbal_base_x + pitch_arm_l/2 + camera_l/2
camera_body = (
    cq.Workplane("XY")
    .workplane(offset=camera_z)
    .transformed(offset=(camera_x, 0, 0))
    .box(camera_l, camera_w, camera_h, centered=True)
    .edges().fillet(2)
)
body_shell = body_shell.union(camera_body)

# Lens Barrel
lens_z = camera_z
lens_x = camera_x + camera_l/2
lens_barrel = (
    cq.Workplane("XY")
    .workplane(offset=lens_z)
    .transformed(offset=(lens_x, 0, 0))
    .circle(lens_barrel_od / 2).extrude(lens_barrel_depth)
)
body_shell = body_shell.union(lens_barrel)

# Lens Cutout
lens_cutout = (
    cq.Workplane("XY")
    .workplane(offset=lens_z)
    .transformed(offset=(lens_x + lens_barrel_depth, 0, 0))
    .circle(lens_dia / 2).extrude(-2)
)
body_shell = body_shell.cut(lens_cutout)

# =============================================================================
# --- 11. Arms, Motors, and Propellers ---
# =============================================================================
# Helper function to create a motor assembly
def create_motor_assembly(x, y, z):
    # Motor Mount Plate
    mount = (
        cq.Workplane("XY")
        .workplane(offset=z)
        .transformed(offset=(x, y, 0))
        .circle(motor_mount_od / 2).circle(motor_mount_bore_dia / 2)
        .extrude(motor_mount_h)
    )
    # Bolt holes
    for angle in [0, 120, 240]:
        hole_x = x + (motor_bolt_circle_dia / 2) * math.cos(math.radians(angle))
        hole_y = y + (motor_bolt_circle_dia / 2) * math.sin(math.radians(angle))
        hole = (
            cq.Workplane("XY")
            .workplane(offset=z - 1)
            .transformed(offset=(hole_x, hole_y, 0))
            .circle(motor_bolt_dia / 2).extrude(motor_mount_h + 2)
        )
        mount = mount.cut(hole)

    # Prop Guard Boss
    boss = (
        cq.Workplane("XY")
        .workplane(offset=z + motor_mount_h)
        .transformed(offset=(x, y, 0))
        .circle(prop_guard_boss_od / 2).circle(prop_guard_boss_id / 2)
        .extrude(prop_guard_boss_h)
    )
    mount = mount.union(boss)
    
    # Motor Bell
    bell_z = z + motor_mount_h
    bell = (
        cq.Workplane("XY")
        .workplane(offset=bell_z)
        .transformed(offset=(x, y, 0))
        .circle(motor_bell_od / 2).circle(motor_bell_od / 2 - motor_bell_wall)
        .extrude(motor_bell_h)
    )
    mount = mount.union(bell)

    # Magnet Ring
    magnet_z = bell_z + wall_th
    magnet = (
        cq.Workplane("XY")
        .workplane(offset=magnet_z)
        .transformed(offset=(x, y, 0))
        .circle(magnet_ring_od / 2).circle(magnet_ring_id / 2)
        .extrude(magnet_ring_h)
    )
    mount = mount.union(magnet)
    
    # Motor Shaft
    shaft_z = z + motor_mount_h
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=shaft_z)
        .transformed(offset=(x, y, 0))
        .circle(motor_shaft_dia / 2).extrude(motor_bell_h + motor_shaft_protrusion)
    )
    mount = mount.union(shaft)
    
    return mount

# Helper function to create a propeller
def create_propeller(x, y, z, rotation):
    prop_z = z + motor_mount_h + motor_bell_h + motor_shaft_protrusion
    # Hub
    hub = (
        cq.Workplane("XY")
        .workplane(offset=prop_z)
        .transformed(offset=(x, y, 0))
        .circle(prop_hub_od / 2).circle(prop_hub_bore_dia / 2)
        .extrude(prop_hub_h)
    )
    # Blades
    blade_1 = (
        cq.Workplane("XY")
        .workplane(offset=prop_z + prop_hub_h / 2)
        .transformed(offset=(x, y, 0), rotate=(0, prop_blade_angle, rotation))
        .box(prop_dia, prop_blade_root_chord, prop_blade_th, centered=True)
        .edges("|Z").fillet(prop_blade_th * 0.4)
    )
    blade_2 = (
        cq.Workplane("XY")
        .workplane(offset=prop_z + prop_hub_h / 2)
        .transformed(offset=(x, y, 0), rotate=(0, -prop_blade_angle, rotation + 180))
        .box(prop_dia, prop_blade_root_chord, prop_blade_th, centered=True)
        .edges("|Z").fillet(prop_blade_th * 0.4)
    )
    return hub.union(blade_1).union(blade_2)


# --- Arm Definitions ---
arm_definitions = [
    {'pos': (arm_pivot_x, arm_pivot_y), 'angle': front_arm_angle_deg, 'prop_rot': 45}, # Front Right
    {'pos': (arm_pivot_x, -arm_pivot_y), 'angle': -front_arm_angle_deg, 'prop_rot': -45}, # Front Left
    {'pos': (-arm_pivot_x, arm_pivot_y), 'angle': 180 - rear_arm_angle_deg, 'prop_rot': -45}, # Rear Right
    {'pos': (-arm_pivot_x, -arm_pivot_y), 'angle': 180 + rear_arm_angle_deg, 'prop_rot': 45} # Rear Left
]

for arm_def in arm_definitions:
    px, py = arm_def['pos']
    angle = arm_def['angle']
    
    # Using PATTERN 3 for the arm
    arm_outer = (
        cq.Workplane("XY")
        .workplane(offset=arm_pivot_z)
        .transformed(offset=(px, py, 0), rotate=(0, 0, angle))
        .transformed(offset=(arm_pivot_to_motor/2, 0, 0)) # Move box center to arm center
        .box(arm_pivot_to_motor, arm_w, arm_h, centered=True)
        .edges("|Z").fillet(arm_fr)
    )
    
    # Using PATTERN 4 for the wire channel
    arm_inner_cutout = (
        cq.Workplane("XY")
        .workplane(offset=arm_pivot_z)
        .transformed(offset=(px, py, 0), rotate=(0, 0, angle))
        .transformed(offset=(arm_pivot_to_motor/2, 0, 0))
        .circle(arm_wire_channel_dia / 2).extrude(arm_pivot_to_motor + 2, both=True)
        .rotate((0,0,0), (0,1,0), 90)
    )
    
    arm = arm_outer.cut(arm_inner_cutout)
    body_shell = body_shell.union(arm)

    # ESC inside arm
    esc_dist = esc_dist_from_body
    esc_x = px + esc_dist * math.cos(math.radians(angle))
    esc_y = py + esc_dist * math.sin(math.radians(angle))
    esc_pcb = (
        cq.Workplane("XY")
        .workplane(offset=arm_pivot_z)
        .transformed(offset=(esc_x, esc_y, 0), rotate=(0, 0, angle))
        .box(esc_pcb_l, esc_pcb_w, esc_pcb_h, centered=True)
    )
    body_shell = body_shell.union(esc_pcb)
    
    # Motor position calculation
    motor_x = px + arm_pivot_to_motor * math.cos(math.radians(angle))
    motor_y = py + arm_pivot_to_motor * math.sin(math.radians(angle))
    motor_z = arm_pivot_z
    
    motor_assembly = create_motor_assembly(motor_x, motor_y, motor_z)
    body_shell = body_shell.union(motor_assembly)

    propeller = create_propeller(motor_x, motor_y, motor_z, arm_def['prop_rot'])
    body_shell = body_shell.union(propeller)


# =============================================================================
# --- 12. Landing Gear ---
# =============================================================================
# Rear landing gear positions are under the rear motors
rear_motor_1_pos_x = -arm_pivot_x + arm_pivot_to_motor * math.cos(math.radians(180 - rear_arm_angle_deg))
rear_motor_1_pos_y = arm_pivot_y + arm_pivot_to_motor * math.sin(math.radians(180 - rear_arm_angle_deg))
rear_motor_2_pos_x = -arm_pivot_x + arm_pivot_to_motor * math.cos(math.radians(180 + rear_arm_angle_deg))
rear_motor_2_pos_y = -arm_pivot_y + arm_pivot_to_motor * math.sin(math.radians(180 + rear_arm_angle_deg))

lg_positions = [
    (rear_motor_1_pos_x, rear_motor_1_pos_y),
    (rear_motor_2_pos_x, rear_motor_2_pos_y)
]

for x, y in lg_positions:
    # Strut
    strut_z = arm_pivot_z - arm_h/2 - lg_strut_h/2
    strut = (
        cq.Workplane("XY")
        .workplane(offset=strut_z)
        .transformed(offset=(x, y, 0))
        .box(lg_strut_l, lg_strut_w, lg_strut_h, centered=True)
        .edges().fillet(lg_fr)
    )
    # Weight saving slot
    slot = (
        cq.Workplane("XY")
        .workplane(offset=strut_z)
        .transformed(offset=(x, y, 0))
        .box(lg_slot_l, lg_slot_h, lg_strut_h * 0.6, centered=True)
    )
    strut = strut.cut(slot)
    
    # Foot Pad
    foot_z = strut_z - lg_strut_h/2 - lg_foot_h/2
    foot = (
        cq.Workplane("XY")
        .workplane(offset=foot_z)
        .transformed(offset=(x, y, 0))
        .box(lg_foot_l, lg_foot_w, lg_foot_h, centered=True)
        .edges().fillet(1.5)
    )
    
    # Rubber Layer
    rubber_z = foot_z - lg_foot_h/2 - lg_rubber_h/2
    rubber = (
        cq.Workplane("XY")
        .workplane(offset=rubber_z)
        .transformed(offset=(x, y, 0))
        .box(lg_foot_l, lg_foot_w, lg_rubber_h, centered=True)
    )
    
    landing_gear_leg = strut.union(foot).union(rubber)
    body_shell = body_shell.union(landing_gear_leg)


# =============================================================================
# --- Final Assignment ---
# =============================================================================
result = body_shell