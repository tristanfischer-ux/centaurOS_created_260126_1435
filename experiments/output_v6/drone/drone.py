import cadquery as cq
import math

# =============================================================================
# --- Dimensions ---
# All dimensions are in millimeters.
# =============================================================================

# --- Main Body ---
body_length = 180.0
body_width = 85.0
body_height = 48.0
body_wall_thickness = 2.0
body_corner_radius = 12.0
# The dome is created by applying larger fillets to the top edges
# These values are chosen to approximate a 15mm high elliptical dome skewed to the rear
dome_fillet_front = 40.0
dome_fillet_rear = 80.0
dome_fillet_sides = 60.0
body_bottom_fillet = 4.0

# --- Internal Ribs ---
rib_thickness = 1.5
rib_height = body_height - body_wall_thickness * 2

# --- Screw Bosses ---
boss_outer_dia = 6.0
boss_inner_dia = 2.5  # For M2.5 screw
boss_height = 10.0
boss_inset_x = 60.0
boss_inset_y = 30.0

# --- Arms ---
arm_major_length = 140.0 # From pivot to motor center
arm_width = 20.0
arm_height = 16.0
arm_wall_thickness = 2.0
arm_fillet = 4.0
arm_front_angle_deg = 32.0
arm_rear_angle_deg = 38.0
wire_channel_dia = 6.0
# Arm pivot points relative to body center
arm_pivot_inset_x = body_length / 2 - 25.0
arm_pivot_inset_y = body_width / 2 - 5.0 # Arms are close to the body edge

# --- ESC (Electronic Speed Controller) ---
esc_length = 30.0
esc_width = 15.0
esc_height = 5.0
esc_dist_from_center = 35.0

# --- Motors ---
motor_mount_dia = 28.0
motor_mount_height = 5.0
motor_bore_dia = 22.0
motor_screw_dia = 3.0 # M3
motor_bolt_circle_dia = 16.0
motor_bell_dia = 24.0
motor_bell_height = 12.0
motor_bell_wall = 2.0
magnet_ring_outer_dia = 22.0
magnet_ring_inner_dia = 18.0
magnet_ring_height = 8.0
motor_shaft_dia = 5.0
motor_shaft_height = 10.0

# --- Propellers ---
prop_dia = 183.0
prop_hub_dia = 12.0
prop_hub_height = 6.0
prop_blade_width = 15.0
prop_blade_thickness = 2.5

# --- Camera & Gimbal ---
gimbal_plate_pos_z = -body_height / 2 - 5.0
gimbal_plate_length = 40.0
gimbal_plate_width = 30.0
gimbal_plate_height = 3.0
damper_dia = 8.0
damper_height = 6.0
yaw_ring_dia = 20.0
yaw_ring_height = 6.0
pitch_arm_length = 15.0
pitch_arm_width = 6.0
pitch_arm_height = 4.0
camera_body_length = 28.0
camera_body_width = 22.0
camera_body_height = 26.0
camera_lens_dia = 16.0
camera_lens_length = 10.0

# --- Battery Bay ---
battery_bay_length = 110.0
battery_bay_width = 62.0
battery_bay_height = 30.0
battery_bay_offset_x = -25.0
battery_rail_width = 4.0
battery_rail_height = 28.0
contact_pin_dia = 2.0
contact_pin_height = 3.0
latch_length = 16.0
latch_width = 8.0
latch_height = 6.0

# --- Internal Components ---
pcb_length = 60.0
pcb_width = 40.0
pcb_thickness = 1.6
pcb_standoff_dia = 5.0
pcb_standoff_height = 6.0
pcb_standoff_hole_dia = 2.5
gps_puck_dia = 22.0
gps_puck_height = 5.0
gps_recess_depth = 2.0
antenna_length = 35.0
antenna_width = 16.0
antenna_height = 4.0

# --- Ports & Sensors ---
port_offset_z = -10.0
port_offset_y = -body_width / 2
usbc_width = 8.94
usbc_height = 3.26
microsd_width = 12.0
microsd_height = 1.5
sensor_front_length = 10.0
sensor_front_width = 8.0
sensor_front_inset = 5.0
sensor_bottom_dia1 = 12.0
sensor_bottom_dia2 = 6.0
sensor_rear_dia = 10.0

# --- LEDs, Vents, Landing Gear ---
led_front_bar_length = 30.0
led_front_bar_height = 3.0
led_rear_width = 8.0
led_rear_height = 3.0
vent_slot_length = 15.0
vent_slot_width = 2.0
vent_slot_count = 6
landing_strut_width = 8.0
landing_strut_height = 15.0
landing_foot_length = 25.0
landing_foot_width = 10.0
landing_foot_height = 4.0
prop_guard_boss_dia = 6.0
prop_guard_boss_height = 5.0
prop_guard_boss_hole_dia = 2.0

# =============================================================================
# --- Helper Functions for Creating Components ---
# =============================================================================

def create_main_body():
    """Creates the main hollow body of the drone with internal ribs."""
    # --- Outer Shell ---
    outer_shell = (
        cq.Workplane("XY")
        .box(body_length, body_width, body_height, centered=True)
    )
    # Fillet vertical edges first
    outer_shell = outer_shell.edges("|Z").fillet(body_corner_radius)
    # Fillet top edges to create the dome shape
    outer_shell = outer_shell.edges(">Z and >X").fillet(dome_fillet_front)
    outer_shell = outer_shell.edges(">Z and <X").fillet(dome_fillet_rear)
    outer_shell = outer_shell.edges(">Z and |Y").fillet(dome_fillet_sides)
    # Fillet bottom edges
    outer_shell = outer_shell.edges("<Z").fillet(body_bottom_fillet)

    # --- Inner Shell for Hollowing ---
    inner_shell_offset = body_wall_thickness
    inner_length = body_length - 2 * inner_shell_offset
    inner_width = body_width - 2 * inner_shell_offset
    inner_height = body_height - 2 * inner_shell_offset
    
    inner_shell = (
        cq.Workplane("XY")
        .box(inner_length, inner_width, inner_height, centered=True)
    )
    # Corresponding inner fillets
    inner_corner_radius = max(0.1, body_corner_radius - inner_shell_offset)
    inner_dome_fillet_front = max(0.1, dome_fillet_front - inner_shell_offset)
    inner_dome_fillet_rear = max(0.1, dome_fillet_rear - inner_shell_offset)
    inner_dome_fillet_sides = max(0.1, dome_fillet_sides - inner_shell_offset)
    inner_bottom_fillet = max(0.1, body_bottom_fillet - inner_shell_offset)

    inner_shell = inner_shell.edges("|Z").fillet(inner_corner_radius)
    inner_shell = inner_shell.edges(">Z and >X").fillet(inner_dome_fillet_front)
    inner_shell = inner_shell.edges(">Z and <X").fillet(inner_dome_fillet_rear)
    inner_shell = inner_shell.edges(">Z and |Y").fillet(inner_dome_fillet_sides)
    inner_shell = inner_shell.edges("<Z").fillet(inner_bottom_fillet)

    # --- Create Hollow Body ---
    hollow_body = outer_shell.cut(inner_shell)

    # --- Internal Ribs ---
    # Longitudinal rib
    long_rib = (
        cq.Workplane("XY")
        .workplane(offset=(-rib_height / 2) + body_wall_thickness)
        .box(body_length - 2 * body_wall_thickness, rib_thickness, rib_height, centered=True)
    )
    hollow_body = hollow_body.union(long_rib)

    # Cross ribs
    cross_rib_positions = [-50, 0, 40]
    for x_pos in cross_rib_positions:
        cross_rib = (
            cq.Workplane("XY")
            .workplane(offset=(-rib_height / 2) + body_wall_thickness)
            .transformed(offset=(x_pos, 0, 0))
            .box(rib_thickness, body_width - 2 * body_wall_thickness, rib_height, centered=True)
        )
        hollow_body = hollow_body.union(cross_rib)

    return hollow_body

def create_arm(is_front, is_right):
    """Creates a single hollow arm with a wire channel."""
    angle = arm_front_angle_deg if is_front else -arm_rear_angle_deg
    # Mirror angle for left side
    if not is_right:
        angle = 180 - angle

    # Position of the arm pivot
    cx = arm_pivot_inset_x if is_front else -arm_pivot_inset_x
    cy = arm_pivot_inset_y if is_right else -arm_pivot_inset_y
    
    # Arm is modeled along X-axis then transformed
    # --- Outer Arm ---
    outer_arm = (
        cq.Workplane("XY")
        .box(arm_major_length, arm_width, arm_height, centered=True)
    )
    outer_arm = outer_arm.edges("|Z").fillet(arm_fillet)
    outer_arm = outer_arm.edges("<Y or >Y").fillet(arm_fillet / 2)

    # --- Inner Arm ---
    inner_arm = (
        cq.Workplane("XY")
        .workplane(offset=body_wall_thickness)
        .box(
            arm_major_length,
            arm_width - 2 * arm_wall_thickness,
            arm_height - 2 * arm_wall_thickness,
            centered=True
        )
    )
    inner_arm_fillet = max(0.1, arm_fillet - arm_wall_thickness)
    inner_arm = inner_arm.edges("|Z").fillet(inner_arm_fillet)
    
    hollow_arm = outer_arm.cut(inner_arm)
    
    # --- Wire Channel ---
    wire_channel_cutter = (
        cq.Workplane("XY")
        .circle(wire_channel_dia / 2)
        .extrude(arm_major_length)
        .rotate((0, 0, 0), (0, 1, 0), 90)
    )
    hollow_arm = hollow_arm.cut(wire_channel_cutter)
    
    # --- Prop Guard Boss ---
    boss_z = arm_height / 2
    boss_x = arm_major_length / 2 - 10
    prop_boss = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(boss_x, 0, 0))
        .circle(prop_guard_boss_dia / 2)
        .extrude(prop_guard_boss_height)
    )
    prop_boss_hole = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(boss_x, 0, 0))
        .circle(prop_guard_boss_hole_dia / 2)
        .extrude(prop_guard_boss_height)
    )
    prop_boss = prop_boss.cut(prop_boss_hole)
    hollow_arm = hollow_arm.union(prop_boss)

    # --- Final Transformation ---
    # The arm is created centered at origin, needs to be moved out
    arm_center_offset = arm_major_length / 2
    rad_angle = math.radians(angle)
    tx = cx + arm_center_offset * math.cos(rad_angle)
    ty = cy + arm_center_offset * math.sin(rad_angle)
    
    final_arm = hollow_arm.transformed(offset=(tx, ty, 0), rotate=(0, 0, angle))
    
    return final_arm

def create_motor_assembly():
    """Creates a single motor with mount, bell, and shaft."""
    # --- Motor Mount ---
    mount = (
        cq.Workplane("XY")
        .circle(motor_mount_dia / 2)
        .extrude(motor_mount_height)
    )
    # Bore
    bore_cutter = (
        cq.Workplane("XY")
        .workplane(offset=-1) # Ensure cut goes through
        .circle(motor_bore_dia / 2)
        .extrude(motor_mount_height + 2)
    )
    mount = mount.cut(bore_cutter)
    # Screw holes
    screw_holes = (
        cq.Workplane("XY")
        .workplane(offset=motor_mount_height / 2)
        .polarArray(
            radius=motor_bolt_circle_dia / 2,
            startAngle=0,
            angle=360,
            count=3
        )
        .circle(motor_screw_dia / 2)
        .extrude(motor_mount_height)
    )
    mount = mount.cut(screw_holes)
    mount = mount.edges("<Z").fillet(0.5)

    # --- Motor Bell ---
    bell_z = motor_mount_height
    outer_bell = (
        cq.Workplane("XY")
        .workplane(offset=bell_z)
        .circle(motor_bell_dia / 2)
        .extrude(motor_bell_height)
    )
    inner_bell_dia = motor_bell_dia - 2 * motor_bell_wall
    inner_bell_cutter = (
        cq.Workplane("XY")
        .workplane(offset=bell_z)
        .circle(inner_bell_dia / 2)
        .extrude(motor_bell_height - motor_bell_wall)
    )
    bell = outer_bell.cut(inner_bell_cutter)
    bell = bell.edges(">Z").fillet(1.0)
    
    # --- Magnet Ring (inside bell) ---
    magnet_ring_z = bell_z + motor_bell_wall
    magnet_ring = (
        cq.Workplane("XY")
        .workplane(offset=magnet_ring_z)
        .circle(magnet_ring_outer_dia / 2)
        .circle(magnet_ring_inner_dia / 2)
        .extrude(magnet_ring_height)
    )
    
    # --- Motor Shaft ---
    shaft_z = motor_mount_height
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=shaft_z)
        .circle(motor_shaft_dia / 2)
        .extrude(motor_shaft_height)
    )
    
    # --- Combine Motor Parts ---
    motor = mount.union(bell).union(magnet_ring).union(shaft)
    return motor

def create_propeller(is_cw):
    """Creates a two-bladed propeller."""
    # --- Hub ---
    hub = (
        cq.Workplane("XY")
        .circle(prop_hub_dia / 2)
        .extrude(prop_hub_height)
    )
    hub = hub.edges(">Z").fillet(1.0)
    
    # --- Blade ---
    # A blade is created by lofting through several cross-sections
    num_sections = 5
    blade_len = prop_dia / 2 - prop_hub_dia / 2
    
    sections = []
    for i in range(num_sections + 1):
        p = i / num_sections  # Progress along blade (0 to 1)
        
        # Position of the section
        radius = prop_hub_dia / 2 + p * blade_len
        
        # Blade shape parameters (taper and twist)
        chord = prop_blade_width * (1 - 0.5 * p)
        thickness = prop_blade_thickness * (1 - 0.7 * p**2)
        twist_angle = 25 * (1 - p) # Degrees
        
        # Create airfoil-like shape
        section_wire = (
            cq.Workplane("XY")
            .transformed(offset=(radius, 0, 0))
            .ellipse(thickness / 2, chord / 2)
            .rotate((radius, 0, 0), (radius+1, 0, 0), twist_angle)
        ).wires().val()
        sections.append(section_wire)

    blade = cq.Solid.makeLoft(sections)
    
    # --- Assemble Propeller ---
    # Create two blades
    blade2 = blade.rotate((0, 0, 0), (0, 0, 1), 180)
    prop = hub.union(blade).union(blade2)
    
    # Flip one prop for counter-rotation
    if not is_cw:
        prop = prop.mirror(mirrorPlane="XY")
        
    return prop

def create_gimbal_camera_assembly():
    """Creates the camera and gimbal system."""
    gimbal_pos_x = body_length / 2 - 15
    
    # --- Gimbal Plate ---
    plate = (
        cq.Workplane("XY")
        .workplane(offset=gimbal_plate_pos_z)
        .box(gimbal_plate_length, gimbal_plate_width, gimbal_plate_height, centered=True)
    )
    plate = plate.edges().fillet(1.0)
    
    # --- Dampers ---
    damper_pos = [
        (gimbal_plate_length/2 - 5, gimbal_plate_width/2 - 5),
        (gimbal_plate_length/2 - 5, -gimbal_plate_width/2 + 5),
        (-gimbal_plate_length/2 + 5, gimbal_plate_width/2 - 5),
        (-gimbal_plate_length/2 + 5, -gimbal_plate_width/2 + 5),
    ]
    all_dampers = cq.Workplane("XY")
    for x, y in damper_pos:
        damper = (
            cq.Workplane("XY")
            .workplane(offset=gimbal_plate_pos_z + gimbal_plate_height/2)
            .transformed(offset=(x, y, 0))
            .circle(damper_dia / 2)
            .extrude(damper_height)
        )
        all_dampers = all_dampers.union(damper)
        
    # --- Yaw Ring ---
    yaw_z = gimbal_plate_pos_z - yaw_ring_height / 2
    yaw_ring = (
        cq.Workplane("XY")
        .workplane(offset=yaw_z)
        .circle(yaw_ring_dia / 2)
        .circle(yaw_ring_dia / 2 - 2) # 2mm wall
        .extrude(yaw_ring_height)
    )
    
    # --- Pitch Arms ---
    pitch_arm_z = yaw_z
    pitch_arm_y_offset = yaw_ring_dia / 2 - pitch_arm_width / 2
    
    left_arm = (
        cq.Workplane("XY")
        .workplane(offset=pitch_arm_z)
        .transformed(offset=(0, -pitch_arm_y_offset, 0))
        .box(pitch_arm_length, pitch_arm_width, pitch_arm_height, centered=True)
        .translate((pitch_arm_length/2, 0, 0))
    )
    left_arm = left_arm.edges().fillet(1.0)
    
    right_arm = (
        cq.Workplane("XY")
        .workplane(offset=pitch_arm_z)
        .transformed(offset=(0, pitch_arm_y_offset, 0))
        .box(pitch_arm_length, pitch_arm_width, pitch_arm_height, centered=True)
        .translate((pitch_arm_length/2, 0, 0))
    )
    right_arm = right_arm.edges().fillet(1.0)
    
    # --- Camera Body ---
    cam_x = pitch_arm_length + camera_body_length / 2
    cam_z = pitch_arm_z
    camera = (
        cq.Workplane("XY")
        .workplane(offset=cam_z)
        .transformed(offset=(cam_x, 0, 0))
        .box(camera_body_length, camera_body_width, camera_body_height, centered=True)
    )
    camera = camera.edges().fillet(3.0)
    
    # --- Camera Lens ---
    lens_x = cam_x + camera_body_length / 2
    lens = (
        cq.Workplane("XY")
        .workplane(offset=cam_z)
        .transformed(offset=(lens_x, 0, 0))
        .circle(camera_lens_dia / 2)
        .extrude(camera_lens_length)
        .rotate((lens_x, 0, cam_z), (lens_x, 1, cam_z), 90)
    )
    lens = lens.edges(">X").fillet(1.0)
    
    # --- Assemble and Position ---
    assembly = (
        plate
        .union(all_dampers)
        .union(yaw_ring)
        .union(left_arm)
        .union(right_arm)
        .union(camera)
        .union(lens)
    )
    assembly = assembly.translate((gimbal_pos_x, 0, 0))
    
    return assembly

# =============================================================================
# --- Model Assembly ---
# =============================================================================

# 1. Start with the main body
body_shell = create_main_body()

# 2. Create and add arms
arm_configs = [
    {'is_front': True, 'is_right': True},   # Front-Right
    {'is_front': True, 'is_right': False},  # Front-Left
    {'is_front': False, 'is_right': True},  # Rear-Right
    {'is_front': False, 'is_right': False}  # Rear-Left
]
for config in arm_configs:
    arm = create_arm(config['is_front'], config['is_right'])
    body_shell = body_shell.union(arm)

# 3. Create and add motors and propellers
motor_z_offset = arm_height / 2
prop_z_offset = motor_z_offset + motor_mount_height + motor_shaft_height + prop_hub_height / 2

for config in arm_configs:
    angle = arm_front_angle_deg if config['is_front'] else -arm_rear_angle_deg
    if not config['is_right']:
        angle = 180 - angle
    
    cx = arm_pivot_inset_x if config['is_front'] else -arm_pivot_inset_x
    cy = arm_pivot_inset_y if config['is_right'] else -arm_pivot_inset_y
    
    rad_angle = math.radians(angle)
    motor_x = cx + arm_major_length * math.cos(rad_angle)
    motor_y = cy + arm_major_length * math.sin(rad_angle)
    
    motor = create_motor_assembly().translate((motor_x, motor_y, motor_z_offset))
    body_shell = body_shell.union(motor)
    
    # CW props on FR, RL. CCW on FL, RR
    is_cw = (config['is_front'] and config['is_right']) or \
            (not config['is_front'] and not config['is_right'])
    prop = create_propeller(is_cw).translate((motor_x, motor_y, prop_z_offset))
    body_shell = body_shell.union(prop)

# 4. Add Camera and Gimbal assembly
gimbal_assembly = create_gimbal_camera_assembly()
body_shell = body_shell.union(gimbal_assembly)

# 5. Create cutouts and features on the main body
# --- Battery Bay Cutout ---
battery_cutter = (
    cq.Workplane("XY")
    .transformed(offset=(battery_bay_offset_x, 0, 0))
    .box(battery_bay_length, battery_bay_width, battery_bay_height, centered=True)
)
body_shell = body_shell.cut(battery_cutter)

# --- Battery Rails and Details ---
rail_y = battery_bay_width/2 - battery_rail_width/2
rail_z = -battery_bay_height/2 + battery_rail_height/2
left_rail = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(battery_bay_offset_x, -rail_y, 0))
    .box(battery_bay_length, battery_rail_width, battery_rail_height, centered=True)
)
right_rail = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(battery_bay_offset_x, rail_y, 0))
    .box(battery_bay_length, battery_rail_width, battery_rail_height, centered=True)
)
body_shell = body_shell.union(left_rail).union(right_rail)

# Battery Latch
latch_x = battery_bay_offset_x + battery_bay_length/2 + latch_length/2
latch = (
    cq.Workplane("XY")
    .transformed(offset=(latch_x, 0, 0))
    .box(latch_length, latch_width, latch_height, centered=True)
)
latch = latch.edges(">X").fillet(2.0)
body_shell = body_shell.union(latch)

# Battery Contacts
contact_x = battery_bay_offset_x - battery_bay_length/2 + 2
contact_z = -battery_bay_height/2 + contact_pin_height/2
for i in range(6):
    contact_y = -12.5 + i * 5.0
    contact_pin = (
        cq.Workplane("XY")
        .workplane(offset=contact_z)
        .transformed(offset=(contact_x, contact_y, 0))
        .circle(contact_pin_dia/2)
        .extrude(contact_pin_height)
    )
    body_shell = body_shell.union(contact_pin)

# --- Ports ---
port_cutters = cq.Workplane("XY")
usbc_cutter = (
    cq.Workplane("XY")
    .workplane(offset=port_offset_z)
    .transformed(offset=(-20, port_offset_y - 5, 0))
    .rect(usbc_height, usbc_width) # Rotated
    .extrude(10)
)
microsd_cutter = (
    cq.Workplane("XY")
    .workplane(offset=port_offset_z)
    .transformed(offset=(0, port_offset_y - 5, 0))
    .rect(microsd_height, microsd_width) # Rotated
    .extrude(10)
)
port_cutters = port_cutters.union(usbc_cutter).union(microsd_cutter)
body_shell = body_shell.cut(port_cutters)

# --- Sensors ---
sensor_cutters = cq.Workplane("XY")
# Front sensors
front_sensor_z = 10
front_sensor_x = body_length/2 + 1
sensor_front_left = (
    cq.Workplane("XY")
    .workplane(offset=front_sensor_z)
    .transformed(offset=(front_sensor_x, -body_width/4, 0))
    .box(sensor_front_inset, sensor_front_width, sensor_front_length, centered=True)
)
sensor_front_right = sensor_front_left.mirror("XZ")
# Bottom sensors
bottom_sensor_z = -body_height/2 - 1
sensor_bottom1 = (
    cq.Workplane("XY")
    .workplane(offset=bottom_sensor_z)
    .transformed(offset=(10, 0, 0))
    .circle(sensor_bottom_dia1/2)
    .extrude(5)
)
sensor_bottom2 = (
    cq.Workplane("XY")
    .workplane(offset=bottom_sensor_z)
    .transformed(offset=(-10, 0, 0))
    .circle(sensor_bottom_dia2/2)
    .extrude(5)
)
# Rear sensor
rear_sensor_z = 0
rear_sensor_x = -body_length/2 - 1
sensor_rear = (
    cq.Workplane("XY")
    .workplane(offset=rear_sensor_z)
    .transformed(offset=(rear_sensor_x, 0, 0))
    .circle(sensor_rear_dia/2)
    .extrude(5)
)
sensor_cutters = sensor_cutters.union(sensor_front_left).union(sensor_front_right)
sensor_cutters = sensor_cutters.union(sensor_bottom1).union(sensor_bottom2).union(sensor_rear)
body_shell = body_shell.cut(sensor_cutters)

# --- LEDs ---
led_features = cq.Workplane("XY")
# Front LED Bar
front_led_x = body_length/2 - 5
front_led_z = -body_height/2 + 5
front_led = (
    cq.Workplane("XY")
    .workplane(offset=front_led_z)
    .transformed(offset=(front_led_x, 0, 0))
    .box(10, led_front_bar_length, led_front_bar_height, centered=True)
)
led_features = led_features.union(front_led)
# Rear LEDs
rear_led_x = -body_length/2 + 5
rear_led_z = 5
rear_led_left = (
    cq.Workplane("XY")
    .workplane(offset=rear_led_z)
    .transformed(offset=(rear_led_x, -body_width/4, 0))
    .box(10, led_rear_width, led_rear_height, centered=True)
)
rear_led_right = rear_led_left.mirror("XZ")
led_features = led_features.union(rear_led_left).union(rear_led_right)
# Cut a recess for the LEDs
body_shell = body_shell.cut(led_features)

# --- Vents ---
vent_z = -body_height/2 + 5
vent_cutter = (
    cq.Workplane("XY")
    .workplane(offset=vent_z)
    .transformed(offset=(body_length/2 - 20, 0, 0))
    .rarray(dx=1, dy=4, xCount=1, yCount=vent_slot_count, center=True)
    .rect(vent_slot_length, vent_slot_width)
    .extrude(-10) # Cut into the body
)
body_shell = body_shell.cut(vent_cutter)

# --- Landing Gear ---
landing_gear = cq.Workplane("XY")
strut_z = -body_height/2 - landing_strut_height/2
strut_x = body_length/2 - 30
strut_y = body_width/2 - landing_strut_width/2
foot_z = strut_z - landing_strut_height/2 - landing_foot_height/2

# Front struts and feet
front_strut_left = (
    cq.Workplane("XY")
    .workplane(offset=strut_z)
    .transformed(offset=(strut_x, -strut_y, 0))
    .box(landing_strut_width, landing_strut_width, landing_strut_height, centered=True)
)
front_foot_left = (
    cq.Workplane("XY")
    .workplane(offset=foot_z)
    .transformed(offset=(strut_x, -strut_y, 0))
    .box(landing_foot_length, landing_foot_width, landing_foot_height, centered=True)
)
front_foot_left = front_foot_left.edges().fillet(1.5)
landing_gear = landing_gear.union(front_strut_left).union(front_foot_left)

# Mirror for the right side
front_right_gear = front_strut_left.union(front_foot_left).mirror("XZ")
landing_gear = landing_gear.union(front_right_gear)
body_shell = body_shell.union(landing_gear)

# --- GPS Puck Recess ---
gps_z = body_height/2 + 10 # Estimate Z position on dome
gps_cutter = (
    cq.Workplane("XY")
    .workplane(offset=gps_z)
    .transformed(offset=(-body_length/4, 0, 0))
    .circle(gps_puck_dia/2)
    .extrude(-gps_recess_depth)
)
gps_puck = (
    cq.Workplane("XY")
    .workplane(offset=gps_z - gps_recess_depth)
    .transformed(offset=(-body_length/4, 0, 0))
    .circle(gps_puck_dia/2)
    .extrude(-gps_puck_height)
)
body_shell = body_shell.cut(gps_cutter).union(gps_puck)

# --- Screw Bosses (Internal) ---
boss_z = -body_height/2 + body_wall_thickness + boss_height/2
boss_positions = [
    (boss_inset_x, boss_inset_y), (boss_inset_x, -boss_inset_y),
    (-boss_inset_x, boss_inset_y), (-boss_inset_x, -boss_inset_y),
    (0, boss_inset_y), (0, -boss_inset_y),
    (boss_inset_x/2, 0), (-boss_inset_x/2, 0)
]
for x, y in boss_positions:
    boss = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(x, y, 0))
        .circle(boss_outer_dia/2)
        .extrude(boss_height)
    )
    boss_hole = (
        cq.Workplane("XY")
        .workplane(offset=boss_z)
        .transformed(offset=(x, y, 0))
        .circle(boss_inner_dia/2)
        .extrude(boss_height)
    )
    final_boss = boss.cut(boss_hole)
    body_shell = body_shell.union(final_boss)

# --- Internal Electronics (PCB, Antenna) ---
# These are placed inside the body for detail
pcb_z = -body_height/2 + body_wall_thickness + pcb_standoff_height + pcb_thickness/2
pcb = (
    cq.Workplane("XY")
    .workplane(offset=pcb_z)
    .box(pcb_length, pcb_width, pcb_thickness, centered=True)
)
body_shell = body_shell.union(pcb)

standoff_x = pcb_length/2 - 5
standoff_y = pcb_width/2 - 5
standoff_positions = [
    (standoff_x, standoff_y), (standoff_x, -standoff_y),
    (-standoff_x, standoff_y), (-standoff_x, -standoff_y)
]
standoff_z = -body_height/2 + body_wall_thickness + pcb_standoff_height/2
for x, y in standoff_positions:
    standoff = (
        cq.Workplane("XY")
        .workplane(offset=standoff_z)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_dia/2)
        .extrude(pcb_standoff_height)
    )
    standoff_hole = (
        cq.Workplane("XY")
        .workplane(offset=standoff_z)
        .transformed(offset=(x, y, 0))
        .circle(pcb_standoff_hole_dia/2)
        .extrude(pcb_standoff_height)
    )
    body_shell = body_shell.union(standoff.cut(standoff_hole))

# Antenna
antenna = (
    cq.Workplane("XY")
    .workplane(offset=10)
    .transformed(offset=(40, 0, 0))
    .box(antenna_length, antenna_width, antenna_height, centered=True)
)
body_shell = body_shell.union(antenna)


# =============================================================================
# --- Final Result ---
# =============================================================================
result = body_shell