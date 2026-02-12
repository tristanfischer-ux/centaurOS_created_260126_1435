import cadquery as cq
import math

# === DIMENSIONS ===

# --- Body ---
body_length = 180.0
body_width = 85.0
body_height = 48.0
body_wall_thickness = 2.0
body_corner_radius = 12.0

# --- Top Dome ---
dome_height = 15.0
dome_ellipse_minor_radius = body_width / 2.0
dome_ellipse_major_radius = 55.0 # Estimate for the ellipse length
dome_rear_offset = -25.0 # Positioned towards the rear

# --- Internal Ribs ---
rib_thickness = 1.5
rib_height = body_height - body_wall_thickness * 2

# --- Screw Bosses ---
boss_od = 6.0
boss_id = 2.5 # M2.5 hole
boss_height = 10.0
boss_x_spacing = 70.0
boss_y_spacing = 35.0

# --- Arms ---
arm_length = 140.0
arm_pivot_to_body_center_x = 45.0
arm_pivot_to_body_center_y = 30.0
arm_cross_section_w = 20.0
arm_cross_section_h = 16.0
arm_wall_thickness = 2.0
arm_front_angle_deg = 32.0
arm_rear_angle_deg = 38.0
arm_wire_channel_d = 6.0
arm_pivot_z = body_height - arm_cross_section_h - 5.0

# --- Motors ---
motor_mount_od = 28.0
motor_mount_h = 5.0
motor_center_bore_d = 22.0
motor_bolt_circle_d = 16.0
motor_bolt_d = 3.0 # M3
motor_bell_od = 24.0
motor_bell_h = 12.0
motor_bell_wall = 2.0
motor_magnet_ring_od = 22.0
motor_magnet_ring_id = 18.0
motor_magnet_ring_h = 8.0
motor_shaft_d = 5.0
motor_shaft_h = 10.0

# --- Propellers ---
prop_diameter = 183.0
prop_hub_od = 12.0
prop_hub_bore = 5.2
prop_hub_h = 6.0
prop_blade_width = 18.0
prop_blade_thickness = 2.5

# --- ESC (Electronic Speed Controller) ---
esc_l = 30.0
esc_w = 15.0
esc_h = 5.0
esc_dist_from_body_center = 35.0

# --- Camera/Gimbal ---
gimbal_plate_l = 40.0
gimbal_plate_w = 30.0
gimbal_plate_h = 3.0
gimbal_damper_od = 8.0
gimbal_damper_h = 6.0
gimbal_yaw_motor_od = 20.0
gimbal_yaw_motor_h = 6.0
gimbal_pitch_arm_l = 15.0
gimbal_pitch_arm_w = 4.0
gimbal_pitch_arm_h = 6.0
camera_l = 26.0
camera_w = 28.0
camera_h = 22.0
camera_lens_od = 16.0
camera_lens_element_d = 12.0
camera_lens_depth = 10.0
gimbal_z_offset = -10.0

# --- Battery Bay ---
battery_bay_l = 110.0
battery_bay_w = 62.0
battery_bay_h = 30.0
battery_rail_w = 4.0
battery_contact_w = 4.0
battery_contact_h = 8.0
battery_contact_spacing = 8.0
battery_latch_l = 16.0
battery_latch_w = 8.0
battery_latch_h = 6.0

# --- PCB (Main Board) ---
pcb_l = 60.0
pcb_w = 40.0
pcb_h = 1.6
pcb_standoff_od = 5.0
pcb_standoff_id = 2.5 # M2.5
pcb_standoff_h = 6.0
pcb_z = 10.0

# --- Ports ---
port_usb_c_w = 8.94
port_usb_c_h = 3.26
port_microsd_w = 12.0
port_microsd_h = 1.5
port_y_pos = -body_width / 2.0
port_z_pos = 15.0

# --- Sensors ---
sensor_front_w = 10.0
sensor_front_h = 8.0
sensor_bottom_d1 = 12.0
sensor_bottom_d2 = 6.0
sensor_rear_d = 10.0

# --- LEDs ---
led_front_bar_w = 30.0
led_front_bar_h = 3.0
led_rear_w = 8.0
led_rear_h = 3.0

# --- GPS ---
gps_puck_d = 22.0
gps_puck_h = 5.0
gps_recess_d = 24.0
gps_recess_depth = 3.0

# --- Antenna ---
antenna_l = 35.0
antenna_w = 16.0
antenna_h = 4.0

# --- Ventilation ---
vent_slot_l = 15.0
vent_slot_w = 2.0
vent_slot_count = 6
vent_slot_spacing = 8.0

# --- Landing Gear ---
landing_gear_strut_l = 50.0
landing_gear_strut_w = 10.0
landing_gear_strut_h = 18.0
landing_gear_foot_l = 54.0
landing_gear_foot_w = 12.0
landing_gear_foot_h = 4.0
landing_gear_front_x = body_length / 2 - 20

# --- Prop Guard Bosses ---
prop_guard_boss_od = 6.0
prop_guard_boss_id = 2.0
prop_guard_boss_h = 5.0


# === MODEL CONSTRUCTION ===

# --- 1. Main Body Shell ---
body_shell = (
    cq.Workplane("XY")
    .box(body_length, body_width, body_height, centered=True)
)
body_shell = body_shell.translate((0, 0, body_height / 2))

# Fillet main body edges
try:
    body_shell = body_shell.edges("|Z").fillet(body_corner_radius)
except Exception:
    pass
try:
    body_shell = body_shell.edges(">Z or <Z").fillet(body_corner_radius / 2)
except Exception:
    pass

# Hollow out the body
inner_body = (
    cq.Workplane("XY")
    .workplane(offset=body_wall_thickness)
    .box(
        body_length - 2 * body_wall_thickness,
        body_width - 2 * body_wall_thickness,
        body_height - body_wall_thickness,
        centered=True
    )
)
try:
    inner_body = inner_body.edges("|Z").fillet(body_corner_radius - body_wall_thickness)
except Exception:
    pass
try:
    inner_body = inner_body.edges(">Z or <Z").fillet(body_corner_radius / 2 - body_wall_thickness)
except Exception:
    pass

body_shell = body_shell.cut(inner_body)

# --- 2. Top Dome ---
dome = (
    cq.Workplane("XY")
    .workplane(offset=body_height)
    .transformed(offset=(dome_rear_offset, 0, 0))
    .ellipse(dome_ellipse_major_radius, dome_ellipse_minor_radius)
    .workplane(offset=dome_height)
    .circle(0.1) # Point at the top
    .loft(combine=True)
)
body_shell = body_shell.union(dome)

# --- 3. Battery Bay Cutout ---
battery_bay_cut = (
    cq.Workplane("XY")
    .workplane(offset=(body_height - battery_bay_h) / 2 + 5)
    .transformed(offset=(-(body_length - battery_bay_l) / 2, 0, 0))
    .box(battery_bay_l, battery_bay_w, battery_bay_h, centered=True)
)
body_shell = body_shell.cut(battery_bay_cut)

# Battery Bay Rails
rail_z = (body_height - battery_bay_h) / 2 + 5 - battery_bay_h/2 + body_wall_thickness
rail_y = battery_bay_w/2 - battery_rail_w/2
rail_x_offset = -(body_length - battery_bay_l) / 2

rail_left = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(rail_x_offset, rail_y, 0))
    .box(battery_bay_l, battery_rail_w, body_wall_thickness, centered=True)
)
rail_right = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(rail_x_offset, -rail_y, 0))
    .box(battery_bay_l, battery_rail_w, body_wall_thickness, centered=True)
)
body_shell = body_shell.union(rail_left).union(rail_right)

# Battery Contacts
contact_x = -body_length/2 + body_wall_thickness + 1
contact_z = 18
num_contacts = 6
total_contact_width = (num_contacts - 1) * battery_contact_spacing
for i in range(num_contacts):
    contact_y = -total_contact_width / 2 + i * battery_contact_spacing
    contact = (
        cq.Workplane("XY")
        .workplane(offset=contact_z)
        .transformed(offset=(contact_x, contact_y, 0))
        .box(body_wall_thickness * 2, battery_contact_w, battery_contact_h, centered=True)
    )
    body_shell = body_shell.union(contact)

# Battery Latch
latch_x = -body_length/2 + battery_bay_l + 5
latch_z = (body_height - battery_bay_h) / 2 + 5 + battery_bay_h/2 - latch_h/2
latch_cut = (
    cq.Workplane("XY")
    .workplane(offset=latch_z)
    .transformed(offset=(latch_x, 0, 0))
    .box(latch_l, latch_w, latch_h, centered=True)
)
body_shell = body_shell.cut(latch_cut)


# --- 4. Internal Ribs ---
rib_z = rib_height / 2 + body_wall_thickness
# Longitudinal rib
long_rib = (
    cq.Workplane("XY")
    .workplane(offset=rib_z)
    .box(body_length - 2 * body_wall_thickness, rib_thickness, rib_height, centered=True)
)
body_shell = body_shell.union(long_rib)

# Cross ribs
cross_rib_x_positions = [-40, 0, 40]
for x_pos in cross_rib_x_positions:
    cross_rib = (
        cq.Workplane("XY")
        .workplane(offset=rib_z)
        .transformed(offset=(x_pos, 0, 0))
        .box(rib_thickness, body_width - 2 * body_wall_thickness, rib_height, centered=True)
    )
    body_shell = body_shell.union(cross_rib)

# --- 5. Internal Screw Bosses & PCB Mounts ---
boss_z = boss_height / 2 + body_wall_thickness
boss_positions = [
    (boss_x_spacing / 2, boss_y_spacing / 2),
    (boss_x_spacing / 2, -boss_y_spacing / 2),
    (-boss_x_spacing / 2, boss_y_spacing / 2),
    (-boss_x_spacing / 2, -boss_y_spacing / 2),
    (boss_x_spacing, 0), (-boss_x_spacing, 0),
    (0, boss_y_spacing), (0, -boss_y_spacing)
]

for x, y in boss_positions:
    boss = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(x, y, 0))
        .circle(boss_od / 2).extrude(boss_height)
    )
    hole = (
        cq.Workplane("XY")
        .workplane(offset=body_wall_thickness - 1)
        .transformed(offset=(x, y, 0))
        .circle(boss_id / 2).extrude(boss_height + 2)
    )
    body_shell = body_shell.union(boss).cut(hole)

# PCB and Standoffs
pcb_body = (
    cq.Workplane("XY")
    .workplane(offset=pcb_z + pcb_standoff_h + pcb_h/2)
    .box(pcb_l, pcb_w, pcb_h, centered=True)
)
body_shell = body_shell.union(pcb_body)

standoff_x = pcb_l/2 - 5
standoff_y = pcb_w/2 - 5
standoff_positions = [
    (standoff_x, standoff_y), (standoff_x, -standoff_y),
    (-standoff_x, standoff_y), (-standoff_x, -standoff_y)
]
for x, y in standoff_positions:
    standoff = (
        cq.Workplane("XY")
        .workplane(offset=pcb_z + pcb_standoff_h/2)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_od / 2).extrude(pcb_standoff_h)
    )
    hole = (
        cq.Workplane("XY")
        .workplane(offset=pcb_z - 1)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_id / 2).extrude(pcb_standoff_h + 2)
    )
    body_shell = body_shell.union(standoff).cut(hole)

# --- 6. Landing Gear ---
def make_landing_gear():
    strut = (
        cq.Workplane("XY")
        .workplane(offset=landing_gear_strut_h / 2)
        .transformed(offset=(landing_gear_front_x, 0, 0), rotate=(0, 0, -15))
        .box(landing_gear_strut_w, landing_gear_strut_l, landing_gear_strut_h, centered=True)
    )
    try:
        strut = strut.edges().fillet(2)
    except Exception:
        pass
    
    foot = (
        cq.Workplane("XY")
        .workplane(offset=landing_gear_foot_h / 2)
        .transformed(offset=(landing_gear_front_x - 10, -landing_gear_strut_l/2 + 5, 0))
        .box(landing_gear_foot_l, landing_gear_foot_w, landing_gear_foot_h, centered=True)
    )
    try:
        foot = foot.edges(">Z or <Z").fillet(1.5)
    except Exception:
        pass
    
    return strut.union(foot)

lg_y = body_width/2 - landing_gear_strut_w/2 + 5
lg_right = make_landing_gear().translate((0, lg_y, 0))
lg_left = make_landing_gear().translate((0, -lg_y, 0))

body_shell = body_shell.union(lg_right).union(lg_left)


# --- 7. Arms and Motors ---
def make_motor_assembly():
    # Motor Mount Plate
    mount = (
        cq.Workplane("XY")
        .circle(motor_mount_od / 2)
        .extrude(motor_mount_h)
    )
    
    # Center Bore
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-1)
        .circle(motor_center_bore_d / 2)
        .extrude(motor_mount_h + 2)
    )
    mount = mount.cut(bore)
    
    # Bolt Holes
    bolt_holes = (
        cq.Workplane("XY")
        .workplane(offset=-1)
        .pushPoints([(r * math.cos(t), r * math.sin(t)) for t in [0, 2*math.pi/3, 4*math.pi/3] for r in [motor_bolt_circle_d/2]])
        .circle(motor_bolt_d / 2)
        .extrude(motor_mount_h + 2)
    )
    mount = mount.cut(bolt_holes)
    
    # Motor Bell
    bell_outer = (
        cq.Workplane("XY")
        .workplane(offset=motor_mount_h)
        .circle(motor_bell_od / 2)
        .extrude(motor_bell_h)
    )
    bell_inner = (
        cq.Workplane("XY")
        .workplane(offset=motor_mount_h + motor_bell_wall)
        .circle(motor_bell_od / 2 - motor_bell_wall)
        .extrude(motor_bell_h)
    )
    bell = bell_outer.cut(bell_inner)
    try:
        bell = bell.edges(">Z").fillet(2)
    except Exception:
        pass
        
    # Magnet Ring
    magnet_ring = (
        cq.Workplane("XY")
        .workplane(offset=motor_mount_h + motor_bell_wall)
        .ring(motor_magnet_ring_od / 2, motor_magnet_ring_id / 2)
        .extrude(motor_magnet_ring_h)
    )
    
    # Shaft
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=motor_mount_h)
        .circle(motor_shaft_d / 2)
        .extrude(motor_shaft_h)
    )
    
    motor = mount.union(bell).union(magnet_ring).union(shaft)
    return motor

def make_propeller(rotation_dir=1): # 1 for CW, -1 for CCW
    hub = (
        cq.Workplane("XY")
        .circle(prop_hub_od / 2)
        .extrude(prop_hub_h)
    )
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-1)
        .circle(prop_hub_bore / 2)
        .extrude(prop_hub_h + 2)
    )
    hub = hub.cut(bore)

    # Single blade
    blade_profile = (
        cq.Workplane("XZ")
        .moveTo(-prop_blade_thickness/2, 0)
        .spline([(0, prop_blade_thickness/2), (prop_blade_width/2, 0), (0, -prop_blade_thickness/2), (-prop_blade_thickness/2, 0)], includeCurrent=True)
        .close()
    )
    
    blade_path = (
        cq.Workplane("XY")
        .moveTo(prop_hub_od/2, 0)
        .spline([(prop_diameter/4, 5*rotation_dir), (prop_diameter/2, 0*rotation_dir)])
    )
    
    blade = blade_profile.sweep(blade_path, transition='round')
    
    # Create two blades
    prop = hub.union(blade).union(blade.rotate((0,0,0), (0,0,1), 180))
    return prop

def make_arm(is_front, is_right):
    angle = arm_front_angle_deg if is_front else -arm_rear_angle_deg - 180
    if not is_right:
        angle = -angle

    # Create the arm via loft
    base_rect = (
        cq.Workplane("XY")
        .rect(arm_cross_section_w, arm_cross_section_h)
    )
    tip_rect = (
        cq.Workplane("XY")
        .workplane(offset=arm_length)
        .rect(arm_cross_section_w * 0.8, arm_cross_section_h * 0.8)
    )
    arm_solid = cq.Workplane("XY").add(base_rect).add(tip_rect).loft(combine=True)
    
    # Hollow the arm
    inner_base_rect = (
        cq.Workplane("XY")
        .workplane(offset=arm_wall_thickness)
        .rect(arm_cross_section_w - 2*arm_wall_thickness, arm_cross_section_h - 2*arm_wall_thickness)
    )
    inner_tip_rect = (
        cq.Workplane("XY")
        .workplane(offset=arm_length - arm_wall_thickness)
        .rect((arm_cross_section_w - 2*arm_wall_thickness) * 0.8, (arm_cross_section_h - 2*arm_wall_thickness) * 0.8)
    )
    arm_cutout = cq.Workplane("XY").add(inner_base_rect).add(inner_tip_rect).loft(combine=True)
    arm = arm_solid.cut(arm_cutout)
    
    # Wire channel
    wire_channel = (
        cq.Workplane("YZ")
        .circle(arm_wire_channel_d / 2)
        .extrude(arm_length + 20)
    )
    arm = arm.cut(wire_channel)
    
    # Rotate arm into position
    arm = arm.rotate((0,0,0), (0,1,0), 90) # Orient along X axis
    arm = arm.rotate((0,0,0), (0,0,1), angle)
    
    # ESC inside arm
    esc_x_offset = esc_dist_from_body_center * math.cos(math.radians(angle))
    esc_y_offset = esc_dist_from_body_center * math.sin(math.radians(angle))
    esc = (
        cq.Workplane("XY")
        .workplane(offset=arm_pivot_z)
        .transformed(offset=(esc_x_offset, esc_y_offset, 0))
        .box(esc_l, esc_w, esc_h, centered=True)
    )
    
    # Prop Guard Boss
    boss_x = arm_length * math.cos(math.radians(angle))
    boss_y = arm_length * math.sin(math.radians(angle))
    boss_z = arm_pivot_z + motor_mount_h + 1
    
    prop_boss = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(boss_x, boss_y, 0))
        .circle(prop_guard_boss_od / 2)
        .extrude(prop_guard_boss_h)
    )
    prop_boss_hole = (
        cq.Workplane("XY")
        .workplane(offset=boss_z - 1)
        .transformed(offset=(boss_x, boss_y, 0))
        .circle(prop_guard_boss_id / 2)
        .extrude(prop_guard_boss_h + 2)
    )
    prop_boss = prop_boss.cut(prop_boss_hole)
    
    return arm, esc, prop_boss

# Arm pivot points
pivot_x = arm_pivot_to_body_center_x
pivot_y = arm_pivot_to_body_center_y

# Create and place arms, motors, props
motor_assembly = make_motor_assembly()
prop_cw = make_propeller(1)
prop_ccw = make_propeller(-1)

# Front Right (CW)
arm_fr, esc_fr, boss_fr = make_arm(is_front=True, is_right=True)
arm_fr = arm_fr.translate((pivot_x, pivot_y, arm_pivot_z))
motor_fr = motor_assembly.translate((pivot_x + arm_length * math.cos(math.radians(arm_front_angle_deg)),
                                     pivot_y + arm_length * math.sin(math.radians(arm_front_angle_deg)),
                                     arm_pivot_z))
prop_fr = prop_cw.translate((pivot_x + arm_length * math.cos(math.radians(arm_front_angle_deg)),
                             pivot_y + arm_length * math.sin(math.radians(arm_front_angle_deg)),
                             arm_pivot_z + motor_mount_h + motor_bell_h))

# Front Left (CCW)
arm_fl, esc_fl, boss_fl = make_arm(is_front=True, is_right=False)
arm_fl = arm_fl.translate((pivot_x, -pivot_y, arm_pivot_z))
motor_fl = motor_assembly.translate((pivot_x + arm_length * math.cos(math.radians(-arm_front_angle_deg)),
                                     -pivot_y + arm_length * math.sin(math.radians(-arm_front_angle_deg)),
                                     arm_pivot_z))
prop_fl = prop_ccw.translate((pivot_x + arm_length * math.cos(math.radians(-arm_front_angle_deg)),
                             -pivot_y + arm_length * math.sin(math.radians(-arm_front_angle_deg)),
                             arm_pivot_z + motor_mount_h + motor_bell_h))

# Rear Right (CCW)
arm_rr, esc_rr, boss_rr = make_arm(is_front=False, is_right=True)
arm_rr = arm_rr.translate((-pivot_x, pivot_y, arm_pivot_z))
motor_rr = motor_assembly.translate((-pivot_x + arm_length * math.cos(math.radians(-180-arm_rear_angle_deg)),
                                     pivot_y + arm_length * math.sin(math.radians(-180-arm_rear_angle_deg)),
                                     arm_pivot_z))
prop_rr = prop_ccw.translate((-pivot_x + arm_length * math.cos(math.radians(-180-arm_rear_angle_deg)),
                             pivot_y + arm_length * math.sin(math.radians(-180-arm_rear_angle_deg)),
                             arm_pivot_z + motor_mount_h + motor_bell_h))

# Rear Left (CW)
arm_rl, esc_rl, boss_rl = make_arm(is_front=False, is_right=False)
arm_rl = arm_rl.translate((-pivot_x, -pivot_y, arm_pivot_z))
motor_rl = motor_assembly.translate((-pivot_x + arm_length * math.cos(math.radians(180+arm_rear_angle_deg)),
                                     -pivot_y + arm_length * math.sin(math.radians(180+arm_rear_angle_deg)),
                                     arm_pivot_z))
prop_rl = prop_cw.translate((-pivot_x + arm_length * math.cos(math.radians(180+arm_rear_angle_deg)),
                             -pivot_y + arm_length * math.sin(math.radians(180+arm_rear_angle_deg)),
                             arm_pivot_z + motor_mount_h + motor_bell_h))

# Union all arm components
body_shell = (body_shell
              .union(arm_fr).union(esc_fr).union(motor_fr).union(prop_fr).union(boss_fr)
              .union(arm_fl).union(esc_fl).union(motor_fl).union(prop_fl).union(boss_fl)
              .union(arm_rr).union(esc_rr).union(motor_rr).union(prop_rr).union(boss_rr)
              .union(arm_rl).union(esc_rl).union(motor_rl).union(prop_rl).union(boss_rl))


# --- 8. Camera and Gimbal ---
gimbal_assembly = cq.Workplane("XY")
gimbal_x = body_length / 2 - 25

# Gimbal Plate
plate = (
    cq.Workplane("XY")
    .workplane(offset=gimbal_z_offset)
    .transformed(offset=(gimbal_x, 0, 0))
    .box(gimbal_plate_l, gimbal_plate_w, gimbal_plate_h, centered=True)
)
gimbal_assembly = gimbal_assembly.union(plate)

# Vibration Dampers
damper_x_spacing = gimbal_plate_l - 10
damper_y_spacing = gimbal_plate_w - 8
damper_positions = [
    (damper_x_spacing/2, damper_y_spacing/2), (damper_x_spacing/2, -damper_y_spacing/2),
    (-damper_x_spacing/2, damper_y_spacing/2), (-damper_x_spacing/2, -damper_y_spacing/2)
]
for dx, dy in damper_positions:
    damper = (
        cq.Workplane("XY")
        .workplane(offset=gimbal_z_offset + gimbal_plate_h/2 + gimbal_damper_h/2)
        .transformed(offset=(gimbal_x + dx, dy, 0))
        .circle(gimbal_damper_od / 2).extrude(gimbal_damper_h)
    )
    gimbal_assembly = gimbal_assembly.union(damper)

# Yaw Motor
yaw_motor = (
    cq.Workplane("XY")
    .workplane(offset=gimbal_z_offset - gimbal_plate_h/2 - gimbal_yaw_motor_h/2)
    .transformed(offset=(gimbal_x, 0, 0))
    .circle(gimbal_yaw_motor_od / 2).extrude(gimbal_yaw_motor_h)
)
gimbal_assembly = gimbal_assembly.union(yaw_motor)

# Pitch Arms
pitch_arm_y = gimbal_yaw_motor_od/2 + gimbal_pitch_arm_w/2
pitch_arm_z = gimbal_z_offset - gimbal_plate_h/2 - gimbal_yaw_motor_h
pitch_arm_right = (
    cq.Workplane("XY")
    .workplane(offset=pitch_arm_z)
    .transformed(offset=(gimbal_x, pitch_arm_y, 0))
    .box(gimbal_pitch_arm_l, gimbal_pitch_arm_w, gimbal_pitch_arm_h, centered=True)
)
pitch_arm_left = pitch_arm_right.mirror("XZ")
gimbal_assembly = gimbal_assembly.union(pitch_arm_right).union(pitch_arm_left)

# Camera Body
camera_z = pitch_arm_z
camera_body = (
    cq.Workplane("XY")
    .workplane(offset=camera_z)
    .transformed(offset=(gimbal_x + gimbal_pitch_arm_l/2 - camera_l/2, 0, 0))
    .box(camera_l, camera_w, camera_h, centered=True)
)
try:
    camera_body = camera_body.edges().fillet(2)
except Exception:
    pass
gimbal_assembly = gimbal_assembly.union(camera_body)

# Camera Lens
lens_barrel = (
    cq.Workplane("XY")
    .workplane(offset=camera_z)
    .transformed(offset=(gimbal_x + gimbal_pitch_arm_l/2, 0, 0))
    .circle(camera_lens_od / 2).extrude(camera_lens_depth)
)
lens_element = (
    cq.Workplane("XY")
    .workplane(offset=camera_z)
    .transformed(offset=(gimbal_x + gimbal_pitch_arm_l/2 + camera_lens_depth, 0, 0))
    .sphere(camera_lens_element_d / 2)
)
gimbal_assembly = gimbal_assembly.union(lens_barrel).union(lens_element)
body_shell = body_shell.union(gimbal_assembly)

# --- 9. Ports on Side ---
usb_cut = (
    cq.Workplane("XZ")
    .workplane(offset=port_y_pos)
    .transformed(offset=(20, port_z_pos, 0))
    .rect(port_usb_c_w, port_usb_c_h).extrude(5)
)
microsd_cut = (
    cq.Workplane("XZ")
    .workplane(offset=port_y_pos)
    .transformed(offset=(35, port_z_pos, 0))
    .rect(port_microsd_w, port_microsd_h).extrude(5)
)
body_shell = body_shell.cut(usb_cut).cut(microsd_cut)

# --- 10. Sensors ---
# Front sensors
sensor_front_y = 20
sensor_front_z = 25
sensor_front_cut = (
    cq.Workplane("YZ")
    .workplane(offset=body_length/2)
    .transformed(offset=(sensor_front_y, sensor_front_z, 0))
    .rect(sensor_front_w, sensor_front_h).extrude(5)
)
body_shell = body_shell.cut(sensor_front_cut).cut(sensor_front_cut.mirror("XZ"))

# Bottom sensors
sensor_bottom_z = 0
sensor_bottom1_cut = (
    cq.Workplane("XY")
    .workplane(offset=sensor_bottom_z)
    .transformed(offset=(-20, 0, 0))
    .circle(sensor_bottom_d1 / 2).extrude(-5)
)
sensor_bottom2_cut = (
    cq.Workplane("XY")
    .workplane(offset=sensor_bottom_z)
    .transformed(offset=(-40, 0, 0))
    .circle(sensor_bottom_d2 / 2).extrude(-5)
)
body_shell = body_shell.cut(sensor_bottom1_cut).cut(sensor_bottom2_cut)

# Rear sensor
sensor_rear_cut = (
    cq.Workplane("YZ")
    .workplane(offset=-body_length/2)
    .transformed(offset=(0, 20, 0))
    .circle(sensor_rear_d / 2).extrude(-5)
)
body_shell = body_shell.cut(sensor_rear_cut)

# --- 11. LEDs ---
led_front_z = 10
led_front = (
    cq.Workplane("YZ")
    .workplane(offset=body_length/2 - body_wall_thickness)
    .transformed(offset=(0, led_front_z, 0))
    .box(led_front_bar_w, led_front_bar_h, body_wall_thickness*2, centered=True)
)
body_shell = body_shell.union(led_front)

led_rear_y = 15
led_rear_z = 12
led_rear = (
    cq.Workplane("YZ")
    .workplane(offset=-body_length/2 + body_wall_thickness)
    .transformed(offset=(led_rear_y, led_rear_z, 0))
    .box(led_rear_w, led_rear_h, body_wall_thickness*2, centered=True)
)
body_shell = body_shell.union(led_rear).union(led_rear.mirror("XZ"))

# --- 12. GPS, Antenna, Vents ---
# GPS
gps_recess = (
    cq.Workplane("XY")
    .workplane(offset=body_height)
    .transformed(offset=(10, 0, 0))
    .circle(gps_recess_d / 2).extrude(gps_recess_depth)
)
gps_puck = (
    cq.Workplane("XY")
    .workplane(offset=body_height + gps_recess_depth - gps_puck_h)
    .transformed(offset=(10, 0, 0))
    .circle(gps_puck_d / 2).extrude(gps_puck_h)
)
body_shell = body_shell.cut(gps_recess).union(gps_puck)

# Antenna
antenna_z = body_height + antenna_h/2
antenna_x = -body_length/2 + 15
antenna_box = (
    cq.Workplane("XY")
    .workplane(offset=antenna_z)
    .transformed(offset=(antenna_x, 0, 0))
    .box(antenna_l, antenna_w, antenna_h, centered=True)
)
body_shell = body_shell.union(antenna_box)

# Vents
vent_z = body_height
vent_x_start = -20
for i in range(vent_slot_count):
    vent_x = vent_x_start + i * vent_slot_spacing
    vent_cut = (
        cq.Workplane("XY")
        .workplane(offset=vent_z)
        .transformed(offset=(vent_x, 0, 0))
        .box(vent_slot_w, vent_slot_l, 5, centered=True)
    )
    body_shell = body_shell.cut(vent_cut)

# --- Final Result ---
result = body_shell