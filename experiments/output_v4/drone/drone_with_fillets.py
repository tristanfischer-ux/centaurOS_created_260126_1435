import cadquery as cq
import math

# --- Dimensions ---

# Body
body_length = 180
body_width = 85
body_height = 48
body_wall_thickness = 2

# Arms
arm_length_to_motor = 140
arm_width = 20
arm_height = 16
arm_wall_thickness = 2
front_arm_angle_deg = 32
rear_arm_angle_deg = 38

# Motors
motor_mount_plate_od = 28
motor_mount_plate_height = 5
motor_center_bore_od = 22
motor_bolt_circle_dia = 16
motor_bolt_hole_dia = 3
motor_bell_od = 24
motor_bell_height = 12
motor_magnet_ring_od = 22
motor_magnet_ring_id = 18
motor_magnet_ring_height = 8
motor_shaft_od = 5
motor_shaft_height = 10

# Propellers
prop_diameter = 183
prop_hub_od = 12
prop_hub_height = 8
prop_blade_length = (prop_diameter - prop_hub_od) / 2
prop_blade_width = 18
prop_blade_thickness = 2

# Battery Bay
battery_bay_length = 110
battery_bay_width = 62
battery_bay_height = 30
battery_rail_width = 4
battery_contact_size = 4

# PCB
pcb_length = 60
pcb_width = 40
pcb_thickness = 1.5
pcb_standoff_od = 5
pcb_standoff_height = 6

# Camera/Gimbal
gimbal_plate_width = 40
gimbal_plate_depth = 30
gimbal_plate_height = 2
camera_body_width = 28
camera_body_depth = 22
camera_body_height = 26
camera_lens_od = 16
camera_lens_length = 12

# Ports
usb_c_width = 8.94
usb_c_height = 3.26
microsd_width = 12
microsd_height = 1.5

# Sensors
front_sensor_width = 10
front_sensor_height = 8
bottom_sensor_1_dia = 12
bottom_sensor_2_dia = 6
rear_sensor_dia = 10

# GPS
gps_puck_dia = 22
gps_puck_height = 6

# Landing Gear
lg_strut_length = 50
lg_strut_width = 10
lg_strut_height = 18
lg_foot_length = 54
lg_foot_width = 12
lg_foot_height = 4

# Ventilation
vent_slot_width = 2
vent_slot_length = 15
vent_slot_spacing = 8

# Antenna
antenna_length = 35
antenna_width = 16
antenna_height = 4

# --- Main Body Shell ---
outer_body = cq.Workplane("XY").box(body_length, body_width, body_height, centered=True)
outer_body = outer_body.edges("|Z").fillet(10)
outer_body = outer_body.edges(">Z").fillet(6)
outer_body = outer_body.edges("<Z").fillet(3)

# Top dome for aerodynamics
body_dome = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 - 4)
    .ellipse(body_length / 2 - 5, body_width / 2 - 5)
    .extrude(15)
)
body_dome = body_dome.edges(">Z").fillet(8)
outer_body = outer_body.union(body_dome)

inner_body = (
    cq.Workplane("XY")
    .workplane(offset=-1)
    .box(
        body_length - 2 * body_wall_thickness,
        body_width - 2 * body_wall_thickness,
        body_height - body_wall_thickness,
        centered=True
    )
)
inner_body = inner_body.edges("|Z").fillet(8)
inner_body = inner_body.edges(">Z").fillet(4)

body_shell = outer_body.cut(inner_body)

# --- Battery Bay Cutout ---
bay_cutout_y = -body_length / 2 + battery_bay_length / 2
bay_cutout_z = -body_height / 2 + battery_bay_height / 2
battery_bay_cutout = (
    cq.Workplane("XY")
    .workplane(offset=bay_cutout_z)
    .transformed(offset=(0, bay_cutout_y, 0))
    .box(battery_bay_width, battery_bay_length, battery_bay_height, centered=True)
)
body_shell = body_shell.cut(battery_bay_cutout)

# Battery Rails
rail_z = -body_height / 2 + body_wall_thickness + battery_rail_width / 2
rail_x_offset = battery_bay_width / 2 - battery_rail_width / 2
rail_y = -body_length / 2 + battery_bay_length / 2
left_rail = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(-rail_x_offset, rail_y, 0))
    .box(battery_rail_width, battery_bay_length, battery_rail_width, centered=True)
)
right_rail = (
    cq.Workplane("XY")
    .workplane(offset=rail_z)
    .transformed(offset=(rail_x_offset, rail_y, 0))
    .box(battery_rail_width, battery_bay_length, battery_rail_width, centered=True)
)
body_shell = body_shell.union(left_rail).union(right_rail)

# Battery Contacts
contact_y = -body_length / 2 + body_wall_thickness + 1
contact_z_start = -body_height / 2 + body_wall_thickness + 5
contact_x_spacing = 6
for i in range(6):
    contact_x = - (2.5 * contact_x_spacing) + i * contact_x_spacing
    contact = (
        cq.Workplane("XY")
        .workplane(offset=contact_z_start)
        .transformed(offset=(contact_x, contact_y, 0))
        .box(battery_contact_size, 2, battery_contact_size, centered=True)
    )
    body_shell = body_shell.union(contact)

# --- Internal Components ---
# PCB Standoffs
standoff_z = -body_height / 2 + body_wall_thickness + pcb_standoff_height / 2
standoff_x_dist = pcb_length / 2 - pcb_standoff_od
standoff_y_dist = pcb_width / 2 - pcb_standoff_od
standoff_positions = [
    (standoff_x_dist, standoff_y_dist),
    (-standoff_x_dist, standoff_y_dist),
    (standoff_x_dist, -standoff_y_dist),
    (-standoff_x_dist, -standoff_y_dist)
]
for x, y in standoff_positions:
    standoff = (
        cq.Workplane("XY")
        .workplane(offset=standoff_z)
        .transformed(offset=(y, x, 0)) # Swapped to match body orientation
        .circle(pcb_standoff_od / 2)
        .extrude(pcb_standoff_height)
    )
    body_shell = body_shell.union(standoff)

# PCB
pcb_z = -body_height / 2 + body_wall_thickness + pcb_standoff_height + pcb_thickness / 2
pcb = (
    cq.Workplane("XY")
    .workplane(offset=pcb_z)
    .box(pcb_width, pcb_length, pcb_thickness, centered=True)
)
body_shell = body_shell.union(pcb)

# --- Arms, Motors, and Props ---
arm_pivot_y = body_length / 2 - 45
arm_pivot_x = body_width / 2 - 10
arm_z = body_height / 2 - arm_height / 2

arm_definitions = [
    # pivot_x, pivot_y, angle
    (arm_pivot_x, arm_pivot_y, front_arm_angle_deg),          # Front Right
    (-arm_pivot_x, arm_pivot_y, 180 - front_arm_angle_deg),   # Front Left
    (arm_pivot_x, -arm_pivot_y, -rear_arm_angle_deg),         # Rear Right
    (-arm_pivot_x, -arm_pivot_y, -180 + rear_arm_angle_deg),  # Rear Left
]

for pivot_x, pivot_y, angle_deg in arm_definitions:
    angle_rad = math.radians(angle_deg)
    
    # Arm
    arm_center_x = pivot_x + (arm_length_to_motor / 2) * math.cos(angle_rad)
    arm_center_y = pivot_y + (arm_length_to_motor / 2) * math.sin(angle_rad)
    
    outer_arm = (
        cq.Workplane("XY")
        .workplane(offset=arm_z)
        .transformed(offset=(arm_center_x, arm_center_y, 0), rotate=(0, 0, angle_deg))
        .box(arm_length_to_motor, arm_width, arm_height, centered=True)
    )
    outer_arm = outer_arm.edges("|Z").fillet(4)
    outer_arm = outer_arm.edges("#Z").fillet(2)
    inner_arm = (
        cq.Workplane("XY")
        .workplane(offset=arm_z)
        .transformed(offset=(arm_center_x, arm_center_y, 0), rotate=(0, 0, angle_deg))
        .box(
            arm_length_to_motor - 10,
            arm_width - 2 * arm_wall_thickness,
            arm_height - 2 * arm_wall_thickness,
            centered=True
        )
    )
    inner_arm = inner_arm.edges("|Z").fillet(3)
    arm_shell = outer_arm.cut(inner_arm)
    body_shell = body_shell.union(arm_shell)
    
    # Motor Position
    motor_x = pivot_x + arm_length_to_motor * math.cos(angle_rad)
    motor_y = pivot_y + arm_length_to_motor * math.sin(angle_rad)
    motor_base_z = arm_z + arm_height / 2
    
    # Motor Mount Plate
    mount_plate = (
        cq.Workplane("XY")
        .workplane(offset=motor_base_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_mount_plate_od / 2)
        .extrude(motor_mount_plate_height)
    )
    center_bore = (
        cq.Workplane("XY")
        .workplane(offset=motor_base_z - 1)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_center_bore_od / 2)
        .extrude(motor_mount_plate_height + 2)
    )
    mount_plate = mount_plate.edges(">Z").fillet(1.5)
    mount_plate = mount_plate.edges("<Z").fillet(1)
    motor_assembly = mount_plate.cut(center_bore)
    
    # Motor Mount Holes
    for i in range(3):
        hole_angle_rad = math.radians(i * 120)
        hole_x = motor_x + (motor_bolt_circle_dia / 2) * math.cos(hole_angle_rad)
        hole_y = motor_y + (motor_bolt_circle_dia / 2) * math.sin(hole_angle_rad)
        hole = (
            cq.Workplane("XY")
            .workplane(offset=motor_base_z - 1)
            .transformed(offset=(hole_x, hole_y, 0))
            .circle(motor_bolt_hole_dia / 2)
            .extrude(motor_mount_plate_height + 2)
        )
        motor_assembly = motor_assembly.cut(hole)
        
    # Motor Bell
    motor_bell_z = motor_base_z + motor_mount_plate_height
    bell = (
        cq.Workplane("XY")
        .workplane(offset=motor_bell_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_bell_od / 2)
        .extrude(motor_bell_height)
    )
    bell = bell.edges(">Z").fillet(3)
    motor_assembly = motor_assembly.union(bell)
    
    # Magnet Ring
    magnet_ring_z = motor_bell_z + (motor_bell_height - motor_magnet_ring_height) / 2
    outer_ring = (
        cq.Workplane("XY")
        .workplane(offset=magnet_ring_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_magnet_ring_od / 2)
        .extrude(motor_magnet_ring_height)
    )
    inner_ring = (
        cq.Workplane("XY")
        .workplane(offset=magnet_ring_z - 1)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_magnet_ring_id / 2)
        .extrude(motor_magnet_ring_height + 2)
    )
    motor_assembly = motor_assembly.union(outer_ring.cut(inner_ring))
    
    # Motor Shaft
    shaft_z = motor_bell_z + motor_bell_height
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=shaft_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(motor_shaft_od / 2)
        .extrude(motor_shaft_height)
    )
    motor_assembly = motor_assembly.union(shaft)
    
    body_shell = body_shell.union(motor_assembly)
    
    # Propeller
    prop_z = shaft_z + motor_shaft_height
    prop_hub = (
        cq.Workplane("XY")
        .workplane(offset=prop_z)
        .transformed(offset=(motor_x, motor_y, 0))
        .circle(prop_hub_od / 2)
        .extrude(prop_hub_height)
    )
    
    blade1_center_x = motor_x + (prop_blade_length / 2 + prop_hub_od / 2) * math.cos(angle_rad)
    blade1_center_y = motor_y + (prop_blade_length / 2 + prop_hub_od / 2) * math.sin(angle_rad)
    blade1 = (
        cq.Workplane("XY")
        .workplane(offset=prop_z + prop_hub_height / 2)
        .transformed(offset=(blade1_center_x, blade1_center_y, 0), rotate=(0, 0, angle_deg))
        .box(prop_blade_length, prop_blade_width, prop_blade_thickness, centered=True)
    )
    
    blade2_center_x = motor_x - (prop_blade_length / 2 + prop_hub_od / 2) * math.cos(angle_rad)
    blade2_center_y = motor_y - (prop_blade_length / 2 + prop_hub_od / 2) * math.sin(angle_rad)
    blade2 = (
        cq.Workplane("XY")
        .workplane(offset=prop_z + prop_hub_height / 2)
        .transformed(offset=(blade2_center_x, blade2_center_y, 0), rotate=(0, 0, angle_deg))
        .box(prop_blade_length, prop_blade_width, prop_blade_thickness, centered=True)
    )
    
    propeller = prop_hub.union(blade1).union(blade2)
    body_shell = body_shell.union(propeller)


# --- Camera and Gimbal ---
gimbal_y = body_length / 2 - gimbal_plate_depth / 2
gimbal_z = -body_height / 2 - gimbal_plate_height / 2
gimbal_plate = (
    cq.Workplane("XY")
    .workplane(offset=gimbal_z)
    .transformed(offset=(0, gimbal_y, 0))
    .box(gimbal_plate_width, gimbal_plate_depth, gimbal_plate_height, centered=True)
)
body_shell = body_shell.union(gimbal_plate)

camera_z = gimbal_z - gimbal_plate_height / 2 - camera_body_height / 2
camera_body = (
    cq.Workplane("XY")
    .workplane(offset=camera_z)
    .transformed(offset=(0, gimbal_y, 0))
    .box(camera_body_width, camera_body_depth, camera_body_height, centered=True)
)
body_shell = body_shell.union(camera_body)

lens_y = gimbal_y + camera_body_depth / 2
lens_z = camera_z
lens = (
    cq.Workplane("XY")
    .workplane(offset=lens_z)
    .transformed(offset=(0, lens_y, 0), rotate=(90, 0, 0))
    .circle(camera_lens_od / 2)
    .extrude(camera_lens_length)
)
body_shell = body_shell.union(lens)

# --- Side Ports ---
port_x = -body_width / 2
usb_port = (
    cq.Workplane("XY")
    .workplane(offset=0)
    .transformed(offset=(port_x, 20, 0), rotate=(0, 90, 0))
    .box(body_wall_thickness * 2, usb_c_width, usb_c_height, centered=True)
)
microsd_port = (
    cq.Workplane("XY")
    .workplane(offset=0)
    .transformed(offset=(port_x, -20, 0), rotate=(0, 90, 0))
    .box(body_wall_thickness * 2, microsd_width, microsd_height, centered=True)
)
body_shell = body_shell.cut(usb_port).cut(microsd_port)

# --- Sensors ---
# Front Sensors
front_sensor_y = body_length / 2
front_sensor_cutout = cq.Workplane("XY").box(front_sensor_width, body_wall_thickness * 2, front_sensor_height, centered=True)
fs1 = front_sensor_cutout.translate((15, front_sensor_y, 5))
fs2 = front_sensor_cutout.translate((-15, front_sensor_y, 5))
body_shell = body_shell.cut(fs1).cut(fs2)

# Bottom Sensors
bottom_sensor_z = -body_height / 2
bs1 = (
    cq.Workplane("XY")
    .workplane(offset=bottom_sensor_z)
    .transformed(offset=(10, 0, 0))
    .circle(bottom_sensor_1_dia / 2)
    .extrude(-body_wall_thickness * 2)
)
bs2 = (
    cq.Workplane("XY")
    .workplane(offset=bottom_sensor_z)
    .transformed(offset=(-10, 0, 0))
    .circle(bottom_sensor_2_dia / 2)
    .extrude(-body_wall_thickness * 2)
)
body_shell = body_shell.cut(bs1).cut(bs2)

# Rear Sensor
rear_sensor_y = -body_length / 2
rs1 = (
    cq.Workplane("XY")
    .workplane(offset=0)
    .transformed(offset=(0, rear_sensor_y, 0), rotate=(90, 0, 0))
    .circle(rear_sensor_dia / 2)
    .extrude(body_wall_thickness * 2)
)
body_shell = body_shell.cut(rs1)

# --- Top Features ---
# GPS Puck
gps_z = body_height / 2
gps_puck = (
    cq.Workplane("XY")
    .workplane(offset=gps_z)
    .transformed(offset=(0, 20, 0))
    .circle(gps_puck_dia / 2)
    .extrude(gps_puck_height)
)
body_shell = body_shell.union(gps_puck)

# Ventilation Slots
vent_z = body_height / 2
for i in range(6):
    vent_x = - (2.5 * vent_slot_spacing) + i * vent_slot_spacing
    vent = (
        cq.Workplane("XY")
        .workplane(offset=vent_z)
        .transformed(offset=(vent_x, -20, 0))
        .box(vent_slot_width, vent_slot_length, body_wall_thickness * 2, centered=True)
    )
    body_shell = body_shell.cut(vent)

# Antenna
antenna_z = body_height / 2 + antenna_height / 2
antenna_y = -body_length / 2 + antenna_length / 2 + 10
antenna = (
    cq.Workplane("XY")
    .workplane(offset=antenna_z)
    .transformed(offset=(0, antenna_y, 0))
    .box(antenna_width, antenna_length, antenna_height, centered=True)
)
body_shell = body_shell.union(antenna)

# --- Landing Gear ---
lg_z_strut = -body_height / 2 - lg_strut_height / 2
lg_y_pos = -body_length / 2 + 40
lg_x_pos = body_width / 2 - lg_strut_width / 2

# Right Gear
right_strut = (
    cq.Workplane("XY")
    .workplane(offset=lg_z_strut)
    .transformed(offset=(lg_x_pos, lg_y_pos, 0))
    .box(lg_strut_width, lg_strut_length, lg_strut_height, centered=True)
)
lg_z_foot = lg_z_strut - lg_strut_height / 2 - lg_foot_height / 2
right_foot = (
    cq.Workplane("XY")
    .workplane(offset=lg_z_foot)
    .transformed(offset=(lg_x_pos, lg_y_pos, 0))
    .box(lg_foot_width, lg_foot_length, lg_foot_height, centered=True)
)
body_shell = body_shell.union(right_strut).union(right_foot)

# Left Gear
left_strut = (
    cq.Workplane("XY")
    .workplane(offset=lg_z_strut)
    .transformed(offset=(-lg_x_pos, lg_y_pos, 0))
    .box(lg_strut_width, lg_strut_length, lg_strut_height, centered=True)
)
left_foot = (
    cq.Workplane("XY")
    .workplane(offset=lg_z_foot)
    .transformed(offset=(-lg_x_pos, lg_y_pos, 0))
    .box(lg_foot_width, lg_foot_length, lg_foot_height, centered=True)
)
body_shell = body_shell.union(left_strut).union(left_foot)

# --- Final Result ---
result = body_shell