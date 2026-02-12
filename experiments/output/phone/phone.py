import cadquery as cq
import math

# Phone dimensions
phone_length = 146.6
phone_width = 71.5
phone_thickness = 8.25
wall_thickness = 2.0
corner_radius = 6.3

# Display and bezel parameters
bezel_width = 3.0
bezel_lip_height = 0.5
screen_corner_radius = 5.8

# Camera module parameters
camera_bump_height = 2.5
camera_bump_diameter = 48.0
main_camera_diameter = 14.0
secondary_camera_diameter = 10.0
telephoto_camera_diameter = 10.0
camera_ring_thickness = 1.0
lidar_diameter = 4.0
flash_width = 8.0
flash_height = 12.0

# Button parameters
volume_button_length = 22.0
volume_button_width = 3.0
volume_button_height = 0.8
action_button_diameter = 8.0
power_button_length = 30.0
power_button_width = 3.0
power_button_height = 0.8

# Port parameters
usb_port_width = 8.5
usb_port_height = 2.5
speaker_hole_diameter = 1.2
speaker_hole_spacing = 2.0
mic_hole_diameter = 0.8

# SIM tray parameters
sim_tray_length = 18.0
sim_tray_width = 2.5
sim_tray_depth = 0.8
pin_hole_diameter = 0.8

# Dynamic Island parameters
island_width = 36.0
island_height = 10.0
island_pill_radius = 5.0

# Start with the main chassis body
phone_body = (
    cq.Workplane("XY")
    .box(phone_length, phone_width, phone_thickness)
    .edges("|Z").fillet(corner_radius)
    .edges(">Z or <Z").fillet(2.0)
)

# Hollow out the main body
phone_body = phone_body.faces(">Z").shell(-wall_thickness)

# Add internal ribs for structural support
rib_thickness = 1.0
rib_height = phone_thickness - 2 * wall_thickness

# Horizontal ribs
for i in range(3):
    y_pos = -phone_width/2 + (i+1) * phone_width/4
    rib = (
        cq.Workplane("XY")
        .workplane(offset=-phone_thickness/2 + wall_thickness)
        .transformed(offset=(0, y_pos, 0))
        .box(phone_length - 2*wall_thickness - 2, rib_thickness, rib_height)
    )
    phone_body = phone_body.union(rib)

# Vertical ribs
for i in range(2):
    x_pos = -phone_length/2 + (i+1) * phone_length/3
    rib = (
        cq.Workplane("XY")
        .workplane(offset=-phone_thickness/2 + wall_thickness)
        .transformed(offset=(x_pos, 0, 0))
        .box(rib_thickness, phone_width - 2*wall_thickness - 2, rib_height)
    )
    phone_body = phone_body.union(rib)

# Create display bezel with raised lip
bezel = (
    cq.Workplane("XY")
    .workplane(offset=phone_thickness/2)
    .rect(phone_length - 2*bezel_width, phone_width - 2*bezel_width)
    .extrude(bezel_lip_height)
    .edges("|Z").fillet(screen_corner_radius)
)
phone_body = phone_body.union(bezel)

# Cut out the display area
display_cutout = (
    cq.Workplane("XY")
    .workplane(offset=phone_thickness/2 - 0.1)
    .rect(phone_length - 2*bezel_width - 2, phone_width - 2*bezel_width - 2)
    .extrude(bezel_lip_height + 0.2)
    .edges("|Z").fillet(screen_corner_radius - 0.5)
)
phone_body = phone_body.cut(display_cutout)

# Add camera bump platform on the rear
camera_bump_x = phone_length/2 - 35
camera_bump_y = phone_width/2 - 30

camera_bump = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2)
    .transformed(offset=(camera_bump_x, camera_bump_y, 0))
    .circle(camera_bump_diameter/2)
    .extrude(-camera_bump_height)
    .edges("|Z").fillet(2.0)
)
phone_body = phone_body.union(camera_bump)

# Main camera lens with sapphire ring
main_camera = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height)
    .transformed(offset=(camera_bump_x, camera_bump_y, 0))
    .circle(main_camera_diameter/2 + camera_ring_thickness)
    .extrude(camera_ring_thickness)
)
phone_body = phone_body.union(main_camera)

# Main camera lens cutout
main_lens_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height - 0.1)
    .transformed(offset=(camera_bump_x, camera_bump_y, 0))
    .circle(main_camera_diameter/2)
    .extrude(camera_ring_thickness + 0.2)
)
phone_body = phone_body.cut(main_lens_cut)

# Ultrawide camera with sapphire ring
ultrawide_x = camera_bump_x - 18
ultrawide_y = camera_bump_y + 12

ultrawide_camera = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height)
    .transformed(offset=(ultrawide_x, ultrawide_y, 0))
    .circle(secondary_camera_diameter/2 + camera_ring_thickness)
    .extrude(camera_ring_thickness)
)
phone_body = phone_body.union(ultrawide_camera)

# Ultrawide camera lens cutout
ultrawide_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height - 0.1)
    .transformed(offset=(ultrawide_x, ultrawide_y, 0))
    .circle(secondary_camera_diameter/2)
    .extrude(camera_ring_thickness + 0.2)
)
phone_body = phone_body.cut(ultrawide_cut)

# Telephoto camera with sapphire ring
telephoto_x = camera_bump_x + 18
telephoto_y = camera_bump_y + 12

telephoto_camera = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height)
    .transformed(offset=(telephoto_x, telephoto_y, 0))
    .circle(telephoto_camera_diameter/2 + camera_ring_thickness)
    .extrude(camera_ring_thickness)
)
phone_body = phone_body.union(telephoto_camera)

# Telephoto camera lens cutout
telephoto_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height - 0.1)
    .transformed(offset=(telephoto_x, telephoto_y, 0))
    .circle(telephoto_camera_diameter/2)
    .extrude(camera_ring_thickness + 0.2)
)
phone_body = phone_body.cut(telephoto_cut)

# LiDAR scanner
lidar_x = camera_bump_x
lidar_y = camera_bump_y - 18

lidar_scanner = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height)
    .transformed(offset=(lidar_x, lidar_y, 0))
    .circle(lidar_diameter/2 + 0.5)
    .extrude(0.8)
)
phone_body = phone_body.union(lidar_scanner)

# LiDAR cutout
lidar_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height - 0.1)
    .transformed(offset=(lidar_x, lidar_y, 0))
    .circle(lidar_diameter/2)
    .extrude(1.0)
)
phone_body = phone_body.cut(lidar_cut)

# LED Flash module
flash_x = camera_bump_x - 12
flash_y = camera_bump_y - 18

flash_module = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height)
    .transformed(offset=(flash_x, flash_y, 0))
    .rect(flash_width, flash_height)
    .extrude(0.8)
    .edges("|Z").fillet(1.0)
)
phone_body = phone_body.union(flash_module)

# Flash cutout
flash_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 - camera_bump_height - 0.1)
    .transformed(offset=(flash_x, flash_y, 0))
    .rect(flash_width - 1, flash_height - 1)
    .extrude(1.0)
    .edges("|Z").fillet(0.5)
)
phone_body = phone_body.cut(flash_cut)

# Volume buttons on left side
volume_up_y = 20
volume_down_y = -5

# Volume up button
volume_up = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2)
    .transformed(offset=(volume_up_y, 0, 0))
    .rect(volume_button_length, volume_button_height)
    .extrude(volume_button_width)
    .edges(">X").fillet(0.5)
)
phone_body = phone_body.union(volume_up)

# Volume down button
volume_down = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2)
    .transformed(offset=(volume_down_y, 0, 0))
    .rect(volume_button_length, volume_button_height)
    .extrude(volume_button_width)
    .edges(">X").fillet(0.5)
)
phone_body = phone_body.union(volume_down)

# Action button on left side
action_button_y = -30

action_button = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2)
    .transformed(offset=(action_button_y, 0, 0))
    .circle(action_button_diameter/2)
    .extrude(volume_button_width)
)
phone_body = phone_body.union(action_button)

# Action button recess
action_recess = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2 + volume_button_width - 0.5)
    .transformed(offset=(action_button_y, 0, 0))
    .circle(action_button_diameter/2 - 1)
    .extrude(0.6)
)
phone_body = phone_body.cut(action_recess)

# Power button on right side
power_button_y = 10

power_button = (
    cq.Workplane("YZ")
    .workplane(offset=phone_length/2)
    .transformed(offset=(power_button_y, 0, 0))
    .rect(power_button_length, power_button_height)
    .extrude(-power_button_width)
    .edges("<X").fillet(0.5)
)
phone_body = phone_body.union(power_button)

# SIM tray slot on left side
sim_tray_y = 15

sim_slot = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2 + wall_thickness)
    .transformed(offset=(sim_tray_y, -phone_thickness/2 + 2, 0))
    .rect(sim_tray_length, sim_tray_width)
    .extrude(sim_tray_depth)
    .edges(">X").fillet(0.3)
)
phone_body = phone_body.cut(sim_slot)

# SIM eject pin hole
pin_hole = (
    cq.Workplane("YZ")
    .workplane(offset=-phone_length/2 + wall_thickness/2)
    .transformed(offset=(sim_tray_y + sim_tray_length/2 + 2, -phone_thickness/2 + 2, 0))
    .circle(pin_hole_diameter/2)
    .extrude(wall_thickness)
)
phone_body = phone_body.cut(pin_hole)

# USB-C port on bottom
usb_port = (
    cq.Workplane("XZ")
    .workplane(offset=-phone_width/2 + wall_thickness)
    .transformed(offset=(0, 0, 0))
    .rect(usb_port_width, usb_port_height)
    .extrude(wall_thickness)
    .edges(">Y").fillet(usb_port_height/2 - 0.1)
)
phone_body = phone_body.cut(usb_port)

# Speaker grilles on bottom
for i in range(6):
    # Left side speaker holes
    x_pos = -usb_port_width/2 - 5 - i * speaker_hole_spacing
    speaker_hole = (
        cq.Workplane("XZ")
        .workplane(offset=-phone_width/2 + wall_thickness/2)
        .transformed(offset=(x_pos, 0, 0))
        .circle(speaker_hole_diameter/2)
        .extrude(wall_thickness)
    )
    phone_body = phone_body.cut(speaker_hole)
    
    # Right side speaker holes
    x_pos = usb_port_width/2 + 5 + i * speaker_hole_spacing
    speaker_hole = (
        cq.Workplane("XZ")
        .workplane(offset=-phone_width/2 + wall_thickness/2)
        .transformed(offset=(x_pos, 0, 0))
        .circle(speaker_hole_diameter/2)
        .extrude(wall_thickness)
    )
    phone_body = phone_body.cut(speaker_hole)

# Bottom microphone hole
bottom_mic = (
    cq.Workplane("XZ")
    .workplane(offset=-phone_width/2 + wall_thickness/2)
    .transformed(offset=(-20, 1, 0))
    .circle(mic_hole_diameter/2)
    .extrude(wall_thickness)
)
phone_body = phone_body.cut(bottom_mic)

# Top microphone hole
top_mic = (
    cq.Workplane("XZ")
    .workplane(offset=phone_width/2 - wall_thickness/2)
    .transformed(offset=(0, 2, 0))
    .circle(mic_hole_diameter/2)
    .extrude(-wall_thickness)
)
phone_body = phone_body.cut(top_mic)

# Dynamic Island cutout (pill shape)
island_x = 0
island_y = phone_width/2 - 15

# Create pill shape for Dynamic Island
island_cutout = (
    cq.Workplane("XY")
    .workplane(offset=phone_thickness/2 - 0.5)
    .transformed(offset=(island_x, island_y, 0))
    .rect(island_width, island_height)
    .extrude(1.0)
    .edges("|Z").fillet(island_pill_radius)
)
phone_body = phone_body.cut(island_cutout)

# Front camera housing inside Dynamic Island
camera_housing = (
    cq.Workplane("XY")
    .workplane(offset=phone_thickness/2 - 0.4)
    .transformed(offset=(island_x - 10, island_y, 0))
    .circle(3.0)
    .extrude(0.4)
)
phone_body = phone_body.union(camera_housing)

# Front camera lens cutout
front_camera_cut = (
    cq.Workplane("XY")
    .workplane(offset=phone_thickness/2 - 0.5)
    .transformed(offset=(island_x - 10, island_y, 0))
    .circle(2.5)
    .extrude(0.6)
)
phone_body = phone_body.cut(front_camera_cut)

# Face ID sensor array
for i in range(3):
    x_pos = island_x + 5 + i * 4
    sensor = (
        cq.Workplane("XY")
        .workplane(offset=phone_thickness/2 - 0.4)
        .transformed(offset=(x_pos, island_y, 0))
        .circle(1.0)
        .extrude(0.4)
    )
    phone_body = phone_body.union(sensor)
    
    sensor_cut = (
        cq.Workplane("XY")
        .workplane(offset=phone_thickness/2 - 0.5)
        .transformed(offset=(x_pos, island_y, 0))
        .circle(0.8)
        .extrude(0.6)
    )
    phone_body = phone_body.cut(sensor_cut)

# Antenna bands (grooves around edges)
antenna_positions = [
    (-phone_length/2 + 15, 0),
    (-phone_length/2 + 30, 0),
    (phone_length/2 - 15, 0),
    (phone_length/2 - 30, 0)
]

for x_pos, y_pos in antenna_positions:
    # Side antenna bands
    antenna_band = (
        cq.Workplane("XY")
        .workplane(offset=0)
        .transformed(offset=(x_pos, 0, 0))
        .rect(0.5, phone_width + 1)
        .extrude(phone_thickness/2 + 1)
    )
    phone_body = phone_body.cut(antenna_band)
    
    antenna_band = (
        cq.Workplane("XY")
        .workplane(offset=0)
        .transformed(offset=(x_pos, 0, 0))
        .rect(0.5, phone_width + 1)
        .extrude(-phone_thickness/2 - 1)
    )
    phone_body = phone_body.cut(antenna_band)

# Add internal mounting bosses for components
boss_positions = [
    (30, 20), (30, -20), (-30, 20), (-30, -20),
    (50, 0), (-50, 0), (0, 25), (0, -25)
]

for x_pos, y_pos in boss_positions:
    boss = (
        cq.Workplane("XY")
        .workplane(offset=-phone_thickness/2 + wall_thickness)
        .transformed(offset=(x_pos, y_pos, 0))
        .circle(3.0)
        .extrude(3.0)
    )
    phone_body = phone_body.union(boss)
    
    # Screw hole in boss
    screw_hole = (
        cq.Workplane("XY")
        .workplane(offset=-phone_thickness/2 + wall_thickness - 0.1)
        .transformed(offset=(x_pos, y_pos, 0))
        .circle(1.2)
        .extrude(3.2)
    )
    phone_body = phone_body.cut(screw_hole)

# Add wireless charging coil recess on back
coil_recess = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness)
    .circle(25.0)
    .extrude(0.5)
)
phone_body = phone_body.cut(coil_recess)

# Add battery compartment
battery_length = 90
battery_width = 45
battery_depth = phone_thickness - 2 * wall_thickness - 1

battery_compartment = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness + 0.5)
    .rect(battery_length, battery_width)
    .extrude(battery_depth)
    .edges("|Z").fillet(3.0)
)
phone_body = phone_body.cut(battery_compartment)

# Add rear glass panel indicator (subtle groove)
glass_groove = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + 0.1)
    .rect(phone_length - 4, phone_width - 4)
    .extrude(0.2)
    .edges("|Z").fillet(corner_radius - 1)
)
# Create the inner cutout
glass_inner = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2)
    .rect(phone_length - 6, phone_width - 6)
    .extrude(0.4)
    .edges("|Z").fillet(corner_radius - 2)
)
glass_groove = glass_groove.cut(glass_inner)
phone_body = phone_body.cut(glass_groove)

# Add subtle logo recess (centered on back)
logo_recess = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2)
    .transformed(offset=(0, 5, 0))
    .circle(12.0)
    .extrude(0.1)
)
phone_body = phone_body.cut(logo_recess)

# Add vibration motor housing
motor_housing = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness)
    .transformed(offset=(-40, -20, 0))
    .rect(15, 8)
    .extrude(4.0)
    .edges("|Z").fillet(1.0)
)
phone_body = phone_body.union(motor_housing)

# Cut out space for motor
motor_cut = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness + 0.5)
    .transformed(offset=(-40, -20, 0))
    .rect(13, 6)
    .extrude(3.5)
    .edges("|Z").fillet(0.5)
)
phone_body = phone_body.cut(motor_cut)

# Add more internal structure details
# PCB support rails
rail_width = 2.0
rail_height = 2.0

# Left rail
left_rail = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness)
    .transformed(offset=(-phone_length/2 + wall_thickness + rail_width/2, 0, 0))
    .rect(rail_width, phone_width - 2*wall_thickness - 20)
    .extrude(rail_height)
)
phone_body = phone_body.union(left_rail)

# Right rail
right_rail = (
    cq.Workplane("XY")
    .workplane(offset=-phone_thickness/2 + wall_thickness)
    .transformed(offset=(phone_length/2 - wall_thickness - rail_width/2, 0, 0))
    .rect(rail_width, phone_width - 2*wall_thickness - 20)
    .extrude(rail_height)
)
phone_body = phone_body.union(right_rail)

# Assign final result
result = phone_body